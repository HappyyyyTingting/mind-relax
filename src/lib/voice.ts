import { blobToBase64, proxyFetch } from './proxy';

/** Recording stops by itself at this length (the server's limit too). */
export const MAX_RECORDING_MS = 120_000;

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

/**
 * transcribeAudio sends one recording to the Gemini server and returns the
 * spoken words as text. The recording is not stored anywhere.
 */
export async function transcribeAudio(blob: Blob): Promise<string> {
  try {
    const audio = await blobToBase64(blob);
    const response = await proxyFetch('/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio, mimeType: blob.type || 'audio/webm' }),
    });
    if (!response.ok) throw new VoiceError('failed');
    const parsed = (await response.json()) as { text?: unknown };
    const text = typeof parsed.text === 'string' ? parsed.text.trim() : '';
    if (!text) throw new VoiceError('empty');
    return text;
  } catch (err) {
    if (err instanceof VoiceError) throw err;
    throw new VoiceError('failed');
  }
}
