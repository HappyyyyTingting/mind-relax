import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, firestore } from '../lib/firebase';
import type { TalkMessage, TalkMessageStatus } from '../types/talk';

const TABLE = 'talk_messages';

interface TalkCloudRow {
  id: string;
  user_id: string;
  day: string;
  role: 'user' | 'assistant';
  content: string;
  status: TalkMessageStatus;
  created_at: number;
  updated_at: number;
  saved_at: number | null;
  deleted_at: number | null;
}

/**
 * The talk sync follows the entries pattern (last-write-wins by
 * max(updatedAt, deletedAt)) but per message: the day's conversation is an
 * append-only log, so each message row wins or loses independently and the
 * two devices' messages simply merge into one timeline. Streaming messages
 * never reach the cloud; pushes are fire-and-forget and healed by the next
 * bidirectional align (alignToday).
 */
function hasSession(): boolean {
  return auth.currentUser !== null;
}

function messageVersion(row: {
  updated_at: number;
  deleted_at: number | null;
}): number {
  return Math.max(row.updated_at, row.deleted_at ?? 0);
}

function localVersion(message: TalkMessage): number {
  return Math.max(message.updatedAt, message.deletedAt ?? 0);
}

function rowToMessage(row: TalkCloudRow): TalkMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    status: row.status === 'streaming' ? 'failed' : row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    savedAt: row.saved_at ?? undefined,
    deletedAt: row.deleted_at ?? undefined,
  };
}

function messageToRow(uid: string, day: string, message: TalkMessage): TalkCloudRow {
  return {
    id: message.id,
    user_id: uid,
    day,
    role: message.role,
    content: message.content,
    status: message.status,
    created_at: message.createdAt,
    updated_at: message.updatedAt,
    saved_at: message.savedAt ?? null,
    deleted_at: message.deletedAt ?? null,
  };
}

/**
 * mergeWithCloud unions local and cloud messages by id. For shared ids the
 * newer version wins (cloud wins ties are impossible: local wins on equal,
 * so an in-memory streaming edit is never clobbered by its own older cloud
 * row). Cloud-only rows are adopted; local-only rows are kept (the caller
 * pushes them afterwards). Rows the cloud deleted but this device never had
 * are skipped. Returns the input array when nothing changes.
 */
function mergeWithCloud(
  cloud: TalkCloudRow[],
  local: TalkMessage[],
): TalkMessage[] {
  if (cloud.length === 0) return local;

  const cloudById = new Map(cloud.map((row) => [row.id, row]));
  let changed = false;

  const merged = local.map((message) => {
    const row = cloudById.get(message.id);
    if (!row) return message;
    cloudById.delete(message.id);
    if (messageVersion(row) <= localVersion(message)) return message;
    changed = true;
    if (row.deleted_at !== null) {
      return { ...message, deletedAt: row.deleted_at };
    }
    return rowToMessage(row);
  });

  const cloudOnly = [...cloudById.values()].filter(
    (row) => row.deleted_at === null,
  );
  if (cloudOnly.length === 0) {
    return changed ? merged.sort((a, b) => a.createdAt - b.createdAt) : local;
  }
  return [...merged, ...cloudOnly.map(rowToMessage)].sort(
    (a, b) => a.createdAt - b.createdAt,
  );
}

/**
 * alignToday pulls the day's cloud messages, merges them with the local ones
 * and pushes back every local message that is newer than its cloud copy (the
 * outbox replay that heals earlier failed pushes). The local messages are
 * read via getLocal only after the pull, and the method returns without
 * awaiting anything after that read, so the caller can replace its store with
 * the result without a window for concurrent local writes. Cloud unreachable
 * or signed out: returns the local messages untouched, silently.
 */
export async function alignToday(
  day: string,
  getLocal: () => TalkMessage[],
): Promise<TalkMessage[]> {
  if (!hasSession()) return getLocal();
  const uid = auth.currentUser?.uid;
  if (!uid) return getLocal();

  let cloud: TalkCloudRow[] = [];
  try {
    const snapshot = await getDocs(
      query(
        collection(firestore, TABLE),
        where('user_id', '==', uid),
        where('day', '==', day),
      ),
    );
    cloud = snapshot.docs.map((item) => ({
      ...(item.data() as Omit<TalkCloudRow, 'id'>),
      id: item.id,
    }));
  } catch {
    // network failure — degrade to local-only, next entry aligns again
    return getLocal();
  }

  const local = getLocal();
  const merged = mergeWithCloud(cloud, local);

  const cloudVersionById = new Map(
    cloud.map((row) => [row.id, messageVersion(row)]),
  );
  const wins = merged.filter((message) => {
    if (message.status === 'streaming') return false;
    const cloudVersion = cloudVersionById.get(message.id);
    return cloudVersion === undefined || localVersion(message) > cloudVersion;
  });
  if (wins.length > 0) {
    void pushRows(uid, day, wins);
  }

  return merged;
}

function pushRows(uid: string, day: string, rows: TalkMessage[]): void {
  void (async () => {
    try {
      const batch = writeBatch(firestore);
      rows.forEach((message) => {
        batch.set(doc(firestore, TABLE, message.id), messageToRow(uid, day, message));
      });
      await batch.commit();
    } catch {
      // fire-and-forget; the next align heals
    }
  })();
}

/** pushTalkMessage uploads one message (or tombstone) in the background. */
export function pushTalkMessage(day: string, message: TalkMessage): void {
  void (async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
      await setDoc(
        doc(firestore, TABLE, message.id),
        messageToRow(uid, day, message),
      );
    } catch {
      // fire-and-forget; the next align heals
    }
  })();
}
