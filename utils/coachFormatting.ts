type TranslateFn = (scope: string, options?: Record<string, unknown>) => string;

function formatRelativeTimeLabel(value: string, t: TranslateFn) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  const diffMs = Math.max(0, Date.now() - timestamp);
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) {
    return t('common.time_ago.just_now');
  }

  if (diffMinutes < 60) {
    return t('common.time_ago.minutes_ago', { count: diffMinutes });
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return t('common.time_ago.hours_ago', { count: diffHours });
  }

  if (diffHours < 48) {
    return t('common.time_ago.yesterday');
  }

  return t('common.time_ago.days_ago', { count: Math.floor(diffHours / 24) });
}

export function formatCoachTimestamp(
  value: string | null | undefined,
  locale: string,
): string | null {
  if (!value) {
    return null;
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  try {
    return new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(parsedDate);
  } catch {
    return parsedDate.toLocaleString();
  }
}

export function formatCoachHistoryDate(
  value: string | null | undefined,
  locale: string,
  t: TranslateFn,
): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }

  const parsedDate = new Date(value);
  const timestamp = parsedDate.getTime();
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  const diffMs = Math.max(0, Date.now() - timestamp);
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 7) {
    return formatRelativeTimeLabel(value, t);
  }

  const currentYear = new Date().getFullYear();
  const formatOptions: Intl.DateTimeFormatOptions =
    parsedDate.getFullYear() === currentYear
      ? {
          month: 'short',
          day: 'numeric',
        }
      : {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        };

  try {
    return new Intl.DateTimeFormat(locale, formatOptions).format(parsedDate);
  } catch {
    return new Intl.DateTimeFormat(undefined, formatOptions).format(parsedDate);
  }
}
