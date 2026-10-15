import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { PhotoButton } from '../components/PhotoButton';
import { VoiceButton } from '../components/VoiceButton';
import { WelcomeCard } from '../components/WelcomeCard';
import { nanoid } from 'nanoid';
import { useAuth } from '../context/AuthContext';
import { entryRepository } from '../db/repository';
import { useToast } from '../hooks/useToast';
import { summarizeToday } from '../lib/aiClient';
import { clearChatDraft, loadChatDraft, saveChatDraft } from '../lib/chatDraft';
import { t, useI18n } from '../lib/i18n';
import { loadModelConfig, type ModelConfig } from '../lib/modelConfig';
import { isModelReady } from '../lib/modelStore';
import type { PhotoReading } from '../lib/photo';
import { canRecord } from '../lib/voice';
import { formatMonthDayWeekday, formatTime, startOfLocalDay } from '../utils/date';

function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) return t('chat.greetingMorning');
  if (hour >= 12 && hour < 18) return t('chat.greetingAfternoon');
  return t('chat.greetingEvening');
}

/**
 * The summary request is a module-level store so an in-flight summary keeps
 * running while ChatPage is unmounted, while staying in this file — 009
 * touches no new modules. The flag is deliberately not persisted: a refresh
 * kills the request, so a fresh mount starts idle.
 */
let summaryGenerating = false;
const summaryListeners = new Set<() => void>();

function getSummaryGenerating(): boolean {
  return summaryGenerating;
}

function subscribeSummaryGenerating(listener: () => void): () => void {
  summaryListeners.add(listener);
  return () => {
    summaryListeners.delete(listener);
  };
}

function setSummaryGenerating(next: boolean): void {
  summaryGenerating = next;
  summaryListeners.forEach((listener) => listener());
}

/**
 * generateSummary snapshots today's entries, asks the model for a three-part
 * summary and saves it as an entry tagged 'daily' (createdAt = completion
 * time), so the timeline and the AI's own context can both tell it apart from
 * what the user wrote. Failures (network, timeout, empty content) propagate
 * after resetting the flag; the caller shows the toast. No record is written
 * on failure.
 */
async function generateSummary(config: ModelConfig): Promise<void> {
  if (summaryGenerating) return;
  setSummaryGenerating(true);
  try {
    const entries = await entryRepository.listByDay(startOfLocalDay(Date.now()));
    // A weekly review is the model's own text about an earlier window, so it
    // is not part of what today's recap is written from. Today's own recap is
    // left in, as it was before: it is this day, condensed.
    const summarisable = entries.filter((entry) => entry.type !== 'weekly');
    const content = await summarizeToday(config, summarisable);
    const now = Date.now();
    await entryRepository.add({
      id: nanoid(),
      type: 'daily',
      content,
      createdAt: now,
      updatedAt: now,
      metadata: {},
    });
  } finally {
    setSummaryGenerating(false);
  }
}

/**
 * ChatPage is the default landing page and holds nothing but the composer: a
 * box that fills the screen, with Save and Talk side by side underneath it.
 * What has already been written is read on the review page instead, which
 * keeps this page about the one thing it is for. Saving is pure recording, so
 * it never navigates away.
 *
 * Today's entries are still loaded, but only to decide whether the recap
 * button has anything to summarise — nothing on this page renders them.
 *
 * Unsaved text is mirrored into a per-account local draft, so leaving the page
 * — by route change, refresh or restart — never costs what has been written.
 */
export function ChatPage() {
  // RequireAuth only renders this page once the account is resolved, so the
  // uid is known from the first render and stays the same for the page's life.
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  // Restored synchronously, before the first commit, so the box is never
  // painted empty and then filled. That is also why no "don't clobber the
  // stored draft" guard is needed here: nothing can write before this read.
  const [input, setInput] = useState(() => loadChatDraft(uid));
  // Today's own writing only — the AI's recap and weekly review are the
  // button's subject, never part of the count or the strip.
  const [todayCount, setTodayCount] = useState(0);
  const [lastAt, setLastAt] = useState<number | null>(null);
  const hasTodayEntries = todayCount > 0;
  const [isLoading, setIsLoading] = useState(true);
  /** A photo added to the entry being written, until it is saved. */
  const [photo, setPhoto] = useState<{ id: string; preview: string } | null>(null);
  const toast = useToast();
  useI18n();

  const summaryGeneratingNow = useSyncExternalStore(
    subscribeSummaryGenerating,
    getSummaryGenerating,
  );

  /** Latest text and account, for the flush handlers and the save guard. */
  const draftRef = useRef(input);
  draftRef.current = input;
  const uidRef = useRef(uid);
  uidRef.current = uid;

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const todayEntries = await entryRepository.listByDay(
          startOfLocalDay(Date.now()),
        );
        if (isMounted) {
          const own = todayEntries.filter((entry) => entry.type === 'thought');
          setTodayCount(own.length);
          setLastAt(
            own.length > 0
              ? Math.max(...own.map((entry) => entry.createdAt))
              : null,
          );
        }
      } catch {
        if (isMounted) {
          toast.error(t('common.operationFailed'));
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      isMounted = false;
    };
  }, [toast]);

  // Draft: written on a short debounce while typing. The cleanup cancels the
  // pending write on every change, so a queued write can never land after
  // handleSend has cleared the draft.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      saveChatDraft(uid, input);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [input, uid]);

  // Draft: flush the last keystrokes when the page goes away. A route change
  // is covered by the cleanup below — pagehide never fires for an in-app
  // navigation — while visibilitychange/pagehide cover refresh, tab close and
  // leaving the site, where React's cleanup may not run at all.
  useEffect(() => {
    const flush = () => {
      saveChatDraft(uidRef.current, draftRef.current);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);

  async function handleSend() {
    if (!input.trim()) return;

    const text = input;
    const now = Date.now();

    try {
      await entryRepository.add({
        id: nanoid(),
        type: 'thought',
        content: text,
        createdAt: now,
        updatedAt: now,
        metadata: photo ? { photo: photo.id } : {},
      });
      // The box stays editable while the write is in flight, so only clear
      // when it still holds exactly what was just saved: anything typed since
      // belongs to the next entry, draft included.
      if (draftRef.current === text) {
        clearChatDraft(uid);
        setInput('');
      }
      // The photo went out with this entry, whatever was typed since.
      setPhoto(null);
      setTodayCount((count) => count + 1);
      setLastAt(now);
    } catch {
      // The text stays in the box and the draft stays on disk, so a failed
      // save is never a loss.
      toast.error(t('common.operationFailed'));
    }
  }

  function handleSummary() {
    const config = loadModelConfig();
    if (!config) {
      toast.error(t('chat.configureModelFirst'));
      return;
    }
    // Local mode needs the model file first; guide instead of failing
    // generically after a 2GB-sized silence (016).
    if (config.mode === 'local') {
      void isModelReady().then((ready) => {
        if (!ready) {
          toast.error(t('chat.localModelNotReady'));
          return;
        }
        generateSummary(config).catch(() => {
          toast.error(t('chat.summaryFailed'));
        });
      });
      return;
    }
    generateSummary(config).catch(() => {
      toast.error(t('chat.summaryFailed'));
    });
  }

  // Once something is written today and the box is empty, talking it through
  // is the natural next step, so it becomes the main button.
  const talkIsPrimary = hasTodayEntries && !input.trim();

  // Voice goes to Gemini, so it is offered only in Gemini mode: on-device
  // mode promises nothing leaves the phone.
  const voiceAvailable = loadModelConfig()?.mode === 'gemini' && canRecord();

  function appendSpoken(text: string) {
    setInput((current) => (current.trim() ? `${current.trimEnd()}\n${text}` : text));
  }

  function handlePhoto(reading: PhotoReading, preview: string) {
    if (reading.text) appendSpoken(reading.text);
    // Without a stored id (local test server) there is nothing to attach.
    setPhoto(reading.photoId ? { id: reading.photoId, preview } : null);
  }

  return (
    <main
      style={{ minHeight: '100dvh' }}
      className="mx-auto flex min-h-screen max-w-[480px] flex-col bg-app-bg text-app-text"
    >
      <header className="px-5 pb-2 pt-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-app-accent">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-app-primary text-app-text">
              <Icon name="leaf" className="h-4 w-4" />
            </span>
            Mind Relax
          </div>
          <Link
            to="/settings"
            className="flex h-9 w-9 items-center justify-center rounded-full text-app-muted hover:bg-app-card hover:text-app-text"
            aria-label={t('common.settings')}
          >
            <Icon name="settings" />
          </Link>
        </div>

        <h1 className="mt-5 text-2xl font-semibold">
          {greetingFor(new Date().getHours())}
        </h1>
        <div className="mt-1 text-sm text-app-muted">
          {formatMonthDayWeekday(Date.now())}
          {' · '}
          {isLoading
            ? ''
            : lastAt === null
              ? t('ui.todayNone')
              : todayCount === 1
                ? t('ui.todayOne', { time: formatTime(lastAt) })
                : t('ui.todayCount', { n: todayCount, time: formatTime(lastAt) })}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleSummary}
            disabled={isLoading || !hasTodayEntries || summaryGeneratingNow}
            className="flex min-h-9 items-center gap-1.5 rounded-full border border-app-input-border bg-app-card px-3 text-sm font-medium text-app-text shadow-card hover:border-app-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
          >
            <Icon name="sparkles" className="h-4 w-4 text-app-accent" />
            {summaryGeneratingNow ? t('chat.summarizing') : t('chat.summary')}
          </button>
          <Link
            to="/review"
            className="flex min-h-9 items-center gap-1.5 rounded-full border border-app-input-border bg-app-card px-3 text-sm font-medium text-app-text shadow-card hover:border-app-primary"
          >
            <Icon name="book" className="h-4 w-4 text-app-accent" />
            {t('chat.review')}
          </Link>
          <Link
            to="/insights"
            className="flex min-h-9 items-center gap-1.5 rounded-full border border-app-input-border bg-app-card px-3 text-sm font-medium text-app-text shadow-card hover:border-app-primary"
          >
            <Icon name="chart" className="h-4 w-4 text-app-accent" />
            {t('chat.insights')}
          </Link>
        </div>
      </header>

      <WelcomeCard />

      {/* The composer takes every pixel the header leaves, so the page is the
          writing surface and nothing competes with it. */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-6 pt-3">
        <div className="relative flex min-h-0 flex-1 flex-col">
          {photo ? (
            <div className="absolute left-3 top-3 z-10">
              <img
                src={photo.preview}
                alt=""
                className="h-16 w-16 rounded-lg object-cover shadow-card"
              />
              <button
                type="button"
                onClick={() => setPhoto(null)}
                aria-label={t('ui.photoRemove')}
                className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-app-text text-app-card"
              >
                <Icon name="close" className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}
          <textarea
            autoFocus
            maxLength={10000}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={t('common.thoughtPlaceholder')}
            className={`min-h-0 w-full flex-1 resize-none rounded-xl border border-app-input-border bg-app-card px-4 py-3 text-base leading-7 text-app-text shadow-card outline-none focus:border-app-primary ${voiceAvailable ? 'pb-16' : ''} ${photo ? 'pt-24' : ''}`}
          />
          {voiceAvailable ? (
            <div className="absolute bottom-3 right-3 flex items-center gap-2">
              <PhotoButton onPhoto={handlePhoto} />
              <VoiceButton onText={appendSpoken} />
            </div>
          ) : null}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!input.trim()}
            className={
              talkIsPrimary
                ? 'min-h-12 flex-1 rounded-xl border border-app-input-border bg-app-card text-sm font-semibold text-app-muted disabled:cursor-not-allowed'
                : 'min-h-12 flex-1 rounded-xl bg-app-primary text-sm font-semibold text-app-text hover:bg-app-primary-hover disabled:cursor-not-allowed disabled:bg-app-primary-disabled disabled:text-app-muted'
            }
          >
            {t('common.save')}
          </button>
          <Link
            to="/talk"
            className={
              talkIsPrimary
                ? 'flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-app-primary text-sm font-semibold text-app-text hover:bg-app-primary-hover'
                : 'flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-app-primary bg-app-card text-sm font-medium text-app-text hover:bg-app-input-bg'
            }
          >
            <Icon name="chat" className="h-4 w-4" />
            {talkIsPrimary ? t('ui.talkItThrough') : t('chat.talkEntry')}
          </Link>
        </div>
      </div>
    </main>
  );
}
