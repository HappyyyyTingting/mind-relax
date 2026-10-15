import { db } from '../db/db';
import { getLang } from './i18n';
import { blobToBase64, proxyFetch } from './proxy';
import { isSyncEnabled } from './syncSettings';

/**
 * Where a photo lives follows the cloud sync switch, like entries do. With
 * sync on, the server keeps it in the user's private Cloud Storage folder so
 * every signed-in device can show it. With sync off, Gemini only reads it for
 * the text and the photo itself is saved on this device; its id starts with
 * "local-" so the helpers below know where to look.
 */
const LOCAL_PREFIX = 'local-';

function isLocalId(id: string): boolean {
  return id.startsWith(LOCAL_PREFIX);
}

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
  /**
   * Where the photo was kept: a server id (sync on), a "local-" id on this
   * device (sync off), or absent when a local test server stored nothing.
   */
  photoId?: string;
}

/** Sends one shrunk photo to Gemini and returns its text. */
export async function readPhoto(blob: Blob): Promise<PhotoReading> {
  const keep = isSyncEnabled();
  const image = await blobToBase64(blob);
  const response = await proxyFetch('/photo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image, mimeType: 'image/jpeg', lang: getLang(), keep }),
  });
  if (!response.ok) throw new Error('photo request failed');
  const parsed = (await response.json()) as { text?: unknown; photoId?: unknown };
  const text = typeof parsed.text === 'string' ? parsed.text.trim() : '';
  if (!keep) {
    const id = `${LOCAL_PREFIX}${crypto.randomUUID()}`;
    await db.photos.put({ id, blob });
    return { text, photoId: id };
  }
  return { text, photoId: typeof parsed.photoId === 'string' ? parsed.photoId : undefined };
}

/** Object URLs of photos already fetched in this visit, by photo id. */
const urlCache = new Map<string, Promise<string>>();

async function loadPhoto(id: string): Promise<Blob> {
  if (isLocalId(id)) {
    // Missing on a device the entry was synced to later: nothing to show.
    const local = await db.photos.get(id);
    if (!local) throw new Error('photo not on this device');
    return local.blob;
  }
  const response = await proxyFetch(`/photo/${encodeURIComponent(id)}`);
  if (!response.ok) throw new Error('photo not found');
  return response.blob();
}

/** Loads one of the user's own photos and returns a URL an <img> can show. */
export function photoUrl(id: string): Promise<string> {
  let cached = urlCache.get(id);
  if (!cached) {
    cached = loadPhoto(id).then((blob) => URL.createObjectURL(blob));
    // A failed load can be retried on the next visit to the page.
    cached.catch(() => urlCache.delete(id));
    urlCache.set(id, cached);
  }
  return cached;
}

/** Best effort: removes the stored photo when its entry is deleted. */
export async function deletePhoto(id: string): Promise<void> {
  try {
    if (isLocalId(id)) {
      await db.photos.delete(id);
      return;
    }
    await proxyFetch(`/photo/${encodeURIComponent(id)}`, { method: 'DELETE' });
  } catch {
    // The entry is already gone for the user; a leftover file is harmless.
  }
}
