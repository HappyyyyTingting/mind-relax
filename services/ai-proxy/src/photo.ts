import { BadRequest } from './messages.js';

/**
 * Photo journaling: the app sends one photo (already shrunk on the phone,
 * which also drops location data). Gemini copies out any handwriting or
 * printed text, or else writes one short line about what the photo shows.
 * The text goes to the journal box for the user to edit; the photo itself is
 * kept in the user's own private folder in Cloud Storage so it can be shown
 * with the entry later.
 */

export interface PhotoRequest {
  /** Base64 image, no data: prefix. */
  image: string;
  mimeType: string;
  /** App language, so a caption is written in it. */
  lang: 'en' | 'zh';
}

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** The app sends at most 1280px JPEGs, a few hundred KB. */
export const MAX_IMAGE_BASE64_CHARS = 3_000_000;

/** Gemini counts one image as at most this many input tokens. */
export const IMAGE_TOKENS = 1_200;

/** Photo ids are generated here; anything else is refused. */
const PHOTO_ID = /^[A-Za-z0-9_-]{8,40}$/;

export function photoInstruction(lang: 'en' | 'zh'): string {
  const language = lang === 'zh' ? 'Simplified Chinese' : 'English';
  return [
    'You help someone add a photo to their private journal.',
    'If the photo shows handwriting or printed text (for example a diary page or a note),',
    'copy the text out exactly, in its own language. Keep paragraph breaks, but join lines that wrap mid-sentence.',
    `Otherwise write one short, plain sentence in ${language} saying what the photo shows,`,
    'as a starting point for their entry. Do not guess feelings, names or places.',
    'Reply with the text only.',
  ].join(' ');
}

export function isPhotoId(value: unknown): value is string {
  return typeof value === 'string' && PHOTO_ID.test(value);
}

/** Each user's photos live under their own folder; ids cannot climb out. */
export function photoPath(uid: string, id: string): string {
  return `u/${uid}/${id}.jpg`;
}

/** Validates the untrusted body; throws BadRequest with a reason. */
export function parsePhotoRequest(body: unknown): PhotoRequest {
  if (typeof body !== 'object' || body === null) {
    throw new BadRequest('body must be a JSON object');
  }
  const { image, mimeType, lang } = body as Record<string, unknown>;
  if (typeof image !== 'string' || image.length === 0) {
    throw new BadRequest('image must be a non-empty base64 string');
  }
  if (image.length > MAX_IMAGE_BASE64_CHARS) {
    throw new BadRequest('photo is too large');
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(image)) {
    throw new BadRequest('image must be base64');
  }
  if (typeof mimeType !== 'string' || !ALLOWED_MIME.has(mimeType.toLowerCase())) {
    throw new BadRequest('unsupported image format');
  }
  return {
    image,
    mimeType: mimeType.toLowerCase(),
    lang: lang === 'zh' ? 'zh' : 'en',
  };
}
