import type { Entry } from '../types/entry';
import { dailyMoods, isMoodCandidate } from './mood';
import { proxyFetch } from './proxy';

/**
 * Community pulse (opt-in). When sharing is on, the app sends one number per
 * day: the average mood score of that day's entries. The server keeps no
 * text, no feelings and no user id (see services/ai-proxy/src/pulse.ts), and
 * only shows a day once at least 10 people shared it.
 *
 * Groups: with a join code (a campus, a company), the same number also counts
 * toward that group's own pulse, under the same 10-person rule. The server
 * stores a hash of the code, never the code.
 */

const ENABLED_KEY = 'mind_relax_pulse_enabled';

/** What was last sent, so an unchanged week is not sent again. */
const SENT_KEY = 'mind_relax_pulse_sent';

/** The group join code this device belongs to, if any. */
const GROUP_KEY = 'mind_relax_pulse_group';

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
  /** True for a group's own view, which has no forecast. */
  group?: boolean;
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

/** Same rule as the server: letters, digits and dashes, 6 to 24 long. */
export function normaliseGroupCode(raw: string): string | null {
  const code = raw.replace(/\s+/g, '').toUpperCase();
  return /^[A-Z0-9-]{6,24}$/.test(code) ? code : null;
}

export function getPulseGroup(): string | null {
  const stored = readStorage(GROUP_KEY);
  return stored ? normaliseGroupCode(stored) : null;
}

/** A fresh code to share, e.g. CALM-7KQ3-X9PD. No 0/O or 1/I to misread. */
export function newGroupCode(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const chars = [...bytes].map((b) => letters[b % letters.length]).join('');
  return `CALM-${chars.slice(0, 4)}-${chars.slice(4)}`;
}

/**
 * Joins a group (code) or leaves it (null). When sharing is on, the recent
 * days are sent again at once so the shared rows move with the user.
 */
export async function setPulseGroup(code: string | null, entries: Entry[]): Promise<void> {
  writeStorage(GROUP_KEY, code);
  if (isPulseEnabled()) await sendPulse(entries);
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
  const group = getPulseGroup();
  const body = JSON.stringify(group ? { days, group } : { days });
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

/**
 * Everyone's pulse, or one group's with a code. The code goes in a header,
 * not the URL, so it never shows up in request logs.
 */
export async function fetchPulse(group?: string | null): Promise<PulseSummary> {
  const response = await proxyFetch(
    '/pulse',
    group ? { headers: { 'X-Pulse-Group': group } } : {},
  );
  if (!response.ok) throw new Error(`pulse request failed: ${response.status}`);
  return (await response.json()) as PulseSummary;
}
