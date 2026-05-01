import { Phase2HttpError } from './phase2Errors.ts';
import type { Phase2FeatureFlags } from './phase2Types.ts';
import { isRecord, readOptionalBoolean, readOptionalNumber, readOptionalString } from './phase2Utils.ts';

export const DEFAULT_PHASE2_FEATURE_FLAGS: Phase2FeatureFlags = {
  scope: 'mobile',
  social_enabled: false,
  coach_enabled: false,
  entry_offer_enabled: false,
  social_comments_enabled: false,
  moderation_enabled: false,
  entry_offer_offering_id: null,
  rollout_percentage: null,
  post_rate_limit_per_day: 3,
  comment_rate_limit_per_hour: 10,
  report_rate_limit_per_day: 10,
  repeated_rejection_threshold: 3,
  rejected_content_cooldown_hours: 24,
  coach_cache_ttl_minutes: 720,
};

export function normalizePhase2FeatureFlags(payload: unknown): Phase2FeatureFlags {
  if (!isRecord(payload)) {
    return DEFAULT_PHASE2_FEATURE_FLAGS;
  }

  return {
    scope: readOptionalString(payload.scope) ?? DEFAULT_PHASE2_FEATURE_FLAGS.scope,
    social_enabled:
      readOptionalBoolean(payload.social_enabled) ??
      DEFAULT_PHASE2_FEATURE_FLAGS.social_enabled,
    coach_enabled:
      readOptionalBoolean(payload.coach_enabled) ??
      DEFAULT_PHASE2_FEATURE_FLAGS.coach_enabled,
    entry_offer_enabled:
      readOptionalBoolean(payload.entry_offer_enabled) ??
      DEFAULT_PHASE2_FEATURE_FLAGS.entry_offer_enabled,
    social_comments_enabled:
      readOptionalBoolean(payload.social_comments_enabled) ??
      DEFAULT_PHASE2_FEATURE_FLAGS.social_comments_enabled,
    moderation_enabled:
      readOptionalBoolean(payload.moderation_enabled) ??
      DEFAULT_PHASE2_FEATURE_FLAGS.moderation_enabled,
    entry_offer_offering_id:
      readOptionalString(payload.entry_offer_offering_id) ?? null,
    rollout_percentage: readOptionalNumber(payload.rollout_percentage) ?? null,
    post_rate_limit_per_day:
      readOptionalNumber(payload.post_rate_limit_per_day) ??
      DEFAULT_PHASE2_FEATURE_FLAGS.post_rate_limit_per_day,
    comment_rate_limit_per_hour:
      readOptionalNumber(payload.comment_rate_limit_per_hour) ??
      DEFAULT_PHASE2_FEATURE_FLAGS.comment_rate_limit_per_hour,
    report_rate_limit_per_day:
      readOptionalNumber(payload.report_rate_limit_per_day) ??
      DEFAULT_PHASE2_FEATURE_FLAGS.report_rate_limit_per_day,
    repeated_rejection_threshold:
      readOptionalNumber(payload.repeated_rejection_threshold) ??
      DEFAULT_PHASE2_FEATURE_FLAGS.repeated_rejection_threshold,
    rejected_content_cooldown_hours:
      readOptionalNumber(payload.rejected_content_cooldown_hours) ??
      DEFAULT_PHASE2_FEATURE_FLAGS.rejected_content_cooldown_hours,
    coach_cache_ttl_minutes:
      readOptionalNumber(payload.coach_cache_ttl_minutes) ??
      DEFAULT_PHASE2_FEATURE_FLAGS.coach_cache_ttl_minutes,
  };
}

export async function loadPhase2FeatureFlags(client: any, scope = 'mobile') {
  try {
    const { data, error } = await client
      .from('app_feature_flags')
      .select('*')
      .eq('scope', scope)
      .maybeSingle();

    if (error || !data) {
      return DEFAULT_PHASE2_FEATURE_FLAGS;
    }

    return normalizePhase2FeatureFlags(data);
  } catch {
    return DEFAULT_PHASE2_FEATURE_FLAGS;
  }
}

export function requireFeatureEnabled(
  enabled: boolean,
  code: string,
  message: string,
) {
  if (!enabled) {
    throw new Phase2HttpError(403, code, message);
  }
}
