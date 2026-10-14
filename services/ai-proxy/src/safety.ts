/**
 * Crisis screening for the newest user message. This is a deliberately simple
 * phrase match: it runs before any model call, costs nothing, and behaves the
 * same every time. It is a first line only. Gemini's safety settings and the
 * system instruction added in server.ts sit behind it.
 *
 * False positives are acceptable here (the user sees a gentle reply and a help
 * card); false negatives are the failure that matters, so phrases lean broad.
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

export type SafetyLevel = 'ok' | 'crisis';

export function screenText(text: string): SafetyLevel {
  const matched = [...ENGLISH_PATTERNS, ...CHINESE_PATTERNS].some((pattern) =>
    pattern.test(text),
  );
  return matched ? 'crisis' : 'ok';
}

/** True when the text is mostly Chinese, used to pick the reply language. */
export function looksChinese(text: string): boolean {
  const cjk = text.match(/[㐀-鿿]/g)?.length ?? 0;
  return cjk > 0 && cjk >= text.replace(/\s/g, '').length / 3;
}

/**
 * The fixed reply sent instead of a model answer when screening fires. It is
 * fixed on purpose: a crisis moment is not the place for a model to improvise.
 * The app shows region-specific helplines in a card next to it.
 */
export function crisisReply(chinese: boolean): string {
  if (chinese) {
    return [
      '谢谢你愿意把这么沉重的感受说出来。你现在的安全最重要。',
      '如果你有伤害自己的想法，请现在就联系身边信任的人，或拨打当地的心理援助热线；如果有紧急危险，请立刻拨打当地急救电话。',
      '下方列出了一些可以随时求助的热线。你不需要一个人扛着这些。',
    ].join('\n\n');
  }
  return [
    "Thank you for telling me how heavy things feel right now. Your safety matters most.",
    "If you're thinking about hurting yourself, please reach out to someone you trust or a crisis line now. If you are in immediate danger, call your local emergency number.",
    "You'll find helplines below that you can contact any time. You don't have to carry this alone.",
  ].join('\n\n');
}

/** Added to every system instruction as a backstop to the phrase match. */
export const SAFETY_INSTRUCTION = [
  'Safety rule (overrides everything above):',
  'You are a reflection companion, not a therapist or a medical service.',
  'If the user mentions suicide, self-harm, wanting to die, or being in danger,',
  'stop coaching or analysing. Respond briefly and warmly, say their safety matters,',
  'and encourage them to contact a trusted person, a local crisis helpline, or emergency services.',
  'Never give instructions or information that could be used for self-harm.',
].join(' ');
