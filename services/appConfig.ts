import { supabase } from './supabase';

import type { FeatureFlags } from '@/types';

export const APP_CONFIG_REMOTE_KEY = 'mobile';

export type AppConfigSource = 'default' | 'canonical' | 'rpc' | 'compatibility';
export type SocialCommentsGateState = 'enabled' | 'disabled' | 'unknown';

export interface AppConfig extends FeatureFlags {
  config_source: AppConfigSource;
  entry_offer_offering_id: string | null;
  post_rate_limit_per_day: number | null;
  comment_rate_limit_per_hour: number | null;
  rollout_percentage: number | null;
  moderation_enabled: boolean;
}

interface AppConfigRow {
  value?: unknown;
}

interface SupabaseErrorLike {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  social_enabled: false,
  coach_enabled: false,
  entry_offer_enabled: false,
  social_comments_enabled: false,
};

export const DEFAULT_APP_CONFIG: AppConfig = {
  ...DEFAULT_FEATURE_FLAGS,
  config_source: 'default',
  entry_offer_offering_id: null,
  post_rate_limit_per_day: null,
  comment_rate_limit_per_hour: null,
  rollout_percentage: null,
  moderation_enabled: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readBoolean(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function readOptionalBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : null;
}

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function toSupabaseErrorLike(error: unknown): SupabaseErrorLike {
  if (!error || typeof error !== 'object') {
    return {};
  }

  return error as SupabaseErrorLike;
}

function buildSupabaseErrorHaystack(error: unknown) {
  const supabaseError = toSupabaseErrorLike(error);

  return [
    supabaseError.message,
    supabaseError.details,
    supabaseError.hint,
  ]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase();
}

function isMissingAppConfigError(error: unknown, sourceName: 'app_config' | 'app_feature_flags') {
  const supabaseError = toSupabaseErrorLike(error);
  const errorCode = supabaseError.code ?? '';

  if (errorCode === '42P01' || errorCode === 'PGRST204' || errorCode === 'PGRST205') {
    return true;
  }

  const haystack = buildSupabaseErrorHaystack(error);

  return haystack.includes(sourceName) && (
    haystack.includes('not found') ||
    haystack.includes('does not exist') ||
    haystack.includes('schema cache')
  );
}

function isIncompatibleAppConfigError(
  error: unknown,
  sourceName: 'app_config' | 'app_feature_flags',
) {
  const supabaseError = toSupabaseErrorLike(error);
  const errorCode = supabaseError.code ?? '';

  if (errorCode === '42703' || errorCode === 'PGRST204') {
    return true;
  }

  const haystack = buildSupabaseErrorHaystack(error);
  return haystack.includes(sourceName) && haystack.includes('column') && haystack.includes('does not exist');
}

export function parseAppConfigValue(
  value: unknown,
  source: AppConfigSource = 'default',
): AppConfig {
  if (!isRecord(value)) {
    return DEFAULT_APP_CONFIG;
  }

  const socialEnabled = readBoolean(value.social_enabled);
  const socialCommentsEnabled =
    readOptionalBoolean(value.social_comments_enabled) ?? socialEnabled;

  return {
    ...DEFAULT_APP_CONFIG,
    config_source: source,
    social_enabled: socialEnabled,
    coach_enabled: readBoolean(value.coach_enabled),
    entry_offer_enabled: readBoolean(value.entry_offer_enabled),
    social_comments_enabled: socialCommentsEnabled,
    entry_offer_offering_id: readString(value.entry_offer_offering_id),
    post_rate_limit_per_day: readNumber(value.post_rate_limit_per_day),
    comment_rate_limit_per_hour: readNumber(value.comment_rate_limit_per_hour),
    rollout_percentage: readNumber(value.rollout_percentage),
    moderation_enabled: readBoolean(value.moderation_enabled),
  };
}

export function areSocialCommentsEnabled(
  featureFlags: Pick<FeatureFlags, 'social_enabled' | 'social_comments_enabled'> | null | undefined,
) {
  if (featureFlags?.social_comments_enabled === true) {
    return true;
  }

  if (featureFlags?.social_comments_enabled === false) {
    return false;
  }

  return featureFlags?.social_enabled === true;
}

type SocialCommentsGateInput =
  Pick<FeatureFlags, 'social_enabled' | 'social_comments_enabled'> & {
    config_source?: AppConfigSource | null;
  };

export function resolveSocialCommentsGate(
  featureFlags: SocialCommentsGateInput | null | undefined,
  options: { resolved?: boolean } = {},
): SocialCommentsGateState {
  if (
    options.resolved === false ||
    !featureFlags ||
    featureFlags.config_source === 'default'
  ) {
    return 'unknown';
  }

  return areSocialCommentsEnabled(featureFlags) ? 'enabled' : 'disabled';
}

export function shouldEnableSocialComments(gateState: SocialCommentsGateState) {
  return gateState !== 'disabled';
}

async function fetchCanonicalAppConfig() {
  try {
    const { data, error } = await supabase
      .from('app_feature_flags')
      .select(
        'social_enabled, coach_enabled, entry_offer_enabled, social_comments_enabled, entry_offer_offering_id, post_rate_limit_per_day, comment_rate_limit_per_hour, rollout_percentage, moderation_enabled',
      )
      .eq('scope', APP_CONFIG_REMOTE_KEY)
      .maybeSingle();

    if (error) {
      if (
        isMissingAppConfigError(error, 'app_feature_flags') ||
        isIncompatibleAppConfigError(error, 'app_feature_flags')
      ) {
        return null;
      }

      console.warn(
        '[AppConfig] Failed to fetch canonical app_feature_flags config, trying fallbacks:',
        error,
      );
      return null;
    }

    if (!data) {
      return null;
    }

    return parseAppConfigValue(data, 'canonical');
  } catch (error) {
    console.warn(
      '[AppConfig] Unexpected app_feature_flags failure, trying fallbacks:',
      error,
    );
    return null;
  }
}

function isMissingFeatureFlagsRpcError(error: unknown) {
  const supabaseError = toSupabaseErrorLike(error);
  const errorCode = supabaseError.code ?? '';

  if (errorCode === '42883' || errorCode === 'PGRST202') {
    return true;
  }

  const haystack = buildSupabaseErrorHaystack(error);

  return (
    haystack.includes('get_phase2_feature_flags') &&
    (
      haystack.includes('not found') ||
      haystack.includes('does not exist') ||
      haystack.includes('schema cache')
    )
  );
}

async function fetchRpcAppConfig() {
  try {
    const { data, error } = await supabase.rpc('get_phase2_feature_flags', {
      p_scope: APP_CONFIG_REMOTE_KEY,
    });

    if (error) {
      if (!isMissingFeatureFlagsRpcError(error)) {
        console.warn(
          '[AppConfig] Failed to fetch feature flags RPC config, trying legacy config:',
          error,
        );
      }
      return null;
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      return DEFAULT_APP_CONFIG;
    }

    return parseAppConfigValue(row, 'rpc');
  } catch (error) {
    console.warn(
      '[AppConfig] Unexpected feature flags RPC failure, trying legacy config:',
      error,
    );
    return null;
  }
}

async function fetchCompatibilityAppConfig() {
  try {
    const { data, error } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', APP_CONFIG_REMOTE_KEY)
      .maybeSingle();

    if (error) {
      if (!isMissingAppConfigError(error, 'app_config')) {
        console.warn('[AppConfig] Failed to fetch app config, using defaults:', error);
      }
      return DEFAULT_APP_CONFIG;
    }

    return parseAppConfigValue((data as AppConfigRow | null)?.value, 'compatibility');
  } catch (error) {
    console.warn('[AppConfig] Unexpected app config failure, using defaults:', error);
    return DEFAULT_APP_CONFIG;
  }
}

export async function fetchAppConfig(): Promise<AppConfig> {
  const canonicalConfig = await fetchCanonicalAppConfig();
  if (canonicalConfig !== null) {
    return canonicalConfig;
  }

  const rpcConfig = await fetchRpcAppConfig();
  if (rpcConfig !== null) {
    return rpcConfig;
  }

  return fetchCompatibilityAppConfig();
}
