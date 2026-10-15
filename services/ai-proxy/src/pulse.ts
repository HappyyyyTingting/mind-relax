import { createHash, createHmac } from 'node:crypto';
import { BadRequest } from './messages.js';

/**
 * Community pulse: people who opt in send one number per day, the average of
 * that day's mood scores (1 to 5). No text, no feelings, no user id is
 * stored. Each row carries a contributor key that is a keyed hash of the
 * user id and the day, so the same person gets a different key every day and
 * rows cannot be joined across days without the server's secret.
 *
 * A day is only shown when at least MIN_GROUP people sent a number for it,
 * so one person's mood can never be picked out of the average.
 *
 * Groups: a campus or a company shares a join code. A member's rows also carry
 * a group key (a hash of the code, never the code itself), and the group sees
 * its own average under the same rule: a day appears only with 10+ people.
 * The rows still count in the everyone view too.
 */

export const MIN_GROUP = 10;

/** How far back a phone may send a day (it may have been offline). */
export const MAX_DAYS_BACK = 7;

/** Days of community history the app shows. */
export const HISTORY_DAYS = 14;

/** Days BigQuery ML forecasts ahead. */
export const FORECAST_DAYS = 7;

/** When sharing is turned off, rows this far back are deleted. */
export const FORGET_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Join codes: letters, digits and dashes, after upper-casing and dropping spaces. */
const GROUP_PATTERN = /^[A-Z0-9-]{6,24}$/;

/**
 * Normalises a join code: "demo campus" and "DEMO-CAMPUS" are different, but
 * " demo-campus " and "DEMO-CAMPUS" are the same. Empty or missing is null
 * (no group); anything else that is not a valid code is a BadRequest.
 */
export function parseGroupCode(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'string') throw new BadRequest('group must be a string');
  const code = raw.replace(/\s+/g, '').toUpperCase();
  if (!GROUP_PATTERN.test(code)) {
    throw new BadRequest('group code must be 6 to 24 letters, digits or dashes');
  }
  return code;
}

/**
 * The group key stored in BigQuery. A plain hash (not keyed with the server
 * secret) so the demo sample SQL can compute it too; it only keeps the raw
 * code out of the table, which only this service can read. The same formula
 * is in bigquery/sample-group.sql.
 */
export function groupKey(code: string): string {
  return createHash('sha256').update(`mind-relax-group|${code}`).digest('hex').slice(0, 32);
}

export interface PulseDay {
  day: string;
  score: number;
}

/** UTC calendar day of a timestamp, as YYYY-MM-DD. */
export function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Checks the app's list of { day, score }. A day may be up to MAX_DAYS_BACK
 * days old, or one day ahead of the server (phones east of UTC are already
 * on tomorrow). Scores are rounded to two decimals.
 */
export function parsePulseRequest(body: unknown, now = Date.now()): PulseDay[] {
  const days = (body as { days?: unknown } | null)?.days;
  if (!Array.isArray(days) || days.length === 0) {
    throw new BadRequest('days must be a non-empty array');
  }
  if (days.length > MAX_DAYS_BACK + 2) {
    throw new BadRequest(`at most ${MAX_DAYS_BACK + 2} days per request`);
  }
  const earliest = isoDay(now - MAX_DAYS_BACK * DAY_MS);
  const latest = isoDay(now + DAY_MS);
  const seen = new Map<string, number>();
  for (const item of days) {
    const { day, score } = (item ?? {}) as Record<string, unknown>;
    if (typeof day !== 'string' || !DAY_PATTERN.test(day) || Number.isNaN(Date.parse(day))) {
      throw new BadRequest('day must be YYYY-MM-DD');
    }
    if (day < earliest || day > latest) {
      throw new BadRequest('day is out of range');
    }
    if (typeof score !== 'number' || !Number.isFinite(score) || score < 1 || score > 5) {
      throw new BadRequest('score must be a number from 1 to 5');
    }
    seen.set(day, Math.round(score * 100) / 100);
  }
  return [...seen.entries()].map(([day, score]) => ({ day, score }));
}

/** Keyed hash of user and day; different every day for the same person. */
export function contributorKey(secret: string, uid: string, day: string): string {
  return createHmac('sha256', secret).update(`${uid}|${day}`).digest('base64url').slice(0, 22);
}

/** The caller's keys for the last FORGET_DAYS days, used to delete their rows. */
export function recentKeys(secret: string, uid: string, now = Date.now()): string[] {
  const keys: string[] = [];
  for (let back = -1; back <= FORGET_DAYS; back++) {
    keys.push(contributorKey(secret, uid, isoDay(now - back * DAY_MS)));
  }
  return keys;
}

/** Fully qualified table and model names inside the dataset. */
export function pulseNames(project: string, dataset: string) {
  return {
    table: `\`${project}.${dataset}.checkins\``,
    model: `\`${project}.${dataset}.mood_forecast\``,
  };
}

/** Insert or replace the caller's number for each day. @rows is a JSON string. */
export function upsertSql(table: string): string {
  return `
MERGE ${table} AS target
USING (
  SELECT
    DATE(JSON_VALUE(row, '$.day')) AS day,
    JSON_VALUE(row, '$.contributor') AS contributor,
    CAST(JSON_VALUE(row, '$.score') AS FLOAT64) AS score,
    JSON_VALUE(row, '$.grp') AS grp
  FROM UNNEST(JSON_QUERY_ARRAY(@rows)) AS row
) AS source
ON target.day = source.day AND target.contributor = source.contributor
WHEN MATCHED THEN
  UPDATE SET score = source.score, grp = source.grp, received_at = CURRENT_TIMESTAMP()
WHEN NOT MATCHED THEN
  INSERT (day, contributor, score, grp, source, received_at)
  VALUES (source.day, source.contributor, source.score, source.grp, 'live', CURRENT_TIMESTAMP())`;
}

export function forgetSql(table: string): string {
  return `
DELETE FROM ${table}
WHERE day >= DATE_SUB(CURRENT_DATE(), INTERVAL ${FORGET_DAYS + 1} DAY)
  AND contributor IN UNNEST(@keys)`;
}

/**
 * Daily community average, only for days with at least @minGroup people.
 * With inGroup, only rows carrying @grp count (the group view).
 */
export function historySql(table: string, inGroup = false): string {
  return `
SELECT
  CAST(day AS STRING) AS day,
  COUNT(DISTINCT contributor) AS people,
  AVG(score) AS average,
  LOGICAL_OR(source = 'sample') AS sample
FROM ${table}
WHERE day BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL ${HISTORY_DAYS - 1} DAY) AND CURRENT_DATE()${inGroup ? '\n  AND grp = @grp' : ''}
GROUP BY day
HAVING people >= @minGroup
ORDER BY day`;
}

/** BigQuery ML forecast from the trained ARIMA_PLUS model. */
export function forecastSql(model: string): string {
  return `
SELECT
  CAST(DATE(forecast_timestamp) AS STRING) AS day,
  forecast_value AS average,
  prediction_interval_lower_bound AS low,
  prediction_interval_upper_bound AS high
FROM ML.FORECAST(MODEL ${model}, STRUCT(${FORECAST_DAYS} AS horizon, 0.8 AS confidence_level))
ORDER BY day`;
}

export interface HistoryPoint {
  day: string;
  people: number;
  average: number;
}

export interface ForecastPoint {
  day: string;
  average: number;
  low: number;
  high: number;
}

export interface PulseSummary {
  minGroup: number;
  /** True for a group's own view (no forecast: groups are too small to train on). */
  group: boolean;
  history: HistoryPoint[];
  forecast: ForecastPoint[];
  /** True when any shown day includes demo sample rows. */
  sample: boolean;
}

const clamp = (value: number) => Math.min(5, Math.max(1, value));
const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Shapes BigQuery rows into the reply. Days under the group size are dropped
 * again here (defence in depth), and forecast days that are not after the
 * last real day are dropped, since an older model forecasts from its own
 * training end.
 */
export function summarisePulse(
  historyRows: Record<string, unknown>[],
  forecastRows: Record<string, unknown>[],
  group = false,
): PulseSummary {
  let sample = false;
  const history: HistoryPoint[] = [];
  for (const row of historyRows) {
    const people = Number(row.people);
    const average = Number(row.average);
    if (typeof row.day !== 'string' || !(people >= MIN_GROUP) || !Number.isFinite(average)) {
      continue;
    }
    if (row.sample === true) sample = true;
    history.push({ day: row.day, people, average: round2(clamp(average)) });
  }
  const lastDay = history.at(-1)?.day ?? '';
  const forecast: ForecastPoint[] = [];
  if (history.length > 0) {
    for (const row of forecastRows) {
      const average = Number(row.average);
      const low = Number(row.low);
      const high = Number(row.high);
      if (typeof row.day !== 'string' || row.day <= lastDay) continue;
      if (![average, low, high].every(Number.isFinite)) continue;
      forecast.push({
        day: row.day,
        average: round2(clamp(average)),
        low: round2(clamp(low)),
        high: round2(clamp(high)),
      });
    }
  }
  return { minGroup: MIN_GROUP, group, history, forecast: forecast.slice(0, FORECAST_DAYS), sample };
}
