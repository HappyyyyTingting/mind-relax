const KEY_PREFIX = 'mind_relax_chat_draft_';

function draftKey(uid: string | null): string {
  return `${KEY_PREFIX}${uid ?? 'anon'}`;
}

/**
 * The home composer's draft survives route changes, refresh and restart, and
 * is scoped to one account. Unlike the talk draft it carries no day stamp: the
 * writing surface is continuous, and text written at 23:59 must not evaporate
 * at midnight (the entry still lands on whichever day it is saved). It only
 * covers content not yet saved — saving clears it, and an emptied box leaves
 * no key behind.
 *
 * This runs during render (a lazy useState initializer), and the app has no
 * error boundary, so the try has to cover the localStorage lookup itself: some
 * privacy configurations throw on the property access, not just on getItem.
 */
export function loadChatDraft(uid: string | null): string {
  try {
    return localStorage.getItem(draftKey(uid)) ?? '';
  } catch {
    return '';
  }
}

/**
 * Empty text removes the key instead of storing an empty string, so flushing
 * an empty box (on unmount, or the one StrictMode's double mount causes) can
 * never leave a stale draft behind.
 */
export function saveChatDraft(uid: string | null, text: string): void {
  try {
    if (text === '') {
      localStorage.removeItem(draftKey(uid));
      return;
    }
    localStorage.setItem(draftKey(uid), text);
  } catch {
    // best effort
  }
}

export function clearChatDraft(uid: string | null): void {
  try {
    localStorage.removeItem(draftKey(uid));
  } catch {
    // best effort
  }
}
