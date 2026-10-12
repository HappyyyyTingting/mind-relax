import { useEffect, useRef, useState } from 'react';
import { Header } from '../components/Header';
import { ImportConfirmDialog } from '../components/ImportConfirmDialog';
import { entryRepository } from '../db/repository';
import { useToast } from '../hooks/useToast';
import { localizedError } from '../lib/errors';
import { t, useI18n } from '../lib/i18n';
import { BackupService } from '../services/BackupService';
import type { BackupFile } from '../types/backup';

export function DataSettingsPage() {
  useI18n();
  const [entryCount, setEntryCount] = useState<number | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [pendingBackup, setPendingBackup] = useState<BackupFile | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  useEffect(() => {
    let isMounted = true;

    async function load() {
      const entries = await entryRepository.list();
      if (isMounted) {
        setEntryCount(entries.length);
      }
    }

    void load();

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleExport() {
    setIsExporting(true);

    try {
      const blob = await BackupService.export();
      const url = URL.createObjectURL(blob);

      const now = new Date();
      const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
      const a = document.createElement('a');
      a.href = url;
      a.download = `mind_relax_backup_${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(t('data.exportSuccess'));
    } catch {
      toast.error(t('data.exportFailed'));
    } finally {
      setIsExporting(false);
    }
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const backup = await BackupService.validate(file);
      setPendingBackup(backup);
    } catch (err) {
      toast.error(localizedError(err, 'data.importFailed'));
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  async function handleConfirmImport() {
    if (!pendingBackup) {
      return;
    }

    const backup = pendingBackup;
    setPendingBackup(null);
    setIsImporting(true);

    try {
      const result = await BackupService.import(backup);

      const parts: string[] = [];
      if (result.newCount > 0) parts.push(t('data.importNew', { n: result.newCount }));
      if (result.updatedCount > 0) parts.push(t('data.importUpdated', { n: result.updatedCount }));
      if (result.skippedCount > 0) parts.push(t('data.importSkipped', { n: result.skippedCount }));

      toast.success(
        parts.length > 0
          ? t('data.importDone', { detail: parts.join(t('data.importDetailSep')) })
          : t('data.importDoneSimple'),
      );

      const entries = await entryRepository.list();
      setEntryCount(entries.length);
    } catch {
      toast.error(t('data.importRolledBack'));
    } finally {
      setIsImporting(false);
    }
  }

  function handleCancelImport() {
    setPendingBackup(null);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-[480px] flex-col bg-app-bg text-app-text">
      <Header title={t('settings.data')} backTo="/settings" />

      <div className="flex flex-1 flex-col gap-8 px-6 pb-8 pt-4">
        <section>
          <h2 className="mb-3 text-base font-semibold text-app-text">{t('data.export')}</h2>
          <p className="mb-4 text-sm text-app-muted">
            {entryCount === null
              ? t('common.loading')
              : entryCount === 0
                ? t('data.exportEmpty')
                : t('data.exportCount', { n: entryCount })}
          </p>

          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={entryCount === null || isExporting}
            className="min-h-12 w-full rounded-md bg-app-primary-soft px-6 text-base font-semibold text-app-text disabled:opacity-40"
          >
            {isExporting ? t('data.exporting') : t('data.export')}
          </button>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-app-text">{t('data.import')}</h2>
          <p className="mb-4 text-sm text-app-muted">
            {t('data.importHint')}
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(event) => void handleFileSelected(event)}
          />

          <button
            type="button"
            onClick={handleImportClick}
            disabled={entryCount === null || isImporting}
            className="min-h-12 w-full rounded-md bg-app-primary-soft px-6 text-base font-semibold text-app-text disabled:opacity-40"
          >
            {isImporting ? t('data.importing') : t('data.import')}
          </button>
        </section>
      </div>

      {pendingBackup ? (
        <ImportConfirmDialog
          backup={pendingBackup}
          onConfirm={() => void handleConfirmImport()}
          onCancel={handleCancelImport}
        />
      ) : null}
    </main>
  );
}
