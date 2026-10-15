import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { nanoid } from 'nanoid';
import { Header } from '../components/Header';
import { Icon } from '../components/Icon';
import { entryRepository } from '../db/repository';
import { useToast } from '../hooks/useToast';
import {
  WEEKLY_INTERVAL_DAYS,
  WEEKLY_MIN_DAYS,
  buildWeeklyDigest,
  buildWeeklyMessages,
  streamChat,
  weeklySample,
} from '../lib/aiClient';
import { t, useI18n } from '../lib/i18n';
import { loadModelConfig, type ModelConfig } from '../lib/modelConfig';
import { isModelReady } from '../lib/modelStore';
import type { Entry } from '../types/entry';
import {
  createSummary,
  formatDateGroup,
  formatMonthDayWeekday,
  formatTime,
} from '../utils/date';

interface EntryGroup {
  label: string;
  entries: Entry[];
}

function groupEntries(entries: Entry[]): EntryGroup[] {
  return entries.reduce<EntryGroup[]>((groups, entry) => {
    const label = formatDateGroup(entry.createdAt);
    const currentGroup = groups[groups.length - 1];

    if (currentGroup?.label === label) {
      currentGroup.entries.push(entry);
      return groups;
    }

    groups.push({ label, entries: [entry] });
    return groups;
  }, []);
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** A review is due again once the newest one no longer covers the recent days. */
const WEEKLY_INTERVAL_MS = WEEKLY_INTERVAL_DAYS * DAY_MS;
/** Where the automatic trigger records its last attempt. */
const AUTO_ATTEMPT_KEY = 'mindrelax.weekly-auto-attempt';
/** How long the automatic trigger waits after a failed attempt. */
const AUTO_RETRY_MS = 6 * 60 * 60 * 1000;

type WeeklyStatus = 'idle' | 'streaming' | 'failed';

/**
 * The weekly review's request lives at module level, like the daily recap's: a
 * review is the longest generation in the app, so leaving the page must not
 * cancel it and coming back must not lose the text already streamed. Status,
 * text and the saved entry are separate snapshots on one listener set, so
 * streamed text redraws only the region it belongs to.
 *
 * Nothing here is persisted: a refresh loses a review in flight, by design
 * (the same as the daily recap). Writing a draft would have to invent a
 * recovery UI this page deliberately does not have.
 */
let weeklyStatus: WeeklyStatus = 'idle';
let weeklyText = '';
let weeklySavedEntry: Entry | null = null;
const weeklyListeners = new Set<() => void>();

function getWeeklyStatus(): WeeklyStatus {
  return weeklyStatus;
}

function getWeeklyText(): string {
  return weeklyText;
}

function getWeeklySavedEntry(): Entry | null {
  return weeklySavedEntry;
}

function subscribeWeekly(listener: () => void): () => void {
  weeklyListeners.add(listener);
  return () => {
    weeklyListeners.delete(listener);
  };
}

function notifyWeekly(): void {
  weeklyListeners.forEach((listener) => listener());
}

function setWeeklyStatus(next: WeeklyStatus): void {
  weeklyStatus = next;
  notifyWeekly();
}

function setWeeklyText(next: string): void {
  weeklyText = next;
  notifyWeekly();
}

/** True when no review covers the recent days: none ever written, or the newest one is stale. */
function weeklyDue(entries: Entry[], now: number): boolean {
  let newest = 0;
  for (const entry of entries) {
    if (entry.type === 'weekly' && entry.createdAt > newest) {
      newest = entry.createdAt;
    }
  }
  return newest === 0 || now - newest >= WEEKLY_INTERVAL_MS;
}

/**
 * The automatic trigger's throttle, kept in localStorage rather than memory: a
 * failed attempt must survive the reload it invites, or every visit would spend
 * another request for the same missing answer. Best effort by design — private
 * mode throws and the attempt simply runs again.
 */
function autoAttemptRecent(now: number): boolean {
  try {
    const last = Number(window.localStorage.getItem(AUTO_ATTEMPT_KEY) ?? 0);
    return last > 0 && now - last < AUTO_RETRY_MS;
  } catch {
    return false;
  }
}

function markAutoAttempt(now: number): void {
  try {
    window.localStorage.setItem(AUTO_ATTEMPT_KEY, String(now));
  } catch {
    // The guard is an optimisation, not a correctness requirement.
  }
}

/**
 * saveWeeklyReview writes the finished review as a 'weekly' entry and hands it
 * to the page through the store's saved-entry slot, so a page that mounted
 * before the write still gets the new record into its list. A failed write
 * keeps the text on screen (it took the model a while to produce) and leaves
 * the button usable.
 */
async function saveWeeklyReview(text: string): Promise<void> {
  const now = Date.now();
  const entry: Entry = {
    id: nanoid(),
    type: 'weekly',
    content: text,
    createdAt: now,
    updatedAt: now,
    metadata: {},
  };

  try {
    await entryRepository.add(entry);
    weeklySavedEntry = entry;
    setWeeklyText('');
    setWeeklyStatus('idle');
  } catch {
    setWeeklyStatus('failed');
  }
}

/**
 * runWeeklyReview streams one weekly review into the module store. It streams
 * rather than using the recap's non-streaming call because that one is a 30s
 * wall-clock timeout while this is the app's longest generation; the streaming
 * timeout is 30s between chunks, which a slow model that keeps producing never
 * hits. A failure keeps the partial text so a retry is not a total loss.
 *
 * A crisis reply from the proxy arrives here as ordinary text and is saved as
 * the review, exactly as the daily recap already behaves; the crisis card is
 * raised by streamChat either way.
 */
async function runWeeklyReview(
  config: ModelConfig,
  dayStarts: number[],
  entries: Entry[],
): Promise<void> {
  if (weeklyStatus === 'streaming') return;
  setWeeklyText('');
  setWeeklyStatus('streaming');

  try {
    await streamChat(
      config,
      buildWeeklyMessages(buildWeeklyDigest(dayStarts, entries)),
      {
        onDelta: (delta) => {
          setWeeklyText(weeklyText + delta);
        },
        onDone: (fullText) => {
          void saveWeeklyReview(fullText);
        },
        onError: () => {
          setWeeklyStatus('failed');
        },
      },
    );
  } catch {
    // The model never started (local engine failed to load) — same failure
    // state as a stream that died, so the button stays retryable.
    setWeeklyStatus('failed');
  }
}

interface WeeklyGate {
  /** Days the review would read (most recent days with entries, oldest first). */
  dayStarts: number[];
  /** Everything, because the request needs the whole log to sample from. */
  entries: Entry[];
  /**
   * How to report a refusal. The button hands in the toast; the automatic
   * trigger leaves it out and stays quiet, which is also what keeps a device
   * in local mode without its model file from being pushed at a 2GB download.
   */
  notify?: (message: string) => void;
}

/**
 * startWeekly is the one gate in front of a review, shared by the button and
 * the automatic trigger so both check the same things in the same order. It is
 * module level because the automatic path calls it from an effect, where a
 * function redefined on every render would restart the effect.
 */
async function startWeekly({
  dayStarts,
  entries,
  notify,
}: WeeklyGate): Promise<void> {
  if (dayStarts.length < WEEKLY_MIN_DAYS) {
    notify?.(t('review.weeklyNotEnough'));
    return;
  }
  const config = loadModelConfig();
  if (!config) {
    notify?.(t('chat.configureModelFirst'));
    return;
  }
  // Local mode needs the model file first; guide instead of failing generically
  // after a 2GB-sized silence (016).
  if (config.mode === 'local') {
    const ready = await isModelReady();
    if (!ready) {
      notify?.(t('chat.localModelNotReady'));
      return;
    }
  }
  await runWeeklyReview(config, dayStarts, entries);
}

interface WeeklySectionProps {
  dayStarts: number[];
  entries: Entry[];
  /** The reviews themselves, newest first. */
  notes: Entry[];
}

/**
 * WeeklySection is the top third of the page: everything the weekly review has
 * ever said, in its own scrolling region, with the one button that makes a new
 * one. Keeping the reviews out of the timeline below is the point of the
 * separate region — neither has to compete with the other for attention.
 *
 * The height is a fixed third, not the content's height up to some cap: the
 * reviews accumulate forever, so a divider that follows them slides further
 * down every week until the entries below are unreadable. Fixed means the
 * entries always get the other two thirds, and the price is empty space up
 * here until the first review exists.
 *
 * The region explains nothing: the days it samples are an implementation detail
 * the user did not ask for. Too little to read is reported by the tap, not by a
 * standing sentence.
 */
function WeeklySection({ dayStarts, entries, notes }: WeeklySectionProps) {
  useI18n();
  const toast = useToast();
  const status = useSyncExternalStore(subscribeWeekly, getWeeklyStatus);
  const text = useSyncExternalStore(subscribeWeekly, getWeeklyText);

  return (
    <section className="flex h-1/3 shrink-0 flex-col border-b border-app-input-border">
      <div className="flex items-center justify-between gap-3 px-6 py-3">
        <h2 className="text-sm font-semibold text-app-muted">
          {t('review.weeklyTitle')}
        </h2>
        <button
          type="button"
          onClick={() => {
            void startWeekly({
              dayStarts,
              entries,
              notify: (message) => toast.error(message),
            });
          }}
          disabled={status === 'streaming'}
          className="flex min-h-9 items-center gap-1.5 rounded-full border border-app-input-border bg-app-card px-3 text-sm font-medium text-app-text shadow-card hover:border-app-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
        >
          <Icon name="sparkles" className="h-4 w-4 text-app-accent" />
          {status === 'streaming'
            ? t('review.weeklyGenerating')
            : t('review.weeklyStart')}
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-6 pb-4">
        {/* The request in flight reads as the newest note, above the finished
            ones — it is where the text is going to land anyway. */}
        {text ? (
          <div className="rounded-xl border border-app-input-border bg-app-card p-4 shadow-card">
            <p className="whitespace-pre-wrap text-base leading-7 text-app-text">
              {text}
            </p>
          </div>
        ) : null}

        {status === 'failed' ? (
          <p className="text-sm text-app-muted">{t('review.weeklyFailed')}</p>
        ) : null}

        {notes.map((entry, index) => (
          <WeeklyNoteCard key={entry.id} entry={entry} isNewest={index === 0} />
        ))}
      </div>
    </section>
  );
}

interface WeeklyNoteCardProps {
  entry: Entry;
  /** The newest review reads in full instead of as a preview. */
  isNewest: boolean;
}

/**
 * WeeklyNoteCard keeps the review's whole text on screen for the newest one,
 * with the date it was written: a review is about an earlier stretch of days,
 * so the time of day says nothing about which days it covers. Older ones stay a
 * two-line preview — the review you just made reads where you made it, and last
 * month's is one tap away.
 */
function WeeklyNoteCard({ entry, isNewest }: WeeklyNoteCardProps) {
  useI18n();

  return (
    <Link
      to={`/detail/${entry.id}`}
      className="block rounded-xl border border-app-input-border bg-app-card p-4 shadow-card"
    >
      <div className="mb-1 flex items-center gap-2 text-xs font-medium text-app-muted">
        {formatMonthDayWeekday(entry.createdAt)}
        <span className="flex items-center gap-1 rounded-full bg-app-primary px-2 py-0.5 text-app-text">
          <Icon name="sparkles" className="h-3 w-3" />
          {t('review.tagWeekly')}
        </span>
      </div>
      {isNewest ? (
        <p className="whitespace-pre-wrap text-base leading-7 text-app-text">
          {entry.content}
        </p>
      ) : (
        <p className="line-clamp-2 text-base leading-7 text-app-text">
          {createSummary(entry.content)}
        </p>
      )}
    </Link>
  );
}

/** The newest AI-written recap of a list, by timestamp rather than by order. */
function newestRecapId(entries: Entry[]): string | null {
  let newest: Entry | null = null;
  for (const entry of entries) {
    if (entry.type !== 'daily') continue;
    if (!newest || entry.createdAt > newest.createdAt) newest = entry;
  }
  return newest?.id ?? null;
}

/**
 * ReviewPage is the looking-back page: the weekly review above, the entries
 * below, each in its own scrolling region. Both regions read the same list —
 * the reviews are entries too — and the split is only about where they are
 * shown, so deleting one is still just deleting an entry.
 */
export function ReviewPage() {
  useI18n();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const toast = useToast();
  const weeklySaved = useSyncExternalStore(
    subscribeWeekly,
    getWeeklySavedEntry,
  );

  // The days the review would read: the most recent days that actually hold
  // something, not the last seven calendar days. Someone who writes in bursts
  // gets a review of what they did write instead of a refusal, and someone who
  // writes daily gets the last week. Snapshotted whenever entries change, so
  // saving a review (or a recap) does not silently re-pick the days under an
  // open card.
  const dayStarts = useMemo(() => weeklySample(entries, Date.now()), [entries]);

  useEffect(() => {
    let isMounted = true;

    async function loadEntries() {
      try {
        const loadedEntries = await entryRepository.list();

        if (isMounted) {
          setEntries(loadedEntries);
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

    void loadEntries();

    return () => {
      isMounted = false;
    };
  }, [toast]);

  // This page loads its list once, so a review that finished after that load —
  // or while the page was away — arrives through the store instead. The id
  // check makes a remount a no-op, and the updater stays pure: React runs it
  // twice in dev StrictMode and a side effect here would run twice too. The
  // slot is then cleared: leaving it filled would resurrect the review after
  // the user deleted it and came back.
  useEffect(() => {
    if (!weeklySaved) return;
    setEntries((current) =>
      current.some((entry) => entry.id === weeklySaved.id)
        ? current
        : [weeklySaved, ...current],
    );
    weeklySavedEntry = null;
  }, [weeklySaved]);

  // Opening the page is the intent to see a review, so a due one starts without
  // a tap. Deliberately quiet: no toasts (a refusal here is the app guessing
  // wrong about what the user wanted), and a failure shows in the region above
  // with the button still there to retry. Attempts are throttled through
  // localStorage so a failure cannot spend the request budget again on every
  // visit; a success needs no bookkeeping, because the review it writes is
  // itself what the next due check measures against. The ref keeps it to one
  // attempt per visit, StrictMode's second pass included, and the streaming
  // check inside runWeeklyReview is the second door. The ref is only spent on
  // an attempt that actually starts, so an early render (before the list has
  // arrived) cannot use up the visit's one try.
  const autoAttempted = useRef(false);
  useEffect(() => {
    if (isLoading || autoAttempted.current) return;
    const now = Date.now();
    if (weeklyStatus === 'streaming') return;
    if (dayStarts.length < WEEKLY_MIN_DAYS) return;
    if (!weeklyDue(entries, now) || autoAttemptRecent(now)) return;
    autoAttempted.current = true;
    markAutoAttempt(now);
    void startWeekly({ dayStarts, entries });
  }, [isLoading, dayStarts, entries]);

  const visibleEntries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return entries.filter(
      (entry) =>
        entry.type !== 'weekly' &&
        (!query || entry.content.toLowerCase().includes(query)),
    );
  }, [entries, searchQuery]);

  // Reviews live in their own region above, so the timeline below never repeats
  // them. Newest first, whatever order the load handed back.
  const weeklyNotes = useMemo(
    () =>
      entries
        .filter((entry) => entry.type === 'weekly')
        .sort((a, b) => b.createdAt - a.createdAt),
    [entries],
  );

  const groups = groupEntries(visibleEntries);

  // The newest recap reads in full here, the way the newest review does above.
  const newestRecap = useMemo(() => newestRecapId(entries), [entries]);

  return (
    <main className="mx-auto flex h-dvh max-w-[480px] flex-col overflow-hidden bg-app-bg text-app-text">
      <Header title={t('chat.review')} backTo="/" />

      {!isLoading ? (
        <WeeklySection
          dayStarts={dayStarts}
          entries={entries}
          notes={weeklyNotes}
        />
      ) : null}

      {/* The entries region takes whatever height is left and scrolls on its
          own, so reading back through months of writing never moves the review
          above it out of reach. */}
      <section className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-3 px-6 py-3">
          <h2 className="text-sm font-semibold text-app-muted">
            {t('review.entriesTitle')}
          </h2>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-8">
          <div className="relative mb-4">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('ui.searchPlaceholder')}
              aria-label={t('ui.searchPlaceholder')}
              className="w-full rounded-xl border border-app-input-border bg-app-card py-3 pl-10 pr-10 text-base text-app-text shadow-card placeholder:text-app-muted focus:border-app-primary focus:outline-none"
            />
            <Icon
              name="search"
              className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-app-muted"
            />
            {searchQuery ? (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-app-muted hover:bg-app-input-bg"
                aria-label={t('review.clearSearch')}
              >
                <Icon name="close" className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          {!isLoading && visibleEntries.length === 0 && !searchQuery.trim() ? (
            <div className="flex flex-1 items-center justify-center text-center text-base text-app-muted">
              {t('review.empty')}
            </div>
          ) : null}

          {!isLoading && visibleEntries.length === 0 && searchQuery.trim() ? (
            <div className="flex flex-1 items-center justify-center text-center text-base text-app-muted">
              {t('review.noMatch')}
            </div>
          ) : null}

          <div className="space-y-8">
            {groups.map((group) => (
              <section key={group.label} className="space-y-3">
                {/* Sticky so the day stays visible while its entries scroll
                    past, and full-bleed so nothing shows through the gutters. */}
                <h3 className="sticky -mx-6 top-0 z-10 bg-app-bg px-6 py-2 text-sm font-semibold uppercase tracking-wide text-app-muted">
                  {group.label}
                </h3>

                <div className="overflow-hidden rounded-xl border border-app-input-border bg-app-card shadow-card">
                  <div className="divide-y divide-app-input-border">
                    {group.entries.map((entry) => {
                      const recap = entry.type === 'daily';
                      return (
                        <Link
                          key={entry.id}
                          to={`/detail/${entry.id}`}
                          className={`block px-4 py-3 hover:bg-app-input-bg ${recap ? 'bg-app-primary-disabled/60' : ''}`}
                        >
                          <div className="mb-1 flex items-center gap-2 text-xs font-medium text-app-muted">
                            {formatTime(entry.createdAt)}
                            {recap ? (
                              <span className="flex items-center gap-1 rounded-full bg-app-primary px-2 py-0.5 text-app-text">
                                <Icon name="sparkles" className="h-3 w-3" />
                                {t('ui.aiRecap')}
                              </span>
                            ) : null}
                          </div>
                          {entry.id === newestRecap ? (
                            <p className="whitespace-pre-wrap text-base leading-7 text-app-text">
                              {entry.content}
                            </p>
                          ) : (
                            <p className="line-clamp-2 text-base leading-7 text-app-text">
                              {createSummary(entry.content)}
                            </p>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </section>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
