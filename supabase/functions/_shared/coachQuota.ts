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

export interface CoachQuotaStatus {
  account_tier: CoachQuotaAccountTier;
  limit: number | null;
  used_count: number;
  available: number | null;
  next_recharge_at: string | null;
  unlimited: boolean;
  window_seconds: number;
  as_of: string;
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

  return {
    account_tier: normalizeCoachAccountTier(value.account_tier),
    limit: unlimited ? null : Math.max(0, Math.trunc(limit ?? 0)),
    used_count: Math.max(0, Math.trunc(usedCount)),
    available: unlimited ? null : Math.max(0, Math.trunc(available ?? 0)),
    next_recharge_at: nextRechargeAt,
    unlimited,
    window_seconds: Math.max(1, Math.trunc(windowSeconds)),
    as_of: asOf,
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

export function buildCoachQuotaErrorDetails(quota: CoachQuotaStatus) {
  return {
    quota_account_tier: quota.account_tier,
    quota_limit: quota.limit,
    quota_used_count: quota.used_count,
    quota_available: quota.available,
    quota_next_recharge_at: quota.next_recharge_at,
    quota_unlimited: quota.unlimited,
    quota_window_seconds: quota.window_seconds,
    quota_as_of: quota.as_of,
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
    source: 'coach_generation' | 'coach_cache';
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
    source?: 'coach_generation' | 'coach_cache' | null;
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
