import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';
import { Header } from '../components/Header';
import { useToast } from '../hooks/useToast';
import {
  hasApiKeyUrlMismatch,
  loadRemoteConfig,
  loadStoredConfig,
  saveModelConfig,
  syncRemoteConfig,
} from '../lib/modelConfig';
import {
  MODEL_SIZE,
  deleteModel,
  downloadModel,
  getDownloadState,
  importModelFile,
  isModelReady,
  subscribeDownload,
} from '../lib/modelStore';

const inputClass =
  'w-full rounded-lg border border-app-input-border bg-app-card px-3 py-2 text-base leading-7 text-app-text outline-none focus:border-app-primary';

const MODEL_GB = (MODEL_SIZE / 1e9).toFixed(1);

function modeButtonClass(active: boolean): string {
  return `min-h-11 rounded-lg border px-3 text-sm font-medium ${
    active
      ? 'border-app-primary bg-app-primary-soft text-app-text'
      : 'border-app-input-border bg-app-card text-app-muted'
  }`;
}

export function AiModelSettingsPage() {
  const [mode, setMode] = useState<'local' | 'http'>('http');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [ready, setReady] = useState<boolean | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const location = useLocation();
  const backTo =
    (location.state as { from?: string } | null)?.from ?? '/settings';

  const download = useSyncExternalStore(subscribeDownload, getDownloadState);
  const downloading = download !== null;
  const downloadPct = download
    ? ((download.received / download.total) * 100).toFixed(1)
    : '0';

  useEffect(() => {
    void (async () => {
      // Align with the cloud first, then fill the form (fresh devices prefill
      // the cloud baseURL / model and only need the key).
      await syncRemoteConfig();
      const stored = loadStoredConfig();
      if (stored) {
        setMode(stored.mode);
        setBaseUrl((prev) => prev || stored.baseUrl);
        setApiKey((prev) => prev || stored.apiKey);
        setModel((prev) => prev || stored.model);
      } else {
        const remote = loadRemoteConfig();
        if (remote) {
          setBaseUrl((prev) => prev || remote.baseUrl);
          setModel((prev) => prev || remote.model);
        }
      }
      void isModelReady().then(setReady);
    })();
  }, []);

  const canSave =
    baseUrl.trim() !== '' && apiKey.trim() !== '' && model.trim() !== '';

  function handleSave() {
    try {
      if (mode === 'local') {
        // Local mode keeps the HTTP fields as typed so switching back never
        // discards them.
        saveModelConfig({
          mode: 'local',
          baseUrl: baseUrl.trim(),
          apiKey: apiKey.trim(),
          model: model.trim(),
        });
      } else {
        if (!canSave) return;
        saveModelConfig({
          mode: 'http',
          baseUrl: baseUrl.trim(),
          apiKey: apiKey.trim(),
          model: model.trim(),
        });
      }
      toast.success('已保存');
    } catch {
      toast.error('保存失败，请重试。');
    }
  }

  function handleDownload() {
    downloadModel()
      .then(() => void isModelReady().then(setReady))
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : '下载失败，请重试');
      });
  }

  function handleImport(file: File | undefined) {
    if (!file) return;
    setImporting(true);
    importModelFile(file)
      .then(() => {
        void isModelReady().then(setReady);
        toast.success('模型已导入');
      })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : '导入失败，请重试');
      })
      .finally(() => setImporting(false));
  }

  function handleDelete() {
    if (!window.confirm('确定删除本地模型吗？下次使用需重新下载。')) return;
    void deleteModel()
      .then(() => void isModelReady().then(setReady))
      .catch(() => toast.error('删除失败，请重试'));
  }

  const statusLine = downloading
    ? `下载中 ${downloadPct}%`
    : ready
      ? `已就绪 · ${MODEL_GB} GB · 推理全程在本机浏览器完成`
      : ready === false
        ? `未就绪 · 模型约 ${MODEL_GB} GB，下载一次后离线可用`
        : '检测中…';

  return (
    <main className="mx-auto flex min-h-screen max-w-[480px] flex-col bg-app-bg text-app-text">
      <Header title="AI 模型" backTo={backTo} />

      <div className="flex flex-1 flex-col gap-8 px-6 pb-8 pt-4">
        <section>
          <p className="mb-4 text-sm text-app-muted">
            选择模型运行方式。baseURL 与模型名会跨设备同步；API Key
            仅保存在本机浏览器。
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode('local')}
              className={modeButtonClass(mode === 'local')}
            >
              本地模型
            </button>
            <button
              type="button"
              onClick={() => setMode('http')}
              className={modeButtonClass(mode === 'http')}
            >
              自定义服务器
            </button>
          </div>
        </section>

        {mode === 'local' ? (
          <section>
            <p className="mb-4 text-sm text-app-muted">
              在浏览器内运行 Gemma 模型：原始文字不出设备、离线可用。模型文件下载一次后保存在本机。
            </p>
            <div className="space-y-3">
              <p className="text-sm text-app-text">{statusLine}</p>
              {downloading ? (
                <div className="h-2 w-full overflow-hidden rounded bg-app-input-border">
                  <div
                    className="h-full bg-app-primary"
                    style={{ width: `${downloadPct}%` }}
                  />
                </div>
              ) : null}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={downloading || importing}
                  className="min-h-10 rounded-md bg-app-primary-soft px-4 text-sm font-semibold text-app-text disabled:bg-app-primary-disabled"
                >
                  {downloading ? '下载中…' : '下载模型'}
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={downloading || importing}
                  className="min-h-10 rounded-md bg-app-primary-soft px-4 text-sm font-semibold text-app-text disabled:bg-app-primary-disabled"
                >
                  {importing ? '导入中…' : '导入模型文件'}
                </button>
                {ready ? (
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={downloading || importing}
                    className="min-h-10 rounded-md border border-app-input-border px-4 text-sm font-medium text-app-muted disabled:opacity-40"
                  >
                    删除
                  </button>
                ) : null}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".litertlm"
                hidden
                onChange={(event) => {
                  handleImport(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
            </div>
          </section>
        ) : (
          <section>
            <p className="mb-4 text-sm text-app-muted">
              配置 OpenAI 兼容的模型服务（云端 API 或你自己的服务器）。
            </p>
            <div className="space-y-3">
              <input
                type="text"
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder="baseURL，如 https://api.openai.com/v1 或 http://localhost:11434/v1"
                aria-label="baseURL"
                className={inputClass}
              />
              <div>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder="API Key"
                  aria-label="API Key"
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-app-muted">
                  仅保存在本机浏览器；本地模型可填任意值。
                </p>
                {hasApiKeyUrlMismatch() ? (
                  <p className="mt-1 text-xs text-app-muted">
                    云端配置已更新 baseURL，请确认 API Key 仍适用于该地址。
                  </p>
                ) : null}
              </div>
              <input
                type="text"
                value={model}
                onChange={(event) => setModel(event.target.value)}
                placeholder="模型名，如 gpt-4o-mini"
                aria-label="模型名"
                className={inputClass}
              />
              <p className="text-xs text-app-muted">
                使用云端模型时，你的记录会发送给该服务商处理。
              </p>
            </div>
          </section>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={mode === 'http' && !canSave}
          className="min-h-12 w-full rounded-md bg-app-primary-soft px-6 text-base font-semibold text-app-text disabled:bg-app-primary-disabled"
        >
          保存
        </button>
      </div>
    </main>
  );
}
