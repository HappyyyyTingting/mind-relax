import {
  collection,
  doc,
  documentId,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  writeBatch,
} from 'firebase/firestore';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { auth, firestore } from '../lib/firebase';
import { db } from '../db/db';
import { syncRemoteConfig } from '../lib/modelConfig';
import type { Entry } from '../types/entry';

interface CloudRow {
  id: string;
  user_id: string;
  content: string;
  type: string;
  created_at: number;
  updated_at: number;
  metadata: Entry['metadata'] | null;
  deleted_at: number | null;
}

export type SyncState = 'never' | 'syncing' | 'success' | 'failed';

export interface SyncStatus {
  state: SyncState;
  lastSyncAt: number | null;
}

const TABLE = 'entries';
const PAGE_SIZE = 500;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const RETRY_DELAY_MULTIPLIER = 3;

const listeners = new Set<(status: SyncStatus) => void>();

let status: SyncStatus = { state: 'never', lastSyncAt: null };
let aligning = false;

function setStatus(next: SyncStatus): void {
  status = next;
  listeners.forEach((listener) => listener(status));
}

function versionOf(entry: Entry): number {
  return Math.max(entry.updatedAt, entry.deletedAt ?? 0);
}

function rowToEntry(row: CloudRow): Entry {
  return {
    id: row.id,
    type: row.type as Entry['type'],
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    metadata: row.metadata ?? {},
    deletedAt: row.deleted_at ?? undefined,
  };
}

function entryToRow(entry: Entry, uid: string): CloudRow {
  return {
    id: entry.id,
    user_id: uid,
    type: entry.type,
    content: entry.content,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
    metadata: entry.metadata ?? null,
    deleted_at: entry.deletedAt ?? null,
  };
}

function hasSession(): boolean {
  return auth.currentUser !== null;
}

/** fetchAllRows pages through the user's entries in document-id order. */
async function fetchAllRows(): Promise<CloudRow[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];

  const rows: CloudRow[] = [];
  let after: QueryDocumentSnapshot | undefined;

  for (;;) {
    let q = query(
      collection(firestore, TABLE),
      where('user_id', '==', uid),
      orderBy(documentId()),
      limit(PAGE_SIZE),
    );
    if (after) q = query(q, startAfter(after));
    const snapshot = await getDocs(q);

    rows.push(
      ...snapshot.docs.map((item) => ({
        ...(item.data() as Omit<CloudRow, 'id'>),
        id: item.id,
      })),
    );
    if (snapshot.docs.length < PAGE_SIZE) break;
    after = snapshot.docs[snapshot.docs.length - 1];
  }

  return rows;
}

/** upsertRows writes rows in chunks of 500 (the Firestore batch limit). */
async function upsertRows(rows: CloudRow[]): Promise<void> {
  for (let i = 0; i < rows.length; i += 500) {
    const batch = writeBatch(firestore);
    rows.slice(i, i + 500).forEach((row) => {
      batch.set(doc(firestore, TABLE, row.id), row);
    });
    await batch.commit();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * runWithRetries executes task up to MAX_RETRIES times with backoff. It never
 * rejects: after the final failure the sync status becomes 'failed'. When the
 * session disappears (sign-out) the task is abandoned silently.
 */
async function runWithRetries(task: () => Promise<void>): Promise<void> {
  let delay = RETRY_DELAY_MS;

  for (let attempt = 1; ; attempt++) {
    if (!hasSession()) return;

    try {
      await task();
      setStatus({ state: 'success', lastSyncAt: Date.now() });
      return;
    } catch (err) {
      if (attempt >= MAX_RETRIES) {
        setStatus({ state: 'failed', lastSyncAt: status.lastSyncAt });
        console.error('[sync] failed after retries:', err);
        return;
      }
      await sleep(delay);
      delay *= RETRY_DELAY_MULTIPLIER;
    }
  }
}

async function performAlign(): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;

  const rows = await fetchAllRows();
  const locals = await db.entries.toArray();
  const localById = new Map(locals.map((entry) => [entry.id, entry]));
  const cloudVersionById = new Map(
    rows.map((row) => [row.id, Math.max(row.updated_at, row.deleted_at ?? 0)]),
  );

  // Apply cloud wins locally (includes tombstones from other devices).
  const cloudWins = rows.map(rowToEntry).filter((entry) => {
    const local = localById.get(entry.id);
    return !local || versionOf(entry) > versionOf(local);
  });

  if (cloudWins.length > 0) {
    await db.entries.bulkPut(cloudWins);
  }

  // Upload local wins (local-only or locally newer).
  const localWins = locals.filter((entry) => {
    const cloudVersion = cloudVersionById.get(entry.id);
    return cloudVersion === undefined || versionOf(entry) > cloudVersion;
  });

  if (localWins.length > 0) {
    await upsertRows(localWins.map((entry) => entryToRow(entry, uid)));
  }
}

async function pushEntries(entries: Entry[]): Promise<void> {
  if (entries.length === 0) return;

  await runWithRetries(async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const rows = await fetchAllRows();
    const cloudVersionById = new Map(
      rows.map((row) => [row.id, Math.max(row.updated_at, row.deleted_at ?? 0)]),
    );

    // Only rows newer than the cloud copy are written (last-write-wins).
    const wins = entries.filter((entry) => {
      const cloudVersion = cloudVersionById.get(entry.id);
      return cloudVersion === undefined || versionOf(entry) > cloudVersion;
    });

    if (wins.length === 0) return;

    await upsertRows(wins.map((entry) => entryToRow(entry, uid)));
  });
}

export const syncService = {
  getStatus(): SyncStatus {
    return status;
  },

  subscribe(listener: (next: SyncStatus) => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  /**
   * align merges local and cloud data both ways. Runs on app open / sign-in,
   * and doubles as the manual retry entry from Settings. The model config
   * sync rides along best-effort: its failures never affect the entries
   * status (e.g. before the 013 tables are created).
   */
  async align(): Promise<void> {
    if (aligning || !hasSession()) return;
    aligning = true;
    setStatus({ state: 'syncing', lastSyncAt: status.lastSyncAt });
    try {
      await runWithRetries(performAlign);
    } finally {
      aligning = false;
    }
    void syncRemoteConfig();
  },

  /**
   * pushEntry uploads a single changed entry when it is newer than the cloud
   * copy. Fire-and-forget from the caller; failures surface via status.
   */
  pushEntry(entry: Entry): Promise<void> {
    return pushEntries([entry]);
  },

  /** pushEntries uploads changed entries in one batch (backup import). */
  pushEntries,
};
