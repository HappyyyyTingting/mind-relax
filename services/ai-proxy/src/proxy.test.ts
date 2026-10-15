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
import {
  MAX_MOOD_ENTRIES,
  MAX_MOOD_ENTRY_CHARS,
  moodPrompt,
  parseMoodRequest,
  parseMoodResponse,
} from './mood.js';
import { RateLimiter } from './rateLimit.js';
import { crisisLanguage, crisisReply, looksChinese, screenText } from './safety.js';
import { isPhotoId, parsePhotoRequest, photoInstruction, photoPath } from './photo.js';
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
    'मैं अब जीना नहीं चाहता',
    'कभी कभी आत्महत्या का ख़याल आता है',
    'मैं ख़ुद को नुकसान पहुँचा रही हूँ',
    'sach mein marna chahta hoon',
    'Saya rasa nak bunuh diri',
    'Saya tak mahu hidup lagi',
    'もう死にたい',
    '最近ずっと消えたいと思う',
    '정말 죽고 싶어',
    '요즘 자해를 했어',
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
    'आज ऑफिस में बहुत थकान हुई',
    'Hari ini saya sangat penat di tempat kerja',
    '今日は仕事で疲れた',
    '오늘 회사에서 너무 피곤했어',
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
  it('picks the reply language from the text', () => {
    assert.equal(crisisLanguage('I want to die'), 'en');
    assert.equal(crisisLanguage('我真的不想活了'), 'zh');
    assert.equal(crisisLanguage('मैं अब जीना नहीं चाहता'), 'hi');
    assert.equal(crisisLanguage('sach mein marna chahta hoon'), 'hi');
    assert.equal(crisisLanguage('Saya rasa nak bunuh diri'), 'ms');
    assert.equal(crisisLanguage('自殺したい、もう死にたい'), 'ja');
    assert.equal(crisisLanguage('정말 죽고 싶어'), 'ko');
  });
  it('replies in the user language', () => {
    assert.match(crisisReply('zh'), /热线/);
    assert.match(crisisReply('en'), /helpline/);
    assert.match(crisisReply('hi'), /हेल्पलाइन/);
    assert.match(crisisReply('ms'), /talian/);
    assert.match(crisisReply('ja'), /相談窓口/);
    assert.match(crisisReply('ko'), /상담 전화/);
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

  for (const lang of ['zh', 'hi', 'ms', 'ja', 'ko']) {
    it(`keeps ${lang}`, () =>
      assert.equal(
        parsePhotoRequest({ image: '/9j/4AAQ', mimeType: 'image/jpeg', lang }).lang,
        lang,
      ));
  }

  it('falls back to English for an unknown language', () => {
    for (const lang of ['fr', 'toString', 42]) {
      assert.equal(
        parsePhotoRequest({ image: '/9j/4AAQ', mimeType: 'image/jpeg', lang }).lang,
        'en',
      );
    }
  });

  it('names the caption language for Gemini', () => {
    assert.match(photoInstruction('hi'), /in Hindi/);
    assert.match(photoInstruction('ko'), /in Korean/);
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

describe('mood requests', () => {
  const asked = [
    { id: 'a1', text: 'Great day at the park' },
    { id: 'b2', text: 'Could not sleep, worried about exams' },
  ];

  it('accepts entries and cuts long text', () => {
    const parsed = parseMoodRequest({
      entries: [{ id: 'abc_DEF-1', text: 'x'.repeat(MAX_MOOD_ENTRY_CHARS + 50) }],
    });
    assert.equal(parsed[0].text.length, MAX_MOOD_ENTRY_CHARS);
  });

  for (const body of [
    null,
    { entries: [] },
    { entries: [{ id: '../x', text: 'hi' }] },
    { entries: [{ id: 'a1', text: '   ' }] },
    { entries: Array.from({ length: MAX_MOOD_ENTRIES + 1 }, (_, i) => ({ id: `e${i}`, text: 'hi' })) },
  ]) {
    it(`rejects ${JSON.stringify(body).slice(0, 60)}`, () =>
      assert.throws(() => parseMoodRequest(body), BadRequest));
  }

  it('tags each entry with its id', () => {
    assert.match(moodPrompt(asked), /\[id: a1\]\nGreat day/);
    assert.match(moodPrompt(asked), /\[id: b2\]/);
  });

  it('keeps only valid results for ids that were asked', () => {
    const raw = JSON.stringify([
      { id: 'a1', score: 5, feeling: 'happy' },
      { id: 'a1', score: 1, feeling: 'sad' },
      { id: 'b2', score: 9, feeling: 'anxious' },
      { id: 'zz', score: 3, feeling: 'calm' },
      { id: 'b2', score: 2, feeling: 'nervous' },
    ]);
    assert.deepEqual(parseMoodResponse(raw, asked), [{ id: 'a1', score: 5, feeling: 'happy' }]);
  });

  it('survives a broken reply', () => {
    assert.deepEqual(parseMoodResponse('not json', asked), []);
    assert.deepEqual(parseMoodResponse('{"id":"a1"}', asked), []);
  });
});
