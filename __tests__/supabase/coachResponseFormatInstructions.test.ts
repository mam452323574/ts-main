/**
 * Tests unitaires pour le suffixe RESPONSE_FORMAT_INSTRUCTIONS ajouté au
 * tone_instructions persona dans `coach-generate-response/handler.ts`.
 *
 * On ne teste pas le handler complet ici (couvert par
 * `coachGenerateResponseHandler.test.ts`) — uniquement le wrapper qui décore
 * le persona pour cadrer le format de réponse coach (top 3, 10 min, ce soir,
 * pas médical).
 */

import {
  COACH_RESPONSE_FORMAT_INSTRUCTIONS,
  applyResponseFormatToPersona,
} from '@/shared/coachResponseFormatRules';

describe('COACH_RESPONSE_FORMAT_INSTRUCTIONS content', () => {
  it('contains explicit rules for top 3 / immediate / time-bound / routine patterns', () => {
    // Patterns canoniques que les nouvelles questions du scan result peuvent
    // contenir et que le LLM doit savoir gérer.
    const requiredPatterns = [
      /top 3|3 actions|3 gestes|3 choses/i,
      /10 minutes|maintenant|right now|n°1|action n°1/i,
      /ce soir|tonight|demain matin|tomorrow morning/i,
      /routine|plan 24h|plan|planning/i,
    ];

    for (const pattern of requiredPatterns) {
      expect(COACH_RESPONSE_FORMAT_INSTRUCTIONS).toMatch(pattern);
    }
  });

  it('requires action_steps to stay concrete and short', () => {
    expect(COACH_RESPONSE_FORMAT_INSTRUCTIONS).toMatch(/action_steps/);
    expect(COACH_RESPONSE_FORMAT_INSTRUCTIONS).toMatch(/concise|short|concrete/i);
  });

  it('mandates a summary and an encouragement at the end', () => {
    expect(COACH_RESPONSE_FORMAT_INSTRUCTIONS).toMatch(/summary/i);
    expect(COACH_RESPONSE_FORMAT_INSTRUCTIONS).toMatch(/encouragement/i);
  });

  it('forbids medical, diagnostic, treatment, pathology references', () => {
    expect(COACH_RESPONSE_FORMAT_INSTRUCTIONS).toMatch(/no medical|never give medical/i);
    expect(COACH_RESPONSE_FORMAT_INSTRUCTIONS).toMatch(/diagnost(ic|ic|ic)/i);
    expect(COACH_RESPONSE_FORMAT_INSTRUCTIONS).toMatch(/treatment/i);
    expect(COACH_RESPONSE_FORMAT_INSTRUCTIONS).toMatch(/pathology/i);
  });

  it('asks for wellness self-improvement scope', () => {
    expect(COACH_RESPONSE_FORMAT_INSTRUCTIONS).toMatch(/wellness self-improvement/i);
  });
});

describe('applyResponseFormatToPersona', () => {
  it('appends the format rules to the persona toneInstructions without erasing the base tone', () => {
    const basePersona = {
      key: 'gentle_supportive' as const,
      toneInstructions: 'Use a gentle, supportive, reassuring wellness coaching tone.',
    };

    const decorated = applyResponseFormatToPersona(basePersona);

    // Base tone is preserved.
    expect(decorated.toneInstructions).toContain(
      'Use a gentle, supportive, reassuring wellness coaching tone.',
    );
    // Format rules are appended.
    expect(decorated.toneInstructions).toContain(COACH_RESPONSE_FORMAT_INSTRUCTIONS);
    // Format rules come AFTER the persona tone (append, not prepend).
    const personaIndex = decorated.toneInstructions.indexOf(
      'Use a gentle, supportive',
    );
    const formatIndex = decorated.toneInstructions.indexOf(
      'Response format rules',
    );
    expect(personaIndex).toBeGreaterThanOrEqual(0);
    expect(formatIndex).toBeGreaterThan(personaIndex);
  });

  it('is purely additive (same length suffix, never trims base persona)', () => {
    const basePersona = {
      key: 'strict_tough' as const,
      toneInstructions: 'Use a strict, tough-love coaching tone.',
    };
    const decorated = applyResponseFormatToPersona(basePersona);

    expect(decorated.toneInstructions.length).toBe(
      basePersona.toneInstructions.length +
        COACH_RESPONSE_FORMAT_INSTRUCTIONS.length,
    );
  });

  it('preserves the medical referral prefix when stacked with urgency override', () => {
    // Simule le pipeline complet : urgency prepend → persona base → format append.
    // L'ordre attendu :
    //   <MEDICAL_REFERRAL_PREFIX> + <persona.tone> + <FORMAT_RULES>
    const MEDICAL_PREFIX =
      'IMPORTANT MEDICAL DISCLAIMER (urgent signal): ... Begin your reply with a clear referral statement before any other content. ';
    const personaTone = 'Use a gentle, supportive, reassuring wellness coaching tone.';
    const urgencyOverridden = {
      toneInstructions: `${MEDICAL_PREFIX}${personaTone}`,
    };

    const finalPersona = applyResponseFormatToPersona(urgencyOverridden);

    const medicalIndex = finalPersona.toneInstructions.indexOf(
      'IMPORTANT MEDICAL DISCLAIMER',
    );
    const personaIndex = finalPersona.toneInstructions.indexOf(personaTone);
    const formatIndex = finalPersona.toneInstructions.indexOf('Response format rules');

    expect(medicalIndex).toBe(0);
    expect(personaIndex).toBeGreaterThan(medicalIndex);
    expect(formatIndex).toBeGreaterThan(personaIndex);
  });

  it('returns a new object (does not mutate the input)', () => {
    const basePersona = {
      key: 'analytical_precise' as const,
      toneInstructions: 'Use an analytical, precise coaching tone.',
      extra: 'kept',
    };
    const decorated = applyResponseFormatToPersona(basePersona);

    expect(decorated).not.toBe(basePersona);
    expect(basePersona.toneInstructions).toBe('Use an analytical, precise coaching tone.');
    // Other fields on the persona are preserved on the returned object.
    expect((decorated as typeof basePersona).extra).toBe('kept');
  });
});
