import type { Entry } from '../types/entry';
import { dailyMoods, isMoodCandidate } from './mood';
import { proxyFetch } from './proxy';

/**
 * Community pulse (opt-in). When sharing is on, the app sends one number per
 * day: the average mood score of that day's entries. The server keeps no
 * text, no feelings and no user id (see services/ai-proxy/src/pulse.ts), and
 * only shows a day once at least 10 people shared it.
 */

const ENABLED_KEY = 'mind_relax_pulse_enabled';

/** What was last sent, so an unchanged week is not sent again. */
const SENT_KEY = 'mind_relax_pulse_sent';

/** Days sent each time; the server accepts up to 7 days back. */
const SEND_DAYS = 7;

export interface PulsePoint {
  day: string;
  people: number;
  average: number;
}

export interface PulseForecastPoint {
  day: string;
  average: number;
  low: number;
  high: number;
}

export interface PulseSummary {
  minGroup: number;
  history: PulsePoint[];
  forecast: PulseForecastPoint[];
  sample: boolean;
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Private mode: sharing simply stays off.
  }
}

export function isPulseEnabled(): boolean {
  return readStorage(ENABLED_KEY) === '1';
}

/** Local calendar day as YYYY-MM-DD. */
export function localDay(ms: number): string {
  const date = new Date(ms);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** The numbers sharing would send: one per recent day that has a mood. */
export function pulseDays(entries: Entry[], now = Date.now()): { day: string; score: number }[] {
  return dailyMoods(entries.filter(isMoodCandidate), SEND_DAYS, now)
    .filter((day) => day.average !== null)
    .map((day) => ({ day: localDay(day.day), score: Math.round((day.average ?? 0) * 100) / 100 }));
}

/**
 * Sends this week's daily numbers if sharing is on and they changed since
 * the last send.
 */
export async function sendPulse(entries: Entry[]): Promise<void> {
  if (!isPulseEnabled()) return;
  const days = pulseDays(entries);
  if (days.length === 0) return;
  const body = JSON.stringify({ days });
  if (readStorage(SENT_KEY) === body) return;
  const response = await proxyFetch('/pulse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  if (!response.ok) throw new Error(`pulse send failed: ${response.status}`);
  writeStorage(SENT_KEY, body);
}

/** Turns sharing on (and sends now) or off (and deletes what was shared). */
export async function setPulseEnabled(on: boolean, entries: Entry[]): Promise<void> {
  if (on) {
    writeStorage(ENABLED_KEY, '1');
    writeStorage(SENT_KEY, null);
    try {
      await sendPulse(entries);
    } catch (err) {
      writeStorage(ENABLED_KEY, null);
      throw err;
    }
    return;
  }
  const response = await proxyFetch('/pulse', { method: 'DELETE' });
  if (!response.ok) throw new Error(`pulse delete failed: ${response.status}`);
  writeStorage(ENABLED_KEY, null);
  writeStorage(SENT_KEY, null);
}

export async function fetchPulse(): Promise<PulseSummary> {
  const response = await proxyFetch('/pulse');
  if (!response.ok) throw new Error(`pulse request failed: ${response.status}`);
  return (await response.json()) as PulseSummary;
}
