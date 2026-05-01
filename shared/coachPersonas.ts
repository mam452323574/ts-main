export const COACH_PERSONA_KEYS = [
  'gentle_supportive',
  'strict_tough',
  'motivational_energetic',
  'patient_calm',
  'analytical_precise',
  'playful_light',
] as const;

export type CoachPersonaKey = (typeof COACH_PERSONA_KEYS)[number];

export interface CoachPersonaStyleGuide {
  opening: string;
  cadence: string;
  avoid: readonly string[];
  emphasize: readonly string[];
}

export interface CoachPersonaDefinition {
  key: CoachPersonaKey;
  requiresPremium: boolean;
  titleTranslationKey: `coach.personas.${CoachPersonaKey}.title`;
  subtitleTranslationKey: `coach.personas.${CoachPersonaKey}.subtitle`;
  toneBadgeTranslationKey: `coach.personas.${CoachPersonaKey}.tone_badge`;
  summaryTranslationKey: `coach.personas.${CoachPersonaKey}.summary`;
  voiceTranslationKey: `coach.personas.${CoachPersonaKey}.voice`;
  energyTranslationKey: `coach.personas.${CoachPersonaKey}.energy`;
  motivationTranslationKey: `coach.personas.${CoachPersonaKey}.motivation`;
  bestForTranslationKey: `coach.personas.${CoachPersonaKey}.best_for`;
  toneInstructions: string;
  styleGuide: CoachPersonaStyleGuide;
}

export const DEFAULT_COACH_PERSONA_KEY: CoachPersonaKey = 'gentle_supportive';

export const COACH_PERSONAS: readonly CoachPersonaDefinition[] = [
  {
    key: 'gentle_supportive',
    requiresPremium: false,
    titleTranslationKey: 'coach.personas.gentle_supportive.title',
    subtitleTranslationKey: 'coach.personas.gentle_supportive.subtitle',
    toneBadgeTranslationKey: 'coach.personas.gentle_supportive.tone_badge',
    summaryTranslationKey: 'coach.personas.gentle_supportive.summary',
    voiceTranslationKey: 'coach.personas.gentle_supportive.voice',
    energyTranslationKey: 'coach.personas.gentle_supportive.energy',
    motivationTranslationKey: 'coach.personas.gentle_supportive.motivation',
    bestForTranslationKey: 'coach.personas.gentle_supportive.best_for',
    toneInstructions:
      'Use a gentle, supportive, reassuring wellness coaching tone. Be warm, practical, encouraging, and non-judgmental. Keep guidance calm, clear, and easy to follow.',
    styleGuide: {
      opening:
        'Ouvre avec une observation chaleureuse et apaisante, sans jargon.',
      cadence:
        'Phrases courtes, 1–2 idées max par paragraphe. Laisse respirer le texte.',
      avoid: ['ordres secs', 'pression', 'vocabulaire médical dur'],
      emphasize: ['encouragement concret', 'micro-victoires', 'permission de ralentir'],
    },
  },
  {
    key: 'strict_tough',
    requiresPremium: true,
    titleTranslationKey: 'coach.personas.strict_tough.title',
    subtitleTranslationKey: 'coach.personas.strict_tough.subtitle',
    toneBadgeTranslationKey: 'coach.personas.strict_tough.tone_badge',
    summaryTranslationKey: 'coach.personas.strict_tough.summary',
    voiceTranslationKey: 'coach.personas.strict_tough.voice',
    energyTranslationKey: 'coach.personas.strict_tough.energy',
    motivationTranslationKey: 'coach.personas.strict_tough.motivation',
    bestForTranslationKey: 'coach.personas.strict_tough.best_for',
    toneInstructions:
      'Use a strict, tough-love coaching tone. Be direct, disciplined, and accountability-focused without being insulting or unsafe. Push for consistency and decisive next steps.',
    styleGuide: {
      opening: 'Va droit au but, cadre la situation sans détour.',
      cadence: 'Phrases directes, verbes à l’impératif, rythme serré.',
      avoid: [
        'smileys',
        'formulations chaleureuses gratuites',
        'édulcoration des constats',
      ],
      emphasize: ['engagement mesurable', 'deadline courte', 'responsabilité'],
    },
  },
  {
    key: 'motivational_energetic',
    requiresPremium: true,
    titleTranslationKey: 'coach.personas.motivational_energetic.title',
    subtitleTranslationKey: 'coach.personas.motivational_energetic.subtitle',
    toneBadgeTranslationKey: 'coach.personas.motivational_energetic.tone_badge',
    summaryTranslationKey: 'coach.personas.motivational_energetic.summary',
    voiceTranslationKey: 'coach.personas.motivational_energetic.voice',
    energyTranslationKey: 'coach.personas.motivational_energetic.energy',
    motivationTranslationKey: 'coach.personas.motivational_energetic.motivation',
    bestForTranslationKey: 'coach.personas.motivational_energetic.best_for',
    toneInstructions:
      'Use a motivational, energetic coaching tone. Sound upbeat, momentum-building, and action-oriented. Highlight wins, reinforce confidence, and keep the advice dynamic and concise.',
    styleGuide: {
      opening: 'Célèbre brièvement un élan ou un gain possible dès la première ligne.',
      cadence: 'Tempo rapide, verbes d’action, une idée percutante par phrase.',
      avoid: ['fatalisme', 'longs préambules', 'hésitations'],
      emphasize: ['momentum', 'prochaine petite victoire', 'confiance'],
    },
  },
  {
    key: 'patient_calm',
    requiresPremium: true,
    titleTranslationKey: 'coach.personas.patient_calm.title',
    subtitleTranslationKey: 'coach.personas.patient_calm.subtitle',
    toneBadgeTranslationKey: 'coach.personas.patient_calm.tone_badge',
    summaryTranslationKey: 'coach.personas.patient_calm.summary',
    voiceTranslationKey: 'coach.personas.patient_calm.voice',
    energyTranslationKey: 'coach.personas.patient_calm.energy',
    motivationTranslationKey: 'coach.personas.patient_calm.motivation',
    bestForTranslationKey: 'coach.personas.patient_calm.best_for',
    toneInstructions:
      'Use a patient, calm coaching tone. Speak with steadiness, empathy, and low pressure. Break guidance into manageable steps and normalize gradual progress.',
    styleGuide: {
      opening: 'Pose le contexte avec douceur, normalise le rythme de l’utilisateur.',
      cadence: 'Rythme posé, phrases moyennes, transitions fluides.',
      avoid: ['urgence', 'superlatifs', 'listes à rallonge'],
      emphasize: ['progression graduelle', 'acceptation', 'petits pas tenables'],
    },
  },
  {
    key: 'analytical_precise',
    requiresPremium: true,
    titleTranslationKey: 'coach.personas.analytical_precise.title',
    subtitleTranslationKey: 'coach.personas.analytical_precise.subtitle',
    toneBadgeTranslationKey: 'coach.personas.analytical_precise.tone_badge',
    summaryTranslationKey: 'coach.personas.analytical_precise.summary',
    voiceTranslationKey: 'coach.personas.analytical_precise.voice',
    energyTranslationKey: 'coach.personas.analytical_precise.energy',
    motivationTranslationKey: 'coach.personas.analytical_precise.motivation',
    bestForTranslationKey: 'coach.personas.analytical_precise.best_for',
    toneInstructions:
      'Use an analytical, precise coaching tone. Prioritize clarity, structure, and evidence-minded reasoning. Explain recommendations in a crisp, methodical way without sounding clinical.',
    styleGuide: {
      opening: 'Nomme l’observation clé en une phrase factuelle.',
      cadence:
        'Structure nette, chaîne de raisonnement courte, un constat par point.',
      avoid: ['émotions excessives', 'métaphores vagues', 'remplissage'],
      emphasize: [
        'chiffres précis quand ils existent dans le payload',
        'cause → conséquence → action',
      ],
    },
  },
  {
    key: 'playful_light',
    requiresPremium: true,
    titleTranslationKey: 'coach.personas.playful_light.title',
    subtitleTranslationKey: 'coach.personas.playful_light.subtitle',
    toneBadgeTranslationKey: 'coach.personas.playful_light.tone_badge',
    summaryTranslationKey: 'coach.personas.playful_light.summary',
    voiceTranslationKey: 'coach.personas.playful_light.voice',
    energyTranslationKey: 'coach.personas.playful_light.energy',
    motivationTranslationKey: 'coach.personas.playful_light.motivation',
    bestForTranslationKey: 'coach.personas.playful_light.best_for',
    toneInstructions:
      'Use a playful, light coaching tone. Stay witty, friendly, and breezy while remaining useful and respectful. Keep the advice optimistic and easy to act on.',
    styleGuide: {
      opening: 'Ouvre avec une image simple ou un clin d’œil léger, jamais immature.',
      cadence: 'Phrases courtes, rebonds, ton vif mais toujours utile.',
      avoid: ['gravité', 'ton médical', 'catastrophisme'],
      emphasize: [
        'image simple',
        'appel à l’action léger',
        'humour bienveillant',
      ],
    },
  },
] as const;

const COACH_PERSONAS_BY_KEY: Record<CoachPersonaKey, CoachPersonaDefinition> =
  COACH_PERSONAS.reduce(
    (accumulator, persona) => {
      accumulator[persona.key] = persona;
      return accumulator;
    },
    {} as Record<CoachPersonaKey, CoachPersonaDefinition>,
  );

export function isCoachPersonaKey(value: unknown): value is CoachPersonaKey {
  return (
    typeof value === 'string' &&
    (COACH_PERSONA_KEYS as readonly string[]).includes(value)
  );
}

export function getCoachPersona(
  personaKey: CoachPersonaKey,
): CoachPersonaDefinition {
  return COACH_PERSONAS_BY_KEY[personaKey];
}

export function hasCoachPersonaAccess(
  personaKey: CoachPersonaKey,
  accountTier?: string | null,
): boolean {
  const persona = getCoachPersona(personaKey);
  if (!persona.requiresPremium) {
    return true;
  }

  return accountTier === 'premium' || accountTier === 'admin';
}

export function resolveEffectiveCoachPersonaKey(
  personaKey: unknown,
  accountTier?: string | null,
): CoachPersonaKey {
  if (!isCoachPersonaKey(personaKey)) {
    return DEFAULT_COACH_PERSONA_KEY;
  }

  return hasCoachPersonaAccess(personaKey, accountTier)
    ? personaKey
    : DEFAULT_COACH_PERSONA_KEY;
}

export function getVisibleCoachPersonas() {
  return COACH_PERSONAS;
}
