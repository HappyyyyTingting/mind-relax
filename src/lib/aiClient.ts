import type { Entry } from '../types/entry';
import type { TalkMessage } from '../types/talk';
import type { ModelConfig } from './modelConfig';
import { localComplete, localStream } from './localAi';

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

如果这是你们今天对话的开始（此前没有你的回复）：请基于用户的记录自然地开启对话，先承接情绪，再回应其中最值得聊的一件事。
始终用中文回应。`;

const SUMMARY_SYSTEM_PROMPT = `你是一位客观的「整理者」，帮用户回顾今天记录的零散想法。
基于用户今天的所有记录，用纯文本输出三个小节，每小节 2～4 句：
「今天的主线」：今天主要在思考/在忙的几件事或主题
「情绪脉络」：情绪的变化起伏与整体基调
「值得留意的小信号」：反复出现的词、念头或细节
要求：客观回顾，不评判、不说教、不列行动建议；不用 Markdown 格式；始终用中文`;

const TALK_SUMMARY_SYSTEM_PROMPT = `把这段「早前对话」压缩成一份简短摘要（150 字左右，纯文本）：
- 保留：用户提到的重要事实、反复出现的情绪与主题、未解决的疑问
- 省略：寒暄、客套、已经解决的小事
- 若提供了旧摘要，把旧摘要与新对话内容合并成一份新的完整摘要
- 始终用中文`;

export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

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
 * Conservative token estimate: CJK characters count as two tokens each (byte
 * fallback tokenizers often need more than one), everything else four
 * characters per token. Overestimating only truncates earlier than needed;
 * underestimating would overflow a local model's window.
 */
function estimateTokens(text: string): number {
  let cjk = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (
      (code >= 0x3000 && code <= 0x9fff) ||
      (code >= 0xf900 && code <= 0xfaff)
    ) {
      cjk++;
    }
  }
  return Math.ceil(cjk * 2 + (text.length - cjk) / 4);
}

/**
 * buildSystemText assembles the single system message: the persona prompt
 * plus the day's entries as a fixed preamble (background material, never
 * mixed into the conversation turns), an optional rolling summary of evicted
 * messages, and the explicit note when messages were dropped without one.
 */
function buildSystemText(
  entries: Entry[],
  summary: string | undefined,
  droppedCount: number,
): string {
  const preamble =
    entries.length > 0
      ? `\n\n【用户今天写下的记录】（按时间顺序，是背景素材，不是用户对你说的话，不要逐条回应）\n${entries
          .map((entry, index) => `${index + 1}. ${entry.content}`)
          .join('\n')}`
      : '';
  const summaryBlock = summary ? `\n\n【此前对话的摘要】\n${summary}` : '';
  const dropNote =
    droppedCount > 0 && !summary
      ? `\n\n【提示】早先有 ${droppedCount} 条对话消息因长度限制未包含在本次上下文中。`
      : '';
  return SYSTEM_PROMPT + preamble + summaryBlock + dropNote;
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
  const messages: AiMessage[] = [
    { role: 'system', content: TALK_SUMMARY_SYSTEM_PROMPT },
  ];
  if (oldSummary) {
    messages.push({
      role: 'user',
      content: `【此前的对话摘要】\n${oldSummary}`,
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
  const first = fitToBudget(entries, conversation, summary ?? undefined);
  let newSummary: string | undefined;
  if (first.evicted.length >= SUMMARY_MIN_EVICTED) {
    newSummary = await summarizeConversation(
      config,
      summary ?? undefined,
      first.evicted,
    );
  }
  const effective = newSummary ?? summary ?? undefined;
  const second = fitToBudget(entries, conversation, effective);
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
    const response = await fetch(
      `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: config.model,
          messages,
        }),
        signal: controller.signal,
      },
    );

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
    const response = await fetch(
      `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          stream: true,
        }),
        signal: controller.signal,
      },
    );

    if (!response.ok || !response.body) {
      callbacks.onError();
      return;
    }

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
    { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
    ...entries.map((entry) => ({
      role: 'user' as const,
      content: entry.content,
    })),
  ];

  return completeChat(config, messages);
}
