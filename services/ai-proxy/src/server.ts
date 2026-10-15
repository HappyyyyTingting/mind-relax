import { randomBytes } from 'node:crypto';
import { Storage } from '@google-cloud/storage';
import express, { type NextFunction, type Request, type Response } from 'express';
import {
  GoogleGenAI,
  HarmBlockThreshold,
  HarmCategory,
  ThinkingLevel,
  type GenerateContentConfig,
} from '@google/genai';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import {
  DailyBudget,
  MemoryBudgetStore,
  costInr,
  type BudgetStore,
  type Reservation,
} from './budget.js';
import { config } from './config.js';
import { FirestoreBudgetStore } from './firestoreBudgetStore.js';
import {
  BadRequest,
  completion,
  lastUserText,
  parseChatRequest,
  sseChunk,
  toGemini,
} from './messages.js';
import {
  MOOD_INSTRUCTION,
  MOOD_RESPONSE_SCHEMA,
  moodPrompt,
  parseMoodRequest,
  parseMoodResponse,
} from './mood.js';
import { RateLimiter } from './rateLimit.js';
import { SAFETY_INSTRUCTION, crisisLanguage, crisisReply, screenText } from './safety.js';
import {
  IMAGE_TOKENS,
  isPhotoId,
  parsePhotoRequest,
  photoInstruction,
  photoPath,
} from './photo.js';
import {
  AUDIO_PRICE_MULTIPLIER,
  AUDIO_TOKENS_PER_SECOND,
  MAX_AUDIO_SECONDS,
  TRANSCRIBE_INSTRUCTION,
  parseTranscribeRequest,
} from './transcribe.js';

const SAFETY_HEADER = 'X-Mind-Relax-Safety';

if (!config.skipAuth && !config.firebaseProject) {
  throw new Error('FIREBASE_PROJECT_ID is required unless SKIP_AUTH=1');
}

// Verifying a Firebase ID token needs only the project id: the public signing
// keys are fetched from Google, so no service account key is involved.
const firebaseAuth = config.skipAuth
  ? null
  : getAuth(initializeApp({ projectId: config.firebaseProject }));

// On Cloud Run the service account's own identity authorises Vertex AI calls,
// so there is no API key anywhere in this service.
const ai = new GoogleGenAI({
  vertexai: true,
  project: config.gcpProject,
  location: config.gcpLocation,
});

// Photos are private objects; only this service's own identity can read them,
// and every route below checks the photo is in the caller's folder.
const photoBucket = config.photoBucket
  ? new Storage({ projectId: config.gcpProject }).bucket(config.photoBucket)
  : null;

const limiter = new RateLimiter(config.requestsPerHour, 60 * 60 * 1000);

// The budget totals live in this service's own project (not the app's
// Firebase project), so it survives restarts and scale-to-zero.
const budgetStore: BudgetStore =
  config.budgetStore === 'firestore'
    ? new FirestoreBudgetStore(
        getFirestore(initializeApp({ projectId: config.gcpProject }, 'budget')),
      )
    : new MemoryBudgetStore();
const dailyBudget = new DailyBudget(budgetStore, {
  maxCalls: config.dailyRequestCap,
  maxInr: config.dailyBudgetInr,
});

/**
 * Upper bound for one call: every input character counted as a token (CJK
 * text is roughly one token per character, English far less), plus the full
 * output cap and the thinking allowance.
 */
function worstCaseInr(inputChars: number): number {
  return costInr(
    {
      inputTokens: inputChars + 1000,
      outputTokens: config.maxOutputTokens + config.assumedThinkingTokens,
    },
    config.prices,
  );
}

interface UsageCounts {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
}

function actualInr(usage: UsageCounts | undefined): number | undefined {
  if (!usage?.promptTokenCount) return undefined;
  return costInr(
    {
      inputTokens: usage.promptTokenCount,
      outputTokens: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
    },
    config.prices,
  );
}

async function settle(reservation: Reservation, usage: UsageCounts | undefined) {
  try {
    await dailyBudget.settle(reservation, actualInr(usage));
  } catch (err) {
    // Failing to settle leaves the worst-case reservation charged: safe side.
    console.error(JSON.stringify({ event: 'budget_settle_error', message: String(err) }));
  }
}

/** About 25 tokens per scored entry, plus room for low-level thinking. */
const MOOD_MAX_OUTPUT_TOKENS = 2048;

const app = express();
app.disable('x-powered-by');
// Voice clips are larger than chat text. This parser runs first for that one
// path; the general parser then sees the body is already read and skips it.
app.use('/v1/transcribe', express.json({ limit: '2mb' }));
app.use('/v1/photo', express.json({ limit: '4mb' }));
app.use(express.json({ limit: '256kb' }));

app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  if (origin && config.allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, DELETE, OPTIONS');
    res.setHeader('Access-Control-Expose-Headers', SAFETY_HEADER);
    res.setHeader('Access-Control-Max-Age', '3600');
  }
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, model: config.model });
});

/** Resolves the caller's Firebase uid, or answers 401 and returns null. */
async function authenticate(req: Request, res: Response): Promise<string | null> {
  if (!firebaseAuth) return 'local-dev';
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    res.status(401).json({ error: 'sign-in required' });
    return null;
  }
  try {
    const decoded = await firebaseAuth.verifyIdToken(token);
    return decoded.uid;
  } catch {
    res.status(401).json({ error: 'invalid or expired sign-in' });
    return null;
  }
}

function generationConfig(systemInstruction: string): GenerateContentConfig {
  return {
    systemInstruction: [systemInstruction, SAFETY_INSTRUCTION]
      .filter(Boolean)
      .join('\n\n'),
    maxOutputTokens: config.maxOutputTokens,
    safetySettings: [
      HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
      HarmCategory.HARM_CATEGORY_HARASSMENT,
      HarmCategory.HARM_CATEGORY_HATE_SPEECH,
      HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    ].map((category) => ({
      category,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    })),
    ...(config.thinkingLevel !== 'default'
      ? { thinkingConfig: { thinkingLevel: config.thinkingLevel as ThinkingLevel } }
      : {}),
  };
}

/**
 * Voice and photo entries may describe hard feelings; copying them out should
 * only stop at the worst content.
 */
const LENIENT_SAFETY = [
  HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
  HarmCategory.HARM_CATEGORY_HARASSMENT,
  HarmCategory.HARM_CATEGORY_HATE_SPEECH,
  HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
].map((category) => ({ category, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH }));

/**
 * OpenAI-compatible chat endpoint, streaming or not. The path matches what the
 * app's existing client appends to a base URL.
 */
app.post('/v1/chat/completions', async (req: Request, res: Response) => {
  const uid = await authenticate(req, res);
  if (!uid) return;

  if (!limiter.allow(uid)) {
    res.status(429).json({ error: 'too many requests, try again later' });
    return;
  }

  let request;
  try {
    request = parseChatRequest(req.body, config);
  } catch (err) {
    if (err instanceof BadRequest) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }

  const userText = lastUserText(request.messages);
  if (screenText(userText) === 'crisis') {
    const reply = crisisReply(crisisLanguage(userText));
    res.setHeader(SAFETY_HEADER, 'crisis');
    if (request.stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.write(sseChunk(reply));
      res.end('data: [DONE]\n\n');
    } else {
      res.json(completion(reply));
    }
    console.log(JSON.stringify({ event: 'crisis_screen', uid }));
    return;
  }

  // Budget is checked only here, after crisis screening: crisis replies never
  // call the model and must never be refused for budget reasons. If the budget
  // store itself fails, the call is refused (fail closed).
  const inputChars = request.messages.reduce((sum, m) => sum + m.content.length, 0);
  let reservation: Reservation | null;
  try {
    reservation = await dailyBudget.reserve(worstCaseInr(inputChars));
  } catch (err) {
    console.error(JSON.stringify({ event: 'budget_store_error', message: String(err) }));
    res.status(503).json({ error: 'AI is temporarily unavailable' });
    return;
  }
  if (!reservation) {
    console.error(JSON.stringify({ event: 'daily_budget_reached' }));
    res.status(429).json({ error: 'daily AI limit reached, try again tomorrow' });
    return;
  }

  const { systemInstruction, contents } = toGemini(request.messages);
  const params = {
    model: config.model,
    contents,
    config: generationConfig(systemInstruction),
  };

  if (!request.stream) {
    try {
      const response = await ai.models.generateContent(params);
      await settle(reservation, response.usageMetadata);
      const text = response.text ?? '';
      if (!text.trim()) {
        res.status(502).json({ error: 'model returned no text' });
        return;
      }
      res.json(completion(text));
    } catch (err) {
      // A rejected request is not billed by Vertex AI, so release the hold.
      await dailyBudget.settle(reservation, 0).catch(() => undefined);
      console.error(JSON.stringify({ event: 'gemini_error', message: String(err) }));
      res.status(502).json({ error: 'model request failed' });
    }
    return;
  }

  const abort = new AbortController();
  res.on('close', () => abort.abort());
  let usage: UsageCounts | undefined;
  try {
    const stream = await ai.models.generateContentStream({
      ...params,
      config: { ...params.config, abortSignal: abort.signal },
    });
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders();
    for await (const chunk of stream) {
      if (chunk.usageMetadata) usage = chunk.usageMetadata;
      const text = chunk.text;
      if (text) res.write(sseChunk(text));
    }
    res.end('data: [DONE]\n\n');
    await settle(reservation, usage);
  } catch (err) {
    // A cut stream keeps the worst-case hold: the real cost is unknown.
    if (abort.signal.aborted) return;
    console.error(JSON.stringify({ event: 'gemini_error', message: String(err) }));
    if (!res.headersSent) {
      res.status(502).json({ error: 'model request failed' });
    } else {
      // The app treats a stream without [DONE] as interrupted and offers retry.
      res.end();
    }
  }
});

/**
 * Voice journaling: turns a short recording into text. The text goes back to
 * the journal box for the user to check; it is not saved or screened here
 * (screening happens when the user talks it through, as for typed text).
 */
app.post('/v1/transcribe', async (req: Request, res: Response) => {
  const uid = await authenticate(req, res);
  if (!uid) return;

  if (!limiter.allow(uid)) {
    res.status(429).json({ error: 'too many requests, try again later' });
    return;
  }

  let request;
  try {
    request = parseTranscribeRequest(req.body);
  } catch (err) {
    if (err instanceof BadRequest) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }

  // Audio costs more than text, so both the hold and the settled cost count
  // input tokens at a multiple of the text price.
  const audioTokens = AUDIO_TOKENS_PER_SECOND * MAX_AUDIO_SECONDS;
  let reservation: Reservation | null;
  try {
    reservation = await dailyBudget.reserve(
      worstCaseInr(audioTokens * AUDIO_PRICE_MULTIPLIER),
    );
  } catch (err) {
    console.error(JSON.stringify({ event: 'budget_store_error', message: String(err) }));
    res.status(503).json({ error: 'AI is temporarily unavailable' });
    return;
  }
  if (!reservation) {
    console.error(JSON.stringify({ event: 'daily_budget_reached' }));
    res.status(429).json({ error: 'daily AI limit reached, try again tomorrow' });
    return;
  }

  try {
    const response = await ai.models.generateContent({
      model: config.model,
      contents: [
        {
          role: 'user',
          parts: [{ inlineData: { mimeType: request.mimeType, data: request.audio } }],
        },
      ],
      config: {
        systemInstruction: TRANSCRIBE_INSTRUCTION,
        maxOutputTokens: config.maxOutputTokens,
        safetySettings: LENIENT_SAFETY,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });
    const usage = response.usageMetadata;
    await settle(
      reservation,
      usage?.promptTokenCount
        ? { ...usage, promptTokenCount: usage.promptTokenCount * AUDIO_PRICE_MULTIPLIER }
        : undefined,
    );
    res.json({ text: (response.text ?? '').trim() });
    console.log(JSON.stringify({ event: 'transcribe', uid }));
  } catch (err) {
    await dailyBudget.settle(reservation, 0).catch(() => undefined);
    console.error(JSON.stringify({ event: 'gemini_error', message: String(err) }));
    res.status(502).json({ error: 'transcription failed' });
  }
});

/**
 * Photo journaling: Gemini copies out handwriting or captions the photo, and
 * the photo is kept in the caller's private folder (when a bucket is set).
 */
app.post('/v1/photo', async (req: Request, res: Response) => {
  const uid = await authenticate(req, res);
  if (!uid) return;

  if (!limiter.allow(uid)) {
    res.status(429).json({ error: 'too many requests, try again later' });
    return;
  }

  let request;
  try {
    request = parsePhotoRequest(req.body);
  } catch (err) {
    if (err instanceof BadRequest) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }

  let reservation: Reservation | null;
  try {
    reservation = await dailyBudget.reserve(worstCaseInr(IMAGE_TOKENS));
  } catch (err) {
    console.error(JSON.stringify({ event: 'budget_store_error', message: String(err) }));
    res.status(503).json({ error: 'AI is temporarily unavailable' });
    return;
  }
  if (!reservation) {
    console.error(JSON.stringify({ event: 'daily_budget_reached' }));
    res.status(429).json({ error: 'daily AI limit reached, try again tomorrow' });
    return;
  }

  try {
    const response = await ai.models.generateContent({
      model: config.model,
      contents: [
        {
          role: 'user',
          parts: [{ inlineData: { mimeType: request.mimeType, data: request.image } }],
        },
      ],
      config: {
        systemInstruction: photoInstruction(request.lang),
        maxOutputTokens: config.maxOutputTokens,
        safetySettings: LENIENT_SAFETY,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });
    await settle(reservation, response.usageMetadata);
    const text = (response.text ?? '').trim();

    let photoId: string | undefined;
    if (photoBucket) {
      photoId = randomBytes(12).toString('base64url');
      await photoBucket.file(photoPath(uid, photoId)).save(
        Buffer.from(request.image, 'base64'),
        { contentType: request.mimeType, resumable: false },
      );
    }
    res.json({ text, photoId });
    console.log(JSON.stringify({ event: 'photo', uid, stored: Boolean(photoId) }));
  } catch (err) {
    await dailyBudget.settle(reservation, 0).catch(() => undefined);
    console.error(JSON.stringify({ event: 'photo_error', message: String(err) }));
    res.status(502).json({ error: 'could not read the photo' });
  }
});

/**
 * Mood insights: scores a batch of the caller's entries (1 to 5 plus one
 * feeling word each) in a single structured-output call.
 */
app.post('/v1/mood', async (req: Request, res: Response) => {
  const uid = await authenticate(req, res);
  if (!uid) return;

  if (!limiter.allow(uid)) {
    res.status(429).json({ error: 'too many requests, try again later' });
    return;
  }

  let entries;
  try {
    entries = parseMoodRequest(req.body);
  } catch (err) {
    if (err instanceof BadRequest) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }

  const prompt = moodPrompt(entries);
  let reservation: Reservation | null;
  try {
    reservation = await dailyBudget.reserve(
      costInr(
        { inputTokens: prompt.length + 1000, outputTokens: MOOD_MAX_OUTPUT_TOKENS },
        config.prices,
      ),
    );
  } catch (err) {
    console.error(JSON.stringify({ event: 'budget_store_error', message: String(err) }));
    res.status(503).json({ error: 'AI is temporarily unavailable' });
    return;
  }
  if (!reservation) {
    console.error(JSON.stringify({ event: 'daily_budget_reached' }));
    res.status(429).json({ error: 'daily AI limit reached, try again tomorrow' });
    return;
  }

  try {
    const response = await ai.models.generateContent({
      model: config.model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        systemInstruction: MOOD_INSTRUCTION,
        maxOutputTokens: MOOD_MAX_OUTPUT_TOKENS,
        responseMimeType: 'application/json',
        responseJsonSchema: MOOD_RESPONSE_SCHEMA,
        safetySettings: LENIENT_SAFETY,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });
    await settle(reservation, response.usageMetadata);
    const scores = parseMoodResponse(response.text ?? '', entries);
    res.json({ scores });
    console.log(
      JSON.stringify({ event: 'mood', uid, asked: entries.length, scored: scores.length }),
    );
  } catch (err) {
    await dailyBudget.settle(reservation, 0).catch(() => undefined);
    console.error(JSON.stringify({ event: 'mood_error', message: String(err) }));
    res.status(502).json({ error: 'could not read the mood' });
  }
});

/** Sends back one of the caller's own photos. */
app.get('/v1/photo/:id', async (req: Request, res: Response) => {
  const uid = await authenticate(req, res);
  if (!uid) return;
  if (!photoBucket || !isPhotoId(req.params.id)) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  const file = photoBucket.file(photoPath(uid, req.params.id));
  try {
    const [[metadata], [data]] = await Promise.all([file.getMetadata(), file.download()]);
    res.setHeader('Content-Type', metadata.contentType ?? 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.send(data);
  } catch {
    res.status(404).json({ error: 'not found' });
  }
});

/** Deletes one of the caller's own photos (when its entry is deleted). */
app.delete('/v1/photo/:id', async (req: Request, res: Response) => {
  const uid = await authenticate(req, res);
  if (!uid) return;
  if (!photoBucket || !isPhotoId(req.params.id)) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  await photoBucket
    .file(photoPath(uid, req.params.id))
    .delete({ ignoreNotFound: true })
    .catch((err: unknown) =>
      console.error(JSON.stringify({ event: 'photo_delete_error', message: String(err) })),
    );
  res.sendStatus(204);
});

app.listen(config.port, () => {
  console.log(
    JSON.stringify({ event: 'listening', port: config.port, model: config.model }),
  );
});
