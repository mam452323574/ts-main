import {
  COACH_PROMPT_DEFINITIONS,
  hasCoachPromptTypeAccess,
  resolveEffectiveCoachPromptType,
  type CoachPromptType,
} from '@/shared/coachPromptTypes';
import type { UserProfile } from '@/types';

type UserProfilePromptSnapshot = Pick<UserProfile, 'account_tier'>;

export function isCoachPromptTypeLockedForProfile(
  promptType: CoachPromptType,
  userProfile?: UserProfilePromptSnapshot | null,
): boolean {
  return !hasCoachPromptTypeAccess(promptType, userProfile?.account_tier);
}

export function getCoachPromptOptionsForProfile(
  userProfile?: UserProfilePromptSnapshot | null,
) {
  return COACH_PROMPT_DEFINITIONS.map((definition) => ({
    ...definition,
    locked: isCoachPromptTypeLockedForProfile(definition.key, userProfile),
  }));
}

export function resolveCoachPromptTypeForProfile(
  promptType: unknown,
  userProfile?: UserProfilePromptSnapshot | null,
): CoachPromptType {
  return resolveEffectiveCoachPromptType(
    promptType,
    userProfile?.account_tier,
  );
}
