import { useEffect, useState } from 'react';
import { useToast } from '../hooks/useToast';
import { getLang, localeOf, t } from '../lib/i18n';
import {
  fetchPulse,
  isPulseEnabled,
  setPulseEnabled,
  type PulseSummary,
} from '../lib/pulse';
import type { Entry } from '../types/entry';

const DAY_MS = 24 * 60 * 60 * 1000;

/** "YYYY-MM-DD" as local midnight, so labels match the user's calendar. */
function parseDay(day: string): number {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date).getTime();
}

/**
 * PulseChart draws the community average (solid) and the BigQuery ML
 * forecast (dashed, with its 80% range shaded) on one 1-to-5 scale.
 */
function PulseChart({ summary }: { summary: PulseSummary }) {
  const width = 320;
  const height = 160;
  const padLeft = 22;
  const padRight = 8;
  const padTop = 10;
  const padBottom = 24;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const first = parseDay(summary.history[0].day);
  const lastDay = summary.forecast.at(-1)?.day ?? summary.history.at(-1)?.day ?? '';
  const span = Math.max(1, Math.round((parseDay(lastDay) - first) / DAY_MS));
  const x = (day: string) => padLeft + (Math.round((parseDay(day) - first) / DAY_MS) * plotW) / span;
  const y = (score: number) => padTop + ((5 - score) / 4) * plotH;
  const point = (day: string, score: number) => `${x(day).toFixed(1)},${y(score).toFixed(1)}`;

  // Split the history line wherever a day is missing (under 10 people).
  const segments: string[][] = [];
  summary.history.forEach((item, i) => {
    const previous = summary.history[i - 1];
    const joined = previous && parseDay(item.day) - parseDay(previous.day) <= DAY_MS * 1.5;
    if (!joined) segments.push([]);
    segments[segments.length - 1].push(point(item.day, item.average));
  });

  const lastReal = summary.history[summary.history.length - 1];
  const forecastLine = summary.forecast.length
    ? [point(lastReal.day, lastReal.average), ...summary.forecast.map((f) => point(f.day, f.average))]
    : [];
  const band = summary.forecast.length
    ? [
        point(lastReal.day, lastReal.average),
        ...summary.forecast.map((f) => point(f.day, f.high)),
        ...[...summary.forecast].reverse().map((f) => point(f.day, f.low)),
      ]
    : [];

  const formatter = new Intl.DateTimeFormat(localeOf(getLang()), {
    month: 'numeric',
    day: 'numeric',
  });
  const labels = [summary.history[0].day, lastReal.day, lastDay].filter(
    (day, i, all) => all.indexOf(day) === i,
  );

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full"
      role="img"
      aria-label={t('pulse.chartLabel')}
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
      {band.length ? (
        <polygon points={band.join(' ')} className="fill-app-accent" fillOpacity={0.15} />
      ) : null}
      {segments.map((segment) =>
        segment.length > 1 ? (
          <polyline
            key={segment[0]}
            points={segment.join(' ')}
            fill="none"
            className="stroke-app-accent"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <circle
            key={segment[0]}
            cx={segment[0].split(',')[0]}
            cy={segment[0].split(',')[1]}
            r={2.5}
            className="fill-app-accent"
          />
        ),
      )}
      {forecastLine.length ? (
        <polyline
          points={forecastLine.join(' ')}
          fill="none"
          className="stroke-app-accent"
          strokeWidth={2}
          strokeDasharray="4 4"
          strokeLinecap="round"
        />
      ) : null}
      {labels.map((day, i) => (
        <text
          key={day}
          x={x(day)}
          y={height - 6}
          textAnchor={i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle'}
          className="fill-app-muted"
          fontSize="10"
        >
          {formatter.format(parseDay(day))}
        </text>
      ))}
    </svg>
  );
}

/**
 * CommunityPulse shows the anonymous community average (days with 10+
 * people only), the BigQuery ML forecast, and the user's own opt-in switch.
 */
export function CommunityPulse({ entries }: { entries: Entry[] }) {
  const toast = useToast();
  const [summary, setSummary] = useState<PulseSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [sharing, setSharing] = useState(isPulseEnabled);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchPulse()
      .then((result) => {
        if (!cancelled) setSummary(result);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = async () => {
    const next = !sharing;
    setBusy(true);
    try {
      await setPulseEnabled(next, entries);
      setSharing(next);
      if (!next) toast.success(t('pulse.removed'));
    } catch {
      toast.error(t('pulse.shareFailed'));
    } finally {
      setBusy(false);
    }
  };

  const latest = summary?.history.at(-1);

  return (
    <section className="rounded-xl border border-app-input-border bg-app-card p-4 shadow-card">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 className="text-sm font-medium text-app-muted">{t('pulse.title')}</h2>
        {summary?.sample ? (
          <span className="whitespace-nowrap rounded-full border border-app-input-border px-2 py-0.5 text-[11px] text-app-muted">
            {t('pulse.sample')}
          </span>
        ) : null}
      </div>
      <p className="mb-3 text-xs leading-5 text-app-muted">
        {t('pulse.about', { n: summary?.minGroup ?? 10 })}
      </p>

      {failed ? (
        <p className="text-sm text-app-muted">{t('pulse.loadFailed')}</p>
      ) : summary === null ? (
        <p className="text-sm text-app-muted">{t('pulse.loading')}</p>
      ) : summary.history.length === 0 || !latest ? (
        <p className="text-sm text-app-muted">{t('pulse.notEnough', { n: summary.minGroup })}</p>
      ) : (
        <>
          <p className="mb-2 text-sm">
            {t('pulse.latest', { avg: latest.average.toFixed(1), n: latest.people })}
          </p>
          <PulseChart summary={summary} />
          {summary.forecast.length ? (
            <p className="mt-1 text-xs text-app-muted">{t('pulse.forecast')}</p>
          ) : null}
        </>
      )}

      <label className="mt-4 flex cursor-pointer items-start gap-3 border-t border-app-input-border pt-3">
        <input
          type="checkbox"
          checked={sharing}
          disabled={busy}
          onChange={() => void toggle()}
          className="mt-1 h-4 w-4 accent-app-accent"
        />
        <span>
          <span className="block text-sm font-medium">{t('pulse.share')}</span>
          <span className="block text-xs leading-5 text-app-muted">{t('pulse.shareHint')}</span>
        </span>
      </label>
    </section>
  );
}
