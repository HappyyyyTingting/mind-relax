import { auth } from './firebase';
import { GEMINI_PROXY_URL } from './modelConfig';

/**
 * proxyFetch calls a path on the Gemini server (services/ai-proxy) as the
 * signed-in user. It holds no secret: the Firebase ID token proves who is
 * calling, and the server applies its own rate and spend limits.
 */
export async function proxyFetch(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const user = auth.currentUser;
  if (!user) throw new Error('sign-in required');
  const token = await user.getIdToken();
  const { timeoutMs = 45_000, headers, ...rest } = init;

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${GEMINI_PROXY_URL.replace(/\/+$/, '')}${path}`, {
      ...rest,
      headers: { ...headers, Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timer);
  }
}

/** Base64 of a blob, without the data: prefix. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(new Error('could not read file'));
    reader.readAsDataURL(blob);
  });
}
