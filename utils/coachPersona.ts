import {
  COACH_PERSONAS,
  getCoachPersona,
  hasCoachPersonaAccess,
  resolveEffectiveCoachPersonaKey,
  type CoachPersonaKey,
} from '@/shared/coachPersonas';
import type { UserProfile } from '@/types';

type UserProfilePersonaSnapshot = Pick<
  UserProfile,
  'account_tier' | 'coach_persona_key'
>;

export function resolveCoachPersonaKeyFromProfile(
  userProfile?: UserProfilePersonaSnapshot | null,
): CoachPersonaKey {
  return resolveEffectiveCoachPersonaKey(
    userProfile?.coach_persona_key,
    userProfile?.account_tier,
  );
}

export function isCoachPersonaLockedForProfile(
  personaKey: CoachPersonaKey,
  userProfile?: UserProfilePersonaSnapshot | null,
): boolean {
  return !hasCoachPersonaAccess(personaKey, userProfile?.account_tier);
}

export function getCoachPersonaOptionsForProfile(
  userProfile?: UserProfilePersonaSnapshot | null,
) {
  return COACH_PERSONAS.map((persona) => ({
    ...persona,
    locked: isCoachPersonaLockedForProfile(persona.key, userProfile),
    active:
      resolveCoachPersonaKeyFromProfile(userProfile) === persona.key,
  }));
}

export function resolveCoachPersonaDefinitionForProfile(
  userProfile?: UserProfilePersonaSnapshot | null,
) {
  return getCoachPersona(resolveCoachPersonaKeyFromProfile(userProfile));
}
