import {
  getCoachPersona,
  isCoachPersonaKey,
  type CoachPersonaKey,
} from '@/shared/coachPersonas';
import {
  getCoachPersonaVisual,
  type CoachPersonaVisual,
} from '@/shared/coachPersonaVisuals';
import type { CoachEntry } from '@/types';

const NEUTRAL_COACH_FALLBACK_LABEL = 'C';
const NEUTRAL_COACH_HALO_TINT = '#94A3B8';

export interface CoachPersonaPresentation {
  kind: 'persona' | 'neutral';
  personaKey: CoachPersonaKey | null;
  titleTranslationKey:
    | `coach.personas.${CoachPersonaKey}.title`
    | 'coach.persona_unknown_title';
  avatarSource?: CoachPersonaVisual['imageSource'];
  avatarFallbackLabel: string;
  avatarHaloTint: string;
}

type CoachEntryPersonaLike = Pick<CoachEntry, 'persona_key' | 'has_valid_persona'>;

export function resolveCoachPersonaPresentation(
  personaKey: unknown,
): CoachPersonaPresentation {
  if (isCoachPersonaKey(personaKey)) {
    const persona = getCoachPersona(personaKey);
    const personaVisual = getCoachPersonaVisual(personaKey);

    return {
      kind: 'persona',
      personaKey,
      titleTranslationKey: persona.titleTranslationKey,
      avatarSource: personaVisual.imageSource,
      avatarFallbackLabel: personaVisual.fallbackLabel,
      avatarHaloTint: personaVisual.haloTint,
    };
  }

  return {
    kind: 'neutral',
    personaKey: null,
    titleTranslationKey: 'coach.persona_unknown_title',
    avatarSource: undefined,
    avatarFallbackLabel: NEUTRAL_COACH_FALLBACK_LABEL,
    avatarHaloTint: NEUTRAL_COACH_HALO_TINT,
  };
}

export function resolveCoachEntryPersonaPresentation(
  entry: CoachEntryPersonaLike | null | undefined,
): CoachPersonaPresentation {
  const hasValidPersona =
    typeof entry?.has_valid_persona === 'boolean'
      ? entry.has_valid_persona
      : isCoachPersonaKey(entry?.persona_key);

  if (!hasValidPersona) {
    return resolveCoachPersonaPresentation(null);
  }

  return resolveCoachPersonaPresentation(entry?.persona_key);
}
