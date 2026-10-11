const KEY_PREFIX = 'mind_relax_talk_draft_';

function draftKey(day: string, uid: string | null): string {
  return `${KEY_PREFIX}${day}_${uid ?? 'anon'}`;
}

/**
 * The talk input draft survives refresh and route changes but is scoped to
 * one day and one account (matching the talk session lifecycle). It only
 * covers content not yet sent: sending clears it, and a day rollover or an
 * account switch naturally points at a different key.
 */
export function loadTalkDraft(day: string, uid: string | null): string {
  try {
    return localStorage.getItem(draftKey(day, uid)) ?? '';
  } catch {
    return '';
  }
}

export function saveTalkDraft(day: string, uid: string | null, text: string): void {
  try {
    localStorage.setItem(draftKey(day, uid), text);
  } catch {
    // best effort
  }
}

export function clearTalkDraft(day: string, uid: string | null): void {
  try {
    localStorage.removeItem(draftKey(day, uid));
  } catch {
    // best effort
  }
}
