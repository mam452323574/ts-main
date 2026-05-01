export const COACH_DEFAULT_DISCLAIMER_BY_LOCALE = {
  en: 'Wellness guidance only. This is not a diagnosis or medical advice.',
  fr: "Conseil bien-etre uniquement. Ceci ne remplace ni un diagnostic ni un avis medical.",
  de: 'Nur Wellness-Hinweise. Das ist weder eine Diagnose noch ein medizinischer Rat.',
  it: 'Indicazioni di benessere soltanto. Non e una diagnosi ne un consiglio medico.',
  es: 'Orientacion de bienestar unicamente. No es un diagnostico ni un consejo medico.',
  pt: 'Orientacao de bem-estar apenas. Isto nao e um diagnostico nem um conselho medico.',
} as const;

export type CoachCopyLocale =
  keyof typeof COACH_DEFAULT_DISCLAIMER_BY_LOCALE;

export const DEFAULT_COACH_DISCLAIMER =
  COACH_DEFAULT_DISCLAIMER_BY_LOCALE.en;

export function normalizeCoachCopyLocale(
  locale?: string | null,
): CoachCopyLocale {
  const normalized = locale?.trim().slice(0, 2).toLowerCase();

  if (
    normalized &&
    Object.prototype.hasOwnProperty.call(
      COACH_DEFAULT_DISCLAIMER_BY_LOCALE,
      normalized,
    )
  ) {
    return normalized as CoachCopyLocale;
  }

  return 'en';
}

export function getDefaultCoachDisclaimer(locale?: string | null) {
  return COACH_DEFAULT_DISCLAIMER_BY_LOCALE[normalizeCoachCopyLocale(locale)];
}

export function isDefaultCoachDisclaimer(
  disclaimer?: string | null,
): boolean {
  const normalizedDisclaimer = disclaimer?.trim();

  if (!normalizedDisclaimer) {
    return false;
  }

  return Object.values(COACH_DEFAULT_DISCLAIMER_BY_LOCALE).some(
    (candidate) => candidate === normalizedDisclaimer,
  );
}
