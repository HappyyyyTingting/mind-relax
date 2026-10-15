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
  /**
   * What produced this entry: the user's own writing ('thought'), the daily
   * recap ('daily') or the weekly review ('weekly'). Only the AI writes the
   * latter two, which is why the places that must not read AI text back as the
   * user's own words — the talk preamble, the recap's input, the weekly digest
   * — filter on it. Rows written before this field was widened are mapped on
   * the way out of db/repository.ts rather than migrated in place.
   */
  type: 'thought' | 'daily' | 'weekly';
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
    /**
     * @deprecated How an AI recap was marked before `type` carried that
     * meaning. Legacy rows still carry it and db/repository.ts reads it as
     * type 'daily'; this build never writes it, and it is kept (not stripped
     * on save) so editing an old recap cannot silently reclassify it as the
     * user's own writing.
     */
    kind?: 'recap';
    /** Id of a photo kept by the Gemini server (photo journaling). */
    photo?: string;
    /** Mood read by Gemini for the insights chart; cleared when the text changes. */
    mood?: EntryMood;
  };
}
