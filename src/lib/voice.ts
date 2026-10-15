import { auth } from './firebase';
import { GEMINI_PROXY_URL } from './modelConfig';

/** Recording stops by itself at this length (the server's limit too). */
export const MAX_RECORDING_MS = 120_000;

const TRANSCRIBE_TIMEOUT_MS = 45_000;

export class VoiceError extends Error {
  constructor(readonly reason: 'denied' | 'empty' | 'failed') {
    super(reason);
  }
}

/** True when this browser can record audio at all. */
export function canRecord(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

/**
 * Chrome and Android record webm/opus; Safari and iOS record mp4/aac. Both
 * are small enough that two minutes stays well under the server's limit.
 */
export function pickMimeType(): string {
  for (const type of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(new Error('could not read recording'));
    reader.readAsDataURL(blob);
  });
}

/**
 * transcribeAudio sends one recording to the Gemini server and returns the
 * spoken words as text. The recording is not stored anywhere.
 */
export async function transcribeAudio(blob: Blob): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new VoiceError('failed');
  const token = await user.getIdToken();
  const audio = await blobToBase64(blob);

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TRANSCRIBE_TIMEOUT_MS);
  try {
    const response = await fetch(`${GEMINI_PROXY_URL.replace(/\/+$/, '')}/transcribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ audio, mimeType: blob.type || 'audio/webm' }),
      signal: controller.signal,
    });
    if (!response.ok) throw new VoiceError('failed');
    const parsed = (await response.json()) as { text?: unknown };
    const text = typeof parsed.text === 'string' ? parsed.text.trim() : '';
    if (!text) throw new VoiceError('empty');
    return text;
  } catch (err) {
    if (err instanceof VoiceError) throw err;
    throw new VoiceError('failed');
  } finally {
    window.clearTimeout(timer);
  }
}
