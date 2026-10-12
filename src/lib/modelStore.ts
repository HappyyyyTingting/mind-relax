/**
 * Local model lifecycle: the 2GB Gemma file lives in OPFS (Origin Private
 * File System) so downloads can resume via Range requests and positional
 * writes. The engine re-reads the file on every load — browsers cannot keep
 * GPU memory across page sessions.
 */

export const MODEL_URL =
  'https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.litertlm';
export const MODEL_SIZE = 2008432640;
const MODEL_FILE = 'gemma-4-E2B-it-web.litertlm';

export interface DownloadProgress {
  received: number;
  total: number;
}

// Module-level download state so the settings page can observe an in-flight
// download started elsewhere; a refresh naturally kills it (not persisted).
let downloadState: DownloadProgress | null = null;
const downloadListeners = new Set<(state: DownloadProgress | null) => void>();

function emitDownload(): void {
  downloadListeners.forEach((listener) => listener(downloadState));
}

export function subscribeDownload(
  listener: (state: DownloadProgress | null) => void,
): () => void {
  downloadListeners.add(listener);
  return () => {
    downloadListeners.delete(listener);
  };
}

export function getDownloadState(): DownloadProgress | null {
  return downloadState;
}

async function getFileHandle(create: boolean): Promise<FileSystemFileHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getFileHandle(MODEL_FILE, { create });
}

/** True when the model file exists with the exact expected size. */
export async function isModelReady(): Promise<boolean> {
  try {
    const file = await (await getFileHandle(false)).getFile();
    return file.size === MODEL_SIZE;
  } catch {
    return false;
  }
}

/** The ready model as a File (disk-backed; the engine streams from it). */
export async function getModelFile(): Promise<File> {
  const file = await (await getFileHandle(false)).getFile();
  if (file.size !== MODEL_SIZE) throw new Error('本地模型未就绪');
  return file;
}

/**
 * Resumable download: resume from the existing partial file's size via a
 * Range request, appending with positional writes. Fails loudly on any
 * network error so the caller (settings page) can offer a retry.
 */
export async function downloadModel(): Promise<void> {
  if (downloadState) return;
  try {
    const handle = await getFileHandle(true);
    let existing = 0;
    try {
      existing = (await handle.getFile()).size;
    } catch {
      // file not created yet — start from zero
    }
    const response = await fetch(MODEL_URL, {
      headers: existing > 0 ? { Range: `bytes=${existing}-` } : {},
    });
    if (!response.ok || !response.body) {
      throw new Error(`下载失败：HTTP ${response.status}`);
    }
    // A server that ignores Range answers 200; restart cleanly in that case.
    const resumed = existing > 0 && response.status === 206;
    const start = resumed ? existing : 0;

    const writable = await handle.createWritable({ keepExistingData: resumed });
    downloadState = { received: start, total: MODEL_SIZE };
    emitDownload();
    try {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await writable.write({
          type: 'write',
          position: downloadState.received,
          data: value,
        });
        downloadState.received += value.length;
        emitDownload();
      }
    } finally {
      await writable.close();
      downloadState = null;
      emitDownload();
    }

    const file = await handle.getFile();
    if (file.size !== MODEL_SIZE) {
      throw new Error('下载不完整，请重试');
    }
    await requestModelPersistence();
  } catch (err) {
    downloadState = null;
    emitDownload();
    throw err;
  }
}

/** Copies a user-picked model file into OPFS (one local disk pass). */
export async function importModelFile(file: File): Promise<void> {
  const handle = await getFileHandle(true);
  const writable = await handle.createWritable();
  try {
    await writable.write(file);
  } finally {
    await writable.close();
  }
  const stored = await handle.getFile();
  if (stored.size !== MODEL_SIZE) {
    throw new Error(
      '文件大小不匹配：需要 gemma-4-E2B-it-web.litertlm（约 2GB）',
    );
  }
  await requestModelPersistence();
}

export async function deleteModel(): Promise<void> {
  const root = await navigator.storage.getDirectory();
  try {
    await root.removeEntry(MODEL_FILE);
  } catch {
    // already gone
  }
}

/** Ask the browser not to evict the model under storage pressure. */
async function requestModelPersistence(): Promise<void> {
  try {
    if (navigator.storage?.persist) await navigator.storage.persist();
  } catch {
    // best effort
  }
}
