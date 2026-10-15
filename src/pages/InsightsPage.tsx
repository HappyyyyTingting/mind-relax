import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CommunityPulse } from '../components/CommunityPulse';
import { Header } from '../components/Header';
import { entryRepository } from '../db/repository';
import { useToast } from '../hooks/useToast';
import { getLang, localeOf, t, useI18n, type I18nKey } from '../lib/i18n';
import { loadModelConfig } from '../lib/modelConfig';
import { sendPulse } from '../lib/pulse';
import {
  dailyMoods,
  feelingCounts,
  isMoodCandidate,
  scoreMissingMoods,
  type DayMood,
} from '../lib/mood';
import type { Entry } from '../types/entry';

type Range = 7 | 30;

const DAY_MS = 24 * 60 * 60 * 1000;

const LEVEL_KEYS: I18nKey[] = [
  'insights.level1',
  'insights.level2',
  'insights.level3',
  'insights.level4',
  'insights.level5',
];

function levelName(score: number): string {
  return t(LEVEL_KEYS[Math.min(4, Math.max(0, Math.round(score) - 1))]);
}

/**
 * MoodChart draws the daily average as a line from 1 (bottom) to 5 (top).
 * Days without a scored entry leave a gap instead of pretending to be 3.
 */
function MoodChart({ days }: { days: DayMood[] }) {
  const width = 320;
  const height = 160;
  const padLeft = 22;
  const padRight = 8;
  const padTop = 10;
  const padBottom = 24;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;
  const x = (i: number) =>
    padLeft + (days.length === 1 ? plotW / 2 : (i * plotW) / (days.length - 1));
  const y = (score: number) => padTop + ((5 - score) / 4) * plotH;

  // Split the line wherever a day has no score.
  const segments: string[] = [];
  let current: string[] = [];
  days.forEach((day, i) => {
    if (day.average === null) {
      if (current.length > 1) segments.push(current.join(' '));
      current = [];
      return;
    }
    current.push(`${current.length ? 'L' : 'M'}${x(i).toFixed(1)},${y(day.average).toFixed(1)}`);
  });
  if (current.length > 1) segments.push(current.join(' '));

  const locale = localeOf(getLang());
  const labelEvery = days.length <= 7 ? 1 : 7;
  const dayLabel = new Intl.DateTimeFormat(
    locale,
    days.length <= 7 ? { weekday: 'narrow' } : { month: 'numeric', day: 'numeric' },
  );

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full"
      role="img"
      aria-label={t('insights.chartLabel')}
    >
      {[1, 2, 3, 4, 5].map((score) => (
        <g key={score}>
          <line
            x1={padLeft}
            x2={width - padRight}
            y1={y(score)}
            y2={y(score)}
            className="stroke-app-input-border"
            strokeWidth={score === 3 ? 1 : 0.5}
            strokeDasharray={score === 3 ? undefined : '3 3'}
          />
          <text
            x={padLeft - 8}
            y={y(score) + 3.5}
            textAnchor="middle"
            className="fill-app-muted"
            fontSize="10"
          >
            {score}
          </text>
        </g>
      ))}
      {segments.map((d) => (
        <path
          key={d}
          d={d}
          fill="none"
          className="stroke-app-accent"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {days.map((day, i) =>
        day.average === null ? null : (
          <circle key={day.day} cx={x(i)} cy={y(day.average)} r={3} className="fill-app-accent">
            <title>{`${dayLabel.format(day.day)}: ${day.average.toFixed(1)} · ${levelName(day.average)}`}</title>
          </circle>
        ),
      )}
      {days.map((day, i) =>
        (days.length - 1 - i) % labelEvery === 0 ? (
          <text
            key={`label-${day.day}`}
            x={x(i)}
            y={height - 6}
            textAnchor={days.length > 7 && i === days.length - 1 ? 'end' : 'middle'}
            className="fill-app-muted"
            fontSize="10"
          >
            {dayLabel.format(day.day)}
          </text>
        ) : null,
      )}
    </svg>
  );
}

/**
 * InsightsPage shows how the user's mood has moved over the last 7 or 30
 * days. Gemini reads each entry once and gives it a score and a feeling
 * word; the chart and counts are then worked out on the device.
 */
export function InsightsPage() {
  useI18n();
  const toast = useToast();
  const [range, setRange] = useState<Range>(7);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [reading, setReading] = useState(0);
  const geminiMode = loadModelConfig()?.mode === 'gemini';
  const startedRef = useRef(false);

  const monthStart = Date.now() - 30 * DAY_MS;
  const recent = useMemo(
    () => (entries ?? []).filter((entry) => isMoodCandidate(entry) && entry.createdAt >= monthStart),
    // monthStart moves every render; the list only needs recomputing with entries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries],
  );
  const unscored = recent.filter((entry) => !entry.metadata?.mood).length;

  const readMoods = useCallback(
    async (list: Entry[]) => {
      const waiting = list.filter((entry) => !entry.metadata?.mood).length;
      if (waiting === 0) return;
      setReading(Math.min(waiting, 30));
      try {
        await scoreMissingMoods(list);
        setEntries(await entryRepository.list());
      } catch {
        toast.error(t('insights.failed'));
      } finally {
        setReading(0);
      }
    },
    [toast],
  );

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void (async () => {
      const all = await entryRepository.list();
      setEntries(all);
      if (geminiMode) {
        const since = Date.now() - 30 * DAY_MS;
        await readMoods(all.filter((entry) => isMoodCandidate(entry) && entry.createdAt >= since));
        // Opted-in users share this week's daily numbers (nothing else).
        await sendPulse(await entryRepository.list()).catch(() => undefined);
      }
    })();
  }, [geminiMode, readMoods]);

  const inRange = recent.filter((entry) => entry.createdAt >= Date.now() - range * DAY_MS);
  const days = dailyMoods(inRange, range);
  const scored = inRange.filter((entry) => entry.metadata?.mood);
  const average = scored.length
    ? scored.reduce((sum, entry) => sum + (entry.metadata?.mood?.score ?? 0), 0) / scored.length
    : null;
  const feelings = feelingCounts(inRange).slice(0, 5);

  return (
    <main className="mx-auto flex min-h-screen max-w-[480px] flex-col bg-app-bg text-app-text">
      <Header title={t('insights.title')} backTo="/" />

      <div className="flex flex-1 flex-col gap-4 px-6 pb-8 pt-2">
        <div
          role="tablist"
          aria-label={t('insights.title')}
          className="flex self-start rounded-full border border-app-input-border bg-app-card p-1 text-sm shadow-card"
        >
          {([7, 30] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={range === option}
              onClick={() => setRange(option)}
              className={
                range === option
                  ? 'min-h-8 rounded-full bg-app-primary px-4 font-semibold text-app-text'
                  : 'min-h-8 rounded-full px-4 text-app-muted hover:text-app-text'
              }
            >
              {t(option === 7 ? 'insights.week' : 'insights.month')}
            </button>
          ))}
        </div>

        {!geminiMode ? (
          <p className="rounded-xl border border-app-input-border bg-app-card p-4 text-sm leading-6 text-app-muted">
            {t('insights.needsGemini')}{' '}
            <Link to="/settings/ai-model" className="font-medium text-app-accent">
              {t('talk.goSettings')}
            </Link>
          </p>
        ) : null}

        {reading > 0 ? (
          <p role="status" className="flex items-center gap-2 text-sm text-app-muted">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-app-muted border-t-transparent" />
            {t('insights.reading', { n: reading })}
          </p>
        ) : null}

        {entries === null ? (
          <p className="text-sm text-app-muted">{t('common.loading')}</p>
        ) : scored.length === 0 && reading === 0 ? (
          <p className="rounded-xl border border-app-input-border bg-app-card p-4 text-sm leading-6 text-app-muted">
            {t('insights.empty')}
          </p>
        ) : scored.length > 0 ? (
          <>
            <section className="rounded-xl border border-app-input-border bg-app-card p-4 shadow-card">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="text-sm font-medium text-app-muted">{t('insights.average')}</h2>
                <span className="text-xs text-app-muted">
                  {t('insights.entriesCount', { n: scored.length })}
                </span>
              </div>
              {average !== null ? (
                <p className="mb-3 flex items-baseline gap-2">
                  <span className="text-3xl font-semibold">{average.toFixed(1)}</span>
                  <span className="text-sm text-app-muted">/ 5 · {levelName(average)}</span>
                </p>
              ) : null}
              <MoodChart days={days} />
            </section>

            {feelings.length > 0 ? (
              <section className="rounded-xl border border-app-input-border bg-app-card p-4 shadow-card">
                <h2 className="mb-3 text-sm font-medium text-app-muted">{t('insights.feelings')}</h2>
                <ul className="flex flex-wrap gap-2">
                  {feelings.map(({ feeling, count }) => (
                    <li
                      key={feeling}
                      className="rounded-full border border-app-input-border px-3 py-1 text-sm"
                    >
                      {t(`feeling.${feeling}`)} · {count}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        ) : null}

        {geminiMode && reading === 0 && unscored > 0 && entries !== null ? (
          <button
            type="button"
            onClick={() => void readMoods(recent)}
            className="self-start text-sm font-medium text-app-accent"
          >
            {t('insights.readMore', { n: unscored })}
          </button>
        ) : null}

        {geminiMode && entries !== null ? <CommunityPulse entries={entries} /> : null}

        <p className="text-xs leading-5 text-app-muted">{t('insights.privacy')}</p>
      </div>
    </main>
  );
}
