const zhDateFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: 'long',
  day: 'numeric',
  weekday: 'long',
});

const zhTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const zhFullDateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function startOfLocalDay(timestamp: number): number {
  const date = new Date(timestamp);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
}

function formatDateParts(timestamp: number): string {
  const parts = zhDateFormatter.formatToParts(timestamp);
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
    return '今天';
  }

  if (day === today - oneDay) {
    return '昨天';
  }

  return formatDateParts(timestamp);
}

/**
 * formatTime returns the compact time shown in Review list items.
 */
export function formatTime(timestamp: number): string {
  return zhTimeFormatter.format(timestamp);
}

/**
 * formatFullDateTime returns the complete timestamp shown on Detail.
 */
export function formatFullDateTime(timestamp: number): string {
  return zhFullDateTimeFormatter.format(timestamp);
}

/**
 * createSummary normalizes whitespace before applying the 100 character
 * summary rule from the design.
 */
export function createSummary(content: string): string {
  return content.replace(/\s+/g, ' ').trim().slice(0, 100);
}
