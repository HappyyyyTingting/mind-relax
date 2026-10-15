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

// Hindi in Devanagari, plus the common romanised (Hinglish) spellings.
// Text is matched with the nukta dot removed, so खुद and ख़ुद both match.
const HINDI_PATTERNS: RegExp[] = [
  /आत्महत्या/,
  /खुदकुशी/,
  /मरना चाहत[ाी]/,
  /मर जाना चाहत[ाी]/,
  /जीना नहीं चाहत[ाी]/,
  /जान दे (दू|दूं|दूँ|दूंगा|दूँगा|दूंगी|दूँगी|देना)/,
  /(खुद|अपने आप) को (नुकसान|चोट|खत्म)/,
  /नस काट/,
  /\b(aatmahatya|atmahatya|khudkushi|khud kushi)\b/i,
  /\bmarna chah(ta|ti)\b/i,
  /\bj(ee|i)na nahi chah(ta|ti)\b/i,
];

const MALAY_PATTERNS: RegExp[] = [
  /\bbunuh diri\b/i,
  /\b(nak|mahu|mau|ingin) mati\b/i,
  /\b(tak|tidak) (mahu|nak|ingin) hidup\b/i,
  /\b(men)?cederakan diri\b/i,
  /\b(menamatkan|tamatkan) (hidup|nyawa)\b/i,
  /\bkelar (tangan|diri)\b/i,
];

const JAPANESE_PATTERNS: RegExp[] = [
  /自殺/,
  /死にたい/,
  /消えたい/,
  /自傷/,
  /リストカット|リスカ/,
  /生きて(い)?たくない|生きたくない/,
  /命を絶/,
  /自分を傷つけ/,
  /首を吊/,
];

const KOREAN_PATTERNS: RegExp[] = [
  /자살/,
  /죽고\s?싶/,
  /살고\s?싶지\s?않/,
  /자해/,
  /목숨을\s?끊/,
  /사라지고\s?싶/,
  /손목을?\s?(긋|그어)/,
];

/** Removes the Devanagari nukta so spellings with and without it match. */
function normalise(text: string): string {
  return text.normalize('NFD').replace(/\u093C/g, '').normalize('NFC');
}

export function isCrisisText(text: string): boolean {
  const normalised = normalise(text);
  return [
    ...ENGLISH_PATTERNS,
    ...CHINESE_PATTERNS,
    ...HINDI_PATTERNS,
    ...MALAY_PATTERNS,
    ...JAPANESE_PATTERNS,
    ...KOREAN_PATTERNS,
  ].some((pattern) => pattern.test(normalised));
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
