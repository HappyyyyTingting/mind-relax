/**
 * All runtime settings come from environment variables so the same image runs
 * locally and on Cloud Run. Limits are deliberately small: this service pays
 * for every token, and a reflection reply never needs a long answer.
 */

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function listFromEnv(name: string, fallback: string[]): string[] {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export const config = {
  port: intFromEnv('PORT', 8080),
  /** Google Cloud project that runs Vertex AI (billing lives here). */
  gcpProject: process.env.GOOGLE_CLOUD_PROJECT ?? '',
  gcpLocation: process.env.GEMINI_LOCATION ?? 'global',
  // gemini-2.5-flash retires on 2026-10-20, inside the judging window; 3.8
  // Flash has no announced retirement date.
  model: process.env.GEMINI_MODEL ?? 'gemini-3.8-flash',
  /**
   * Thinking tokens count against maxOutputTokens and are billed as output.
   * LOW keeps replies from being cut short and costs down; a reflective reply
   * does not need deep reasoning. Set to 'default' to leave it to the model.
   */
  thinkingLevel: process.env.GEMINI_THINKING_LEVEL ?? 'LOW',
  /** Firebase project whose sign-in tokens are accepted. */
  firebaseProject: process.env.FIREBASE_PROJECT_ID ?? '',
  /** Local development only: skips token checks. Never set on Cloud Run. */
  skipAuth: process.env.SKIP_AUTH === '1',
  allowedOrigins: listFromEnv('ALLOWED_ORIGINS', [
    'http://localhost:5173',
    'http://localhost:4173',
  ]),
  maxOutputTokens: intFromEnv('MAX_OUTPUT_TOKENS', 1024),
  maxInputChars: intFromEnv('MAX_INPUT_CHARS', 16_000),
  maxMessages: intFromEnv('MAX_MESSAGES', 80),
  requestsPerHour: intFromEnv('REQUESTS_PER_HOUR', 30),
  /**
   * Model calls per UTC day across all users. Anyone can create an account, so
   * the per-user limit alone does not bound spend; this and the rupee budget do.
   */
  dailyRequestCap: intFromEnv('DAILY_REQUEST_CAP', 200),
  dailyBudgetInr: numberFromEnv('DAILY_BUDGET_INR', 500),
  /**
   * Cloud Storage bucket for journal photos. Empty (local runs) means photos
   * are read by Gemini but not kept.
   */
  photoBucket: process.env.PHOTO_BUCKET ?? '',
  /**
   * BigQuery dataset for the community pulse. Empty (local runs) turns the
   * pulse routes off.
   */
  pulseDataset: process.env.PULSE_DATASET ?? '',
  /** Secret key for the daily contributor hash. Required with PULSE_DATASET. */
  pulseSecret: process.env.PULSE_SECRET ?? '',
  /**
   * Second safety layer: Gemini labels messages the phrase match let through.
   * On unless SAFETY_CLASSIFIER=0.
   */
  safetyClassifier: process.env.SAFETY_CLASSIFIER !== '0',
  /** Pub/Sub topic for anonymous safety events. Empty = not published. */
  eventsTopic: process.env.EVENTS_TOPIC ?? '',
  /**
   * Scheduled jobs: the service account Cloud Scheduler signs as, and the
   * audience in its token (this service's URL). Both empty = jobs off.
   */
  jobInvoker: process.env.JOB_INVOKER ?? '',
  jobAudience: process.env.JOB_AUDIENCE ?? '',
  /** Budget store: 'firestore' on Cloud Run, 'memory' for local runs. */
  budgetStore: process.env.BUDGET_STORE === 'firestore' ? 'firestore' : 'memory',
  /** Post-promotion Gemini 3.8 Flash list prices, so estimates err high. */
  prices: {
    inputUsdPerMillion: numberFromEnv('PRICE_INPUT_USD_PER_M', 1.5),
    outputUsdPerMillion: numberFromEnv('PRICE_OUTPUT_USD_PER_M', 7.5),
    inrPerUsd: numberFromEnv('INR_PER_USD', 90),
  },
  /** Thinking tokens assumed per call when sizing the worst-case cost. */
  assumedThinkingTokens: intFromEnv('ASSUMED_THINKING_TOKENS', 2000),
};

function numberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
