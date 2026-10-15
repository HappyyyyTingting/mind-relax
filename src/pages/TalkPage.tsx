import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { CRISIS_CARD_ID, CrisisCard } from '../components/CrisisCard';
import { Header } from '../components/Header';
import { Icon } from '../components/Icon';
import { TalkBubble } from '../components/TalkBubble';
import { entryRepository } from '../db/repository';
import { buildTalkContext, streamChat } from '../lib/aiClient';
import { t, useI18n } from '../lib/i18n';
import { loadModelConfig, type ModelConfig } from '../lib/modelConfig';
import { isModelReady } from '../lib/modelStore';
import {
  getCrisisShown,
  hideCrisisCard,
  isCrisisText,
  showCrisisCard,
  subscribeCrisis,
} from '../lib/safety';
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
    // Screen on the device in every mode: the newest user message, plus
    // today's entries when the AI opens the conversation from them. A weekly
    // review is the model's own prose about an earlier window, so it is not
    // screened — it would raise the card on text the user did not write.
    const screenable = entries.filter((entry) => entry.type !== 'weekly');
    const newestUser = [...getTalkMessages()]
      .reverse()
      .find((message) => message.role === 'user' && !message.deletedAt);
    const screened = [
      newestUser?.content ?? '',
      ...(opening ? screenable.map((entry) => entry.content) : []),
    ];
    if (screened.some(isCrisisText)) showCrisisCard();

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
  useI18n();
  const [input, setInput] = useState('');
  const [modelConfig] = useState<ModelConfig | null>(() => loadModelConfig());
  /** Local mode without the model file: guide instead of auto-opening (016). */
  const [localNotReady, setLocalNotReady] = useState(false);
  const messages = useSyncExternalStore(
    subscribeTalkMessages,
    getTalkMessages,
  );
  const crisisShown = useSyncExternalStore(subscribeCrisis, getCrisisShown);
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
      // The guard and the write stay outside a setInput updater. This setInput
      // shares its tick with the setUid above, and under StrictMode React
      // evaluates the update more than once: the repeats start from the
      // pre-restore state, see the flag the first evaluation flipped, and
      // return that empty value — which is the one that commits. The box
      // looked empty on every entry into the page while the draft sat on disk.
      // Outside an updater the restore runs exactly once.
      if (!inputTouchedRef.current) {
        inputTouchedRef.current = true;
        setInput(loadTalkDraft(talkDayStamp(), getTalkSessionUid()));
      }
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
    // border-box sizing: add the borders, or the box is 2px short of its
    // content and shows a scrollbar on a single line.
    const borders = element.offsetHeight - element.clientHeight;
    element.style.height = `${Math.min(element.scrollHeight + borders, 160)}px`;
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

  /** Brings the helpline card back after it was hidden, and into view. */
  function handleNeedHelp() {
    showCrisisCard();
    window.requestAnimationFrame(() => {
      document
        .getElementById(CRISIS_CARD_ID)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
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
      <Header title={t('chat.talkEntry')} backTo="/" />
      <div className="flex items-center justify-between border-b border-app-input-border px-4 pb-2 text-xs">
        {modelConfig ? (
          <span className="flex items-center gap-1 rounded-full bg-app-card px-2 py-1 text-app-muted">
            <Icon
              name={modelConfig.mode === 'local' ? 'lock' : 'sparkles'}
              className="h-3.5 w-3.5"
            />
            {modelConfig.mode === 'gemini'
              ? t('ui.modeGemini')
              : modelConfig.mode === 'local'
                ? `${t('ui.modeLocal')} · ${t('ui.privateChip')}`
                : t('ui.modeHttp')}
          </span>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={handleNeedHelp}
          className="flex items-center gap-1 rounded-full px-2 py-1 font-medium text-app-accent hover:bg-app-card"
        >
          <Icon name="lifebuoy" className="h-3.5 w-3.5" />
          {t('ui.needHelp')}
        </button>
      </div>

      <div
        ref={streamRef}
        onScroll={handleScroll}
        className="relative flex-1 overflow-y-auto px-4 py-4"
      >
        {!modelConfig ? (
          <div className="mb-4 rounded-xl border border-app-input-border bg-app-card p-4 text-sm leading-6 text-app-muted">
            {t('talk.noModelBanner')}
            <Link
              to="/settings/ai-model"
              state={{ from: '/talk' }}
              className="ml-2 font-medium text-app-accent"
            >
              {t('talk.goSettings')}
            </Link>
          </div>
        ) : localNotReady ? (
          <div className="mb-4 rounded-xl border border-app-input-border bg-app-card p-4 text-sm leading-6 text-app-muted">
            {t('talk.localNotReadyBanner')}
            <Link
              to="/settings/ai-model"
              state={{ from: '/talk' }}
              className="ml-2 font-medium text-app-accent"
            >
              {t('talk.goSettings')}
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

        {crisisShown ? <CrisisCard onHide={hideCrisisCard} /> : null}

        {!pinned ? (
          <button
            type="button"
            aria-label={t('talk.scrollToBottom')}
            onClick={scrollToBottom}
            className="absolute bottom-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-app-input-border bg-app-card text-app-muted shadow-card"
          >
            <Icon name="arrowDown" className="h-4 w-4" />
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
              onKeyDown={(event) => {
                // Enter sends, Shift+Enter breaks the line. Skipped while an
                // IME (Chinese pinyin) is composing, where Enter picks a
                // candidate, and on touch screens, where Enter is the only way
                // to start a new line.
                if (
                  event.key !== 'Enter' ||
                  event.shiftKey ||
                  event.nativeEvent.isComposing ||
                  window.matchMedia('(pointer: coarse)').matches
                ) {
                  return;
                }
                event.preventDefault();
                if (streaming && !openingStreaming) return;
                handleSend();
              }}
              placeholder={t('talk.placeholder')}              className="max-h-40 flex-1 resize-none rounded-xl border border-app-input-border bg-app-card shadow-card px-3 py-2 text-base leading-7 text-app-text outline-none focus:border-app-primary"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim() || (streaming && !openingStreaming)}
              className="min-h-11 shrink-0 rounded-xl bg-app-primary px-4 text-sm font-semibold text-app-text hover:bg-app-primary-hover disabled:cursor-not-allowed disabled:bg-app-primary-disabled disabled:text-app-muted"
            >
              {streaming && !openingStreaming ? t('talk.replying') : t('common.send')}
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
