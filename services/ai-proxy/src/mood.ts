import { BadRequest } from './messages.js';

/**
 * Mood insights: the app sends a batch of entries it has not scored yet, and
 * Gemini returns one mood score (1 to 5) and one feeling word per entry. One
 * call covers up to MAX_MOOD_ENTRIES entries, so a whole month costs about
 * as much as a single chat reply. Nothing is stored on the server; the app
 * keeps the scores with its own entries.
 */

/** Fixed list so the app can translate the word and count them. */
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

export interface MoodEntry {
  id: string;
  text: string;
}

export interface MoodScore {
  id: string;
  score: number;
  feeling: Feeling;
}

export const MAX_MOOD_ENTRIES = 30;

/** Long entries are cut; the start of an entry carries its mood well enough. */
export const MAX_MOOD_ENTRY_CHARS = 1_500;

/** Same id format the app's nanoid produces. */
const ENTRY_ID = /^[A-Za-z0-9_-]{1,64}$/;

export const MOOD_INSTRUCTION = [
  'You read short private journal entries and rate the mood of each one.',
  'For every entry give: score, an integer from 1 to 5',
  '(1 = very low or distressed, 2 = low, 3 = neutral or mixed, 4 = good, 5 = very good),',
  `and feeling, the single word from this list that fits best: ${FEELINGS.join(', ')}.`,
  'Rate only what the writer expresses. Entries can be in any language.',
  'Return one result for every id you were given, using the same id.',
].join(' ');

/** Gemini returns JSON that matches this schema. */
export const MOOD_RESPONSE_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      score: { type: 'integer', minimum: 1, maximum: 5 },
      feeling: { type: 'string', enum: [...FEELINGS] },
    },
    required: ['id', 'score', 'feeling'],
  },
};

/** Validates the untrusted body; throws BadRequest with a reason. */
export function parseMoodRequest(body: unknown): MoodEntry[] {
  if (typeof body !== 'object' || body === null) {
    throw new BadRequest('body must be a JSON object');
  }
  const { entries } = body as Record<string, unknown>;
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new BadRequest('entries must be a non-empty array');
  }
  if (entries.length > MAX_MOOD_ENTRIES) {
    throw new BadRequest(`at most ${MAX_MOOD_ENTRIES} entries per request`);
  }
  return entries.map((entry: unknown) => {
    const { id, text } = (entry ?? {}) as Record<string, unknown>;
    if (typeof id !== 'string' || !ENTRY_ID.test(id)) {
      throw new BadRequest('each entry needs a valid id');
    }
    if (typeof text !== 'string' || text.trim().length === 0) {
      throw new BadRequest('each entry needs text');
    }
    return { id, text: text.slice(0, MAX_MOOD_ENTRY_CHARS) };
  });
}

/** The entries as one user message, each tagged with its id. */
export function moodPrompt(entries: MoodEntry[]): string {
  return entries.map((entry) => `[id: ${entry.id}]\n${entry.text}`).join('\n\n---\n\n');
}

/**
 * Keeps only well-formed results for ids that were asked about, one per id.
 * Anything Gemini skipped is simply left unscored and asked again later.
 */
export function parseMoodResponse(raw: string, asked: MoodEntry[]): MoodScore[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const wanted = new Set(asked.map((entry) => entry.id));
  const seen = new Set<string>();
  const scores: MoodScore[] = [];
  for (const item of parsed as unknown[]) {
    const { id, score, feeling } = (item ?? {}) as Record<string, unknown>;
    if (
      typeof id === 'string' &&
      wanted.has(id) &&
      !seen.has(id) &&
      Number.isInteger(score) &&
      (score as number) >= 1 &&
      (score as number) <= 5 &&
      FEELINGS.includes(feeling as Feeling)
    ) {
      seen.add(id);
      scores.push({ id, score: score as number, feeling: feeling as Feeling });
    }
  }
  return scores;
}
