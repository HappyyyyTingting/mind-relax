/**
 * Local transport for AI requests: Gemma 4 E2B inference in the browser via
 * @litert-lm/core (WebGPU). Mirrors the HTTP transport's shape so
 * aiClient.ts can dispatch on the model mode without touching context
 * assembly. The engine is a singleton — loading the 2GB model takes a while,
 * so a failed load clears the cached promise and the next call retries.
 */
import {
  Engine,
  getOrLoadGlobalLiteRtLm,
  type Message,
} from '@litert-lm/core';
import { getModelFile } from './modelStore';
import type { AiMessage, StreamCallbacks } from './aiClient';

const WASM_DIR = '/wasm/';

let enginePromise: Promise<Engine> | null = null;

function getEngine(): Promise<Engine> {
  if (!enginePromise) {
    enginePromise = (async () => {
      // Idempotent: loadLiteRtLm throws when the wasm module is already
      // loaded, getOrLoadGlobalLiteRtLm reuses it instead.
      await getOrLoadGlobalLiteRtLm(WASM_DIR);
      return Engine.create({
        model: await getModelFile(),
        mainExecutorSettings: { maxNumTokens: 8192 },
      });
    })().catch((err) => {
      enginePromise = null;
      throw err;
    });
  }
  return enginePromise;
}

/** Message.content is string | ContentPart[]; take the text either way. */
function messageText(msg: Message): string {
  if (typeof msg.content === 'string') return msg.content;
  const first = msg.content?.[0];
  return first?.type === 'text' ? (first as { text: string }).text : '';
}

/** AiMessage lacks the lib's index signature; map to fresh literals. */
function toLibMessages(messages: AiMessage[]): Message[] {
  return messages.map((m) => ({ role: m.role, content: m.content }));
}

/**
 * Non-streaming request (daily summary, rolling talk summary): the preface
 * holds system + all but the last message, the last message triggers
 * generation — content-wise identical to the HTTP array call.
 */
export async function localComplete(messages: AiMessage[]): Promise<string> {
  const engine = await getEngine();
  const preface = toLibMessages(messages.slice(0, -1));
  const last = messages[messages.length - 1];
  const convo = await engine.createConversation({
    preface: { messages: preface },
    sessionConfig: { maxOutputTokens: 1024 },
  });
  try {
    const response = await convo.sendMessage({
      role: last.role,
      content: last.content,
    });
    const text = messageText(response);
    if (!text.trim()) throw new Error('本地模型返回了空内容');
    return text;
  } finally {
    // Free the conversation's KV cache; the engine stays for reuse.
    void convo.delete();
  }
}

/**
 * Streaming request (talk page): same preface mapping, then a reader loop
 * over the stream. Chunk semantics are not documented, so the heuristic
 * accepts both cumulative and delta chunks. The external signal cancels the
 * generation the same way the HTTP path aborts its fetch.
 */
export async function localStream(
  messages: AiMessage[],
  callbacks: StreamCallbacks,
  externalSignal?: AbortSignal,
): Promise<void> {
  const engine = await getEngine();
  const convo = await engine.createConversation({
    preface: { messages: toLibMessages(messages.slice(0, -1)) },
    sessionConfig: { maxOutputTokens: 1024 },
  });
  const last = messages[messages.length - 1];

  let aborted = false;
  const onAbort = () => {
    aborted = true;
    convo.cancel();
  };
  externalSignal?.addEventListener('abort', onAbort, { once: true });

  try {
    const reader = convo
      .sendMessageStreaming({ role: last.role, content: last.content })
      .getReader();
    let full = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = messageText(value);
      if (chunk.startsWith(full)) {
        callbacks.onDelta(chunk.slice(full.length));
        full = chunk;
      } else {
        callbacks.onDelta(chunk);
        full += chunk;
      }
    }
    if (!aborted) callbacks.onDone(full);
  } catch {
    if (!aborted) callbacks.onError();
  } finally {
    externalSignal?.removeEventListener('abort', onAbort);
    void convo.delete();
  }
}
