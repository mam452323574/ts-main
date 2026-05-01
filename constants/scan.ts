import { ScanType, ScanLimitConfig, AnalysisType } from '@/types';
import {
  PROVIDER_SCAN_TYPE_BY_APP_SCAN_TYPE,
  SCAN_IMAGE_BUCKET,
} from '@/shared/scanContract';

export const STORAGE_BUCKET_NAME = SCAN_IMAGE_BUCKET;

export const SCAN_TYPE_LABELS: Record<ScanType, string> = {
  body: 'scan_types.body',
  health: 'scan_types.health',
  nutrition: 'scan_types.nutrition',
  super: 'scan_types.super',
};

export const SCAN_PREVIEW_MIN_LOADING_MS: Record<ScanType, number> = {
  body: 5000,
  health: 5000,
  nutrition: 5000,
  super: 7000,
};

// Mapping between app scan types and provider analysis types.
export const SCAN_TYPE_TO_ANALYSIS_TYPE: Record<ScanType, AnalysisType> =
  PROVIDER_SCAN_TYPE_BY_APP_SCAN_TYPE as Record<ScanType, AnalysisType>;

// Labels for provider analysis types returned by the scan pipeline.
export const ANALYSIS_TYPE_LABELS: Record<AnalysisType, string> = {
  face: 'scan_types.health',
  body: 'scan_types.body',
  nutrition: 'scan_types.nutrition',
  fat_distribution_scan_v2: 'scan_types.super',
  super_health_v2: 'scan_types.super',
};

export const FREE_SCAN_LIMITS: Record<ScanType, ScanLimitConfig> = {
  health: {
    count: 1,
    periodMs: 24 * 60 * 60 * 1000,
    label: 'scan_limits.day_1',
  },
  body: {
    count: 1,
    periodMs: 24 * 60 * 60 * 1000,
    label: 'scan_limits.day_1',
  },
  nutrition: {
    count: 1,
    periodMs: 24 * 60 * 60 * 1000,
    label: 'scan_limits.day_1',
  },
  super: {
    count: 0,
    periodMs: 24 * 60 * 60 * 1000,
    label: 'scan_limits.premium_only',
  },
};

export const PREMIUM_SCAN_LIMITS: Record<ScanType, ScanLimitConfig> = {
  health: {
    count: 3,
    periodMs: 24 * 60 * 60 * 1000,
    label: 'scan_limits.day_3',
  },
  body: {
    count: 3,
    periodMs: 24 * 60 * 60 * 1000,
    label: 'scan_limits.day_3',
  },
  nutrition: {
    count: 3,
    periodMs: 24 * 60 * 60 * 1000,
    label: 'scan_limits.day_3',
  },
  super: {
    count: 1,
    periodMs: 24 * 60 * 60 * 1000,
    label: 'scan_limits.day_1',
  },
};

export const SCAN_LIMIT_MESSAGES: Record<ScanType, { free: string; premium: string }> = {
  health: {
    free: 'scan_limits.msg_daily_reached_1',
    premium: 'scan_limits.msg_daily_reached_3',
  },
  body: {
    free: 'scan_limits.msg_daily_reached_1',
    premium: 'scan_limits.msg_daily_reached_3',
  },
  nutrition: {
    free: 'scan_limits.msg_daily_reached_1',
    premium: 'scan_limits.msg_daily_reached_3',
  },
  super: {
    free: 'scan_limits.msg_premium_only',
    premium: 'scan_limits.msg_daily_reached_1',
  },
};

export const NOTIFICATION_MESSAGES: Record<ScanType, { title: string; body: string }> = {
  health: {
    title: 'notifications.scan_health_title',
    body: 'notifications.scan_health_body',
  },
  body: {
    title: 'notifications.scan_body_title',
    body: 'notifications.scan_body_body',
  },
  nutrition: {
    title: 'notifications.scan_nutrition_title',
    body: 'notifications.scan_nutrition_body',
  },
  super: {
    title: 'notifications.scan_super_title',
    body: 'notifications.scan_super_body',
  },
};
