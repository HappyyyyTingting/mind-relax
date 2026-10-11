import { Header } from '../components/Header';
import { useSync } from '../context/SyncContext';
import { formatFullDateTime } from '../utils/date';

export function SyncSettingsPage() {
  const { status, retry } = useSync();

  return (
    <main className="mx-auto flex min-h-screen max-w-[480px] flex-col bg-app-bg text-app-text">
      <Header title="云同步" backTo="/settings" />

      <div className="flex flex-1 flex-col gap-8 px-6 pb-8 pt-4">
        <section>
          <p className="mb-4 text-sm text-app-muted">
            记录会在登录的设备间自动同步。
          </p>
          <p className="text-sm text-app-muted">
            {status.state === 'never' && '尚未同步'}
            {status.state === 'syncing' && '同步中…'}
            {status.state === 'success' &&
              status.lastSyncAt !== null &&
              `上次同步：${formatFullDateTime(status.lastSyncAt)}`}
            {status.state === 'failed' && '同步失败'}
          </p>
          {status.state === 'failed' && (
            <button
              type="button"
              onClick={retry}
              className="mt-2 rounded-md bg-app-primary-soft px-4 py-2 text-sm font-semibold text-app-text"
            >
              重试
            </button>
          )}
        </section>
      </div>
    </main>
  );
}
