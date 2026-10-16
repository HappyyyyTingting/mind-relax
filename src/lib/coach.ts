import type { Entry } from '../types/entry';
import { coachDays } from './aiClient';
import { getLang } from './i18n';
import { proxyFetch } from './proxy';
import { getPulseGroup } from './pulse';
import { SAFETY_HEADER, showCrisisCard } from './safety';

/**
 * Weekly coach: follow-up questions about the weekly review, answered by a
 * Gemini agent on the server (services/ai-proxy/src/coach.ts). The app sends
 * the review's own days, so the coach and the review agree on which days
 * count. Nothing is kept on the server.
 */

export interface CoachTurn {
  role: 'user' | 'model';
  text: string;
}

export interface CoachStep {
  tool: string;
  day?: string;
}

export interface CoachAnswer {
  answer: string;
  steps: CoachStep[];
}

export async function askCoach(
  question: string,
  history: CoachTurn[],
  review: string,
  dayStarts: number[],
  entries: Entry[],
): Promise<CoachAnswer> {
  const response = await proxyFetch('/coach', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question,
      history,
      review,
      days: coachDays(dayStarts, entries),
      lang: getLang(),
      group: getPulseGroup() ?? undefined,
    }),
    // Up to four model rounds.
    timeoutMs: 90_000,
  });
  if (!response.ok) throw new Error(`coach request failed: ${response.status}`);
  if (response.headers.get(SAFETY_HEADER) === 'crisis') showCrisisCard();
  const parsed = (await response.json()) as { answer?: unknown; steps?: unknown };
  if (typeof parsed.answer !== 'string' || !parsed.answer.trim()) {
    throw new Error('coach returned no answer');
  }
  const steps = Array.isArray(parsed.steps)
    ? (parsed.steps as unknown[]).flatMap((step) => {
        const { tool, day } = (step ?? {}) as Record<string, unknown>;
        return typeof tool === 'string'
          ? [{ tool, ...(typeof day === 'string' ? { day } : {}) }]
          : [];
      })
    : [];
  return { answer: parsed.answer, steps };
}
