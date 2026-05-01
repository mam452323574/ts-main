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
    imageSource: require('../assets/images/coach/gentle_supportive.png'),
    fallbackLabel: 'GS',
    haloTint: '#6CA7FF',
    teaserPriority: 1,
  },
  strict_tough: {
    imageSource: require('../assets/images/coach/strict_tough.png'),
    fallbackLabel: 'ST',
    haloTint: '#7E90B7',
    teaserPriority: 5,
  },
  motivational_energetic: {
    imageSource: require('../assets/images/coach/motivational_energetic.png'),
    fallbackLabel: 'ME',
    haloTint: '#42BFFF',
    teaserPriority: 2,
  },
  patient_calm: {
    imageSource: require('../assets/images/coach/patient_calm.png'),
    fallbackLabel: 'PC',
    haloTint: '#53C6BB',
    teaserPriority: 4,
  },
  analytical_precise: {
    imageSource: require('../assets/images/coach/analytical_precise.png'),
    fallbackLabel: 'AP',
    haloTint: '#88A7FF',
    teaserPriority: 3,
  },
  playful_light: {
    imageSource: require('../assets/images/coach/playful_light.png'),
    fallbackLabel: 'PL',
    haloTint: '#FF8F8B',
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

