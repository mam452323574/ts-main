import { ScanEligibilityResponse } from '@/types';

type TranslateFn = (scope: string, options?: Record<string, unknown>) => string;

const LEGACY_SCAN_LIMIT_MESSAGE_KEYS: Record<string, string> = {
  'Limite hebdomadaire atteinte. Prochain scan disponible dans': 'scan_limits.msg_weekly_reached_with_time',
  'Limite mensuelle atteinte. Prochain scan disponible dans': 'scan_limits.msg_monthly_reached_with_time',
  'Limite atteinte. Prochain scan disponible dans': 'scan_limits.msg_days_3_reached_with_time',
  'Limite quotidienne atteinte (3 scans). Prochain scan disponible dans': 'scan_limits.msg_daily_reached_3_with_time',
  'Limite quotidienne atteinte (1 scan). Prochain scan disponible dans': 'scan_limits.msg_daily_reached_1_with_time',
  'Le Super Scan est reserve aux membres Premium': 'scan_limits.msg_premium_only',
  'Le Super Scan est réservé aux membres Premium': 'scan_limits.msg_premium_only',
};

export function resolveScanLimitMessageKey(messageKey?: string | null, legacyMessage?: string | null) {
  if (messageKey) {
    return messageKey;
  }

  if (!legacyMessage) {
    return null;
  }

  const trimmedMessage = legacyMessage.trim();

  if (trimmedMessage.startsWith('scan_limits.')) {
    return trimmedMessage;
  }

  return LEGACY_SCAN_LIMIT_MESSAGE_KEYS[trimmedMessage] ?? null;
}

export function formatScanLimitTime(nextAvailableDate: number, t: TranslateFn, now = Date.now()) {
  const diffMs = Math.max(nextAvailableDate - now, 0);
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) {
    return `${diffDays} ${diffDays > 1 ? t('common.days') : t('common.day')}`;
  }

  if (diffHours > 0) {
    return `${diffHours} ${diffHours > 1 ? t('common.hours') : t('common.hour')}`;
  }

  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  return `${diffMinutes} ${diffMinutes > 1 ? t('common.minutes') : t('common.minute')}`;
}

export function buildScanLimitMessage(
  eligibility: Pick<ScanEligibilityResponse, 'message' | 'message_key'>,
  t: TranslateFn,
  time?: string
) {
  const resolvedKey = resolveScanLimitMessageKey(eligibility.message_key, eligibility.message);

  if (resolvedKey) {
    return time ? t(resolvedKey, { time }) : t(resolvedKey);
  }

  return eligibility.message || t('scan_limit.limit_reached');
}

export function buildFridgeScanLimitMessage(
  eligibility: Pick<ScanEligibilityResponse, 'message' | 'message_key'>,
  t: TranslateFn,
  time?: string,
) {
  const resolvedKey = resolveScanLimitMessageKey(
    eligibility.message_key,
    eligibility.message,
  );

  if (resolvedKey) {
    return time ? t(resolvedKey, { time }) : t(resolvedKey);
  }

  return t('fridge_scan.limit_reached_fallback');
}

export function buildScanLimitPaywallTitle(t: TranslateFn, time: string) {
  return t('scan_limits.next_scan_available_title', { time });
}

export function getScanLimitUpgradeSubtitle(t: TranslateFn) {
  return t('scan_limits.upgrade_unlimited_subtitle');
}
