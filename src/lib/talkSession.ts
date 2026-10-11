import { nanoid } from 'nanoid';
import { auth } from '../lib/firebase';
import { db } from '../db/db';
import { alignToday, pushTalkMessage } from '../services/TalkSync';
import type { TalkMessage, TalkMessageStatus } from '../types/talk';

const LEGACY_CHAT_KEY_PREFIX = 'mind_relax_chat_session_';

function dayStamp(): string {
  const date = new Date();
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function dayFromTime(time: number): string {
  const date = new Date(time);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

/** Removes localStorage keys left over from the 008 chat session store. */
function clearLegacyChatKeys(): void {
  try {
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(LEGACY_CHAT_KEY_PREFIX)) stale.push(key);
    }
    stale.forEach((key) => localStorage.removeItem(key));
  } catch {
    // best effort
  }
}

/**
 * The talk session is a module-level store: it survives route changes (so an
 * in-flight reply keeps streaming while TalkPage is unmounted) and persists to
 * the conversations table under today's date key, so a same-day refresh
 * restores the messages. A day rollover resets the in-memory session.
 *
 * Since 013 the day's conversation also syncs to the cloud (per message,
 * terminal states only) and deleted messages are kept as tombstones so the
 * deletion propagates to other devices. Unlike the 008 chat session, refresh
 * restores any message that was still streaming as failed (retryable) instead
 * of leaving a frozen "zombie" bubble.
 */
let stamp = dayStamp();
let messages: TalkMessage[] = [];
let visible: TalkMessage[] = [];
let ownerUid: string | null = null;
/** Rolling summary of evicted talk messages; day-scoped, local only (014). */
let summary: string | null = null;
let initialized = false;

const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

const initPromise = (async () => {
  clearLegacyChatKeys();
  try {
    const conversation = await db.conversations.get(stamp);
    ownerUid = conversation?.userId ?? null;
    summary = conversation?.summary ?? null;
    const raw = conversation?.messages ?? [];
    messages = raw.map((message) => {
      const normalized = message.updatedAt
        ? message
        : { ...message, updatedAt: message.createdAt };
      return normalized.status === 'streaming'
        ? { ...normalized, status: 'failed' as const }
        : normalized;
    });
    visible = messages.filter((message) => !message.deletedAt);
    if (messages.some((message, index) => message !== raw[index])) {
      void db.conversations.put({ date: stamp, messages, userId: ownerUid });
    }
    // Clear conversations left over from previous days.
    await db.conversations.where('date').notEqual(stamp).delete();
  } catch {
    messages = [];
  }
  initialized = true;
  notify();
})();

/**
 * ensureTalkSession resolves once the day's conversation is loaded and aligned
 * with the cloud (pull newer + push local wins). A signed-in user whose
 * account differs from the conversation's owner starts fresh, so one account's
 * talk never shows (or uploads) another account's conversation.
 */
export async function ensureTalkSession(): Promise<void> {
  await initPromise;

  const uid = auth.currentUser?.uid ?? null;
  if (uid !== null && ownerUid !== null && ownerUid !== uid) {
    ownerUid = uid;
    summary = null;
    commit([]);
  }
  if (uid !== null) ownerUid = uid;

  const merged = await alignToday(stamp, () => messages);
  if (merged !== messages) commit(merged);
}

export function getTalkMessages(): TalkMessage[] {
  return visible;
}

/** getTalkMessagesWithTombstones returns the full sequence including deleted
 * messages, so context assembly (015) can exclude a deleted user message's
 * dependent replies. */
export function getTalkMessagesWithTombstones(): TalkMessage[] {
  return messages;
}

/** getTalkSessionUid is the session owner id; accurate after ensureTalkSession. */
export function getTalkSessionUid(): string | null {
  return ownerUid;
}

/** getTalkSummary returns the day's rolling summary, if one was generated. */
export function getTalkSummary(): string | null {
  return summary;
}

/**
 * setTalkSummary stores the day's rolling summary of evicted messages. The
 * summary lives only in the day's conversation row: it never syncs to the
 * cloud and is cleared by a day rollover or an account switch.
 */
export function setTalkSummary(text: string): void {
  summary = text;
  persist();
}

export function isTalkSessionReady(): boolean {
  return initialized;
}

export function subscribeTalkMessages(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function commit(next: TalkMessage[]): void {
  const today = dayStamp();
  if (today !== stamp) {
    stamp = today;
    next = [];
    summary = null;
  }
  messages = next;
  visible = next.filter((message) => !message.deletedAt);
  persist();
  notify();
}

function persist(): void {
  void db.conversations.put({
    date: stamp,
    messages,
    userId: ownerUid,
    ...(summary !== null ? { summary } : {}),
  });
}

export function appendTalkMessage(
  data: {
    role: 'user' | 'assistant';
    content: string;
    status: TalkMessageStatus;
    createdAt?: number;
  },
  id?: string,
): TalkMessage {
  const now = Date.now();
  const message: TalkMessage = {
    id: id ?? nanoid(),
    role: data.role,
    content: data.content,
    status: data.status,
    createdAt: data.createdAt ?? now,
    updatedAt: now,
  };
  // A provided id replaces any existing message with that id (the fixed
  // opening id would otherwise duplicate after cancel + reopen).
  commit([...messages.filter((existing) => existing.id !== message.id), message]);
  if (message.status !== 'streaming') {
    pushTalkMessage(dayFromTime(message.createdAt), message);
  }
  return message;
}

export function updateTalkMessage(
  id: string,
  patch: Partial<Pick<TalkMessage, 'content' | 'status' | 'savedAt'>>,
): void {
  let updated: TalkMessage | undefined;
  commit(
    messages.map((message) => {
      if (message.id !== id) return message;
      updated = { ...message, ...patch, updatedAt: Date.now() };
      return updated;
    }),
  );
  if (updated && updated.status !== 'streaming') {
    pushTalkMessage(dayFromTime(updated.createdAt), updated);
  }
}

export function removeTalkMessage(id: string): void {
  let tombstone: TalkMessage | undefined;
  commit(
    messages.map((message) => {
      if (message.id !== id || message.deletedAt) return message;
      tombstone = { ...message, deletedAt: Date.now() };
      return tombstone;
    }),
  );
  if (tombstone) {
    pushTalkMessage(dayFromTime(tombstone.createdAt), tombstone);
  }
}

/** talkDayStamp is the day key of the session; the opening message id derives from it. */
export function talkDayStamp(): string {
  return stamp;
}
