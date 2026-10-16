import type { Entry } from '../types/entry';

/**
 * The words a user writes most, counted on the device: no model, no network,
 * no score. It works in every mode (Gemini, Gemma, none) and in all six app
 * languages. Chinese and Japanese have no spaces, so the browser's own word
 * splitter (Intl.Segmenter) does the splitting; very old browsers fall back
 * to splitting on spaces and punctuation.
 *
 * Each word counts once per entry, so one long entry cannot crowd out the
 * rest of the week. Small grammar words ("the", "了", "है", "nak") are
 * skipped, and so is anything that shows up in only one entry.
 */

const STOPWORDS = new Set(
  [
    // en
    'the a an and or but so if then than that this these those there here it its i im ive id me my mine myself',
    'you your we our us they them their he him his she her be been being am is are was were do does did done',
    'have has had having not no yes to of in on at for with from by about into over after before up down out',
    'just really very much more most some any all again also too still even only own same other such what which',
    'who whom when where why how can could would should will shall may might must get got go going went gone',
    'feel feeling felt today day yesterday tomorrow thing things lot bit dont didnt cant wont isnt wasnt its',
    'one two like know think want make made said say back way time now well ok okay maybe because while',
    // ms
    'saya aku awak kau dia kami kita mereka nak tak tidak ada dah sudah akan boleh dan yang ini itu ni tu dengan',
    'untuk pada dalam dari ke di je pun lagi sangat tapi tetapi kalau juga macam rasa hari apa bila mana sebab',
    'lah la kot pula masih belum semua orang buat jadi',
    // hi (romanised)
    'main mai hai hain hoon hun tha thi the ke ka ki ko mein se par aur bhi nahi nahin yeh ye woh vo toh to hi',
    'ek jo bahut aaj kar karna raha rahi rahe gaya gayi ho liye ab kuch sab mujhe mera meri mere hum ham aap tum',
    'kya kyun kaise lag laga lagta hota hoti',
    // hi (Devanagari)
    'मैं मै है हैं हूँ हूं था थी थे के का की को में से पर और भी नहीं यह ये वह वो तो ही एक कि जो बहुत आज कर करना',
    'रहा रही रहे गया गई हो लिए अब कुछ सब मुझे मेरा मेरी मेरे हम आप तुम क्या लग लगा लगता होता होती',
    // zh
    '我们 你们 他们 她们 今天 昨天 明天 一个 没有 自己 什么 就是 还是 但是 因为 所以 这个 那个 觉得 可以 已经 一直',
    '真的 有点 时候 现在 怎么 这样 然后 不是 知道 一下 一些 还有 如果 虽然 其实 可能 应该 感觉',
    // ja
    '今日 昨日 明日 自分 本当 感じ 時間 今 私',
    // ko
    '오늘 어제 내일 정말 너무 그냥 진짜 내가 나는 그리고 하지만 그래서 이제 조금 많이 있어 없어 했어 같아 좀 다시 계속',
  ]
    .join(' ')
    .split(/\s+/),
);

// Korean particles stuck to the end of a word: 회사에서 → 회사.
const KO_PARTICLES = ['에서', '한테', '으로', '은', '는', '이', '가', '을', '를', '에', '의', '도', '와', '과', '랑', '로'];

const HAN_OR_KANA = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const ONLY_HIRAGANA = /^\p{Script=Hiragana}+$/u;
const HANGUL = /\p{Script=Hangul}/u;
const LETTER = /[\p{L}\p{M}]/u;

interface Segment {
  segment: string;
  isWordLike?: boolean;
}
type SegmenterCtor = new (
  locale?: string,
  options?: { granularity: 'word' },
) => { segment(text: string): Iterable<Segment> };

const Segmenter = (Intl as unknown as { Segmenter?: SegmenterCtor }).Segmenter;
const segmenter = Segmenter ? new Segmenter(undefined, { granularity: 'word' }) : null;

function rawWords(text: string): string[] {
  if (segmenter) {
    const words: string[] = [];
    for (const { segment, isWordLike } of segmenter.segment(text)) {
      if (isWordLike) words.push(segment);
    }
    return words;
  }
  return text.split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean);
}

function stripKoParticle(word: string): string {
  for (const particle of KO_PARTICLES) {
    if (word.endsWith(particle) && word.length - particle.length >= 2) {
      return word.slice(0, -particle.length);
    }
  }
  return word;
}

/** The words of one text worth counting, lower-cased, each at most once. */
export function wordsOf(text: string): Set<string> {
  const found = new Set<string>();
  for (const raw of rawWords(text)) {
    let word = raw.toLocaleLowerCase().replace(/[’']/g, '');
    if (!LETTER.test(word)) continue; // numbers, dates
    if (HANGUL.test(word)) word = stripKoParticle(word);
    if (STOPWORDS.has(word)) continue;
    if (HAN_OR_KANA.test(word)) {
      // Single characters and plain hiragana are mostly grammar.
      if (word.length < 2 || ONLY_HIRAGANA.test(word)) continue;
    } else if (word.length < (HANGUL.test(word) ? 2 : 3)) {
      continue;
    }
    found.add(word);
  }
  return found;
}

export interface WordCount {
  word: string;
  /** How many entries used it. */
  count: number;
}

/** The most used words across the entries, most common first. */
export function topWords(entries: Entry[], limit = 12): WordCount[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    for (const word of wordsOf(entry.content)) {
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, limit);
}
