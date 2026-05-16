import type { ImageSourcePropType } from 'react-native';

import type { CoachPersonaKey } from '@/shared/coachPersonas';

export interface CoachPersonaVisual {
  imageSource?: ImageSourcePropType;
  fallbackLabel: string;
  haloTint: string;
  teaserPriority: number;
}

const COACH_PERSONA_VISUALS: Record<CoachPersonaKey, CoachPersonaVisual> = {
  gentle_supportive: {
    imageSource: require('../assets/images/coach/gentle_supportive.webp'),
    fallbackLabel: 'NO',
    haloTint: '#7FA9D4',
    teaserPriority: 1,
  },
  strict_tough: {
    imageSource: require('../assets/images/coach/strict_tough.webp'),
    fallbackLabel: 'AX',
    haloTint: '#8792A7',
    teaserPriority: 5,
  },
  motivational_energetic: {
    imageSource: require('../assets/images/coach/motivational_energetic.webp'),
    fallbackLabel: 'LE',
    haloTint: '#76A9C8',
    teaserPriority: 2,
  },
  patient_calm: {
    imageSource: require('../assets/images/coach/patient_calm.webp'),
    fallbackLabel: 'MI',
    haloTint: '#72AFA8',
    teaserPriority: 4,
  },
  analytical_precise: {
    imageSource: require('../assets/images/coach/analytical_precise.webp'),
    fallbackLabel: 'EL',
    haloTint: '#8D9EC8',
    teaserPriority: 3,
  },
  playful_light: {
    imageSource: require('../assets/images/coach/playful_light.webp'),
    fallbackLabel: 'MO',
    haloTint: '#D98B86',
    teaserPriority: 6,
  },
};

export function getCoachPersonaVisual(personaKey: CoachPersonaKey): CoachPersonaVisual {
  return COACH_PERSONA_VISUALS[personaKey];
}

export function getCoachPersonaTeaserKeys(
  activePersonaKey: CoachPersonaKey,
  count = 3,
): CoachPersonaKey[] {
  const otherKeys = (Object.keys(COACH_PERSONA_VISUALS) as CoachPersonaKey[])
    .filter((key) => key !== activePersonaKey)
    .sort(
      (left, right) =>
        COACH_PERSONA_VISUALS[left].teaserPriority -
        COACH_PERSONA_VISUALS[right].teaserPriority,
    );

  return [activePersonaKey, ...otherKeys].slice(0, count);
}
