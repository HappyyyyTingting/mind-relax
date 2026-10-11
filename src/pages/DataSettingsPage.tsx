import { useEffect, useRef, useState } from 'react';
import { Header } from '../components/Header';
import { ImportConfirmDialog } from '../components/ImportConfirmDialog';
import { entryRepository } from '../db/repository';
import { useToast } from '../hooks/useToast';
import { BackupService } from '../services/BackupService';
import type { BackupFile } from '../types/backup';

export function DataSettingsPage() {
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

      toast.success('备份导出成功。');
    } catch {
      toast.error('导出失败，请重试。');
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
      toast.error(err instanceof Error ? err.message : '导入失败，请重试。');
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
      if (result.newCount > 0) parts.push(`新增 ${result.newCount} 条`);
      if (result.updatedCount > 0) parts.push(`更新 ${result.updatedCount} 条`);
      if (result.skippedCount > 0) parts.push(`跳过 ${result.skippedCount} 条`);

      toast.success(parts.length > 0 ? `导入完成：${parts.join('，')}。` : '导入完成。');

      const entries = await entryRepository.list();
      setEntryCount(entries.length);
    } catch {
      toast.error('导入失败，数据库已回滚，请重试。');
    } finally {
      setIsImporting(false);
    }
  }

  function handleCancelImport() {
    setPendingBackup(null);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-[480px] flex-col bg-app-bg text-app-text">
      <Header title="数据管理" backTo="/settings" />

      <div className="flex flex-1 flex-col gap-8 px-6 pb-8 pt-4">
        <section>
          <h2 className="mb-3 text-base font-semibold text-app-text">导出备份</h2>
          <p className="mb-4 text-sm text-app-muted">
            {entryCount === null
              ? '加载中…'
              : entryCount === 0
                ? '暂无记录，可以导出空备份文件。'
                : `当前共 ${entryCount} 条记录。`}
          </p>

          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={entryCount === null || isExporting}
            className="min-h-12 w-full rounded-md bg-app-primary-soft px-6 text-base font-semibold text-app-text disabled:opacity-40"
          >
            {isExporting ? '导出中…' : '导出备份'}
          </button>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-app-text">导入备份</h2>
          <p className="mb-4 text-sm text-app-muted">
            选择之前导出的备份文件，导入将合并现有数据，较新记录不会被覆盖。
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
            {isImporting ? '导入中…' : '导入备份'}
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
