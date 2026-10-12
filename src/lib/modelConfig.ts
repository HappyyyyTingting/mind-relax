import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, firestore } from '../lib/firebase';

export interface ModelConfig {
  mode: 'local' | 'http';
  baseUrl: string;
  apiKey: string;
  model: string;
}

const STORAGE_KEY = 'mind_relax_model_config';
const REMOTE_KEY = 'mind_relax_model_config_remote';

/** 云端配置的本地缓存（不含 API Key）。 */
interface RemoteConfigCache {
  baseUrl: string;
  model: string;
  updatedAt: number;
}

interface StoredConfig {
  /** 016 起存在；旧配置无此字段，按 http 处理。 */
  mode?: 'local' | 'http';
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Key 保存时所对应的 baseURL；云端覆盖 baseURL 后据此提示 Key 可能失效。 */
  keyBaseUrl?: string;
}

interface CloudConfigRow {
  base_url: string;
  model: string;
  updated_at: number;
}

function readStored(): StoredConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as StoredConfig)
      : null;
  } catch {
    return null;
  }
}

function readRemote(): RemoteConfigCache | null {
  try {
    const raw = localStorage.getItem(REMOTE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const remote = parsed as Partial<RemoteConfigCache>;
    return remote.baseUrl && remote.model && remote.updatedAt
      ? (remote as RemoteConfigCache)
      : null;
  } catch {
    return null;
  }
}

/**
 * Settings form view: the raw stored values without the completeness checks
 * of loadModelConfig, so switching the mode never discards the other mode's
 * fields (016).
 */
export function loadStoredConfig(): {
  mode: 'local' | 'http';
  baseUrl: string;
  apiKey: string;
  model: string;
} | null {
  const stored = readStored();
  if (!stored) return null;
  return {
    mode: stored.mode ?? 'http',
    baseUrl: stored.baseUrl,
    apiKey: stored.apiKey,
    model: stored.model,
  };
}

/**
 * loadModelConfig returns the saved model config, or null when nothing is
 * saved or the stored value is incomplete. Local mode needs none of the
 * HTTP fields (the model file lives in OPFS); HTTP mode needs all three.
 * Configs saved before 016 have no mode and are treated as http.
 */
export function loadModelConfig(): ModelConfig | null {
  const config = readStored();
  if (!config) return null;
  const mode = config.mode ?? 'http';
  if (mode === 'local') {
    return { mode, baseUrl: '', apiKey: '', model: '' };
  }
  if (!config.baseUrl || !config.apiKey || !config.model) return null;

  return {
    mode,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: config.model,
  };
}

/**
 * loadRemoteConfig returns the last cloud-synced baseURL / model (without the
 * key), used to prefill the settings form on a device that has no local
 * config yet.
 */
export function loadRemoteConfig(): { baseUrl: string; model: string } | null {
  const remote = readRemote();
  return remote ? { baseUrl: remote.baseUrl, model: remote.model } : null;
}

/** True when the cloud-synced baseURL no longer matches the one the local key was saved for. */
export function hasApiKeyUrlMismatch(): boolean {
  const stored = readStored();
  if (!stored || !stored.apiKey || !stored.keyBaseUrl) return false;
  return stored.keyBaseUrl !== stored.baseUrl;
}

/**
 * saveModelConfig persists locally (key never leaves the device) and pushes
 * baseURL + model to the cloud in the background. An empty baseURL or model
 * is kept local only: a device with no information must never overwrite a
 * configured one, so clearing a config never propagates.
 */
export function saveModelConfig(config: ModelConfig): void {
  const stored: StoredConfig = { ...config, keyBaseUrl: config.baseUrl };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  if (!config.baseUrl.trim() || !config.model.trim()) return;
  void pushConfigToCloud(config);
}

/**
 * syncRemoteConfig pulls the cloud config and, when it is newer than the last
 * synced one, updates the local cache and overwrites the local baseURL / model
 * (the API key stays). Runs on app open / sign-in / entering the settings
 * page. Failures (including a not-yet-created table) degrade silently.
 */
export async function syncRemoteConfig(): Promise<void> {
  try {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const result = await getDoc(doc(firestore, 'user_config', uid));
    if (!result.exists()) return;

    const row = result.data() as CloudConfigRow;
    // An empty cloud row is treated as invalid: a partial client must never
    // wipe configured devices, so it is neither cached nor applied.
    if (!row.base_url?.trim() || !row.model?.trim()) return;

    const remote: RemoteConfigCache = {
      baseUrl: row.base_url,
      model: row.model,
      updatedAt: row.updated_at,
    };
    const cached = readRemote();
    if (cached && cached.updatedAt >= remote.updatedAt) return;

    localStorage.setItem(REMOTE_KEY, JSON.stringify(remote));

    const stored = readStored();
    if (stored && stored.baseUrl && stored.apiKey && stored.model) {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          ...stored,
          baseUrl: remote.baseUrl,
          model: remote.model,
        }),
      );
    }
  } catch {
    // silent degradation
  }
}

async function pushConfigToCloud(config: ModelConfig): Promise<void> {
  try {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    await setDoc(
      doc(firestore, 'user_config', uid),
      { base_url: config.baseUrl, model: config.model, updated_at: Date.now() },
    );
  } catch {
    // fire-and-forget; the next save or syncRemoteConfig heals
  }
}
