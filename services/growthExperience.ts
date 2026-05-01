import { supabase } from './supabase';

import { isRolloutEnabledForUser } from '@/utils/featureRollout';
import { hasPremiumAccess } from '@/utils/subscription';
import type { AppConfig } from '@/services/appConfig';
import type { UserGrowthExperience, UserProfile } from '@/types';

interface SupabaseErrorLike {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}

interface GrowthEligibilityInput {
  featureFlags: Pick<
    AppConfig,
    'entry_offer_enabled' | 'entry_offer_offering_id' | 'rollout_percentage'
  >;
  growthExperience?: UserGrowthExperience | null;
  userProfile?: Pick<UserProfile, 'id' | 'account_tier'> | null;
  hasActiveEntitlement?: boolean | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readRequiredString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readBoolean(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function toSupabaseErrorLike(error: unknown): SupabaseErrorLike {
  if (!error || typeof error !== 'object') {
    return {};
  }

  return error as SupabaseErrorLike;
}

function isMissingGrowthExperienceError(error: unknown) {
  const supabaseError = toSupabaseErrorLike(error);
  const errorCode = supabaseError.code ?? '';

  if (
    errorCode === '42P01' ||
    errorCode === 'PGRST204' ||
    errorCode === 'PGRST205' ||
    errorCode === 'PGRST202'
  ) {
    return true;
  }

  const haystack = [
    supabaseError.message,
    supabaseError.details,
    supabaseError.hint,
  ]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase();

  return (
    haystack.includes('user_growth_experiences') ||
    haystack.includes('ensure_user_growth_experience') ||
    haystack.includes('mark_entry_offer_') ||
    haystack.includes('mark_coach_seen')
  );
}

function parseGrowthExperienceRow(row: unknown): UserGrowthExperience | null {
  if (!isRecord(row)) {
    return null;
  }

  const userId = readRequiredString(row.user_id);
  const growthState = readRequiredString(row.growth_state);
  const updatedAt = readRequiredString(row.updated_at);
  const growthStateUpdatedAt = readRequiredString(row.growth_state_updated_at);

  if (!userId || !growthState || !updatedAt || !growthStateUpdatedAt) {
    return null;
  }

  return {
    user_id: userId,
    growth_state: growthState as UserGrowthExperience['growth_state'],
    entry_offer_eligible: readBoolean(row.entry_offer_eligible),
    entry_offer_shown_at: readOptionalString(row.entry_offer_shown_at),
    entry_offer_dismissed_at: readOptionalString(row.entry_offer_dismissed_at),
    entry_offer_claimed_at: readOptionalString(row.entry_offer_claimed_at),
    entry_offer_offering_id: readOptionalString(row.entry_offer_offering_id),
    coach_seen_at: readOptionalString(row.coach_seen_at),
    coach_cooldown_until: readOptionalString(row.coach_cooldown_until),
    growth_state_updated_at: growthStateUpdatedAt,
    created_at: readOptionalString(row.created_at) ?? undefined,
    updated_at: updatedAt,
  };
}

async function invokeGrowthExperienceRpc(
  functionName: string,
  args: Record<string, unknown> = {},
) {
  try {
    const { data, error } = await supabase.rpc(functionName, args);
    if (error) {
      if (!isMissingGrowthExperienceError(error)) {
        console.warn(`[GrowthExperience] RPC ${functionName} failed:`, error);
      }
      return null;
    }

    const row = Array.isArray(data) ? data[0] : data;
    return parseGrowthExperienceRow(row);
  } catch (error) {
    if (!isMissingGrowthExperienceError(error)) {
      console.warn(`[GrowthExperience] Unexpected RPC ${functionName} failure:`, error);
    }
    return null;
  }
}

export async function ensureGrowthExperience(offeringId?: string | null) {
  return invokeGrowthExperienceRpc('ensure_user_growth_experience', {
    p_offering_id: offeringId ?? null,
  });
}

export async function fetchGrowthExperience(userId?: string | null) {
  if (!userId) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('user_growth_experiences')
      .select('*')
      .maybeSingle();

    if (error) {
      if (!isMissingGrowthExperienceError(error)) {
        console.warn('[GrowthExperience] Failed to fetch row:', error);
      }
      return null;
    }

    const parsedRow = parseGrowthExperienceRow(data);
    if (parsedRow) {
      return parsedRow;
    }

    return ensureGrowthExperience();
  } catch (error) {
    if (!isMissingGrowthExperienceError(error)) {
      console.warn('[GrowthExperience] Unexpected fetch failure:', error);
    }
    return null;
  }
}

export async function markCoachSeen() {
  return invokeGrowthExperienceRpc('mark_coach_seen');
}

export async function markEntryOfferShown(offeringId?: string | null) {
  return invokeGrowthExperienceRpc('mark_entry_offer_shown', {
    p_offering_id: offeringId ?? null,
  });
}

export async function markEntryOfferDismissed(offeringId?: string | null) {
  return invokeGrowthExperienceRpc('mark_entry_offer_dismissed', {
    p_offering_id: offeringId ?? null,
  });
}

export async function markEntryOfferClaimed(offeringId?: string | null) {
  return invokeGrowthExperienceRpc('mark_entry_offer_claimed', {
    p_offering_id: offeringId ?? null,
  });
}

export function shouldPresentEntryOffer({
  featureFlags,
  growthExperience,
  userProfile,
  hasActiveEntitlement,
}: GrowthEligibilityInput) {
  if (!featureFlags.entry_offer_enabled || !featureFlags.entry_offer_offering_id) {
    return false;
  }

  if (!userProfile?.id || hasPremiumAccess(userProfile.account_tier)) {
    return false;
  }

  if (hasActiveEntitlement) {
    return false;
  }

  if (!growthExperience?.entry_offer_eligible) {
    return false;
  }

  if (
    growthExperience.entry_offer_shown_at ||
    growthExperience.entry_offer_dismissed_at ||
    growthExperience.entry_offer_claimed_at
  ) {
    return false;
  }

  return isRolloutEnabledForUser({
    userId: userProfile.id,
    accountTier: userProfile.account_tier,
    rolloutPercentage: featureFlags.rollout_percentage,
  });
}
