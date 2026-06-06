// Defense-in-depth client-side mirror of the Edge-Function scan-result
// sanitizer. The server (`supabase/functions/_shared/scanResultSanitizer.ts`)
// is the authoritative gate — this mirror exists so the rest of the client
// can re-apply the same filtering on data loaded from other endpoints (e.g.
// cached scans, history queries that go straight to PostgREST).
//
// The server file and this one must stay in sync. The coherence is enforced
// by tests in `__tests__/utils/scanResultSanitizer.test.ts`.

import {
  PREMIUM_LOCKED_FIELDS,
  PREMIUM_LOCKED_SUPER_SCAN_FIELDS,
} from '@/constants/premiumFields';
import type { AccountTier } from '@/types';

export type SanitizableScanTypeKey =
  | 'face'
  | 'health'
  | 'body'
  | 'nutrition'
  | 'super'
  | 'super_health_v2'
  | 'fat_distribution_scan_v2';

export function isPremiumTier(
  tier: AccountTier | string | null | undefined,
): boolean {
  return tier === 'premium' || tier === 'admin';
}

function getLockedFieldsForType(
  scanType: string | null | undefined,
): readonly string[] {
  if (scanType === 'face' || scanType === 'health') {
    return PREMIUM_LOCKED_FIELDS.face;
  }
  if (scanType === 'body') {
    return PREMIUM_LOCKED_FIELDS.body;
  }
  if (scanType === 'nutrition') {
    return PREMIUM_LOCKED_FIELDS.nutrition;
  }
  if (
    scanType === 'super' ||
    scanType === 'super_health_v2' ||
    scanType === 'fat_distribution_scan_v2'
  ) {
    return PREMIUM_LOCKED_SUPER_SCAN_FIELDS;
  }
  return [];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' && value !== null && !Array.isArray(value)
  );
}

function omitFields<T extends Record<string, unknown>>(
  record: T,
  keys: readonly string[],
): T {
  let changed = false;
  const next: Record<string, unknown> = { ...record };
  for (const key of keys) {
    if (key in next) {
      delete next[key];
      changed = true;
    }
  }
  return changed ? (next as T) : record;
}

/**
 * Strip premium-locked fields from a scan analysis result when the requested
 * tier is `free`. Premium and admin tiers receive the input unchanged.
 */
export function sanitizeScanAnalysisResultForTier(
  analysisResult: unknown,
  tier: AccountTier | string | null | undefined,
  scanTypeHint?: string | null,
): unknown {
  if (isPremiumTier(tier)) {
    return analysisResult;
  }
  if (!isPlainObject(analysisResult)) {
    return analysisResult;
  }

  const resolvedScanType =
    (typeof scanTypeHint === 'string' && scanTypeHint.length > 0
      ? scanTypeHint
      : typeof analysisResult.scan_type === 'string'
        ? (analysisResult.scan_type as string)
        : null) ?? null;

  const locked = getLockedFieldsForType(resolvedScanType);
  if (locked.length === 0) {
    return analysisResult;
  }

  return omitFields(analysisResult, locked);
}

/**
 * Apply tier-gating to a Scan row containing `analysis_result`. When the tier
 * is `free`, the analysis_result is filtered to drop premium-locked fields.
 *
 * Returns a shallow-cloned scan only when the analysis_result was modified;
 * otherwise the original reference is returned.
 */
export function sanitizeScanForTier<
  T extends { scan_type?: unknown; analysis_result?: unknown },
>(scan: T, tier: AccountTier | string | null | undefined): T {
  if (isPremiumTier(tier)) {
    return scan;
  }
  if (!scan || typeof scan !== 'object') {
    return scan;
  }

  const result = scan.analysis_result;
  if (!isPlainObject(result)) {
    return scan;
  }

  const scanTypeHint =
    typeof scan.scan_type === 'string' && scan.scan_type.length > 0
      ? (scan.scan_type as string)
      : null;
  const sanitized = sanitizeScanAnalysisResultForTier(
    result,
    tier,
    scanTypeHint,
  );

  if (sanitized === result) {
    return scan;
  }

  return { ...scan, analysis_result: sanitized };
}
