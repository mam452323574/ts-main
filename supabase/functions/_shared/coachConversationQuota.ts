import { createPhase2DatabaseError, Phase2HttpError } from './phase2Errors.ts';
import {
  isRecord,
  readOptionalBoolean,
  readOptionalNumber,
  readOptionalString,
} from './phase2Utils.ts';
import type { CoachAccountTier } from './coachTier.ts';

export const COACH_CONVERSATION_QUOTA_EXHAUSTED_ERROR_CODE =
  'coach_conversation_quota_exhausted';
export const COACH_CONVERSATION_FREE_ALREADY_USED_ERROR_CODE =
  'coach_free_conversation_already_used';
export const COACH_CONVERSATION_FREE_LIMIT_REACHED_ERROR_CODE =
  'coach_free_conversation_message_limit_reached';
export const COACH_CONVERSATION_REQUEST_IN_PROGRESS_ERROR_CODE =
  'coach_conversation_request_in_progress';
export const COACH_CONVERSATION_MESSAGE_LIMIT_ERROR_CODE =
  'coach_conversation_message_limit_reached';
export const COACH_CONVERSATION_NOT_FOUND_ERROR_CODE =
  'coach_conversation_not_found';
export const COACH_CONVERSATION_ENDED_ERROR_CODE = 'coach_conversation_ended';
export const COACH_CONVERSATION_RATE_LIMIT_ERROR_CODE =
  'coach_conversation_rate_limit_exceeded';
export const COACH_CONVERSATION_QUOTA_UNAVAILABLE_ERROR_CODE =
  'coach_conversation_quota_unavailable';

export interface CoachConversationPersonaLastSnapshot {
  id: string;
  updated_at: string;
  last_user_message_at: string | null;
}

export interface CoachConversationQuotaStatus {
  tier: CoachAccountTier;
  account_tier: CoachAccountTier;
  unlimited: boolean;
  window_seconds: number;
  premium_today_used: number;
  premium_today_limit: number | null;
  premium_today_available: number | null;
  next_recharge_at: string | null;
  per_conversation_limit: number;
  free_used: boolean;
  free_message_limit: number | null;
  free_used_count: number | null;
  free_remaining_messages: number | null;
  free_next_recharge_at: string | null;
  free_window_seconds: number | null;
  free_conversation_id: string | null;
  quota_exceeded: boolean;
  as_of: string;
  last_conversation_by_persona: Record<
    string,
    CoachConversationPersonaLastSnapshot | null
  >;
  conversation_count_by_persona: Record<string, number>;
}

export interface CoachConversationReservationResult {
  allowed: boolean;
  code: string | null;
  usage_event_id: string | null;
  quota: CoachConversationQuotaStatus;
}

export interface CoachConversationStartResult {
  allowed: boolean;
  code: string | null;
  conversation_id: string | null;
  resumed: boolean;
  quota: CoachConversationQuotaStatus;
}

function normalizeAccountTier(value: unknown): CoachAccountTier {
  return value === 'premium' || value === 'admin' ? value : 'free';
}

function readPersonaLastMap(
  value: unknown,
): Record<string, CoachConversationPersonaLastSnapshot | null> {
  if (!isRecord(value)) return {};
  const out: Record<string, CoachConversationPersonaLastSnapshot | null> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (raw === null) {
      out[key] = null;
      continue;
    }
    if (!isRecord(raw)) continue;
    const id = readOptionalString(raw.id);
    const updatedAt = readOptionalString(raw.updated_at);
    if (!id || !updatedAt) continue;
    out[key] = {
      id,
      updated_at: updatedAt,
      last_user_message_at: readOptionalString(raw.last_user_message_at),
    };
  }
  return out;
}

function readPersonaCountsMap(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value)) {
    const n = readOptionalNumber(raw);
    if (n !== null) {
      out[key] = Math.max(0, Math.trunc(n));
    }
  }
  return out;
}

export function normalizeCoachConversationQuotaStatus(
  value: unknown,
): CoachConversationQuotaStatus {
  if (!isRecord(value)) {
    throw new Phase2HttpError(
      502,
      COACH_CONVERSATION_QUOTA_UNAVAILABLE_ERROR_CODE,
      'Coach conversation quota payload is invalid',
    );
  }

  const unlimited = readOptionalBoolean(value.unlimited) === true;
  const windowSeconds = readOptionalNumber(value.window_seconds);
  const perConversationLimit = readOptionalNumber(value.per_conversation_limit);
  const asOf = readOptionalString(value.as_of);

  if (windowSeconds === null || perConversationLimit === null || !asOf) {
    throw new Phase2HttpError(
      502,
      COACH_CONVERSATION_QUOTA_UNAVAILABLE_ERROR_CODE,
      'Coach conversation quota payload is incomplete',
    );
  }

  const tier = normalizeAccountTier(value.account_tier ?? value.tier);

  return {
    tier,
    account_tier: tier,
    unlimited,
    window_seconds: Math.max(1, Math.trunc(windowSeconds)),
    premium_today_used: Math.max(
      0,
      Math.trunc(readOptionalNumber(value.premium_today_used) ?? 0),
    ),
    premium_today_limit:
      value.premium_today_limit === null || value.premium_today_limit === undefined
        ? null
        : Math.max(0, Math.trunc(readOptionalNumber(value.premium_today_limit) ?? 0)),
    premium_today_available:
      value.premium_today_available === null ||
      value.premium_today_available === undefined
        ? null
        : Math.max(
            0,
            Math.trunc(readOptionalNumber(value.premium_today_available) ?? 0),
          ),
    next_recharge_at: readOptionalString(value.next_recharge_at),
    per_conversation_limit: Math.max(1, Math.trunc(perConversationLimit)),
    free_used: readOptionalBoolean(value.free_used) === true,
    free_message_limit:
      value.free_message_limit === null || value.free_message_limit === undefined
        ? null
        : Math.max(0, Math.trunc(readOptionalNumber(value.free_message_limit) ?? 0)),
    free_used_count:
      value.free_used_count === null || value.free_used_count === undefined
        ? null
        : Math.max(0, Math.trunc(readOptionalNumber(value.free_used_count) ?? 0)),
    free_remaining_messages:
      value.free_remaining_messages === null ||
      value.free_remaining_messages === undefined
        ? null
        : Math.max(
            0,
            Math.trunc(readOptionalNumber(value.free_remaining_messages) ?? 0),
          ),
    free_next_recharge_at: readOptionalString(value.free_next_recharge_at),
    free_window_seconds:
      value.free_window_seconds === null || value.free_window_seconds === undefined
        ? null
        : Math.max(1, Math.trunc(readOptionalNumber(value.free_window_seconds) ?? 1)),
    free_conversation_id: readOptionalString(value.free_conversation_id),
    quota_exceeded: readOptionalBoolean(value.quota_exceeded) === true,
    as_of: asOf,
    last_conversation_by_persona: readPersonaLastMap(
      value.last_conversation_by_persona,
    ),
    conversation_count_by_persona: readPersonaCountsMap(
      value.conversation_count_by_persona,
    ),
  };
}

function createQuotaDatabaseError(error: unknown, contextLabel: string) {
  return createPhase2DatabaseError(error, {
    contextLabel,
    fallbackCode: COACH_CONVERSATION_QUOTA_UNAVAILABLE_ERROR_CODE,
    fallbackMessage: 'Coach conversation quota lookup failed',
    relationName: 'coach_conversation_message_events',
  });
}

export async function getCoachConversationQuotaStatus(
  client: any,
  userId: string,
): Promise<CoachConversationQuotaStatus> {
  const { data, error } = await client.rpc('get_coach_conversation_quota_status', {
    p_user_id: userId,
  });

  if (error) {
    throw createQuotaDatabaseError(error, 'Coach conversation quota status lookup');
  }

  return normalizeCoachConversationQuotaStatus(data);
}

export async function recordCoachConversationAttempt(
  client: any,
  options: {
    userId: string;
    perMinute?: number;
    perHour?: number;
    perDay?: number;
  },
) {
  const { data, error } = await client.rpc('record_coach_conversation_attempt', {
    p_user_id: options.userId,
    p_per_minute: options.perMinute ?? 8,
    p_per_hour: options.perHour ?? 80,
    p_per_day: options.perDay ?? 200,
  });

  if (error) {
    throw createQuotaDatabaseError(error, 'Coach conversation rate-limit check');
  }

  if (!isRecord(data)) {
    throw new Phase2HttpError(
      502,
      COACH_CONVERSATION_QUOTA_UNAVAILABLE_ERROR_CODE,
      'Coach conversation rate-limit check returned an invalid payload',
    );
  }

  if (data.allowed === false) {
    const windowExceeded =
      readOptionalString(data.window_exceeded) ?? 'unknown';
    throw new Phase2HttpError(
      429,
      COACH_CONVERSATION_RATE_LIMIT_ERROR_CODE,
      `Coach conversation rate limit exceeded for window ${windowExceeded}`,
      { window_exceeded: windowExceeded },
    );
  }
}

export async function startCoachConversation(
  client: any,
  options: {
    userId: string;
    personaKey: string;
    locale?: string | null;
  },
): Promise<CoachConversationStartResult> {
  const { data, error } = await client.rpc('start_coach_conversation', {
    p_user_id: options.userId,
    p_persona_key: options.personaKey,
    p_locale: options.locale ?? null,
  });

  if (error) {
    throw createQuotaDatabaseError(error, 'Coach conversation creation');
  }

  if (!isRecord(data) || data.success !== true) {
    throw new Phase2HttpError(
      502,
      COACH_CONVERSATION_QUOTA_UNAVAILABLE_ERROR_CODE,
      'Coach conversation creation returned an invalid payload',
    );
  }

  return {
    allowed: data.allowed === true,
    code: readOptionalString(data.code),
    conversation_id: readOptionalString(data.conversation_id),
    resumed: data.code === 'coach_free_conversation_resumed',
    quota: normalizeCoachConversationQuotaStatus(data.quota),
  };
}

export async function reserveCoachConversationMessageSlot(
  client: any,
  options: {
    userId: string;
    conversationId: string;
    clientRequestId?: string | null;
  },
): Promise<CoachConversationReservationResult> {
  const { data, error } = await client.rpc(
    'reserve_coach_conversation_message_slot',
    {
      p_user_id: options.userId,
      p_conversation_id: options.conversationId,
      p_client_request_id: options.clientRequestId ?? null,
    },
  );

  if (error) {
    throw createQuotaDatabaseError(error, 'Coach conversation slot reservation');
  }

  if (!isRecord(data) || data.success !== true) {
    throw new Phase2HttpError(
      502,
      COACH_CONVERSATION_QUOTA_UNAVAILABLE_ERROR_CODE,
      'Coach conversation reservation returned an invalid payload',
    );
  }

  return {
    allowed: data.allowed === true,
    code: readOptionalString(data.code),
    usage_event_id: readOptionalString(data.usage_event_id),
    quota: normalizeCoachConversationQuotaStatus(data.quota),
  };
}

export async function attachCoachConversationQuotaEvent(
  client: any,
  options: {
    usageEventId: string | null;
    userId: string;
    messageId: string;
  },
) {
  if (!options.usageEventId) {
    return null;
  }

  const { data, error } = await client.rpc(
    'attach_coach_conversation_quota_event',
    {
      p_usage_event_id: options.usageEventId,
      p_user_id: options.userId,
      p_message_id: options.messageId,
    },
  );

  if (error) {
    throw createQuotaDatabaseError(error, 'Coach conversation quota attach');
  }

  return data;
}

export async function refundCoachConversationQuotaEvent(
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

  const { data, error } = await client.rpc(
    'refund_coach_conversation_quota_event',
    {
      p_usage_event_id: options.usageEventId,
      p_user_id: options.userId,
      p_reason: options.reason ?? 'technical_failure',
    },
  );

  if (error) {
    throw createQuotaDatabaseError(error, 'Coach conversation quota refund');
  }

  return data;
}

export async function endCoachConversation(
  client: any,
  options: {
    conversationId: string;
    userId: string;
    reason?: 'user_ended' | 'quota_reached' | 'admin' | 'timeout';
  },
) {
  const { data, error } = await client.rpc('end_coach_conversation', {
    p_conversation_id: options.conversationId,
    p_user_id: options.userId,
    p_reason: options.reason ?? 'user_ended',
  });

  if (error) {
    throw createQuotaDatabaseError(error, 'Coach conversation end');
  }

  return data;
}

export async function archiveCoachConversation(
  client: any,
  options: {
    conversationId: string;
    userId: string;
  },
) {
  const { data, error } = await client.rpc('archive_coach_conversation', {
    p_conversation_id: options.conversationId,
    p_user_id: options.userId,
  });

  if (error) {
    throw createQuotaDatabaseError(error, 'Coach conversation archive');
  }

  return data;
}

export function mapCoachConversationReservationToHttpError(
  result: CoachConversationReservationResult,
): Phase2HttpError {
  const code = result.code ?? COACH_CONVERSATION_QUOTA_EXHAUSTED_ERROR_CODE;
  const details = {
    quota_account_tier: result.quota.account_tier,
    quota_premium_today_used: result.quota.premium_today_used,
    quota_premium_today_limit: result.quota.premium_today_limit,
    quota_per_conversation_limit: result.quota.per_conversation_limit,
    quota_free_used: result.quota.free_used,
    quota_free_used_count: result.quota.free_used_count,
    quota_free_remaining_messages: result.quota.free_remaining_messages,
    quota_free_next_recharge_at: result.quota.free_next_recharge_at,
    quota_free_window_seconds: result.quota.free_window_seconds,
    quota_next_recharge_at: result.quota.next_recharge_at,
  } satisfies Record<string, unknown>;

  switch (code) {
    case COACH_CONVERSATION_NOT_FOUND_ERROR_CODE:
      return new Phase2HttpError(404, code, 'Coach conversation not found', details);
    case COACH_CONVERSATION_ENDED_ERROR_CODE:
      return new Phase2HttpError(409, code, 'Coach conversation already ended', details);
    case COACH_CONVERSATION_FREE_ALREADY_USED_ERROR_CODE:
      return new Phase2HttpError(403, code, 'Free Coach conversation already used', details);
    case COACH_CONVERSATION_FREE_LIMIT_REACHED_ERROR_CODE:
      return new Phase2HttpError(403, code, 'Free Coach conversation message limit reached', details);
    case COACH_CONVERSATION_REQUEST_IN_PROGRESS_ERROR_CODE:
      return new Phase2HttpError(409, code, 'Coach conversation request is already in progress', details);
    case COACH_CONVERSATION_MESSAGE_LIMIT_ERROR_CODE:
      return new Phase2HttpError(403, code, 'Per-conversation message limit reached', details);
    default:
      return new Phase2HttpError(
        429,
        COACH_CONVERSATION_QUOTA_EXHAUSTED_ERROR_CODE,
        'Coach conversation quota exhausted',
        details,
      );
  }
}
