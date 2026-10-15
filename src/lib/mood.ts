import { entryRepository } from '../db/repository';
import { FEELINGS, type Entry, type EntryMood } from '../types/entry';
import { proxyFetch } from './proxy';

/** The server reads at most this many entries per call. */
const BATCH_SIZE = 30;

/** Long entries are cut to this; the server cuts them too. */
const MAX_TEXT_CHARS = 1_500;

/**
 * Entries an insights chart can use: the user's own words only, never the
 * AI's daily recap or weekly review (entryTypeOf in db/repository.ts already
 * maps legacy recap rows to 'daily').
 */
export function isMoodCandidate(entry: Entry): boolean {
  return entry.type === 'thought' && entry.content.trim().length > 0;
}

function isFeeling(value: unknown): value is EntryMood['feeling'] {
  return FEELINGS.includes(value as EntryMood['feeling']);
}

/**
 * scoreMissingMoods sends the newest unscored entries (one batch) to the
 * Gemini server and saves the moods it returns. It returns how many entries
 * were scored. One call per visit keeps the cost to a cent or two.
 */
export async function scoreMissingMoods(entries: Entry[]): Promise<number> {
  const batch = entries
    .filter((entry) => isMoodCandidate(entry) && !entry.metadata?.mood)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, BATCH_SIZE);
  if (batch.length === 0) return 0;

  const response = await proxyFetch('/mood', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      entries: batch.map((entry) => ({
        id: entry.id,
        text: entry.content.slice(0, MAX_TEXT_CHARS),
      })),
    }),
  });
  if (!response.ok) throw new Error(`mood request failed: ${response.status}`);

  const parsed = (await response.json()) as { scores?: unknown };
  const scores = Array.isArray(parsed.scores) ? (parsed.scores as unknown[]) : [];
  const moods: { id: string; mood: EntryMood }[] = [];
  for (const item of scores) {
    const { id, score, feeling } = (item ?? {}) as Record<string, unknown>;
    if (
      typeof id === 'string' &&
      typeof score === 'number' &&
      Number.isInteger(score) &&
      score >= 1 &&
      score <= 5 &&
      isFeeling(feeling)
    ) {
      moods.push({ id, mood: { score, feeling } });
    }
  }
  await entryRepository.setMoods(moods);
  return moods.length;
}

export interface DayMood {
  /** Local midnight of the day, ms. */
  day: number;
  /** Average score of the day's entries, or null when none were scored. */
  average: number | null;
  count: number;
}

/** One point per day for the last `days` days, oldest first. */
export function dailyMoods(entries: Entry[], days: number, now = Date.now()): DayMood[] {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const result: DayMood[] = [];
  for (let offset = days - 1; offset >= 0; offset--) {
    const start = new Date(today);
    start.setDate(today.getDate() - offset);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);
    const scores = entries
      .filter(
        (entry) =>
          entry.createdAt >= start.getTime() &&
          entry.createdAt < end.getTime() &&
          entry.metadata?.mood,
      )
      .map((entry) => entry.metadata?.mood?.score ?? 0);
    result.push({
      day: start.getTime(),
      average: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
      count: scores.length,
    });
  }
  return result;
}

/** Feelings in the given entries, most common first. */
export function feelingCounts(entries: Entry[]): { feeling: EntryMood['feeling']; count: number }[] {
  const counts = new Map<EntryMood['feeling'], number>();
  for (const entry of entries) {
    const feeling = entry.metadata?.mood?.feeling;
    if (feeling) counts.set(feeling, (counts.get(feeling) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([feeling, count]) => ({ feeling, count }))
    .sort((a, b) => b.count - a.count);
}
