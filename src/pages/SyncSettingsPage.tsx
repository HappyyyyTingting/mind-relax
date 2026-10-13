import { Header } from '../components/Header';
import { useSync } from '../context/SyncContext';
import { t, useI18n } from '../lib/i18n';
import { setSyncEnabled, useSyncEnabled } from '../lib/syncSettings';
import { formatFullDateTime } from '../utils/date';

function toggleButtonClass(active: boolean): string {
  return `min-h-11 rounded-lg border px-4 text-sm font-medium ${
    active
      ? 'border-app-primary bg-app-primary-soft text-app-text'
      : 'border-app-input-border bg-app-card text-app-muted'
  }`;
}

export function SyncSettingsPage() {
  useI18n();
  const { status, retry } = useSync();
  const syncEnabled = useSyncEnabled();

  return (
    <main className="mx-auto flex min-h-screen max-w-[480px] flex-col bg-app-bg text-app-text">
      <Header title={t('settings.sync')} backTo="/settings" />

      <div className="flex flex-1 flex-col gap-8 px-6 pb-8 pt-4">
        <section>
          <div className="flex items-center justify-between gap-4">
            <span className="text-base">{t('sync.toggleLabel')}</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSyncEnabled(false)}
                className={toggleButtonClass(!syncEnabled)}
              >
                {t('sync.off')}
              </button>
              <button
                type="button"
                onClick={() => setSyncEnabled(true)}
                className={toggleButtonClass(syncEnabled)}
              >
                {t('sync.on')}
              </button>
            </div>
          </div>

          <p className="mt-4 text-sm text-app-muted">
            {syncEnabled ? t('sync.description') : t('sync.offHint')}
          </p>
        </section>

        {syncEnabled && (
          <section>
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
        )}
      </div>
    </main>
  );
}
