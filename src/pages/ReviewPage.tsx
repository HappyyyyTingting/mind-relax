import { PhotoImage } from '../components/PhotoImage';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Header } from '../components/Header';
import { Icon } from '../components/Icon';
import { entryRepository } from '../db/repository';
import { useToast } from '../hooks/useToast';
import { t, useI18n } from '../lib/i18n';
import type { Entry } from '../types/entry';
import { createSummary, formatDateGroup, formatTime } from '../utils/date';

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

/**
 * Recaps written before entries were tagged are recognised by their first
 * section heading, so older data gets the badge too.
 */
function isRecap(entry: Entry): boolean {
  if (entry.metadata?.kind === 'recap') return true;
  return /^\s*[「"“]?(今天的主线|Today's main threads)/.test(entry.content);
}

export function ReviewPage() {
  useI18n();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const toast = useToast();

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

  const filteredEntries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return entries;
    return entries.filter((entry) =>
      entry.content.toLowerCase().includes(query),
    );
  }, [entries, searchQuery]);

  const groups = groupEntries(filteredEntries);

  return (
    <main className="mx-auto flex min-h-screen max-w-[480px] flex-col bg-app-bg text-app-text">
      <Header title={t('chat.review')} backTo="/" />

      <div className="flex flex-1 flex-col px-6 pb-8 pt-4">
        <div className="relative mb-6">
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
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-app-muted hover:bg-app-input-bg"
              aria-label={t('review.clearSearch')}
            >
              <Icon name="close" className="h-4 w-4" />
            </button>
          )}
        </div>

        {!isLoading && entries.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-center text-base text-app-muted">
            {t('review.empty')}
          </div>
        ) : null}

        {!isLoading && entries.length > 0 && filteredEntries.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-center text-base text-app-muted">
            {t('review.noMatch')}
          </div>
        ) : null}

        {groups.length > 0 ? (
          <div className="space-y-8">
            {groups.map((group) => (
              <section key={group.label} className="space-y-3">
                <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-app-muted">
                  {group.label}
                </h2>

                <div className="overflow-hidden rounded-xl border border-app-input-border bg-app-card shadow-card">
                  <div className="divide-y divide-app-input-border">
                    {group.entries.map((entry) => {
                      const recap = isRecap(entry);
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
                          <div className="flex gap-3">
                            <p className="line-clamp-2 flex-1 text-base leading-7 text-app-text">
                              {createSummary(entry.content)}
                            </p>
                            {entry.metadata?.photo ? (
                              <PhotoImage
                                id={entry.metadata.photo}
                                className="h-14 w-14 shrink-0 rounded-lg"
                              />
                            ) : null}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </section>
            ))}
          </div>
        ) : null}
      </div>
    </main>
  );
}
