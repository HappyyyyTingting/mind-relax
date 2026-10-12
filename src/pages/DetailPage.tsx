import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Header } from '../components/Header';
import { entryRepository } from '../db/repository';
import { useToast } from '../hooks/useToast';
import { t, useI18n } from '../lib/i18n';
import type { Entry } from '../types/entry';
import { formatFullDateTime } from '../utils/date';

export function DetailPage() {
  useI18n();
  const { id } = useParams();
  const [entry, setEntry] = useState<Entry | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    let isMounted = true;

    async function loadEntry(entryId: string) {
      try {
        const loadedEntry = await entryRepository.get(entryId);

        if (isMounted) {
          setEntry(loadedEntry ?? null);
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

    if (id) {
      void loadEntry(id);
    } else {
      setIsLoading(false);
    }

    return () => {
      isMounted = false;
    };
  }, [id, toast]);

  async function deleteEntry(entryId: string) {
    if (!window.confirm(t('common.confirmDeleteEntry'))) {
      return;
    }

    setIsDeleting(true);

    try {
      await entryRepository.delete(entryId);
      toast.success(t('common.deleted'));
      window.setTimeout(() => {
        navigate('/review');
      }, 1000);
    } catch {
      toast.error(t('common.operationFailed'));
      setIsDeleting(false);
    }
  }

  function handleDelete() {
    if (entry) {
      void deleteEntry(entry.id);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-[480px] flex-col bg-app-bg text-app-text">
      <Header backTo="/review" />

      <div className="flex flex-1 flex-col px-6 pb-8 pt-4">
        {!isLoading && !entry ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <p className="text-base text-app-muted">{t('common.entryNotFound')}</p>
            <Link
              to="/review"
              className="rounded-md bg-app-primary px-5 py-3 text-sm font-semibold text-app-text"
            >
              {t('common.backToReview')}
            </Link>
          </div>
        ) : null}

        {entry ? (
          <article className="flex flex-1 flex-col">
            <time className="mb-8 text-base font-medium text-app-muted">
              {formatFullDateTime(entry.createdAt)}
            </time>

            <p className="whitespace-pre-wrap text-base leading-8 text-app-text">
              {entry.content}
            </p>

            <div className="mt-auto flex gap-3 pt-10">
              <button
                type="button"
                onClick={() => navigate(`/edit/${entry.id}`)}
                className="min-h-14 flex-1 rounded-md bg-app-primary px-4 text-lg font-semibold text-app-text"
              >
                {t('common.edit')}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="min-h-14 flex-1 rounded-md bg-app-primary px-4 text-lg font-semibold text-app-text disabled:opacity-40"
              >
                {t('common.delete')}
              </button>
            </div>
          </article>
        ) : null}
      </div>
    </main>
  );
}
