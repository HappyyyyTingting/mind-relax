import type { BackupFile, ImportResult } from '../types/backup';
import type { Entry } from '../types/entry';
import { db } from '../db/db';
import { ensureOwnership, requireOwner } from '../db/ownership';
import { entryRepository } from '../db/repository';
import { CodedError } from '../lib/errors';
import { syncService } from './SyncService';

const CURRENT_VERSION = 1;

/** Ownership is a local detail, so backups stay portable across accounts. */
function stripOwner(entry: Entry): Entry {
  const portable: Entry = { ...entry };
  delete portable.owner;
  return portable;
}

export const BackupService = {
  async export(): Promise<Blob> {
    const entries = (await entryRepository.list()).map(stripOwner);

    const timestamps = entries.map((e) => e.createdAt);
    const now = new Date().toISOString();

    const backup: BackupFile = {
      version: CURRENT_VERSION,
      app: 'mind_relax',
      exportTime: now,
      summary: {
        entryCount: entries.length,
        earliestCreatedAt:
          entries.length > 0
            ? new Date(Math.min(...timestamps)).toISOString()
            : now,
        latestCreatedAt:
          entries.length > 0
            ? new Date(Math.max(...timestamps)).toISOString()
            : now,
      },
      entries,
    };

    const json = JSON.stringify(backup, null, 2);
    return new Blob([json], { type: 'application/json' });
  },

  async validate(file: File): Promise<BackupFile> {
    let raw: unknown;

    try {
      const text = await file.text();
      raw = JSON.parse(text);
    } catch {
      throw new CodedError('backup.parseFailed');
    }

    if (raw == null || typeof raw !== 'object') {
      throw new CodedError('backup.invalidFormat');
    }

    const data = raw as Record<string, unknown>;

    if (!Number.isInteger(data.version)) {
      throw new CodedError('backup.versionNotInteger');
    }

    if (data.version !== CURRENT_VERSION) {
      throw new CodedError('backup.unsupportedVersion', { v: CURRENT_VERSION });
    }

    if (data.app !== 'mind_relax') {
      throw new CodedError('backup.notMindRelax');
    }

    if (typeof data.exportTime !== 'string') {
      throw new CodedError('backup.invalidExportTime');
    }

    if (!Array.isArray(data.entries)) {
      throw new CodedError('backup.missingEntries');
    }

    return data as unknown as BackupFile;
  },

  async import(backup: BackupFile): Promise<ImportResult> {
    await ensureOwnership();
    const owner = requireOwner();

    let newCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    const changed: Entry[] = [];

    await db.transaction('rw', db.entries, async () => {
      for (const entry of backup.entries) {
        const existing = await db.entries.get(entry.id);

        if (existing && existing.owner !== owner) {
          // Same id under another account: never overwrite another account's row.
          skippedCount++;
          continue;
        }

        // The row id is the table's primary key, so the backup is imported into
        // whichever account is signed in; ownership is never taken from the file.
        const owned: Entry = { ...entry, owner };

        if (!existing) {
          await db.entries.put(owned);
          newCount++;
          changed.push(owned);
        } else if (existing.deletedAt) {
          // Deleted locally: skip so the deletion (and its sync) is not undone.
          skippedCount++;
        } else if (entry.updatedAt > existing.updatedAt) {
          await db.entries.put(owned);
          updatedCount++;
          changed.push(owned);
        } else {
          skippedCount++;
        }
      }
    });

    if (changed.length > 0) {
      void syncService.pushEntries(changed);
    }

    return { newCount, updatedCount, skippedCount };
  },
};
