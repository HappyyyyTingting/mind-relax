import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BadRequest,
  lastUserText,
  parseChatRequest,
  sseChunk,
  toGemini,
} from './messages.js';
import { DailyBudget, MemoryBudgetStore, costInr } from './budget.js';
import { RateLimiter } from './rateLimit.js';
import { crisisReply, looksChinese, screenText } from './safety.js';
import { isPhotoId, parsePhotoRequest, photoPath } from './photo.js';
import { MAX_AUDIO_BASE64_CHARS, parseTranscribeRequest } from './transcribe.js';

const limits = { maxMessages: 5, maxInputChars: 100 };

describe('screenText', () => {
  const crisis = [
    'I want to kill myself',
    'Sometimes I think everyone would be better off dead without me, I am better off dead',
    'I keep thinking about suicide',
    "I don't want to wake up tomorrow",
    'I have been hurting myself again',
    '我真的不想活了',
    '最近总想自杀',
    '我又自残了',
  ];
  for (const text of crisis) {
    it(`flags: ${text}`, () => assert.equal(screenText(text), 'crisis'));
  }

  const ordinary = [
    'Work was exhausting today and my boss killed my idea',
    'I am dying to go on holiday',
    'This deadline is killing me',
    '今天工作好累，老板否定了我的方案',
    'I overthink every message I send',
  ];
  for (const text of ordinary) {
    it(`does not flag: ${text}`, () => assert.equal(screenText(text), 'ok'));
  }
});

describe('crisis reply language', () => {
  it('detects Chinese text', () => {
    assert.equal(looksChinese('我真的不想活了'), true);
    assert.equal(looksChinese('I want to die'), false);
  });
  it('replies in the user language', () => {
    assert.match(crisisReply(true), /热线/);
    assert.match(crisisReply(false), /helpline/);
  });
});

describe('parseChatRequest', () => {
  it('accepts a valid request', () => {
    const request = parseChatRequest(
      { messages: [{ role: 'user', content: 'hi' }], stream: true },
      limits,
    );
    assert.equal(request.stream, true);
    assert.equal(request.messages.length, 1);
  });

  const bad: Array<[string, unknown]> = [
    ['non-object body', 'hello'],
    ['empty messages', { messages: [] }],
    ['bad role', { messages: [{ role: 'tool', content: 'x' }] }],
    ['non-string content', { messages: [{ role: 'user', content: 3 }] }],
    ['no user message', { messages: [{ role: 'system', content: 'x' }] }],
    ['too many messages', { messages: Array(6).fill({ role: 'user', content: 'x' }) }],
    ['too long', { messages: [{ role: 'user', content: 'x'.repeat(101) }] }],
  ];
  for (const [name, body] of bad) {
    it(`rejects ${name}`, () =>
      assert.throws(() => parseChatRequest(body, limits), BadRequest));
  }
});

describe('toGemini', () => {
  it('splits system text and merges consecutive user turns', () => {
    const { systemInstruction, contents } = toGemini([
      { role: 'system', content: 'persona' },
      { role: 'user', content: 'entry one' },
      { role: 'user', content: 'entry two' },
      { role: 'assistant', content: 'reply' },
      { role: 'user', content: 'follow-up' },
    ]);
    assert.equal(systemInstruction, 'persona');
    assert.deepEqual(
      contents.map((c) => [c.role, c.parts?.length]),
      [
        ['user', 2],
        ['model', 1],
        ['user', 1],
      ],
    );
  });

  it('starts with a user turn when the first turn is the model', () => {
    const { contents } = toGemini([
      { role: 'assistant', content: 'opening' },
      { role: 'user', content: 'hi' },
    ]);
    assert.equal(contents[0].role, 'user');
  });
});

describe('helpers', () => {
  it('finds the newest user message', () => {
    assert.equal(
      lastUserText([
        { role: 'user', content: 'old' },
        { role: 'assistant', content: 'a' },
        { role: 'user', content: 'new' },
      ]),
      'new',
    );
  });

  it('formats an OpenAI stream chunk the app can parse', () => {
    const line = sseChunk('hello').trim();
    assert.ok(line.startsWith('data: '));
    const parsed = JSON.parse(line.slice(6));
    assert.equal(parsed.choices[0].delta.content, 'hello');
  });
});

describe('RateLimiter', () => {
  it('blocks after the limit and resets after the window', () => {
    let now = 0;
    const limiter = new RateLimiter(2, 1000, () => now);
    assert.equal(limiter.allow('a'), true);
    assert.equal(limiter.allow('a'), true);
    assert.equal(limiter.allow('a'), false);
    assert.equal(limiter.allow('b'), true);
    now = 1000;
    assert.equal(limiter.allow('a'), true);
  });
});

describe('DailyBudget', () => {
  const prices = { inputUsdPerMillion: 1.5, outputUsdPerMillion: 7.5, inrPerUsd: 90 };

  it('prices tokens in rupees', () => {
    // 1M input at $1.5 + 1M output at $7.5 = $9 = Rs 810
    assert.equal(costInr({ inputTokens: 1_000_000, outputTokens: 1_000_000 }, prices), 810);
  });

  it('refuses a call that would pass the rupee budget', async () => {
    const budget = new DailyBudget(new MemoryBudgetStore(), { maxCalls: 100, maxInr: 10 });
    assert.ok(await budget.reserve(6));
    assert.equal(await budget.reserve(6), null);
  });

  it('refuses a call past the call cap', async () => {
    const budget = new DailyBudget(new MemoryBudgetStore(), { maxCalls: 2, maxInr: 1000 });
    assert.ok(await budget.reserve(1));
    assert.ok(await budget.reserve(1));
    assert.equal(await budget.reserve(1), null);
  });

  it('settling to the real cost frees budget for later calls', async () => {
    const budget = new DailyBudget(new MemoryBudgetStore(), { maxCalls: 100, maxInr: 10 });
    const first = await budget.reserve(8);
    assert.ok(first);
    await budget.settle(first, 1);
    assert.ok(await budget.reserve(8));
  });

  it('an unknown cost keeps the worst-case hold', async () => {
    const budget = new DailyBudget(new MemoryBudgetStore(), { maxCalls: 100, maxInr: 10 });
    const first = await budget.reserve(8);
    assert.ok(first);
    await budget.settle(first, undefined);
    assert.equal(await budget.reserve(8), null);
  });

  it('starts fresh on a new UTC day', async () => {
    let now = new Date('2026-10-14T23:59:00Z');
    const budget = new DailyBudget(new MemoryBudgetStore(), { maxCalls: 1, maxInr: 10 }, () => now);
    assert.ok(await budget.reserve(1));
    assert.equal(await budget.reserve(1), null);
    now = new Date('2026-10-15T00:01:00Z');
    assert.ok(await budget.reserve(1));
  });
});

describe('parseTranscribeRequest', () => {
  it('accepts browser audio and drops codec details', () => {
    const parsed = parseTranscribeRequest({
      audio: 'GkXfo0IChoEB',
      mimeType: 'audio/webm;codecs=opus',
    });
    assert.equal(parsed.mimeType, 'audio/webm');
  });

  it('accepts Safari mp4 audio', () => {
    assert.equal(
      parseTranscribeRequest({ audio: 'AAAAHGZ0eXA=', mimeType: 'audio/mp4' }).mimeType,
      'audio/mp4',
    );
  });

  const bad: [string, unknown][] = [
    ['no body', null],
    ['empty audio', { audio: '', mimeType: 'audio/webm' }],
    ['not base64', { audio: 'hello world!', mimeType: 'audio/webm' }],
    ['video type', { audio: 'AAAA', mimeType: 'video/mp4' }],
    ['missing type', { audio: 'AAAA' }],
    ['too long', { audio: 'A'.repeat(MAX_AUDIO_BASE64_CHARS + 4), mimeType: 'audio/webm' }],
  ];
  for (const [name, body] of bad) {
    it(`rejects ${name}`, () =>
      assert.throws(() => parseTranscribeRequest(body), BadRequest));
  }
});

describe('photo requests', () => {
  it('accepts a JPEG and defaults the language to English', () => {
    const parsed = parsePhotoRequest({ image: '/9j/4AAQ', mimeType: 'image/jpeg' });
    assert.equal(parsed.lang, 'en');
  });

  it('keeps Chinese', () => {
    assert.equal(
      parsePhotoRequest({ image: '/9j/4AAQ', mimeType: 'image/jpeg', lang: 'zh' }).lang,
      'zh',
    );
  });

  for (const body of [
    null,
    { image: '', mimeType: 'image/jpeg' },
    { image: 'not base64!', mimeType: 'image/jpeg' },
    { image: '/9j/4AAQ', mimeType: 'image/gif' },
  ]) {
    it(`rejects ${JSON.stringify(body)}`, () =>
      assert.throws(() => parsePhotoRequest(body), BadRequest));
  }

  it('only accepts generated ids, so a path cannot leave the user folder', () => {
    assert.equal(isPhotoId('aB3_x-9QzLm2Kp0w'), true);
    for (const id of ['../other/x', 'a/b', '', 'short', 'x'.repeat(60)]) {
      assert.equal(isPhotoId(id), false);
    }
    assert.equal(photoPath('uid1', 'aB3_x-9QzLm2Kp0w'), 'u/uid1/aB3_x-9QzLm2Kp0w.jpg');
  });
});
