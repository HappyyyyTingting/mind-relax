import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Header } from '../components/Header';
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
      <Header backTo="/" />

      <div className="flex flex-1 flex-col px-6 pb-8 pt-4">
        <div className="relative mb-6">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-app-input-border bg-app-card px-4 py-3 pr-10 text-base text-app-text placeholder-transparent focus:border-app-primary focus:outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-lg text-app-muted"
              aria-label={t('review.clearSearch')}
            >
              ×
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
              <section key={group.label} className="space-y-4">
                <h2 className="text-base font-semibold text-app-text">
                  {group.label}
                </h2>

                <div className="divide-y divide-app-input-border">
                  {group.entries.map((entry) => (
                    <Link
                      key={entry.id}
                      to={`/detail/${entry.id}`}
                      className="block py-4"
                    >
                      <div className="mb-2 text-sm font-medium text-app-muted">
                        {formatTime(entry.createdAt)}
                      </div>
                      <p className="line-clamp-2 text-base leading-7 text-app-text">
                        {createSummary(entry.content)}
                      </p>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : null}
      </div>
    </main>
  );
}
