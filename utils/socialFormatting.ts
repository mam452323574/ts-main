type TranslateFn = (scope: string, options?: Record<string, unknown>) => string;

export function formatSocialRelativeTimeLabel(
  value: string | null | undefined,
  t: TranslateFn,
): string | null {
  if (!value) {
    return null;
  }

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

export function formatSocialAbsoluteDate(
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

  const options: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  };

  try {
    return new Intl.DateTimeFormat(locale, options).format(parsedDate);
  } catch {
    return new Intl.DateTimeFormat(undefined, options).format(parsedDate);
  }
}

export function formatSocialMemberSinceLabel(
  value: string | null | undefined,
  t: TranslateFn,
): string | null {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  const diffMs = Math.max(0, Date.now() - timestamp);
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 1) {
    return t('social.profile.member_since_today');
  }

  return t('social.profile.member_since_days', { count: diffDays });
}
