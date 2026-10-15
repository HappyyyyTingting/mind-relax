/**
 * Safety eval: how often each layer gives the crisis reply when it should,
 * and how often it gives it when it should not.
 *
 *   npm run eval:safety            phrase match only (free, offline)
 *   npm run eval:safety -- --live  phrase match + Gemini classifier
 *
 * --live calls Vertex AI once per case the phrase match misses (about 60
 * calls, well under ₹5), using your gcloud application-default login and
 * GOOGLE_CLOUD_PROJECT. It writes eval/RESULTS.md.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { GoogleGenAI } from '@google/genai';
import { classifyRisk } from '../src/riskCheck.js';
import { screenText } from '../src/safety.js';

interface Case {
  lang: string;
  kind: 'direct' | 'indirect' | 'everyday';
  text: string;
}

const here = new URL('.', import.meta.url);
const { cases } = JSON.parse(readFileSync(new URL('safety-cases.json', here), 'utf8')) as {
  cases: Case[];
};

const live = process.argv.includes('--live');
const model = process.env.GEMINI_MODEL ?? 'gemini-3.8-flash';
const ai = live
  ? new GoogleGenAI({
      vertexai: true,
      project: process.env.GOOGLE_CLOUD_PROJECT,
      location: process.env.GEMINI_LOCATION ?? 'global',
    })
  : null;

interface Row {
  c: Case;
  phrase: boolean;
  both: boolean | null;
  label: string;
}

const rows: Row[] = [];
for (const c of cases) {
  const phrase = screenText(c.text) === 'crisis';
  let both: boolean | null = null;
  let label = phrase ? 'phrase' : '-';
  if (ai) {
    if (phrase) {
      both = true;
    } else {
      const { result } = await classifyRisk(ai, model, [c.text]);
      label = result?.risk ?? 'unreadable';
      both = result?.risk === 'crisis';
    }
  }
  rows.push({ c, phrase, both, label });
  process.stdout.write('.');
}
process.stdout.write('\n');

const LANGS = ['en', 'zh', 'hi', 'ms', 'ja', 'ko'];
const pct = (n: number, d: number) => (d === 0 ? '-' : `${Math.round((n / d) * 100)}%`);

function score(subset: Row[], pick: (r: Row) => boolean | null) {
  const crisis = subset.filter((r) => r.c.kind !== 'everyday');
  const indirect = subset.filter((r) => r.c.kind === 'indirect');
  const everyday = subset.filter((r) => r.c.kind === 'everyday');
  const hit = (list: Row[]) => list.filter((r) => pick(r) === true).length;
  return {
    recall: `${hit(crisis)}/${crisis.length} (${pct(hit(crisis), crisis.length)})`,
    indirect: `${hit(indirect)}/${indirect.length}`,
    falseAlarms: `${hit(everyday)}/${everyday.length}`,
  };
}

const lines: string[] = [
  '# Safety eval results',
  '',
  `${cases.length} messages in 6 languages (eval/safety-cases.json): per language 3 direct, 5 indirect, 4 everyday.`,
  `Run: ${new Date().toISOString().slice(0, 10)}, model ${live ? model : '(phrase match only)'}.`,
  '',
  '"Caught" counts direct + indirect messages that got the crisis reply. "False alarms" counts everyday messages that got it.',
  '',
  live
    ? '| Language | Phrase only: caught | Phrase only: indirect | Phrase only: false alarms | + Gemini: caught | + Gemini: indirect | + Gemini: false alarms |'
    : '| Language | Caught | Indirect caught | False alarms |',
  live ? '|---|---|---|---|---|---|---|' : '|---|---|---|---|',
];
for (const lang of [...LANGS, 'all']) {
  const subset = lang === 'all' ? rows : rows.filter((r) => r.c.lang === lang);
  const p = score(subset, (r) => r.phrase);
  const name = lang === 'all' ? '**All**' : lang;
  if (live) {
    const b = score(subset, (r) => r.both);
    lines.push(`| ${name} | ${p.recall} | ${p.indirect} | ${p.falseAlarms} | ${b.recall} | ${b.indirect} | ${b.falseAlarms} |`);
  } else {
    lines.push(`| ${name} | ${p.recall} | ${p.indirect} | ${p.falseAlarms} |`);
  }
}

const misses = rows.filter((r) => (r.c.kind === 'everyday') === (live ? r.both === true : r.phrase));
lines.push('', '## Mistakes', '');
if (misses.length === 0) lines.push('None.');
for (const r of misses) {
  const what = r.c.kind === 'everyday' ? 'false alarm' : 'missed';
  lines.push(`- ${r.c.lang} / ${r.c.kind}, ${what}: "${r.c.text}"${live ? (r.phrase ? ' (phrase list fired)' : ` (classifier said ${r.label})`) : ''}`);
}

const out = lines.join('\n') + '\n';
console.log(out);
if (live) writeFileSync(new URL('RESULTS.md', here), out);
