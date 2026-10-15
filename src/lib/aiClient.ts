import type { Entry } from '../types/entry';
import type { TalkMessage } from '../types/talk';
import { auth } from './firebase';
import { getLang, type Lang } from './i18n';
import type { ModelConfig } from './modelConfig';
import { localComplete, localStream } from './localAi';
import { SAFETY_HEADER, showCrisisCard } from './safety';
import {
  formatMonthDayWeekday,
  lastDayStarts,
  startOfLocalDay,
} from '../utils/date';

const SYSTEM_PROMPT = `# Role
你是一个帮助用户理解问题、整理思路和寻找可行下一步的思考伙伴。
你的目标不是单纯安慰用户，也不是急于解决所有问题，而是根据用户当前的表达，提供真正有帮助的回应。

# Understand the Input
在回应前，先理解：
- 用户描述的具体事件和事实是什么？
- 用户正在经历什么情绪？
- 用户担心、假设或反复思考的是什么？
- 用户当前是在表达、寻求理解、分析问题，还是寻找行动方案？
不要假设每次输入都包含明确的问题，也不要强行挖掘深层原因。

# Choose the Response Strategy
根据当前输入选择合适的回应方式：
- 用户主要在表达情绪时，先理解其处境，不急于提出建议。
- 用户反复纠结或担忧时，帮助区分事实、推测和可以控制的部分。
- 用户寻求解决方案时，聚焦真正的障碍，提供具体、可行的下一步。
- 用户面临选择时，帮助梳理选项和取舍。
- 信息不足且会显著影响判断时，优先提出一个必要的澄清问题。
不要机械地执行固定的回应步骤。

# Response Style
- 直接、自然、具体，避免空泛的鼓励。
- 不要简单复述用户已经说过的话。
- 不要把推测当成事实，不要轻易给用户贴标签。
- 避免一次给出太多分析和建议。
- 不为了显得有帮助而强行提供解决方案。
- 根据问题的复杂程度控制回答长度。

如果这是你们今天对话的开始（此前没有你的回复）：请基于用户的记录自然地开启对话，先承接情绪，再回应其中最值得聊的一件事。`;

const SUMMARY_SYSTEM_PROMPT = `你是一位客观的「整理者」，帮用户回顾今天记录的零散想法。
基于用户今天的所有记录，用纯文本输出三个小节，每小节 2～4 句：
「今天的主线」：今天主要在思考/在忙的几件事或主题
「情绪脉络」：情绪的变化起伏与整体基调
「值得留意的小信号」：反复出现的词、念头或细节
要求：客观回顾，不评判、不说教、不列行动建议；不用 Markdown 格式。`;

const TALK_SUMMARY_SYSTEM_PROMPT = `把这段「早前对话」压缩成一份简短摘要（中文约 150 字，英文约 100 词；纯文本）：
- 保留：用户提到的重要事实、反复出现的情绪与主题、未解决的疑问
- 省略：寒暄、客套、已经解决的小事
- 若提供了旧摘要，把旧摘要与新对话内容合并成一份新的完整摘要
- 用对话所用的语言输出（对话是中文就用中文，是英文就用英文），合并旧摘要时也写成同一语言`;

/**
 * The persona prompts are Chinese originals: an English body would have to be
 * kept in step with every change to them, and the reply's language is decided
 * per request by outputLanguageRule instead. What the interface language does
 * pick is the scaffolding around the user's own text — the headings framing the
 * entries and the summaries, and the starter turn for the opening request —
 * because those are the app speaking, not the user.
 */
function promptScaffolding() {
  return getLang() === 'zh'
    ? {
        entriesHeading:
          '【用户今天写下的记录】（按时间顺序，是背景素材，不是用户对你说的话，不要逐条回应）',
        summaryHeading: '【此前对话的摘要】',
        oldSummaryHeading: '【此前的对话摘要】',
        dropNote: (n: number) =>
          `【提示】早先有 ${n} 条对话消息因长度限制未包含在本次上下文中。`,
        openingTurn: '（请基于我今天的记录开始对话）',
      }
    : {
        entriesHeading:
          "[Entries the user wrote today] (in time order; background material, not messages to you; do not reply to them one by one)",
        summaryHeading: '[Summary of the earlier conversation]',
        oldSummaryHeading: '[Earlier conversation summary]',
        dropNote: (n: number) =>
          `[Note] ${n} earlier messages were left out of this context because of length limits.`,
        openingTurn: "(Please start the conversation based on my entries today.)",
      };
}

/**
 * The recap's section headings are part of the prompt's Chinese convention, so
 * an English recap needs them spelled out: a remote model usually translates
 * them on its own, a small local one reliably writes English prose under
 * 「今天的主线」. These are the English labels this build already ships;
 * renaming them would change the headings of every English recap already
 * written.
 */
const SUMMARY_HEADING_RULE = `小节标题也用同一语言：英文依次用 Today's main threads / Emotional arc / Small signals worth noticing。`;

/** The interface language as the prompt names it, for the tiebreaker below. */
const FALLBACK_LANGUAGE_NAMES: Record<Lang, string> = {
  en: 'English',
  zh: '中文',
  hi: '印地语（Hindi）',
  ms: '马来语（Malay）',
  ja: '日语（Japanese）',
  ko: '韩语（Korean）',
};

/**
 * Output language: follow the user's own words — the newest ones win, so one
 * English entry turns a Chinese interface's reply around — with the interface
 * language only as the tiebreaker, for a request with nothing of the user's to
 * go by. Resolved per request rather than at module load, so a language
 * switched in settings applies from the next request on.
 *
 * The parenthetical starter turn requestFor adds for Gemini is named and
 * excluded: it is a user turn the app wrote, and counting it would let an
 * English interface with Chinese entries come back in English. The scaffolding
 * headings are app text too, which is why the rule points at the entries and
 * the messages the user really sent, not at "anything in this request".
 */
function outputLanguageRule(lang: Lang): string {
  const fallback = FALLBACK_LANGUAGE_NAMES[lang];
  return `输出语言：用与用户相同的语言——用户写中文就用中文，写英文就用英文。判断依据是「用户今天写下的记录」和用户真正发来的消息（系统补的那句括号提示不算用户说的话），以最新的为准；若没有可判断的文字，或中英文混杂，用${fallback}输出。`;
}

export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Days with entries one review reads. */
export const WEEKLY_SAMPLE_DAYS = 7;
/** How far back a review will look for those days (8 weeks). */
export const WEEKLY_LOOKBACK_DAYS = 56;
/** Fewer days with entries than this and there is no pattern to see across days. */
export const WEEKLY_MIN_DAYS = 3;
/**
 * How long a review stays current. The review page reads it to decide whether
 * the newest one is due to be replaced, so the window a review covers and the
 * window it is good for stay the same number.
 */
export const WEEKLY_INTERVAL_DAYS = 7;

const WEEKLY_SYSTEM_PROMPT = `你是一位客观的「观察者」，帮用户回顾他最近有记录的几天（最多 ${WEEKLY_SAMPLE_DAYS} 天）。
用户消息是按天排列的记录摘要，一行一天，以「日期 星期：」开头，日期之间可能并不连续。
不要复述用户写了什么，也不要把摘要改写一遍：用户要看到的是自己没注意到的模式。

只输出 2～3 条「模式」和 1 条「可以试试」，每条一行，以标签开头，形如：
模式：……
模式：……
可以试试：……
- 「模式」是跨天重复出现的主题、情绪或行动，最多 3 条；每条要点出它出现在哪几天（用摘要里的日期或星期，例如「星期三和星期六都……」），而不是罗列事件。
- 「可以试试」是一个具体、很小、今天或明天就能做到的做法，直接回应其中一条模式；不要通用建议，不要一次给多个。
- 引用用户原话时最多半句；不确定的模式不要写，宁可只写 2 条。
- 不要评论记录的频率、间隔，或「多久没写」。日期之间隔了多久不重要，只看内容。
- 不要开场白、不要总结式收尾、不要 Markdown、不要编号、不要加粗。`;

/**
 * The weekly labels are Chinese in the prompt body like everything else, so an
 * English review needs them spelled out. The date prefixes are the other way
 * round — the app writes them in the interface language while the entries may
 * be in any language — so they are called out as no language clue at all,
 * which matters most in the default setup: English interface, Chinese entries.
 */
const WEEKLY_HEADING_RULE = `标签也用同一语言：英文依次用 Pattern: 和 Try this:。每行开头的日期星期是系统加的，不算语言线索，语言以摘要正文为准。`;

/**
 * Context budget: the window is model-dependent and unknown, so the
 * conservative research floor (8k) is used and input may take 70% of it
 * (output reserve). The token estimate errs high on purpose, so a local
 * model's n_ctx never overflows (a 400 on LiteRT-LM).
 */
const WINDOW_TOKENS = 8_000;
const INPUT_TOKEN_BUDGET = Math.floor(WINDOW_TOKENS * 0.7);
/** Evicting fewer messages than this is not worth a summary call. */
const SUMMARY_MIN_EVICTED = 2;

/**
 * Per-day cap for the weekly digest, in estimated tokens rather than
 * characters: ~150 CJK characters, the figure the budget was sized against
 * (7 days x 300 + prompt ~ 3000 of the 5600 input budget). Measuring tokens
 * keeps that arithmetic true in either language, since the same character
 * count costs four times as much in CJK.
 */
const WEEKLY_DAY_TOKENS = 300;

function isCjk(code: number): boolean {
  return (
    (code >= 0x3000 && code <= 0x9fff) || (code >= 0xf900 && code <= 0xfaff)
  );
}

/**
 * Conservative token estimate: CJK characters count as two tokens each (byte
 * fallback tokenizers often need more than one), everything else four
 * characters per token. Overestimating only truncates earlier than needed;
 * underestimating would overflow a local model's window.
 */
function estimateTokens(text: string): number {
  let cjk = 0;
  for (const ch of text) {
    if (isCjk(ch.codePointAt(0) ?? 0)) cjk++;
  }
  return Math.ceil(cjk * 2 + (text.length - cjk) / 4);
}

/**
 * truncateToTokens cuts text off at the last character that stays within
 * maxTokens by the same estimate, marking the cut with an ellipsis. The cut
 * lands mid-sentence on purpose: a day's digest is background material, and
 * rounding to a sentence boundary would cost most of the cap.
 */
function truncateToTokens(text: string, maxTokens: number): string {
  let cost = 0;
  let end = 0;
  for (const ch of text) {
    cost += isCjk(ch.codePointAt(0) ?? 0) ? 2 : 0.25;
    if (cost > maxTokens) return `${text.slice(0, end)}…`;
    end += ch.length;
  }
  return text;
}

/**
 * buildSystemText assembles the single system message: the persona prompt
 * plus the day's entries as a fixed preamble (background material, never
 * mixed into the conversation turns), an optional rolling summary of evicted
 * messages, and the explicit note when messages were dropped without one, and
 * the output-language rule last, as the instruction closest to the reply.
 */
function buildSystemText(
  entries: Entry[],
  summary: string | undefined,
  droppedCount: number,
): string {
  const text = promptScaffolding();
  const preamble =
    entries.length > 0
      ? `\n\n${text.entriesHeading}\n${entries
          .map((entry, index) => `${index + 1}. ${entry.content}`)
          .join('\n')}`
      : '';
  const summaryBlock = summary ? `\n\n${text.summaryHeading}\n${summary}` : '';
  const dropNote =
    droppedCount > 0 && !summary ? `\n\n${text.dropNote(droppedCount)}` : '';
  // The language rule is appended here rather than baked into SYSTEM_PROMPT:
  // the fallback needs getLang() per request, and this is the exact string
  // fitToBudget measures, so the token estimate stays honest. Appending it
  // anywhere later would have to be done twice and would skew that estimate.
  return (
    SYSTEM_PROMPT +
    preamble +
    summaryBlock +
    dropNote +
    '\n\n' +
    outputLanguageRule(getLang())
  );
}

interface FittedContext {
  messages: AiMessage[];
  /** Conversation messages that did not fit the budget (oldest first). */
  evicted: TalkMessage[];
}

/**
 * fitToBudget keeps the newest conversation messages that fit the input budget
 * after the system message (always kept whole). When the budget forced an
 * eviction, the cut lands on a user-message boundary: a leading assistant
 * message (the orphaned opening or a reply to an evicted user message) is
 * evicted too. The last message is always kept, so the user's newest message
 * can never be dropped.
 */
function fitToBudget(
  entries: Entry[],
  visible: TalkMessage[],
  summary: string | undefined,
): FittedContext {
  const system = buildSystemText(entries, summary, 0);
  let used = estimateTokens(system);
  let budgetExhausted = false;
  const kept: TalkMessage[] = [];
  for (let i = visible.length - 1; i >= 0; i--) {
    const cost = estimateTokens(visible[i].content);
    if (used + cost > INPUT_TOKEN_BUDGET) {
      budgetExhausted = true;
      break;
    }
    kept.unshift(visible[i]);
    used += cost;
  }
  if (kept.length === 0 && visible.length > 0) {
    kept.push(visible[visible.length - 1]);
  }
  if (budgetExhausted && kept.length > 1 && kept[0].role === 'assistant') {
    kept.shift();
  }
  const evicted = visible.slice(0, visible.length - kept.length);
  const finalSystem = buildSystemText(entries, summary, evicted.length);
  return {
    messages: [
      { role: 'system', content: finalSystem },
      ...kept.map(({ role, content }) => ({ role, content })),
    ],
    evicted,
  };
}

/**
 * summarizeConversation compresses evicted messages into a rolling summary:
 * new summary = old summary + newly evicted messages, chained through the
 * model. The input is capped at the input budget (newest evicted messages
 * first) so the call itself never overflows a local window. Failures return
 * undefined and the caller falls back to the plain truncation note.
 */
async function summarizeConversation(
  config: ModelConfig,
  oldSummary: string | undefined,
  evicted: TalkMessage[],
): Promise<string | undefined> {
  const text = promptScaffolding();
  // The rolling summary keeps its own language line instead of the per-request
  // rule: what it produces is a model input the user never reads as a reply,
  // and it must match the conversation it compresses.
  const messages: AiMessage[] = [
    { role: 'system', content: TALK_SUMMARY_SYSTEM_PROMPT },
  ];
  if (oldSummary) {
    messages.push({
      role: 'user',
      content: `${text.oldSummaryHeading}\n${oldSummary}`,
    });
  }
  let used = estimateTokens(
    messages.reduce((sum, message) => sum + message.content, ''),
  );
  const newest: AiMessage[] = [];
  for (let i = evicted.length - 1; i >= 0; i--) {
    const cost = estimateTokens(evicted[i].content);
    if (used + cost > INPUT_TOKEN_BUDGET) break;
    newest.unshift({ role: evicted[i].role, content: evicted[i].content });
    used += cost;
  }
  messages.push(...newest);

  try {
    return await completeChat(config, messages);
  } catch {
    return undefined;
  }
}

export interface TalkContext {
  messages: AiMessage[];
  /** A rolling summary generated during this assembly; the caller persists it. */
  newSummary?: string;
}

/**
 * excludeDeleted applies the 015 deletion semantics before context assembly.
 * Every tombstone drops itself. A deleted user message additionally drops the
 * messages that came after it and existed before the deletion (rule X, one
 * interval per user tombstone, unioned): replies derived from the deleted
 * message are ghosts and must not be quoted. Messages sent after the deletion
 * survive, so a user who deletes an old message and keeps talking is heard.
 * A deleted AI reply drops only itself, as the following conversation does
 * not depend on it.
 */
export function excludeDeleted(messages: TalkMessage[]): TalkMessage[] {
  const userTombstones = messages.filter(
    (message) => message.role === 'user' && message.deletedAt,
  );
  if (userTombstones.length === 0) {
    return messages.filter((message) => !message.deletedAt);
  }
  return messages.filter((message) => {
    if (message.deletedAt) return false;
    return !userTombstones.some((tombstone) => {
      const tombstoneAt = tombstone.deletedAt ?? 0;
      return (
        messages.indexOf(message) > messages.indexOf(tombstone) &&
        message.createdAt < tombstoneAt
      );
    });
  });
}

/**
 * buildTalkContext assembles the request context for one talk request: the
 * system message (persona + entry preamble + rolling summary), then the newest
 * conversation messages that fit the input budget. When at least two messages
 * are evicted, the evicted part is compressed into a rolling summary first
 * (chained onto the old one) and the context is re-fitted with the longer
 * system message; without a summary, the truncation note says how many
 * messages were dropped. Interrupted and failed messages are excluded so
 * retries regenerate the whole reply, and messages already saved as records
 * are skipped (their content is present as an entry already). Deleted
 * messages and the replies dependent on them are excluded first (015).
 *
 * Weekly reviews are dropped from the preamble: they are the model's own
 * output about an earlier window, and presenting them as "what the user wrote
 * today" invites the model to answer itself. Daily recaps stay in — that one is
 * the day condensed, and today's conversation already builds on it.
 */
export async function buildTalkContext(
  config: ModelConfig,
  entries: Entry[],
  talkMessages: TalkMessage[],
  summary?: string | null,
): Promise<TalkContext> {
  const conversation = excludeDeleted(talkMessages).filter(
    (message) => message.status === 'done' && !message.savedAt,
  );
  const ownEntries = entries.filter((entry) => entry.type !== 'weekly');
  const first = fitToBudget(ownEntries, conversation, summary ?? undefined);
  let newSummary: string | undefined;
  if (first.evicted.length >= SUMMARY_MIN_EVICTED) {
    newSummary = await summarizeConversation(
      config,
      summary ?? undefined,
      first.evicted,
    );
  }
  const effective = newSummary ?? summary ?? undefined;
  const second = fitToBudget(ownEntries, conversation, effective);
  return {
    messages: second.messages,
    ...(newSummary ? { newSummary } : {}),
  };
}

interface StreamChunk {
  choices?: Array<{ delta?: { content?: unknown } }>;
}

export interface StreamCallbacks {
  onDelta: (text: string) => void;
  onDone: (fullText: string) => void;
  onError: () => void;
}

const IDLE_TIMEOUT_MS = 30_000;

/**
 * requestFor builds the fetch target for an HTTP-style config. Gemini mode
 * authenticates with the signed-in user's Firebase ID token (refreshed by the
 * SDK when it is near expiry) instead of an API key. The Gemini server needs
 * at least one user turn, so the opening request (system text only) gets a
 * short starter turn.
 */
async function requestFor(
  config: ModelConfig,
  messages: AiMessage[],
): Promise<{ url: string; headers: Record<string, string>; messages: AiMessage[] }> {
  const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  if (config.mode !== 'gemini') {
    return {
      url,
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      messages,
    };
  }
  const user = auth.currentUser;
  if (!user) throw new Error('sign-in required for Google Gemini');
  const token = await user.getIdToken();
  const hasUserTurn = messages.some((message) => message.role === 'user');
  return {
    url,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    messages: hasUserTurn
      ? messages
      : [...messages, { role: 'user', content: promptScaffolding().openingTurn }],
  };
}

/**
 * completeChat runs one non-streaming request and returns the reply text. One
 * 30s timer covers "no response after 30s" (a non-streaming body has no
 * mid-stream idleness); empty or malformed content throws so callers can
 * treat it as a failure. Shared by the daily summary and the rolling talk
 * summary.
 */
async function completeChat(
  config: ModelConfig,
  messages: AiMessage[],
): Promise<string> {
  // Local mode runs in-browser inference; the message array maps 1:1 onto
  // the local conversation (016). Shared by the daily summary and the
  // rolling talk summary, so both become local together.
  if (config.mode === 'local') {
    return localComplete(messages);
  }
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), IDLE_TIMEOUT_MS);

  try {
    const target = await requestFor(config, messages);
    const response = await fetch(target.url, {
      method: 'POST',
      headers: target.headers,
      body: JSON.stringify({
        model: config.model,
        messages: target.messages,
      }),
      signal: controller.signal,
    });

    if (!response.ok) throw new Error('completion request failed');

    const parsed = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const content = parsed.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.trim().length === 0) {
      throw new Error('completion returned empty content');
    }

    return content;
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * streamChat calls the OpenAI-compatible /chat/completions endpoint and parses
 * the SSE stream. One idle timer covers both "no response after 30s" and "no
 * new data for 30s mid-stream"; firing it aborts the request, which surfaces
 * through onError. An external signal (e.g. canceling the opening reply when
 * the user sends instead) aborts the same way.
 */
export async function streamChat(
  config: ModelConfig,
  messages: AiMessage[],
  callbacks: StreamCallbacks,
  externalSignal?: AbortSignal,
): Promise<void> {
  // Local mode streams from the in-browser engine; abort maps to cancel (016).
  if (config.mode === 'local') {
    return localStream(messages, callbacks, externalSignal);
  }
  const controller = new AbortController();
  const abortFromExternal = () => controller.abort();
  externalSignal?.addEventListener('abort', abortFromExternal, { once: true });
  let idleTimer: number | null = null;
  let fullText = '';

  function resetIdleTimer() {
    if (idleTimer !== null) window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => {
      controller.abort();
    }, IDLE_TIMEOUT_MS);
  }

  try {
    resetIdleTimer();
    const target = await requestFor(config, messages);
    const response = await fetch(target.url, {
      method: 'POST',
      headers: target.headers,
      body: JSON.stringify({
        model: config.model,
        messages: target.messages,
        stream: true,
      }),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      callbacks.onError();
      return;
    }
    // The Gemini server answered with its fixed crisis reply.
    if (response.headers.get(SAFETY_HEADER) === 'crisis') showCrisisCard();

    resetIdleTimer();
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      resetIdleTimer();

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;

        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') {
          callbacks.onDone(fullText);
          return;
        }

        try {
          const parsed = JSON.parse(data) as StreamChunk;
          const delta = parsed.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta.length > 0) {
            fullText += delta;
            callbacks.onDelta(delta);
          }
        } catch {
          // skip unparseable keep-alive lines
        }
      }
    }

    callbacks.onDone(fullText);
  } catch {
    // network failure or timeout abort — both surface as a failure bubble
    callbacks.onError();
  } finally {
    if (idleTimer !== null) window.clearTimeout(idleTimer);
    externalSignal?.removeEventListener('abort', abortFromExternal);
  }
}

/**
 * summarizeToday runs one non-streaming request that turns today's entries
 * into a three-part daily summary (via completeChat, so the same 30s timeout
 * and empty-content failure semantics apply).
 */
export async function summarizeToday(
  config: ModelConfig,
  entries: Entry[],
): Promise<string> {
  const messages: AiMessage[] = [
    {
      role: 'system',
      // The entries below are the user's own words, so the recap's language
      // follows them and only falls back to the interface language when there
      // is nothing of theirs to go by.
      content: `${SUMMARY_SYSTEM_PROMPT}\n${SUMMARY_HEADING_RULE}\n${outputLanguageRule(getLang())}`,
    },
    ...entries.map((entry) => ({
      role: 'user' as const,
      content: entry.content,
    })),
  ];

  return completeChat(config, messages);
}

/**
 * weekDays buckets the window's entries by the local day they were written on
 * (keyed by that day's start), oldest entry first inside a bucket. Entries
 * outside the window are ignored. Weekly reviews are dropped here rather than
 * at the call sites: they are the model's own text about an earlier window, and
 * the day sampling and the digest both have to agree that they are not
 * something the model may read back as the user's words.
 */
function weekDays(dayStarts: number[], entries: Entry[]): Map<number, Entry[]> {
  const window = new Set(dayStarts);
  const buckets = new Map<number, Entry[]>();
  for (const entry of entries) {
    if (entry.type === 'weekly') continue;
    const start = startOfLocalDay(entry.createdAt);
    if (!window.has(start)) continue;
    const bucket = buckets.get(start);
    if (bucket) {
      bucket.push(entry);
    } else {
      buckets.set(start, [entry]);
    }
  }
  // Each bucket reads oldest first, whatever order the caller's list came in.
  for (const bucket of buckets.values()) {
    bucket.sort((a, b) => a.createdAt - b.createdAt);
  }
  return buckets;
}

/**
 * weeklySample picks the days a review reads: the most recent days that have
 * something to read, oldest first, at most WEEKLY_SAMPLE_DAYS of them and only
 * within the last WEEKLY_LOOKBACK_DAYS.
 *
 * Sampling days rather than the last seven calendar days is what keeps a review
 * possible for someone who writes in bursts — with entries spread over the last
 * couple of months it reads those days instead of refusing, while someone who
 * writes every day gets exactly the last week, unchanged. Days that only hold a
 * weekly review count as empty (see weekDays).
 */
export function weeklySample(entries: Entry[], now: number): number[] {
  const lookback = lastDayStarts(WEEKLY_LOOKBACK_DAYS, now);
  const buckets = weekDays(lookback, entries);
  return lookback
    .filter((start) => buckets.has(start))
    .slice(-WEEKLY_SAMPLE_DAYS);
}

/**
 * buildWeeklyDigest turns a sample of days (weeklySample) into the single user
 * message the weekly review reads: one line per day, oldest first, each prefixed
 * with that day's date and weekday. A day that has a daily recap contributes
 * that recap instead of its raw entries (the recap is already the day
 * condensed), the newest one if the user generated several; every other day
 * contributes its entries joined up. Each line is capped at WEEKLY_DAY_TOKENS,
 * which is what keeps the sample inside the input budget without any runtime
 * fitting.
 */
export function buildWeeklyDigest(
  dayStarts: number[],
  entries: Entry[],
): string {
  const buckets = weekDays(dayStarts, entries);
  return dayStarts
    .map((start) => {
      const label = formatMonthDayWeekday(start);
      const day = buckets.get(start) ?? [];
      const recaps = day.filter((entry) => entry.type === 'daily');
      const body = (
        recaps.length > 0
          ? recaps[recaps.length - 1].content
          : day.map((entry) => entry.content).join(' ')
      ).trim();
      if (!body) return `${label}：—`;
      return `${label}：${truncateToTokens(body, WEEKLY_DAY_TOKENS)}`;
    })
    .join('\n');
}

/**
 * buildWeeklyMessages assembles the weekly review's two messages: the observer
 * prompt with the English label mapping and the output-language rule, then the
 * digest as the only user message. The digest is the user's own words (or the
 * day's recap of them), so the review's language follows the entries rather
 * than the interface.
 */
export function buildWeeklyMessages(digest: string): AiMessage[] {
  return [
    {
      role: 'system',
      content: `${WEEKLY_SYSTEM_PROMPT}\n${WEEKLY_HEADING_RULE}\n${outputLanguageRule(getLang())}`,
    },
    { role: 'user', content: digest },
  ];
}
