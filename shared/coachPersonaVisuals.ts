import type { ImageSourcePropType } from 'react-native';

import type { CoachPersonaKey } from '@/shared/coachPersonas';
import type { CoachImageCrop } from '@/shared/coachImageCrop';

export interface CoachPersonaVisual {
  imageSource?: ImageSourcePropType;
  fallbackLabel: string;
  haloTint: string;
  teaserPriority: number;
  /**
   * Default crop for this persona — applied to every renderer (card, avatar,
   * hero) unless a more specific override is set below. Most personas only
   * need this; use the contextual overrides only when one renderer needs a
   * different framing.
   */
  crop?: CoachImageCrop;
  /** Override used by `CoachConversationHeroCard` (full-bleed portrait). */
  heroCrop?: CoachImageCrop;
  /** Override used by `CoachPersonaCard` portrait variant (selector grid). */
  cardCrop?: CoachImageCrop;
  /** Override used by `CoachPersonaAvatar` (circular avatar). */
  avatarCrop?: CoachImageCrop;
}

// Crop values were calibrated from a visual inspection of the source WebPs:
// every persona has the face in the upper third of the 1024×1024 frame, so
// `contentPosition: 'top'` keeps the face visible when the asset is cropped
// to a vertical portrait. `motivational_energetic` has a wide ponytail that
// overflows the frame, so we slightly compress it. The hero renderer keeps
// its historical `'bottom'` positioning since it uses `contentFit: 'contain'`
// rather than `cover`, but we declare it explicitly so the data is the
// single source of truth for cropping.
const COACH_PERSONA_VISUALS: Record<CoachPersonaKey, CoachPersonaVisual> = {
  gentle_supportive: {
    imageSource: require('../assets/images/coach/gentle_supportive.webp'),
    fallbackLabel: 'NO',
    haloTint: '#7FA9D4',
    teaserPriority: 1,
    crop: { contentPosition: 'top' },
    heroCrop: { contentPosition: 'bottom' },
  },
  strict_tough: {
    imageSource: require('../assets/images/coach/strict_tough.webp'),
    fallbackLabel: 'AX',
    haloTint: '#8792A7',
    teaserPriority: 5,
    crop: { contentPosition: 'top' },
    heroCrop: { contentPosition: 'bottom' },
  },
  motivational_energetic: {
    imageSource: require('../assets/images/coach/motivational_energetic.webp'),
    fallbackLabel: 'LE',
    haloTint: '#76A9C8',
    teaserPriority: 2,
    // Le scale 0.95 reste utile pour les petits avatars circulaires où la
    // queue-de-cheval déborde latéralement. La carte portrait ("autres coachs")
    // doit en revanche remplir le frame comme les autres personas : elle utilise
    // donc son propre `cardCrop`, tandis que la hero reste calée en bas sans
    // scale custom.
    crop: { contentPosition: 'top', imageScale: 0.95 },
    cardCrop: { contentPosition: 'top', imageScale: 1.08 },
    heroCrop: { contentPosition: 'bottom' },
  },
  patient_calm: {
    imageSource: require('../assets/images/coach/patient_calm.webp'),
    fallbackLabel: 'MI',
    haloTint: '#72AFA8',
    teaserPriority: 4,
    crop: { contentPosition: 'top' },
    heroCrop: { contentPosition: 'bottom' },
  },
  analytical_precise: {
    imageSource: require('../assets/images/coach/analytical_precise.webp'),
    fallbackLabel: 'EL',
    haloTint: '#8D9EC8',
    teaserPriority: 3,
    crop: { contentPosition: 'top' },
    heroCrop: { contentPosition: 'bottom' },
  },
  playful_light: {
    imageSource: require('../assets/images/coach/playful_light.webp'),
    fallbackLabel: 'MO',
    haloTint: '#D98B86',
    teaserPriority: 6,
    crop: { contentPosition: 'top' },
    heroCrop: { contentPosition: 'bottom' },
  },
};

/**
 * Resolves the effective crop config for a given render context. Falls back
 * to the persona's default `crop`, and to an empty object if nothing is set
 * — letting the rendering component apply its own historical defaults.
 */
export function getCoachPersonaCrop(
  visual: CoachPersonaVisual,
  context: 'card' | 'avatar' | 'hero',
): CoachImageCrop {
  const override =
    context === 'card'
      ? visual.cardCrop
      : context === 'avatar'
        ? visual.avatarCrop
        : visual.heroCrop;
  return override ?? visual.crop ?? {};
}

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
