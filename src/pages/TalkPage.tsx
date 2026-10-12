import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { Header } from '../components/Header';
import { TalkBubble } from '../components/TalkBubble';
import { entryRepository } from '../db/repository';
import { buildTalkContext, streamChat } from '../lib/aiClient';
import { loadModelConfig, type ModelConfig } from '../lib/modelConfig';
import { isModelReady } from '../lib/modelStore';
import { clearTalkDraft, loadTalkDraft, saveTalkDraft } from '../lib/talkDraft';
import {
  appendTalkMessage,
  ensureTalkSession,
  getTalkMessages,
  getTalkMessagesWithTombstones,
  getTalkSessionUid,
  getTalkSummary,
  removeTalkMessage,
  setTalkSummary,
  subscribeTalkMessages,
  talkDayStamp,
  updateTalkMessage,
} from '../lib/talkSession';
import { startOfLocalDay } from '../utils/date';

interface ActiveRequest {
  messageId: string;
  opening: boolean;
  abort: () => void;
}

/**
 * The active request lives at module level so an in-flight reply keeps
 * streaming while TalkPage is unmounted, and so the opening can be aborted
 * when the user sends instead of waiting for it.
 */
let activeRequest: ActiveRequest | null = null;

/** 015: follow the stream while within this distance of the bottom. */
const PIN_DISTANCE_PX = 100;
/** 015: timestamps regroup after this much inactivity. */
const TIMESTAMP_GAP_MS = 5 * 60 * 1000;

/**
 * runTalkRequest sends one AI request against the latest context (today's
 * entries as a preamble plus the conversation messages within the budget;
 * evicted messages are compressed into a rolling summary first) and mirrors
 * the reply into the talk session store. retryMessageId reuses an existing
 * failed bubble instead of appending a new one. The request counts as the
 * opening while the conversation has no completed content yet.
 */
async function runTalkRequest(
  config: ModelConfig,
  retryMessageId?: string,
): Promise<void> {
  if (activeRequest) return;

  const opening = !getTalkMessages().some(
    (message) => message.role === 'user' || message.status === 'done',
  );
  // The opening uses a deterministic id so two devices opening at the same
  // time converge on one opening message instead of duplicating it.
  const messageId =
    retryMessageId ??
    appendTalkMessage(
      { role: 'assistant', content: '', status: 'streaming' },
      opening ? `opening-${talkDayStamp()}` : undefined,
    ).id;
  if (retryMessageId) {
    updateTalkMessage(retryMessageId, { content: '', status: 'streaming' });
  }

  const controller = new AbortController();
  activeRequest = { messageId, opening, abort: () => controller.abort() };

  try {
    const entries = await entryRepository.listByDay(startOfLocalDay(Date.now()));
    const context = await buildTalkContext(
      config,
      entries,
      // Full sequence: context assembly applies the deletion semantics itself.
      getTalkMessagesWithTombstones(),
      getTalkSummary(),
    );
    if (context.newSummary) setTalkSummary(context.newSummary);

    await streamChat(
      config,
      context.messages,
      {
        onDelta: (delta) => {
          const current = getTalkMessages().find(
            (message) => message.id === messageId,
          );
          if (current) {
            updateTalkMessage(messageId, { content: current.content + delta });
          }
        },
        onDone: (fullText) => {
          updateTalkMessage(messageId, { content: fullText, status: 'done' });
        },
        onError: () => {
          const current = getTalkMessages().find(
            (message) => message.id === messageId,
          );
          if (current) {
            updateTalkMessage(messageId, {
              status: current.content ? 'partial' : 'failed',
            });
          }
        },
      },
      controller.signal,
    );
  } catch {
    // context assembly failed before the request — surface as a failure bubble
    const current = getTalkMessages().find(
      (message) => message.id === messageId,
    );
    if (current) updateTalkMessage(messageId, { status: 'failed' });
  } finally {
    if (activeRequest?.messageId === messageId) activeRequest = null;
  }
}

/** Aborts the active request and removes its bubble (opening interruption). */
function cancelActiveRequest(): void {
  if (!activeRequest) return;
  activeRequest.abort();
  removeTalkMessage(activeRequest.messageId);
  activeRequest = null;
}

/**
 * TalkPage hosts the day's conversation with the AI: entering with no
 * conversation content auto-starts the opening reply; sending during the
 * opening aborts it (the user's expression comes first). Messages live in the
 * talk session store; long-press offers copy / save-as-record / delete.
 */
export function TalkPage() {
  const [input, setInput] = useState('');
  const [modelConfig] = useState<ModelConfig | null>(() => loadModelConfig());
  /** Local mode without the model file: guide instead of auto-opening (016). */
  const [localNotReady, setLocalNotReady] = useState(false);
  const messages = useSyncExternalStore(
    subscribeTalkMessages,
    getTalkMessages,
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const streamRef = useRef<HTMLDivElement>(null);
  /** 015 smart scroll: true while the view follows the newest message. */
  const [pinned, setPinned] = useState(true);
  const pinnedRef = useRef(true);
  /** Latest input for the draft debounce / flush paths. */
  const draftRef = useRef('');
  /** Talk session uid, known once ensureTalkSession has resolved. */
  const [uid, setUid] = useState<string | null>(null);
  const uidRef = useRef<string | null>(null);
  uidRef.current = uid;
  const uidReadyRef = useRef(false);
  /** True once the input holds restored or user-typed content (draft writes
   * must not clobber the stored draft before it has been restored). */
  const inputTouchedRef = useRef(false);
  /** Send before the session resolved clears the wrong draft key; the real
   * key is cleared once the uid is known. */
  const pendingClearRef = useRef(false);

  const streaming = messages.some((message) => message.status === 'streaming');
  const openingStreaming = streaming && activeRequest?.opening === true;

  // Once the session is loaded: start the opening when the conversation has
  // no completed content yet (a failed opening bubble is reused). An active
  // request keeps going untouched, so leaving and re-entering never doubles it.
  // The unsent draft is restored too, unless the user already started typing.
  useEffect(() => {
    let cancelled = false;
    void ensureTalkSession().then(async () => {
      if (cancelled) return;
      const config = loadModelConfig();
      if (config && !activeRequest) {
        // Local mode requires the model file; without it show the guide
        // instead of auto-opening straight into a failed bubble (016).
        const ready = config.mode === 'local' ? await isModelReady() : true;
        if (cancelled) return;
        if (ready) {
          const current = getTalkMessages();
          const hasContent = current.some(
            (message) => message.role === 'user' || message.status === 'done',
          );
          if (!hasContent) {
            const failedOpening = current.find(
              (message) =>
                message.role === 'assistant' && message.status === 'failed',
            );
            void runTalkRequest(config, failedOpening?.id);
          }
        } else {
          setLocalNotReady(true);
        }
      }
      setUid(getTalkSessionUid());
      uidReadyRef.current = true;
      if (pendingClearRef.current) {
        pendingClearRef.current = false;
        clearTalkDraft(talkDayStamp(), getTalkSessionUid());
      }
      setInput((prev) => {
        if (inputTouchedRef.current) return prev;
        inputTouchedRef.current = true;
        return loadTalkDraft(talkDayStamp(), getTalkSessionUid());
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    // Once the input is at its max height and the content overflows, skip the
    // reset: the height cannot change, and resetting it would throw away the
    // scroll position and hide the line being typed.
    const atMaxOverflowing =
      element.clientHeight >= 160 - 1 && element.scrollHeight > 160;
    if (atMaxOverflowing) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
  }, [input]);

  // Smart scroll: while pinned, keep the newest message visible. The page
  // starts pinned (entering lands on the latest message); scrolling up past
  // the threshold pauses the follow, so reading history is never yanked back.
  useEffect(() => {
    const element = streamRef.current;
    if (!element || !pinnedRef.current) return;
    element.scrollTop = element.scrollHeight;
  }, [messages]);

  // Draft: save debounced, flush on hide / unmount, and clear on send. Writes
  // start only once the input holds restored or user-typed content and the
  // session uid is known, so the stored draft is never clobbered early.
  useEffect(() => {
    draftRef.current = input;
    if (!inputTouchedRef.current || !uidReadyRef.current) return;
    const timer = window.setTimeout(() => {
      saveTalkDraft(talkDayStamp(), uid, draftRef.current);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [input, uid]);

  useEffect(() => {
    const flush = () => {
      if (!inputTouchedRef.current || !uidReadyRef.current) return;
      saveTalkDraft(talkDayStamp(), uidRef.current, draftRef.current);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    // A browser back-forward restore keeps the scroll position but not the
    // React state, so re-evaluate the follow mode after the page settles.
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      requestAnimationFrame(handleScroll);
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('pageshow', onPageShow);
      flush();
    };
  }, []);

  function handleScroll() {
    const element = streamRef.current;
    if (!element) return;
    const distance =
      element.scrollHeight - element.scrollTop - element.clientHeight;
    const atBottom = distance <= PIN_DISTANCE_PX;
    pinnedRef.current = atBottom;
    setPinned(atBottom);
  }

  function scrollToBottom() {
    pinnedRef.current = true;
    setPinned(true);
    const element = streamRef.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
  }

  function handleSend() {
    if (!input.trim()) return;
    const config = loadModelConfig();
    if (!config) return;

    // Sending during the opening aborts it: the user's expression comes first.
    cancelActiveRequest();

    appendTalkMessage({ role: 'user', content: input, status: 'done' });
    setInput('');
    clearTalkDraft(talkDayStamp(), uid);
    // The uid may not be known yet (session still aligning); clear the real
    // key once it resolves so a sent draft never comes back.
    if (!uidReadyRef.current) pendingClearRef.current = true;
    // Own sends always land at the bottom and resume following.
    scrollToBottom();
    void runTalkRequest(config);
  }

  const lastMessage = messages[messages.length - 1];
  const retryableId =
    lastMessage &&
    (lastMessage.status === 'failed' || lastMessage.status === 'partial')
      ? lastMessage.id
      : null;

  return (
    <main
      style={{ minHeight: '100dvh' }}
      className="mx-auto flex min-h-screen max-w-[480px] flex-col bg-app-bg text-app-text"
    >
      <Header title="🎧 和 AI 聊聊" backTo="/" />

      <div
        ref={streamRef}
        onScroll={handleScroll}
        className="relative flex-1 overflow-y-auto px-4 py-4"
      >
        {!modelConfig ? (
          <div className="mb-4 rounded-xl border border-app-input-border bg-app-card p-4 text-sm leading-6 text-app-muted">
            尚未配置模型，去设置页配置 baseURL、API Key
            与模型名后即可开始对话。
            <Link
              to="/settings/ai-model"
              state={{ from: '/talk' }}
              className="ml-2 font-medium text-app-primary"
            >
              去设置
            </Link>
          </div>
        ) : localNotReady ? (
          <div className="mb-4 rounded-xl border border-app-input-border bg-app-card p-4 text-sm leading-6 text-app-muted">
            本地模型未就绪，去设置页下载或导入模型（约
            2GB）后即可开始对话，推理全程在本机完成。
            <Link
              to="/settings/ai-model"
              state={{ from: '/talk' }}
              className="ml-2 font-medium text-app-primary"
            >
              去设置
            </Link>
          </div>
        ) : null}

        <ul className="flex flex-col gap-4">
          {messages.map((message, index) => (
            <TalkBubble
              key={message.id}
              message={message}
              showTimestamp={
                index === 0 ||
                message.createdAt - messages[index - 1].createdAt >
                  TIMESTAMP_GAP_MS
              }
              onRetry={
                message.id === retryableId
                  ? () => {
                      if (activeRequest) return;
                      const config = loadModelConfig();
                      if (config) void runTalkRequest(config, message.id);
                    }
                  : undefined
              }
            />
          ))}
        </ul>

        {!pinned ? (
          <button
            type="button"
            aria-label="回到底部"
            onClick={scrollToBottom}
            className="absolute bottom-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-app-input-border bg-app-card text-lg text-app-muted shadow"
          >
            ↓
          </button>
        ) : null}
      </div>

      {modelConfig && !localNotReady ? (
        <div className="bg-app-bg px-3 pb-3 pt-2">
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(event) => {
                inputTouchedRef.current = true;
                setInput(event.target.value);
              }}
              placeholder="想和 AI 说点什么…"
              className="max-h-40 flex-1 resize-none rounded-lg border border-app-input-border bg-app-card px-3 py-2 text-base leading-7 text-app-text outline-none focus:border-app-primary"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim() || (streaming && !openingStreaming)}
              className="min-h-10 shrink-0 rounded-md bg-app-primary px-4 text-sm font-semibold text-app-text disabled:bg-app-primary-disabled"
            >
              {streaming && !openingStreaming ? '回应中' : '发送'}
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
