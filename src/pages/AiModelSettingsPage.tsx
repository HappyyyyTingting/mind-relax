import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';
import { Header } from '../components/Header';
import { useToast } from '../hooks/useToast';
import { localizedError } from '../lib/errors';
import { t, useI18n } from '../lib/i18n';
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
/** MB display uses decimal units, consistent with the GB status line. */
const toMb = (bytes: number) => (bytes / 1e6).toFixed(1);

type Preset = 'custom' | 'vertex';

/** Matches a stored Vertex OpenAI-compatible baseURL and captures the three fields. */
const VERTEX_RE =
  /^https:\/\/([a-z0-9-]+)-aiplatform\.googleapis\.com\/v1beta1\/projects\/([^/]+)\/locations\/([^/]+)\/endpoints\/openapi\/?$/i;

function composeVertexUrl(
  region: string,
  project: string,
  location: string,
): string {
  return `https://${region}-aiplatform.googleapis.com/v1beta1/projects/${project}/locations/${location}/endpoints/openapi`;
}

function modeButtonClass(active: boolean): string {
  return `min-h-11 rounded-lg border px-3 text-sm font-medium ${
    active
      ? 'border-app-primary bg-app-primary-soft text-app-text'
      : 'border-app-input-border bg-app-card text-app-muted'
  }`;
}

export function AiModelSettingsPage() {
  useI18n();
  const [mode, setMode] = useState<'local' | 'http'>('http');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [preset, setPreset] = useState<Preset>('custom');
  const [vertexRegion, setVertexRegion] = useState('us-central1');
  const [vertexProject, setVertexProject] = useState('');
  const [vertexLocation, setVertexLocation] = useState('us-central1');
  /** Manual baseURL snapshot while the Vertex preset composes the URL. */
  const customBaseUrlRef = useRef('');
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
      const target = stored
        ? stored.baseUrl
        : (loadRemoteConfig()?.baseUrl ?? '');
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
      // A stored Vertex URL selects the preset and prefills its fields.
      const vertexMatch = VERTEX_RE.exec(target);
      if (vertexMatch) {
        setPreset('vertex');
        setVertexRegion(vertexMatch[1]);
        setVertexProject(vertexMatch[2]);
        setVertexLocation(vertexMatch[3]);
      }
      void isModelReady().then(setReady);
    })();
  }, []);

  const vertexUrl = composeVertexUrl(vertexRegion, vertexProject, vertexLocation);
  const effectiveBaseUrl = preset === 'vertex' ? vertexUrl : baseUrl;
  const canSave =
    effectiveBaseUrl.trim() !== '' && apiKey.trim() !== '' && model.trim() !== '';

  function handlePresetChange(next: Preset) {
    if (next === preset) return;
    if (next === 'vertex') {
      customBaseUrlRef.current = baseUrl;
    } else {
      setBaseUrl(customBaseUrlRef.current);
    }
    setPreset(next);
  }

  function handleSave() {
    try {
      if (mode === 'local') {
        // Local mode keeps the HTTP fields as typed so switching back never
        // discards them.
        saveModelConfig({
          mode: 'local',
          baseUrl: effectiveBaseUrl.trim(),
          apiKey: apiKey.trim(),
          model: model.trim(),
        });
      } else {
        if (!canSave) return;
        saveModelConfig({
          mode: 'http',
          baseUrl: effectiveBaseUrl.trim(),
          apiKey: apiKey.trim(),
          model: model.trim(),
        });
      }
      toast.success(t('model.saved'));
    } catch {
      toast.error(t('model.saveFailed'));
    }
  }

  function handleDownload() {
    downloadModel()
      .then(() => void isModelReady().then(setReady))
      .catch((err: unknown) => {
        toast.error(localizedError(err, 'model.downloadFailed'));
      });
  }

  function handleImport(file: File | undefined) {
    if (!file) return;
    setImporting(true);
    importModelFile(file)
      .then(() => {
        void isModelReady().then(setReady);
        toast.success(t('model.imported'));
      })
      .catch((err: unknown) => {
        toast.error(localizedError(err, 'model.importFailed'));
      })
      .finally(() => setImporting(false));
  }

  function handleDelete() {
    if (!window.confirm(t('model.deleteConfirm'))) return;
    void deleteModel()
      .then(() => void isModelReady().then(setReady))
      .catch(() => toast.error(t('model.deleteFailed')));
  }

  const statusLine = downloading
    ? t('model.downloadProgress', {
        done: toMb(download?.received ?? 0),
        total: toMb(download?.total ?? MODEL_SIZE),
        pct: downloadPct,
      })
    : ready
      ? t('model.readyStatus', { gb: MODEL_GB })
      : ready === false
        ? t('model.notReadyStatus', { gb: MODEL_GB })
        : t('model.statusChecking');

  return (
    <main className="mx-auto flex min-h-screen max-w-[480px] flex-col bg-app-bg text-app-text">
      <Header title={t('settings.aiModel')} backTo={backTo} />

      <div className="flex flex-1 flex-col gap-8 px-6 pb-8 pt-4">
        <section>
          <p className="mb-4 text-sm text-app-muted">
            {t('model.modeHint')}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode('local')}
              className={modeButtonClass(mode === 'local')}
            >
              {t('model.localMode')}
            </button>
            <button
              type="button"
              onClick={() => setMode('http')}
              className={modeButtonClass(mode === 'http')}
            >
              {t('model.httpMode')}
            </button>
          </div>
        </section>

        {mode === 'local' ? (
          <section>
            <p className="mb-4 text-sm text-app-muted">
              {t('model.localHint')}
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
                  {downloading ? t('model.downloading') : t('model.download')}
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={downloading || importing}
                  className="min-h-10 rounded-md bg-app-primary-soft px-4 text-sm font-semibold text-app-text disabled:bg-app-primary-disabled"
                >
                  {importing ? t('model.importing') : t('model.import')}
                </button>
                {ready ? (
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={downloading || importing}
                    className="min-h-10 rounded-md border border-app-input-border px-4 text-sm font-medium text-app-muted disabled:opacity-40"
                  >
                    {t('common.delete')}
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
              {t('model.httpHint')}
            </p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm text-app-muted" htmlFor="preset">
                  {t('model.preset')}
                </label>
                <select
                  id="preset"
                  value={preset}
                  onChange={(event) => handlePresetChange(event.target.value as Preset)}
                  className={inputClass}
                >
                  <option value="custom">{t('model.presetCustom')}</option>
                  <option value="vertex">{t('model.presetVertex')}</option>
                </select>
              </div>

              {preset === 'vertex' ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={vertexRegion}
                      onChange={(event) => setVertexRegion(event.target.value)}
                      placeholder={t('model.vertexRegion')}
                      aria-label={t('model.vertexRegion')}
                      className={inputClass}
                    />
                    <input
                      type="text"
                      value={vertexLocation}
                      onChange={(event) => setVertexLocation(event.target.value)}
                      placeholder={t('model.vertexLocation')}
                      aria-label={t('model.vertexLocation')}
                      className={inputClass}
                    />
                  </div>
                  <input
                    type="text"
                    value={vertexProject}
                    onChange={(event) => setVertexProject(event.target.value)}
                    placeholder={t('model.vertexProject')}
                    aria-label={t('model.vertexProject')}
                    className={inputClass}
                  />
                  <input
                    type="text"
                    value={vertexUrl}
                    readOnly
                    aria-label="baseURL"
                    className={inputClass}
                  />
                  <p className="text-xs text-app-muted">
                    {t('model.vertexHint')}
                  </p>
                </>
              ) : (
                <input
                  type="text"
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.target.value)}
                  placeholder={t('model.baseUrlPlaceholder')}
                  aria-label="baseURL"
                  className={inputClass}
                />
              )}
              <div>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder={t('model.apiKeyPlaceholder')}
                  aria-label="API Key"
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-app-muted">
                  {t('model.apiKeyHint')}
                </p>
                {hasApiKeyUrlMismatch() ? (
                  <p className="mt-1 text-xs text-app-muted">
                    {t('model.apiKeyMismatch')}
                  </p>
                ) : null}
              </div>
              <input
                type="text"
                value={model}
                onChange={(event) => setModel(event.target.value)}
                placeholder={t('model.modelPlaceholder')}
                aria-label={t('model.modelName')}
                className={inputClass}
              />
              <p className="text-xs text-app-muted">
                {t('model.cloudPrivacy')}
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
          {t('common.save')}
        </button>
      </div>
    </main>
  );
}
