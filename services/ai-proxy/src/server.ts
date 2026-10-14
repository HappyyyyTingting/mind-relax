import express, { type NextFunction, type Request, type Response } from 'express';
import {
  GoogleGenAI,
  HarmBlockThreshold,
  HarmCategory,
  type GenerateContentConfig,
} from '@google/genai';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { config } from './config.js';
import {
  BadRequest,
  completion,
  lastUserText,
  parseChatRequest,
  sseChunk,
  toGemini,
} from './messages.js';
import { RateLimiter } from './rateLimit.js';
import { SAFETY_INSTRUCTION, crisisReply, looksChinese, screenText } from './safety.js';

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

const limiter = new RateLimiter(config.requestsPerHour, 60 * 60 * 1000);

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));

app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  if (origin && config.allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
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
    ...(config.thinkingBudget !== undefined
      ? { thinkingConfig: { thinkingBudget: config.thinkingBudget } }
      : {}),
  };
}

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
    const reply = crisisReply(looksChinese(userText));
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

  const { systemInstruction, contents } = toGemini(request.messages);
  const params = {
    model: config.model,
    contents,
    config: generationConfig(systemInstruction),
  };

  if (!request.stream) {
    try {
      const response = await ai.models.generateContent(params);
      const text = response.text ?? '';
      if (!text.trim()) {
        res.status(502).json({ error: 'model returned no text' });
        return;
      }
      res.json(completion(text));
    } catch (err) {
      console.error(JSON.stringify({ event: 'gemini_error', message: String(err) }));
      res.status(502).json({ error: 'model request failed' });
    }
    return;
  }

  const abort = new AbortController();
  res.on('close', () => abort.abort());
  try {
    const stream = await ai.models.generateContentStream({
      ...params,
      config: { ...params.config, abortSignal: abort.signal },
    });
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders();
    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) res.write(sseChunk(text));
    }
    res.end('data: [DONE]\n\n');
  } catch (err) {
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

app.listen(config.port, () => {
  console.log(
    JSON.stringify({ event: 'listening', port: config.port, model: config.model }),
  );
});
