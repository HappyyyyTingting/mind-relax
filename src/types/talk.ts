export type TalkMessageStatus = 'streaming' | 'done' | 'failed' | 'partial';

export interface TalkMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status: TalkMessageStatus;
  createdAt: number;
  /** Merge version: bumped on every change (stream deltas included); devices keep the newest by max(updatedAt, deletedAt). */
  updatedAt: number;
  /** Set when the message is saved as a record; excluded from later contexts. */
  savedAt?: number;
  /** Tombstone: once set the message counts as deleted (hidden); carries deletions across devices. */
  deletedAt?: number;
}

/** One day of talk messages; the date string ('YYYY-MM-DD') is the primary key. */
export interface Conversation {
  date: string;
  messages: TalkMessage[];
  /** Account that owns the conversation (recorded since 013 for account isolation; older data may lack it). */
  userId?: string | null;
  /** Rolling summary of the earlier conversation (since 014; this device only, cleared with the day, never synced). */
  summary?: string;
}
