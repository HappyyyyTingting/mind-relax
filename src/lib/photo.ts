import { getLang } from './i18n';
import { blobToBase64, proxyFetch } from './proxy';

/** Longest side after shrinking: plenty to read a diary page. */
const MAX_SIDE = 1280;

/**
 * shrinkImage redraws the photo at most 1280px wide or tall as a JPEG. Phone
 * photos are several MB; this keeps uploads small, and redrawing drops the
 * hidden data (such as GPS location) that cameras store in the file.
 */
export async function shrinkImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas unavailable');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('could not encode photo'))),
      'image/jpeg',
      0.82,
    );
  });
}

export interface PhotoReading {
  /** Copied handwriting, or one line saying what the photo shows. */
  text: string;
  /** Present when the server kept the photo (absent on local test servers). */
  photoId?: string;
}

/** Sends one shrunk photo to Gemini and returns its text. */
export async function readPhoto(blob: Blob): Promise<PhotoReading> {
  const image = await blobToBase64(blob);
  const response = await proxyFetch('/photo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image, mimeType: 'image/jpeg', lang: getLang() }),
  });
  if (!response.ok) throw new Error('photo request failed');
  const parsed = (await response.json()) as { text?: unknown; photoId?: unknown };
  return {
    text: typeof parsed.text === 'string' ? parsed.text.trim() : '',
    photoId: typeof parsed.photoId === 'string' ? parsed.photoId : undefined,
  };
}

/** Object URLs of photos already fetched in this visit, by photo id. */
const urlCache = new Map<string, Promise<string>>();

/** Loads one of the user's own photos and returns a URL an <img> can show. */
export function photoUrl(id: string): Promise<string> {
  let cached = urlCache.get(id);
  if (!cached) {
    cached = proxyFetch(`/photo/${encodeURIComponent(id)}`)
      .then((response) => {
        if (!response.ok) throw new Error('photo not found');
        return response.blob();
      })
      .then((blob) => URL.createObjectURL(blob));
    // A failed load can be retried on the next visit to the page.
    cached.catch(() => urlCache.delete(id));
    urlCache.set(id, cached);
  }
  return cached;
}

/** Best effort: removes the stored photo when its entry is deleted. */
export async function deletePhoto(id: string): Promise<void> {
  try {
    await proxyFetch(`/photo/${encodeURIComponent(id)}`, { method: 'DELETE' });
  } catch {
    // The entry is already gone for the user; a leftover file is harmless.
  }
}
