import { Header } from '../components/Header';
import { useSync } from '../context/SyncContext';
import { t, useI18n } from '../lib/i18n';
import { formatFullDateTime } from '../utils/date';

export function SyncSettingsPage() {
  useI18n();
  const { status, retry } = useSync();

  return (
    <main className="mx-auto flex min-h-screen max-w-[480px] flex-col bg-app-bg text-app-text">
      <Header title={t('settings.sync')} backTo="/settings" />

      <div className="flex flex-1 flex-col gap-8 px-6 pb-8 pt-4">
        <section>
          <p className="mb-4 text-sm text-app-muted">
            {t('sync.description')}
          </p>
          <p className="text-sm text-app-muted">
            {status.state === 'never' && t('sync.never')}
            {status.state === 'syncing' && t('sync.syncing')}
            {status.state === 'success' &&
              status.lastSyncAt !== null &&
              t('sync.lastSync', { time: formatFullDateTime(status.lastSyncAt) })}
            {status.state === 'failed' && t('sync.failed')}
          </p>
          {status.state === 'failed' && (
            <button
              type="button"
              onClick={retry}
              className="mt-2 rounded-md bg-app-primary-soft px-4 py-2 text-sm font-semibold text-app-text"
            >
              {t('common.retry')}
            </button>
          )}
        </section>
      </div>
    </main>
  );
}
