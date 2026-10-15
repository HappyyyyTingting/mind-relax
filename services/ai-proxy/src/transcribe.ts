import { BadRequest } from './messages.js';

/**
 * Voice journaling: the app records a short clip and sends it here as base64;
 * Gemini returns the words as plain text, which lands in the journal box for
 * the user to read and edit before saving. Nothing is stored on the server.
 */

export interface TranscribeRequest {
  /** Base64 audio, no data: prefix. */
  audio: string;
  mimeType: string;
}

/** Formats browsers record in (Chrome/Android: webm, Safari/iOS: mp4). */
const ALLOWED_MIME = new Set([
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/aac',
]);

/**
 * Two minutes of the codecs browsers use is well under 2 MB of base64; the
 * app stops recording at two minutes anyway.
 */
export const MAX_AUDIO_BASE64_CHARS = 2_000_000;

/** Gemini counts audio at 32 tokens per second. */
export const AUDIO_TOKENS_PER_SECOND = 32;
export const MAX_AUDIO_SECONDS = 120;

/**
 * Audio input is billed above text input. The budget guard multiplies the
 * input price by this so its estimate errs high.
 */
export const AUDIO_PRICE_MULTIPLIER = 3;

export const TRANSCRIBE_INSTRUCTION = [
  'You transcribe a short spoken journal entry.',
  'Write down exactly what the speaker says, in the language they speak.',
  'Add normal punctuation and paragraph breaks. Remove filler sounds like "um".',
  'Write Chinese in Simplified characters.',
  'Do not answer, summarise, translate or add anything.',
  'If there is no clear speech, reply with nothing.',
].join(' ');

/** Validates the untrusted body; throws BadRequest with a reason. */
export function parseTranscribeRequest(body: unknown): TranscribeRequest {
  if (typeof body !== 'object' || body === null) {
    throw new BadRequest('body must be a JSON object');
  }
  const { audio, mimeType } = body as Record<string, unknown>;
  if (typeof audio !== 'string' || audio.length === 0) {
    throw new BadRequest('audio must be a non-empty base64 string');
  }
  if (audio.length > MAX_AUDIO_BASE64_CHARS) {
    throw new BadRequest('recording is too long');
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(audio)) {
    throw new BadRequest('audio must be base64');
  }
  if (typeof mimeType !== 'string') {
    throw new BadRequest('mimeType is required');
  }
  // Browsers add codec details, e.g. "audio/webm;codecs=opus".
  const baseType = mimeType.split(';')[0].trim().toLowerCase();
  if (!ALLOWED_MIME.has(baseType)) {
    throw new BadRequest('unsupported audio format');
  }
  return { audio, mimeType: baseType };
}
