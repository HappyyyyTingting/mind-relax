import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Header } from '../components/Header';
import { useToast } from '../hooks/useToast';
import {
  hasApiKeyUrlMismatch,
  loadModelConfig,
  loadRemoteConfig,
  saveModelConfig,
  syncRemoteConfig,
} from '../lib/modelConfig';

const inputClass =
  'w-full rounded-lg border border-app-input-border bg-app-card px-3 py-2 text-base leading-7 text-app-text outline-none focus:border-app-primary';

export function AiModelSettingsPage() {
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const toast = useToast();
  const location = useLocation();
  const backTo =
    (location.state as { from?: string } | null)?.from ?? '/settings';

  useEffect(() => {
    void (async () => {
      // Align with the cloud first, then fill the form (fresh devices prefill
      // the cloud baseURL / model and only need the key).
      await syncRemoteConfig();
      const config = loadModelConfig();
      if (config) {
        setBaseUrl((prev) => prev || config.baseUrl);
        setApiKey((prev) => prev || config.apiKey);
        setModel((prev) => prev || config.model);
        return;
      }
      const remote = loadRemoteConfig();
      if (remote) {
        setBaseUrl((prev) => prev || remote.baseUrl);
        setModel((prev) => prev || remote.model);
      }
    })();
  }, []);

  const canSave =
    baseUrl.trim() !== '' && apiKey.trim() !== '' && model.trim() !== '';

  function handleSave() {
    if (!canSave) return;
    try {
      saveModelConfig({
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim(),
        model: model.trim(),
      });
      toast.success('已保存');
    } catch {
      toast.error('保存失败，请重试。');
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-[480px] flex-col bg-app-bg text-app-text">
      <Header title="AI 模型" backTo={backTo} />

      <div className="flex flex-1 flex-col gap-8 px-6 pb-8 pt-4">
        <section>
          <p className="mb-4 text-sm text-app-muted">
            配置后即可在首页与 AI 对话。baseURL 与模型名会跨设备同步；API Key
            仅保存在本机浏览器。
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
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              className="min-h-12 w-full rounded-md bg-app-primary-soft px-6 text-base font-semibold text-app-text disabled:bg-app-primary-disabled"
            >
              保存
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
