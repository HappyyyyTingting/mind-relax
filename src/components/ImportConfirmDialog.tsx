import { getLang, localeOf, t, useI18n } from '../lib/i18n';
import type { BackupFile } from '../types/backup';

interface ImportConfirmDialogProps {
  backup: BackupFile;
  onConfirm: () => void;
  onCancel: () => void;
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat(localeOf(getLang()), {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(d);
  } catch {
    return iso;
  }
}

/**
 * Compute display summary from entries — the single source of truth for
 * business data.  backup.summary is intentionally ignored so that a missing
 * or inconsistent summary does not affect import.
 */
function computeSummary(entries: BackupFile['entries']) {
  const entryCount = entries.length;

  if (entryCount === 0) {
    return { entryCount, earliestCreatedAt: null, latestCreatedAt: null };
  }

  const timestamps = entries.map((e) => e.createdAt);
  return {
    entryCount,
    earliestCreatedAt: new Date(Math.min(...timestamps)).toISOString(),
    latestCreatedAt: new Date(Math.max(...timestamps)).toISOString(),
  };
}

export function ImportConfirmDialog({
  backup,
  onConfirm,
  onCancel,
}: ImportConfirmDialogProps) {
  useI18n();
  const summary = computeSummary(backup.entries);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
      <div className="w-full max-w-sm rounded-lg bg-app-card p-6 shadow-lg">
        <h2 className="mb-4 text-lg font-semibold text-app-text">
          {t('data.importConfirmTitle')}
        </h2>

        <dl className="mb-6 space-y-2 text-sm text-app-text">
          <div className="flex justify-between">
            <dt className="text-app-muted">{t('data.importEntryCount')}</dt>
            <dd>{t('data.importEntryCountValue', { n: summary.entryCount })}</dd>
          </div>
          {summary.entryCount > 0 ? (
            <>
              <div className="flex justify-between">
                <dt className="text-app-muted">{t('data.importTimeRange')}</dt>
                <dd>
                  {formatDateTime(summary.earliestCreatedAt!)} ~{' '}
                  {formatDateTime(summary.latestCreatedAt!)}
                </dd>
              </div>
            </>
          ) : (
            <p className="text-app-muted">{t('data.importEmpty')}</p>
          )}
          <div className="flex justify-between">
            <dt className="text-app-muted">{t('data.importExportTime')}</dt>
            <dd>{formatDateTime(backup.exportTime)}</dd>
          </div>
        </dl>

        <p className="mb-6 text-sm text-app-muted">
          {t('data.importHint')}
        </p>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 flex-1 rounded-md border border-app-input-border bg-app-card px-4 text-sm font-medium text-app-text"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="min-h-11 flex-1 rounded-md bg-app-primary-soft px-4 text-sm font-semibold text-app-text"
          >
            {t('data.importConfirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
