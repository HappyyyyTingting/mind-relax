/**
 * Safety counts and scheduled jobs.
 *
 * Safety events: when the server answers a message with the crisis reply, it
 * publishes { event: 'crisis', lang, day } to Pub/Sub. A BigQuery
 * subscription writes each message straight into the safety_events table.
 * No user id and no text are sent, only that it happened, in which reply
 * language, on which day. The counts show where helpline support matters.
 *
 * Scheduled jobs: Cloud Scheduler calls POST /v1/internal/jobs/<name> with a
 * Google-signed token for the job service account.
 * - retrain (daily): retrains the BigQuery ML mood forecast on the newest days.
 * - digest (weekly): writes last week's totals to the weekly_digest table.
 */

export const JOB_NAMES = ['retrain', 'digest'] as const;

export type JobName = (typeof JOB_NAMES)[number];

export function isJobName(value: unknown): value is JobName {
  return typeof value === 'string' && (JOB_NAMES as readonly string[]).includes(value);
}

export interface SafetyEvent {
  event: 'crisis';
  lang: string;
  day: string;
}

/** The whole Pub/Sub message. Deliberately has no user id or text. */
export function crisisEvent(lang: string, now = Date.now()): SafetyEvent {
  return { event: 'crisis', lang, day: new Date(now).toISOString().slice(0, 10) };
}

/** Same rule as the app: learn only from finished days with 10+ people. */
export function trainSql(project: string, dataset: string, minGroup: number): string {
  return `
CREATE OR REPLACE MODEL \`${project}.${dataset}.mood_forecast\`
OPTIONS (
  model_type = 'ARIMA_PLUS',
  time_series_timestamp_col = 'day',
  time_series_data_col = 'average',
  data_frequency = 'DAILY',
  horizon = 7
) AS
SELECT day, AVG(score) AS average
FROM \`${project}.${dataset}.checkins\`
WHERE day < CURRENT_DATE()
GROUP BY day
HAVING COUNT(DISTINCT contributor) >= ${minGroup}`;
}

/**
 * Last full 7 days (yesterday and the 6 before): crisis replies by language,
 * and how many days reached the community pulse group size, with their
 * average. One row is added to weekly_digest.
 */
export function digestSql(project: string, dataset: string, minGroup: number): string {
  const table = (name: string) => `\`${project}.${dataset}.${name}\``;
  const week = 'BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY) AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY)';
  return `
INSERT INTO ${table('weekly_digest')}
  (week_start, crisis_total, crisis_by_lang, pulse_days, pulse_average, created_at)
WITH crisis AS (
  SELECT lang, COUNT(*) AS n
  FROM ${table('safety_events')}
  WHERE event = 'crisis' AND day ${week}
  GROUP BY lang
),
pulse AS (
  SELECT day, AVG(score) AS average
  FROM ${table('checkins')}
  WHERE day ${week}
  GROUP BY day
  HAVING COUNT(DISTINCT contributor) >= ${minGroup}
)
SELECT
  DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY),
  (SELECT IFNULL(SUM(n), 0) FROM crisis),
  (SELECT IFNULL(TO_JSON_STRING(ARRAY_AGG(STRUCT(lang, n) ORDER BY n DESC)), '[]') FROM crisis),
  (SELECT COUNT(*) FROM pulse),
  (SELECT ROUND(AVG(average), 2) FROM pulse),
  CURRENT_TIMESTAMP()`;
}

export function latestDigestSql(project: string, dataset: string): string {
  return `
SELECT
  CAST(week_start AS STRING) AS week_start,
  crisis_total,
  crisis_by_lang,
  pulse_days,
  pulse_average
FROM \`${project}.${dataset}.weekly_digest\`
ORDER BY created_at DESC
LIMIT 1`;
}
