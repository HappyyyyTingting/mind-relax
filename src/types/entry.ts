/** Feeling words the mood reader can return (services/ai-proxy/src/mood.ts). */
export const FEELINGS = [
  'happy',
  'calm',
  'grateful',
  'hopeful',
  'tired',
  'anxious',
  'sad',
  'angry',
  'lonely',
  'mixed',
] as const;

export type Feeling = (typeof FEELINGS)[number];

export interface EntryMood {
  /** 1 = very low, 3 = neutral or mixed, 5 = very good. */
  score: number;
  feeling: Feeling;
}

export interface Entry {
  id: string;
  type: 'thought';
  content: string;
  createdAt: number;
  updatedAt: number;
  /**
   * The account this entry belongs to, set when it is written locally. It is
   * a local detail and never reaches the cloud (entryToRow maps fields
   * explicitly), so signing in as someone else cannot show — or upload — the
   * previous account's entries.
   */
  owner?: string;
  /** Soft-delete marker: once set the entry counts as deleted; carries deletions through sync. */
  deletedAt?: number;
  metadata?: {
    moodScore?: number;
    anxietyLevel?: number;
    /** 'recap' marks an entry written by the AI daily recap. */
    kind?: 'recap';
    /** Id of a photo kept by the Gemini server (photo journaling). */
    photo?: string;
    /** Mood read by Gemini for the insights chart; cleared when the text changes. */
    mood?: EntryMood;
  };
}
