import { getLang, localeOf, t, type Lang } from '../lib/i18n';

interface Formatters {
  date: Intl.DateTimeFormat;
  time: Intl.DateTimeFormat;
  full: Intl.DateTimeFormat;
}

// Cached per language; format* read the current language at call time (they
// run during render, so a language switch re-renders them fresh).
const zhFormatters: Formatters = {
  date: new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }),
  time: new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }),
  full: new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }),
};

function makeFormatters(locale: string): Formatters {
  return {
    date: new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }),
    time: new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }),
    full: new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }),
  };
}

const otherFormatters = new Map<Lang, Formatters>();

function formatters(): Formatters {
  const lang = getLang();
  if (lang === 'zh') return zhFormatters;
  let cached = otherFormatters.get(lang);
  if (!cached) {
    cached = makeFormatters(localeOf(lang));
    otherFormatters.set(lang, cached);
  }
  return cached;
}

export function startOfLocalDay(timestamp: number): number {
  const date = new Date(timestamp);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
}

/**
 * lastDayStarts returns the local midnights of the last `days` calendar days
 * ending with the one `now` falls in, oldest first. The day boundaries come
 * from the local date components rather than a -24h step, so a DST change
 * inside the window cannot shift a day.
 */
export function lastDayStarts(days: number, now: number): number[] {
  const starts: number[] = [];
  const date = new Date(now);
  for (let offset = days - 1; offset >= 0; offset--) {
    starts.push(
      new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate() - offset,
      ).getTime(),
    );
  }
  return starts;
}

function formatDateParts(timestamp: number): string {
  if (getLang() !== 'zh') {
    return formatters().date.format(timestamp);
  }
  const parts = zhFormatters.date.formatToParts(timestamp);
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  const weekday = parts.find((part) => part.type === 'weekday')?.value;

  return `${month}月${day}日 ${weekday}`;
}

/**
 * formatMonthDayWeekday returns the compact local date shown on Home and older
 * Review groups.
 */
export function formatMonthDayWeekday(timestamp: number): string {
  return formatDateParts(timestamp);
}

/**
 * formatDateGroup returns the Review page group label using local time, which
 * keeps "today" and "yesterday" aligned with the user's device timezone.
 */
export function formatDateGroup(timestamp: number, now = Date.now()): string {
  const day = startOfLocalDay(timestamp);
  const today = startOfLocalDay(now);
  const oneDay = 24 * 60 * 60 * 1000;

  if (day === today) {
    return t('date.today');
  }

  if (day === today - oneDay) {
    return t('date.yesterday');
  }

  return formatDateParts(timestamp);
}

/**
 * formatTime returns the compact time shown in Review list items.
 */
export function formatTime(timestamp: number): string {
  return formatters().time.format(timestamp);
}

/**
 * formatFullDateTime returns the complete timestamp shown on Detail.
 */
export function formatFullDateTime(timestamp: number): string {
  return formatters().full.format(timestamp);
}

/**
 * createSummary normalizes whitespace before applying the 100 character
 * summary rule from the design.
 */
export function createSummary(content: string): string {
  return content.replace(/\s+/g, ' ').trim().slice(0, 100);
}
