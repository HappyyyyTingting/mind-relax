import type { Content } from '@google/genai';

/**
 * The app already speaks the OpenAI chat format (its custom-server mode uses
 * it), so this service accepts the same shape. That keeps the app change small:
 * one more base URL, and the existing streaming parser reads our replies.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  stream?: boolean;
}

export class BadRequest extends Error {}

export interface ValidationLimits {
  maxMessages: number;
  maxInputChars: number;
}

/** Validates the untrusted request body; throws BadRequest with a reason. */
export function parseChatRequest(
  body: unknown,
  limits: ValidationLimits,
): ChatRequest {
  if (typeof body !== 'object' || body === null) {
    throw new BadRequest('body must be a JSON object');
  }
  const { messages, stream } = body as Record<string, unknown>;
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new BadRequest('messages must be a non-empty array');
  }
  if (messages.length > limits.maxMessages) {
    throw new BadRequest(`at most ${limits.maxMessages} messages`);
  }
  let chars = 0;
  const parsed = messages.map((item, index) => {
    if (typeof item !== 'object' || item === null) {
      throw new BadRequest(`messages[${index}] must be an object`);
    }
    const { role, content } = item as Record<string, unknown>;
    if (role !== 'system' && role !== 'user' && role !== 'assistant') {
      throw new BadRequest(`messages[${index}].role is invalid`);
    }
    if (typeof content !== 'string') {
      throw new BadRequest(`messages[${index}].content must be a string`);
    }
    chars += content.length;
    return { role, content } as ChatMessage;
  });
  if (chars > limits.maxInputChars) {
    throw new BadRequest(`input exceeds ${limits.maxInputChars} characters`);
  }
  if (!parsed.some((message) => message.role === 'user')) {
    throw new BadRequest('at least one user message is required');
  }
  return { messages: parsed, stream: stream === true };
}

/**
 * Gemini takes the system prompt separately and only "user" / "model" turns.
 * System messages are joined in order; consecutive turns from the same role
 * are merged, since the app sends each journal entry as its own user message.
 */
export function toGemini(messages: ChatMessage[]): {
  systemInstruction: string;
  contents: Content[];
} {
  const system: string[] = [];
  const contents: Content[] = [];
  for (const message of messages) {
    if (message.role === 'system') {
      system.push(message.content);
      continue;
    }
    const role = message.role === 'assistant' ? 'model' : 'user';
    const last = contents[contents.length - 1];
    if (last && last.role === role) {
      last.parts = [...(last.parts ?? []), { text: message.content }];
    } else {
      contents.push({ role, parts: [{ text: message.content }] });
    }
  }
  // Gemini requires the conversation to start with a user turn.
  if (contents[0]?.role === 'model') {
    contents.unshift({ role: 'user', parts: [{ text: '(start)' }] });
  }
  return { systemInstruction: system.join('\n\n'), contents };
}

/** The newest user message, which is what crisis screening looks at. */
export function lastUserText(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return messages[i].content;
  }
  return '';
}

/** One server-sent event in the OpenAI streaming format. */
export function sseChunk(text: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
}

/** A complete non-streaming reply in the OpenAI format. */
export function completion(text: string): object {
  return { choices: [{ message: { role: 'assistant', content: text } }] };
}
