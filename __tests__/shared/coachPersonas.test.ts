import {
  COACH_PERSONAS,
  DEFAULT_COACH_PERSONA_KEY,
  hasCoachPersonaAccess,
  resolveEffectiveCoachPersonaKey,
} from '@/shared/coachPersonas';
import {
  getCoachPersonaOptionsForProfile,
  resolveCoachPersonaKeyFromProfile,
} from '@/utils/coachPersona';

describe('coach persona registry', () => {
  it('falls back to the default persona for unknown values and locked free selections', () => {
    expect(resolveEffectiveCoachPersonaKey(undefined)).toBe(
      DEFAULT_COACH_PERSONA_KEY,
    );
    expect(resolveEffectiveCoachPersonaKey('unknown_persona')).toBe(
      DEFAULT_COACH_PERSONA_KEY,
    );
    expect(
      resolveCoachPersonaKeyFromProfile({
        account_tier: 'free',
        coach_persona_key: 'strict_tough' as any,
      }),
    ).toBe(DEFAULT_COACH_PERSONA_KEY);
  });

  it('allows premium personas only for premium entitlements', () => {
    expect(hasCoachPersonaAccess('gentle_supportive', 'free')).toBe(true);
    expect(hasCoachPersonaAccess('strict_tough', 'free')).toBe(false);
    expect(hasCoachPersonaAccess('strict_tough', 'premium')).toBe(true);
    expect(hasCoachPersonaAccess('strict_tough', 'admin')).toBe(true);
  });

  it('keeps one free persona visible and marks the remaining personas as locked for free users', () => {
    const options = getCoachPersonaOptionsForProfile({
      account_tier: 'free',
      coach_persona_key: 'gentle_supportive',
    });

    expect(options).toHaveLength(COACH_PERSONAS.length);
    expect(options.filter((persona) => !persona.locked)).toHaveLength(1);
    expect(options.filter((persona) => persona.locked)).toHaveLength(5);
    expect(options.find((persona) => persona.key === 'gentle_supportive')?.active).toBe(
      true,
    );
  });

  it('exposes structured detail translation keys for every persona', () => {
    for (const persona of COACH_PERSONAS) {
      expect(persona.toneBadgeTranslationKey).toBe(
        `coach.personas.${persona.key}.tone_badge`,
      );
      expect(persona.summaryTranslationKey).toBe(
        `coach.personas.${persona.key}.summary`,
      );
      expect(persona.voiceTranslationKey).toBe(
        `coach.personas.${persona.key}.voice`,
      );
      expect(persona.energyTranslationKey).toBe(
        `coach.personas.${persona.key}.energy`,
      );
      expect(persona.motivationTranslationKey).toBe(
        `coach.personas.${persona.key}.motivation`,
      );
      expect(persona.bestForTranslationKey).toBe(
        `coach.personas.${persona.key}.best_for`,
      );
    }
  });
});
