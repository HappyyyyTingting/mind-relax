import type { Entry } from '../types/entry';
import { nanoid } from 'nanoid';
import { db } from './db';
import { currentOwner, ensureOwnership, requireOwner } from './ownership';
import { syncService } from '../services/SyncService';

const MAX_CONTENT_LENGTH = 10000;

function normalizeEntry(entry: Entry): Entry {
  return {
    ...entry,
    content: entry.content.slice(0, MAX_CONTENT_LENGTH),
    // Only the recap tag survives; other metadata is not written yet.
    metadata: entry.metadata?.kind === 'recap' ? { kind: 'recap' } : {},
  };
}

/**
 * Repository is the only data access boundary for entries, so pages do not
 * depend on Dexie or IndexedDB details. Every read and write is scoped to the
 * signed-in account, so two accounts on one browser never see each other's
 * entries. Soft-deleted entries are invisible to readers; writes trigger cloud
 * sync in the background.
 */
export const entryRepository = {
  async add(entry: Entry): Promise<string> {
    await ensureOwnership();
    const normalizedEntry = { ...normalizeEntry(entry), owner: requireOwner() };
    await db.entries.add(normalizedEntry);
    void syncService.pushEntry(normalizedEntry);
    return normalizedEntry.id;
  },

  async get(id: string): Promise<Entry | undefined> {
    await ensureOwnership();
    const owner = currentOwner();
    if (!owner) return undefined;
    const entry = await db.entries.get(id);
    return entry && entry.owner === owner && !entry.deletedAt ? entry : undefined;
  },

  async list(): Promise<Entry[]> {
    await ensureOwnership();
    const owner = currentOwner();
    if (!owner) return [];
    const entries = await db.entries.where('owner').equals(owner).sortBy('createdAt');
    return entries.reverse().filter((entry) => !entry.deletedAt);
  },

  /** listByDay returns non-deleted entries created on or after dayStart (local ms), oldest first. */
  async listByDay(dayStart: number): Promise<Entry[]> {
    await ensureOwnership();
    const owner = currentOwner();
    if (!owner) return [];
    const entries = await db.entries.where('owner').equals(owner).sortBy('createdAt');
    return entries.filter(
      (entry) => !entry.deletedAt && entry.createdAt >= dayStart,
    );
  },

  async update(id: string, content: string): Promise<void> {
    await ensureOwnership();
    const owner = currentOwner();
    if (!owner) return;

    const existing = await db.entries.get(id);
    if (!existing || existing.owner !== owner) return;

    const normalizedContent = content.slice(0, MAX_CONTENT_LENGTH);
    await db.entries.update(id, {
      content: normalizedContent,
      updatedAt: Date.now(),
    });

    const updated = await db.entries.get(id);
    if (updated && !updated.deletedAt) {
      void syncService.pushEntry(updated);
    }
  },

  async delete(id: string): Promise<void> {
    await ensureOwnership();
    const owner = currentOwner();
    if (!owner) return;

    const entry = await db.entries.get(id);
    if (!entry || entry.owner !== owner || entry.deletedAt) return;

    await db.entries.update(id, { deletedAt: Date.now() });

    const tombstone = await db.entries.get(id);
    if (tombstone) {
      void syncService.pushEntry(tombstone);
    }
  },

  /**
   * merge combines the given entries into one new entry (content joined by
   * newlines in createdAt order, createdAt from the earliest, updatedAt from
   * the latest) and soft-deletes the originals. The merged entry and the
   * tombstones sync to the cloud as one batch.
   */
  async merge(ids: string[]): Promise<Entry> {
    await ensureOwnership();
    const owner = requireOwner();

    const found = (await db.entries.bulkGet(ids)).filter(
      (entry): entry is Entry =>
        Boolean(entry && entry.owner === owner && !entry.deletedAt),
    );
    if (found.length < 2) {
      throw new Error('merge requires at least two entries');
    }

    const sorted = found.sort((a, b) => a.createdAt - b.createdAt);
    const mergedEntry: Entry = {
      id: nanoid(),
      type: 'thought',
      content: sorted.map((entry) => entry.content).join('\n'),
      createdAt: sorted[0].createdAt,
      updatedAt: sorted[sorted.length - 1].updatedAt,
      owner,
      metadata: {},
    };
    const normalized = normalizeEntry(mergedEntry);
    await db.entries.add(normalized);

    const deletedAt = Date.now();
    await Promise.all(
      sorted.map((entry) => db.entries.update(entry.id, { deletedAt })),
    );

    void syncService.pushEntries([
      normalized,
      ...sorted.map((entry) => ({ ...entry, deletedAt })),
    ]);

    return normalized;
  },

  /** Direct bulk write for backup import — preserves original data without normalization. */
  async bulkPut(entries: Entry[]): Promise<void> {
    await ensureOwnership();
    const owner = requireOwner();
    await db.entries.bulkPut(entries.map((entry) => ({ ...entry, owner })));
  },
};
