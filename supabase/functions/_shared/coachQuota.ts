import { createPhase2DatabaseError, Phase2HttpError } from './phase2Errors.ts';
import {
  isRecord,
  readOptionalBoolean,
  readOptionalNumber,
  readOptionalString,
} from './phase2Utils.ts';

export const COACH_QUOTA_EXHAUSTED_ERROR_CODE = 'coach_quota_exhausted';
export const COACH_QUOTA_STATUS_UNAVAILABLE_ERROR_CODE =
  'coach_quota_status_unavailable';

export type CoachQuotaAccountTier = 'free' | 'premium' | 'admin';

export type CoachQuotaSource =
  | 'coach_generation'
  | 'coach_cache'
  | 'coach_scan_cta_generation'
  | 'coach_scan_cta_cache';

export type CoachQuotaBucketKey = 'general' | 'scan_cta';

export interface CoachQuotaBucketStatus {
  limit: number | null;
  used_count: number;
  available: number | null;
  next_recharge_at: string | null;
  window_seconds: number;
}

export interface CoachQuotaStatus {
  account_tier: CoachQuotaAccountTier;
  // Top-level fields mirror the `general` bucket for backward compatibility
  // with clients (and tests) that predate the split-bucket migration. New
  // code should read `buckets.general` / `buckets.scan_cta` directly.
  limit: number | null;
  used_count: number;
  available: number | null;
  next_recharge_at: string | null;
  unlimited: boolean;
  window_seconds: number;
  as_of: string;
  buckets: {
    general: CoachQuotaBucketStatus;
    scan_cta: CoachQuotaBucketStatus;
  };
}

export function coachQuotaBucketForSource(
  source: CoachQuotaSource,
): CoachQuotaBucketKey {
  return source === 'coach_scan_cta_generation' ||
    source === 'coach_scan_cta_cache'
    ? 'scan_cta'
    : 'general';
}

export interface CoachQuotaReservationResult {
  allowed: boolean;
  code: string | null;
  usage_event_id: string | null;
  quota: CoachQuotaStatus;
}

function normalizeCoachAccountTier(value: unknown): CoachQuotaAccountTier {
  return value === 'premium' || value === 'admin' ? value : 'free';
}

function readNullableNumber(value: unknown) {
  return value === null || value === undefined ? null : readOptionalNumber(value);
}

function normalizeBucketStatus(
  value: unknown,
  unlimited: boolean,
  fallbackWindowSeconds: number,
): CoachQuotaBucketStatus {
  // Defensive: when the bucket payload is missing (e.g. an older RPC shape is
  // somehow returned), synthesize a permissive bucket from the top-level
  // fields so callers can keep operating. The real RPC always provides them
  // post-migration.
  const record = isRecord(value) ? value : {};
  const limit = readNullableNumber(record.limit);
  const available = readNullableNumber(record.available);
  const usedCount = readOptionalNumber(record.used_count);
  const windowSeconds = readOptionalNumber(record.window_seconds);

  return {
    limit:
      unlimited || limit === null ? null : Math.max(0, Math.trunc(limit)),
    used_count: Math.max(0, Math.trunc(usedCount ?? 0)),
    available:
      unlimited || available === null
        ? null
        : Math.max(0, Math.trunc(available)),
    next_recharge_at: readOptionalString(record.next_recharge_at),
    window_seconds: Math.max(
      1,
      Math.trunc(windowSeconds ?? fallbackWindowSeconds),
    ),
  };
}

export function normalizeCoachQuotaStatus(value: unknown): CoachQuotaStatus {
  if (!isRecord(value)) {
    throw new Phase2HttpError(
      502,
      COACH_QUOTA_STATUS_UNAVAILABLE_ERROR_CODE,
      'Coach quota status returned an invalid payload',
    );
  }

  const unlimited = readOptionalBoolean(value.unlimited) === true;
  const limit = readNullableNumber(value.limit);
  const available = readNullableNumber(value.available);
  const usedCount = readOptionalNumber(value.used_count);
  const windowSeconds = readOptionalNumber(value.window_seconds);
  const nextRechargeAt = readOptionalString(value.next_recharge_at);
  const asOf = readOptionalString(value.as_of);

  if (
    usedCount === null ||
    windowSeconds === null ||
    (!unlimited && (limit === null || available === null)) ||
    !asOf
  ) {
    throw new Phase2HttpError(
      502,
      COACH_QUOTA_STATUS_UNAVAILABLE_ERROR_CODE,
      'Coach quota status is incomplete',
    );
  }

  const normalizedTopLevel = {
    limit: unlimited ? null : Math.max(0, Math.trunc(limit ?? 0)),
    used_count: Math.max(0, Math.trunc(usedCount)),
    available: unlimited ? null : Math.max(0, Math.trunc(available ?? 0)),
    next_recharge_at: nextRechargeAt,
    unlimited,
    window_seconds: Math.max(1, Math.trunc(windowSeconds)),
  };

  // The RPC always emits a `buckets` object post-migration. If a stale RPC
  // version is hit during the rollout window, fall back to mirroring the
  // top-level fields into both buckets (matches the pre-migration semantics
  // where everything counted into one pool).
  const bucketsRecord = isRecord(value.buckets) ? value.buckets : null;
  const generalBucket = normalizeBucketStatus(
    bucketsRecord?.general ?? {
      limit: normalizedTopLevel.limit,
      used_count: normalizedTopLevel.used_count,
      available: normalizedTopLevel.available,
      next_recharge_at: normalizedTopLevel.next_recharge_at,
      window_seconds: normalizedTopLevel.window_seconds,
    },
    unlimited,
    normalizedTopLevel.window_seconds,
  );
  const scanCtaBucket = normalizeBucketStatus(
    bucketsRecord?.scan_cta ?? {
      limit: normalizedTopLevel.limit,
      used_count: 0,
      available: normalizedTopLevel.limit,
      next_recharge_at: null,
      window_seconds: normalizedTopLevel.window_seconds,
    },
    unlimited,
    normalizedTopLevel.window_seconds,
  );

  return {
    account_tier: normalizeCoachAccountTier(value.account_tier),
    ...normalizedTopLevel,
    as_of: asOf,
    buckets: {
      general: generalBucket,
      scan_cta: scanCtaBucket,
    },
  };
}

function createQuotaDatabaseError(error: unknown, contextLabel: string) {
  return createPhase2DatabaseError(error, {
    contextLabel,
    fallbackCode: COACH_QUOTA_STATUS_UNAVAILABLE_ERROR_CODE,
    fallbackMessage: 'Failed to evaluate Coach quota',
    relationName: 'coach_usage_events',
  });
}

// Returns a view of the quota where the top-level limit/used/available/
// next_recharge_at fields mirror the bucket associated with `source`. The
// underlying `buckets` object is kept untouched so callers that already know
// about the split can still read both. Useful in error responses: a 429 on a
// scan_cta exhaustion must surface the scan_cta cooldown, not the general one
// (otherwise the user sees a misleading "next request soon" instead of "in
// X hours").
export function projectCoachQuotaForSource(
  quota: CoachQuotaStatus,
  source: CoachQuotaSource,
): CoachQuotaStatus {
  if (quota.unlimited) {
    return quota;
  }
  const bucketKey = coachQuotaBucketForSource(source);
  const bucket = quota.buckets[bucketKey];
  return {
    ...quota,
    limit: bucket.limit,
    used_count: bucket.used_count,
    available: bucket.available,
    next_recharge_at: bucket.next_recharge_at,
  };
}

export function buildCoachQuotaErrorDetails(
  quota: CoachQuotaStatus,
  source?: CoachQuotaSource,
) {
  const projected = source ? projectCoachQuotaForSource(quota, source) : quota;
  return {
    quota_account_tier: projected.account_tier,
    quota_limit: projected.limit,
    quota_used_count: projected.used_count,
    quota_available: projected.available,
    quota_next_recharge_at: projected.next_recharge_at,
    quota_unlimited: projected.unlimited,
    quota_window_seconds: projected.window_seconds,
    quota_as_of: projected.as_of,
    ...(source
      ? {
          quota_source: source,
          quota_bucket: coachQuotaBucketForSource(source),
        }
      : {}),
  };
}

export async function getCoachQuotaStatus(
  client: any,
  userId: string,
): Promise<CoachQuotaStatus> {
  const { data, error } = await client.rpc('get_coach_quota_status', {
    p_user_id: userId,
  });

  if (error) {
    throw createQuotaDatabaseError(error, 'Coach quota status lookup');
  }

  return normalizeCoachQuotaStatus(data);
}

export async function reserveCoachQuota(
  client: any,
  options: {
    userId: string;
    source: CoachQuotaSource;
    requestId?: string | null;
  },
): Promise<CoachQuotaReservationResult> {
  const { data, error } = await client.rpc('reserve_coach_quota', {
    p_user_id: options.userId,
    p_source: options.source,
    p_request_id: options.requestId ?? null,
  });

  if (error) {
    throw createQuotaDatabaseError(error, 'Coach quota reservation');
  }

  if (!isRecord(data) || data.success !== true) {
    throw new Phase2HttpError(
      502,
      COACH_QUOTA_STATUS_UNAVAILABLE_ERROR_CODE,
      'Coach quota reservation returned an invalid payload',
    );
  }

  const quota = normalizeCoachQuotaStatus(data.quota);
  const usageEventId = readOptionalString(data.usage_event_id);
  const allowed = data.allowed === true;
  const code = readOptionalString(data.code);

  return {
    allowed,
    code: code ?? (allowed ? null : COACH_QUOTA_EXHAUSTED_ERROR_CODE),
    usage_event_id: usageEventId,
    quota,
  };
}

export async function attachCoachQuotaEvent(
  client: any,
  options: {
    usageEventId: string | null;
    userId: string;
    coachEntryId: string;
    source?: CoachQuotaSource | null;
  },
) {
  if (!options.usageEventId) {
    return null;
  }

  const { data, error } = await client.rpc('attach_coach_quota_event', {
    p_usage_event_id: options.usageEventId,
    p_user_id: options.userId,
    p_coach_entry_id: options.coachEntryId,
    p_source: options.source ?? null,
  });

  if (error) {
    throw createQuotaDatabaseError(error, 'Coach quota event attachment');
  }

  return data;
}

export async function refundCoachQuotaEvent(
  client: any,
  options: {
    usageEventId: string | null;
    userId: string;
    reason?: string;
  },
) {
  if (!options.usageEventId) {
    return null;
  }

  const { data, error } = await client.rpc('refund_coach_quota_event', {
    p_usage_event_id: options.usageEventId,
    p_user_id: options.userId,
    p_reason: options.reason ?? 'technical_failure',
  });

  if (error) {
    throw createQuotaDatabaseError(error, 'Coach quota refund');
  }

  return data;
}

export interface CoachQuotaRefundRetryResult {
  success: boolean;
  attempts: number;
  data: unknown;
  lastError: unknown;
}

// Default backoff: ~0ms, 100ms, 500ms between the 3 attempts. Total worst-case
// wait is ~600ms — short enough to keep the background task responsive yet
// long enough to ride out transient DB contention (advisory lock collisions,
// pool exhaustion, brief network flaps to PostgREST).
const DEFAULT_COACH_REFUND_RETRY_DELAYS_MS = [0, 100, 500] as const;

/**
 * Refunds a coach usage event with bounded retries.
 *
 * Returns a structured result instead of throwing so callers can decide
 * whether to emit a critical log without wrestling with a second try/catch.
 *
 * `usageEventId === null` short-circuits to `success: true, attempts: 0` —
 * matches `refundCoachQuotaEvent` semantics for cache hits / unsupported paths.
 */
export async function refundCoachQuotaEventWithRetry(
  client: any,
  options: {
    usageEventId: string | null;
    userId: string;
    reason?: string;
  },
  retryDelaysMs: ReadonlyArray<number> = DEFAULT_COACH_REFUND_RETRY_DELAYS_MS,
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<CoachQuotaRefundRetryResult> {
  if (!options.usageEventId) {
    return { success: true, attempts: 0, data: null, lastError: null };
  }

  const delays = retryDelaysMs.length > 0 ? retryDelaysMs : [0];
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= delays.length; attempt += 1) {
    const delay = delays[attempt - 1];
    if (delay > 0) {
      await sleep(delay);
    }

    try {
      const data = await refundCoachQuotaEvent(client, options);
      return { success: true, attempts: attempt, data, lastError: null };
    } catch (error) {
      lastError = error;
    }
  }

  return { success: false, attempts: delays.length, data: null, lastError };
}
