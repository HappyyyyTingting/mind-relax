/**
 * Client-side crisis screening. The phrase lists mirror
 * services/ai-proxy/src/safety.ts so the help card also appears in on-device
 * and custom-endpoint modes, where no server screens the text. In Google
 * Gemini mode the server additionally answers with a fixed reply and flags it
 * through the X-Mind-Relax-Safety header.
 *
 * False positives are acceptable (the user sees a help card they can hide);
 * false negatives are the failure that matters, so phrases lean broad.
 */

const ENGLISH_PATTERNS: RegExp[] = [
  /\bkill(ing)? myself\b/i,
  /\bend(ing)? (my|it all|my own) li(fe|ves)\b/i,
  /\bend it all\b/i,
  /\bsuicid(e|al)\b/i,
  /\bwant(ed)? to die\b/i,
  /\bwish i (was|were) dead\b/i,
  /\bbetter off dead\b/i,
  /\b(hurt|harm|cut)(ing)? myself\b/i,
  /\bself[- ]?harm\b/i,
  /\bno reason to (live|go on)\b/i,
  /\bdon'?t want to (live|be alive|wake up)\b/i,
  /\btake my (own )?life\b/i,
  /\boverdose\b/i,
];

const CHINESE_PATTERNS: RegExp[] = [
  /自杀/,
  /轻生/,
  /不想活/,
  /活不下去/,
  /想死/,
  /去死/,
  /结束(自己的)?生命/,
  /自残/,
  /伤害自己/,
  /割腕/,
  /跳楼/,
];

export function isCrisisText(text: string): boolean {
  return [...ENGLISH_PATTERNS, ...CHINESE_PATTERNS].some((pattern) =>
    pattern.test(text),
  );
}

/** Response header the AI server sets when it answered with the crisis reply. */
export const SAFETY_HEADER = 'X-Mind-Relax-Safety';

// Whether the help card is showing. Module level, so a flag raised by a reply
// that finishes while the talk page is closed is still there on return.
let crisisShown = false;
const listeners = new Set<() => void>();

function setCrisisShown(value: boolean): void {
  if (crisisShown === value) return;
  crisisShown = value;
  listeners.forEach((listener) => listener());
}

export function showCrisisCard(): void {
  setCrisisShown(true);
}

export function hideCrisisCard(): void {
  setCrisisShown(false);
}

export function getCrisisShown(): boolean {
  return crisisShown;
}

export function subscribeCrisis(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
