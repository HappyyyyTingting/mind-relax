import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { nanoid } from 'nanoid';
import { ActionSheet } from '../components/ActionSheet';
import { MessageBubble } from '../components/MessageBubble';
import { entryRepository } from '../db/repository';
import { useToast } from '../hooks/useToast';
import { summarizeToday } from '../lib/aiClient';
import { t, useI18n } from '../lib/i18n';
import { loadModelConfig, type ModelConfig } from '../lib/modelConfig';
import { isModelReady } from '../lib/modelStore';
import type { Entry } from '../types/entry';
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
 * ChatPage is the default landing page: today's records as a chat stream with
 * a bottom input. Sending is pure recording; AI conversation lives on the
 * separate TalkPage behind the entry button below the input. Long-press a
 * bubble for copy / edit / delete / multi-select; in multi-select mode the
 * input is replaced by a bar with the merge action.
 */
export function ChatPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [input, setInput] = useState('');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [menuEntryId, setMenuEntryId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const streamRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const toast = useToast();
  useI18n();

  const summaryGeneratingNow = useSyncExternalStore(
    subscribeSummaryGenerating,
    getSummaryGenerating,
  );

  async function loadToday() {
    const todayEntries = await entryRepository.listByDay(
      startOfLocalDay(Date.now()),
    );
    setEntries(todayEntries);
  }

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const todayEntries = await entryRepository.listByDay(
          startOfLocalDay(Date.now()),
        );
        if (isMounted) {
          setEntries(todayEntries);
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

  // Reload today's entries when a summary finishes — covers a generation that
  // completed while ChatPage was unmounted (the flip is observed on remount).
  const previousSummaryGenerating = useRef(summaryGeneratingNow);
  useEffect(() => {
    if (previousSummaryGenerating.current && !summaryGeneratingNow) {
      void entryRepository
        .listByDay(startOfLocalDay(Date.now()))
        .then(setEntries)
        .catch(() => toast.error(t('common.operationFailed')));
    }
    previousSummaryGenerating.current = summaryGeneratingNow;
  }, [summaryGeneratingNow, toast]);

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

  // Keep the newest message visible as entries load.
  useEffect(() => {
    const element = streamRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [entries.length]);

  async function handleSend() {
    if (!input.trim()) return;

    const now = Date.now();
    const entry: Entry = {
      id: nanoid(),
      type: 'thought',
      content: input,
      createdAt: now,
      updatedAt: now,
      metadata: {},
    };

    try {
      await entryRepository.add(entry);
      setEntries((prev) => [...prev, entry]);
      setInput('');
    } catch {
      toast.error(t('common.operationFailed'));
    }
  }

  async function handleDelete(entry: Entry) {
    if (!window.confirm(t('common.confirmDeleteEntry'))) return;

    try {
      await entryRepository.delete(entry.id);
      toast.success(t('common.deleted'));
      await loadToday();
    } catch {
      toast.error(t('common.operationFailed'));
    }
  }

  async function handleCopy(entry: Entry) {
    try {
      await navigator.clipboard.writeText(entry.content);
      toast.success(t('common.copied'));
    } catch {
      toast.error(t('common.copyFailed'));
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id)
        ? prev.filter((selected) => selected !== id)
        : [...prev, id],
    );
  }

  function exitSelection() {
    setSelectionMode(false);
    setSelectedIds([]);
  }

  async function handleMerge() {
    if (selectedIds.length < 2) return;
    if (!window.confirm(t('chat.mergeConfirm', { n: selectedIds.length }))) return;

    try {
      await entryRepository.merge(selectedIds);
      toast.success(t('chat.merged'));
      exitSelection();
      await loadToday();
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

  const menuEntry = entries.find((entry) => entry.id === menuEntryId);

  const menuActions = menuEntry
    ? [
        {
          label: t('common.copy'),
          onClick: () => void handleCopy(menuEntry),
        },
        {
          label: t('common.edit'),
          onClick: () => navigate(`/edit/${menuEntry.id}`),
        },
        {
          label: t('common.delete'),
          danger: true,
          onClick: () => void handleDelete(menuEntry),
        },
        {
          label: t('chat.multiSelect'),
          onClick: () => {
            setSelectionMode(true);
            setSelectedIds([menuEntry.id]);
          },
        },
      ]
    : [];

  const showGreeting = !isLoading && entries.length === 0;

  return (
    <main
      style={{ minHeight: '100dvh' }}
      className="mx-auto flex min-h-screen max-w-[480px] flex-col bg-app-bg text-app-text"
    >
      <header className="flex items-center justify-between px-6 pb-2 pt-6">
        <div className="text-lg font-medium">
          {formatMonthDayWeekday(Date.now())}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSummary}
            disabled={isLoading || entries.length === 0 || summaryGeneratingNow}
            className="text-sm font-medium text-app-muted disabled:opacity-40"
          >
            {summaryGeneratingNow ? t('chat.summarizing') : t('chat.summary')}
          </button>
          <Link
            to="/review"
            className="text-sm font-medium text-app-muted"
          >
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
      </header>

      <div ref={streamRef} className="flex-1 overflow-y-auto px-4 py-4">
        {showGreeting ? (
          <div className="flex h-full items-center justify-center text-2xl font-medium">
            {greetingFor(new Date().getHours())}
          </div>
        ) : (
          <ul className="flex flex-col gap-4">
            {entries.map((entry) => (
              <MessageBubble
                key={entry.id}
                entry={entry}
                selectionMode={selectionMode}
                selected={selectedIds.includes(entry.id)}
                onToggleSelect={toggleSelect}
                onLongPress={setMenuEntryId}
              />
            ))}
          </ul>
        )}
      </div>

      {selectionMode ? (
        <div className="flex items-center gap-3 bg-app-bg px-4 py-3">
          <button
            type="button"
            onClick={exitSelection}
            className="min-h-10 rounded-md px-4 text-sm font-medium text-app-muted"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void handleMerge()}
            disabled={selectedIds.length < 2}
            className="min-h-10 flex-1 rounded-md bg-app-primary text-sm font-semibold text-app-text disabled:bg-app-primary-disabled"
          >
            {t('chat.mergeCount', { n: selectedIds.length })}
          </button>
        </div>
      ) : (
        <div className="bg-app-bg px-3 pb-3 pt-2">
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              rows={1}
              autoFocus
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={t('common.thoughtPlaceholder')}
              className="max-h-40 flex-1 resize-none rounded-lg border border-app-input-border bg-app-card px-3 py-2 text-base leading-7 text-app-text outline-none focus:border-app-primary"
            />
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!input.trim()}
              className="min-h-10 shrink-0 rounded-md bg-app-primary px-4 text-sm font-semibold text-app-text disabled:bg-app-primary-disabled"
            >
              {t('common.send')}
            </button>
          </div>
          <Link
            to="/talk"
            className="mt-2 flex min-h-11 w-full items-center justify-center rounded-lg border border-app-primary bg-app-card text-base font-medium text-app-text"
          >
            {t('chat.talkEntry')}
          </Link>
        </div>
      )}

      <ActionSheet
        open={Boolean(menuEntry)}
        onClose={() => setMenuEntryId(null)}
        actions={menuActions}
      />
    </main>
  );
}
