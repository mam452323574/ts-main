import { createPhase2DatabaseError, Phase2HttpError } from './phase2Errors.ts';

export type CoachAccountTier = 'free' | 'premium' | 'admin';

function normalizeAccountTier(value: unknown): CoachAccountTier {
  return value === 'premium' || value === 'admin' ? value : 'free';
}

/**
 * Loads the authenticated user's account_tier from user_profiles using the
 * Edge Function's service-role client. Throws a Phase2HttpError when the
 * profile is missing or the table is unavailable.
 */
export async function loadCoachUserAccountTier(
  client: any,
  userId: string,
  contextLabel = 'Coach conversation user profile lookup',
): Promise<CoachAccountTier> {
  const { data, error } = await client
    .from('user_profiles')
    .select('account_tier')
    .eq('id', userId)
    .single();

  if (error) {
    throw createPhase2DatabaseError(error, {
      contextLabel,
      fallbackCode: 'user_profile_lookup_failed',
      fallbackMessage: 'Failed to load the user profile',
      relationName: 'user_profiles',
    });
  }

  if (!data?.account_tier) {
    throw new Phase2HttpError(
      404,
      'user_profile_not_found',
      'User profile not found',
    );
  }

  return normalizeAccountTier(data.account_tier);
}
