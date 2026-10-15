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

// Hindi in Devanagari, plus the common romanised (Hinglish) spellings.
// Text is matched with the nukta dot removed, so खुद and ख\u093Cुद both match.
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

export type SafetyLevel = 'ok' | 'crisis';

/** Languages the fixed crisis reply is written in. */
export type ReplyLang = 'en' | 'zh' | 'hi' | 'ms' | 'ja' | 'ko';

const ALL_PATTERNS = [
  ...ENGLISH_PATTERNS,
  ...CHINESE_PATTERNS,
  ...HINDI_PATTERNS,
  ...MALAY_PATTERNS,
  ...JAPANESE_PATTERNS,
  ...KOREAN_PATTERNS,
];

/** Removes the Devanagari nukta so spellings with and without it match. */
function normalise(text: string): string {
  return text.normalize('NFD').replace(/\u093C/g, '').normalize('NFC');
}

export function screenText(text: string): SafetyLevel {
  const normalised = normalise(text);
  return ALL_PATTERNS.some((pattern) => pattern.test(normalised)) ? 'crisis' : 'ok';
}

/** True when the text is mostly Chinese, used to pick the reply language. */
export function looksChinese(text: string): boolean {
  const cjk = text.match(/[㐀-鿿]/g)?.length ?? 0;
  return cjk > 0 && cjk >= text.replace(/\s/g, '').length / 3;
}

/**
 * Picks the crisis reply language from the text itself. Scripts decide first
 * (kana means Japanese even with kanji in it); Malay and romanised Hindi are
 * recognised by the phrase that matched. Anything else gets English.
 */
export function crisisLanguage(text: string): ReplyLang {
  if (/[\u3040-\u30ff]/.test(text)) return 'ja';
  if (/[\uac00-\ud7af]/.test(text)) return 'ko';
  if (/[\u0900-\u097f]/.test(text)) return 'hi';
  if (looksChinese(text)) return 'zh';
  const normalised = normalise(text);
  if (MALAY_PATTERNS.some((pattern) => pattern.test(normalised))) return 'ms';
  if (HINDI_PATTERNS.some((pattern) => pattern.test(normalised))) return 'hi';
  return 'en';
}

const CRISIS_REPLIES: Record<ReplyLang, string[]> = {
  en: [
    "Thank you for telling me how heavy things feel right now. Your safety matters most.",
    "If you're thinking about hurting yourself, please reach out to someone you trust or a crisis line now. If you are in immediate danger, call your local emergency number.",
    "You'll find helplines below that you can contact any time. You don't have to carry this alone.",
  ],
  zh: [
    '谢谢你愿意把这么沉重的感受说出来。你现在的安全最重要。',
    '如果你有伤害自己的想法，请现在就联系身边信任的人，或拨打当地的心理援助热线；如果有紧急危险，请立刻拨打当地急救电话。',
    '下方列出了一些可以随时求助的热线。你不需要一个人扛着这些。',
  ],
  hi: [
    'मुझे यह बताने के लिए धन्यवाद कि अभी सब कितना भारी लग रहा है। आपकी सुरक्षा सबसे ज\u093Cरूरी है।',
    'अगर आप ख\u093Cुद को नुकसान पहुँचाने के बारे में सोच रहे हैं, तो कृपया अभी किसी भरोसेमंद व्यक्ति या हेल्पलाइन से बात करें। अगर आप तुरंत ख\u093Cतरे में हैं, तो अपने इलाके का इमरजेंसी नंबर (भारत में 112) मिलाएँ।',
    'नीचे कुछ हेल्पलाइन दी गई हैं जिनसे आप कभी भी संपर्क कर सकते हैं। आपको यह सब अकेले नहीं झेलना है।',
  ],
  ms: [
    'Terima kasih kerana memberitahu saya betapa beratnya perasaan anda sekarang. Keselamatan anda paling penting.',
    'Jika anda terfikir untuk mencederakan diri, sila hubungi seseorang yang anda percayai atau talian krisis sekarang. Jika anda dalam bahaya segera, hubungi nombor kecemasan tempatan (999 di Malaysia).',
    'Di bawah ada talian bantuan yang boleh anda hubungi bila-bila masa. Anda tidak perlu menanggung semua ini seorang diri.',
  ],
  ja: [
    '今どれほどつらいかを話してくれて、ありがとうございます。何よりもあなたの安全が大切です。',
    '自分を傷つけることを考えているなら、今すぐ信頼できる人か相談窓口に連絡してください。すぐに危険がある場合は、地域の緊急番号（日本では 119 または 110）に電話してください。',
    '下に、いつでも連絡できる相談窓口があります。ひとりで抱え込まなくていいのです。',
  ],
  ko: [
    '지금 얼마나 힘든지 말해 줘서 고마워요. 무엇보다 당신의 안전이 가장 중요해요.',
    '스스로를 해칠 생각이 든다면 지금 바로 믿을 수 있는 사람이나 상담 전화에 연락해 주세요. 지금 바로 위험하다면 지역 긴급 번호(한국은 119 또는 112)로 전화하세요.',
    '아래에 언제든 연락할 수 있는 상담 전화가 있어요. 혼자 감당하지 않아도 돼요.',
  ],
};

/**
 * The fixed reply sent instead of a model answer when screening fires. It is
 * fixed on purpose: a crisis moment is not the place for a model to improvise.
 * The app shows region-specific helplines in a card next to it.
 */
export function crisisReply(lang: ReplyLang): string {
  return CRISIS_REPLIES[lang].join('\n\n');
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
