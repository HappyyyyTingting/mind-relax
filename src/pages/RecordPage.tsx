import { type FormEvent, useEffect, useState } from 'react';
import { nanoid } from 'nanoid';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Header } from '../components/Header';
import { entryRepository } from '../db/repository';
import { useToast } from '../hooks/useToast';
import { t, useI18n } from '../lib/i18n';
import type { Entry } from '../types/entry';

export function RecordPage() {
  useI18n();
  const { id } = useParams<{ id: string }>();
  const isEditMode = Boolean(id);

  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(isEditMode);
  const [notFound, setNotFound] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    if (!id) return;

    let isMounted = true;

    async function loadEntry() {
      try {
        const entry = await entryRepository.get(id!);

        if (isMounted) {
          if (entry) {
            setContent(entry.content);
          } else {
            setNotFound(true);
          }
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

    void loadEntry();

    return () => {
      isMounted = false;
    };
  }, [id, toast]);

  async function saveEntry() {
    if (!content.trim()) {
      toast.error(t('common.enterContent'));
      return;
    }

    setIsSaving(true);

    try {
      if (isEditMode && id) {
        await entryRepository.update(id, content);
        toast.success(t('record.updated'));
        window.setTimeout(() => {
          navigate(-1);
        }, 1500);
      } else {
        const now = Date.now();
        const entry: Entry = {
          id: nanoid(),
          type: 'thought',
          content,
          createdAt: now,
          updatedAt: now,
          metadata: {},
        };
        await entryRepository.add(entry);
        toast.success(t('record.savedWithLimit'));
        window.setTimeout(() => {
          navigate('/');
        }, 1500);
      }
    } catch {
      toast.error(t('common.operationFailed'));
      setIsSaving(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void saveEntry();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-[480px] flex-col bg-app-bg text-app-text">
      <Header
        backTo={isEditMode && id ? `/detail/${id}` : '/'}
        title={isEditMode ? t('record.editTitle') : undefined}
      />

      {isLoading ? null : notFound ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-base text-app-muted">{t('common.entryNotFound')}</p>
          <Link
            to="/review"
            className="rounded-md bg-app-primary px-5 py-3 text-sm font-semibold text-app-text"
          >
            {t('common.backToReview')}
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-6 px-6 pb-8 pt-4">
          <textarea
            autoFocus
            maxLength={10000}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder={t('common.thoughtPlaceholder')}
            className="min-h-[55vh] flex-1 resize-none rounded-md border border-app-input-border bg-app-input-bg p-4 text-base leading-7 text-app-text outline-none focus:border-app-primary"
          />

          <button
            type="submit"
            disabled={isSaving}
            className="min-h-14 rounded-md bg-app-primary px-6 text-lg font-semibold text-app-text disabled:bg-app-primary-disabled"
          >
            {t('common.save')}
          </button>
        </form>
      )}
    </main>
  );
}
