import { useEffect, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { nanoid } from 'nanoid';
import { entryRepository } from '../db/repository';
import { useToast } from '../hooks/useToast';
import { summarizeToday } from '../lib/aiClient';
import { t, useI18n } from '../lib/i18n';
import { loadModelConfig, type ModelConfig } from '../lib/modelConfig';
import { isModelReady } from '../lib/modelStore';
import { formatMonthDayWeekday, startOfLocalDay } from '../utils/date';

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
 * summary and saves it as a normal entry (createdAt = completion time).
 * Failures (network, timeout, empty content) propagate after resetting the
 * flag; the caller shows the toast. No record is written on failure.
 */
async function generateSummary(config: ModelConfig): Promise<void> {
  if (summaryGenerating) return;
  setSummaryGenerating(true);
  try {
    const entries = await entryRepository.listByDay(startOfLocalDay(Date.now()));
    const content = await summarizeToday(config, entries);
    const now = Date.now();
    await entryRepository.add({
      id: nanoid(),
      type: 'thought',
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
 */
export function ChatPage() {
  const [input, setInput] = useState('');
  const [hasTodayEntries, setHasTodayEntries] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const toast = useToast();
  useI18n();

  const summaryGeneratingNow = useSyncExternalStore(
    subscribeSummaryGenerating,
    getSummaryGenerating,
  );

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const todayEntries = await entryRepository.listByDay(
          startOfLocalDay(Date.now()),
        );
        if (isMounted) {
          setHasTodayEntries(todayEntries.length > 0);
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

  async function handleSend() {
    if (!input.trim()) return;

    const now = Date.now();

    try {
      await entryRepository.add({
        id: nanoid(),
        type: 'thought',
        content: input,
        createdAt: now,
        updatedAt: now,
        metadata: {},
      });
      setInput('');
      setHasTodayEntries(true);
    } catch {
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

  return (
    <main
      style={{ minHeight: '100dvh' }}
      className="mx-auto flex min-h-screen max-w-[480px] flex-col bg-app-bg text-app-text"
    >
      <header className="px-6 pb-3 pt-6">
        <div className="text-center text-2xl font-medium">
          {greetingFor(new Date().getHours())}
        </div>

        <div className="mt-5 flex items-center justify-between">
          <div className="text-lg font-medium">
            {formatMonthDayWeekday(Date.now())}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSummary}
              disabled={isLoading || !hasTodayEntries || summaryGeneratingNow}
              className="text-sm font-medium text-app-muted disabled:opacity-40"
            >
              {summaryGeneratingNow ? t('chat.summarizing') : t('chat.summary')}
            </button>
            <Link to="/review" className="text-sm font-medium text-app-muted">
              {t('chat.review')}
            </Link>
            <Link
              to="/settings"
              className="rounded-md px-2 py-1 text-xl leading-none text-app-muted"
              aria-label={t('common.settings')}
            >
              ⚙
            </Link>
          </div>
        </div>
      </header>

      {/* The composer takes every pixel the header leaves, so the page is the
          writing surface and nothing competes with it. */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 pb-6 pt-4">
        <textarea
          autoFocus
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={t('common.thoughtPlaceholder')}
          className="min-h-0 w-full flex-1 resize-none rounded-lg border border-app-input-border bg-app-card px-4 py-3 text-base leading-7 text-app-text outline-none focus:border-app-primary"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!input.trim()}
            className="min-h-12 flex-1 rounded-md bg-app-primary text-sm font-semibold text-app-text disabled:bg-app-primary-disabled"
          >
            {t('common.save')}
          </button>
          <Link
            to="/talk"
            className="flex min-h-12 flex-1 items-center justify-center rounded-lg border border-app-primary bg-app-card text-sm font-medium text-app-text"
          >
            {t('chat.talkEntry')}
          </Link>
        </div>
      </div>
    </main>
  );
}
