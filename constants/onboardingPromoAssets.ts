import type { LocaleCode } from '@/i18n/config';
import type { ImageSourcePropType } from 'react-native';

export type OnboardingPromoThemeVariant = 'light' | 'dark';
export type OnboardingPromoSlideKey =
  | 'scanner'
  | 'coach'
  | 'social'
  | 'analytics'
  | 'fridge';

type OnboardingPromoThemeAssets = Record<
  OnboardingPromoSlideKey,
  ImageSourcePropType
>;

const LIGHT_HERO_ASSETS: Record<
  OnboardingPromoSlideKey,
  ImageSourcePropType
> = {
  analytics: require('../assets/onboarding/light/analytics/hero.webp'),
  coach: require('../assets/onboarding/light/coach/hero.webp'),
  fridge: require('../assets/onboarding/light/fridge/hero.webp'),
  scanner: require('../assets/onboarding/light/scanner/hero.webp'),
  social: require('../assets/onboarding/light/social/hero.webp'),
};

const DARK_HERO_ASSETS: OnboardingPromoThemeAssets = {
  analytics: require('../assets/onboarding/dark/analytics/hero.webp'),
  coach: require('../assets/onboarding/dark/coach/hero.webp'),
  fridge: require('../assets/onboarding/dark/fridge/hero.webp'),
  scanner: require('../assets/onboarding/dark/scanner/hero.webp'),
  social: require('../assets/onboarding/dark/social/hero.webp'),
};

const ONBOARDING_PROMO_ASSETS: Record<
  OnboardingPromoThemeVariant,
  OnboardingPromoThemeAssets
> = {
  light: LIGHT_HERO_ASSETS,
  dark: DARK_HERO_ASSETS,
};

const LOCALIZED_ASSETS: Record<
  OnboardingPromoThemeVariant,
  Record<
    OnboardingPromoSlideKey,
    Partial<Record<LocaleCode, ImageSourcePropType>>
  >
> = {
  light: {
    analytics: {
      fr: require('../assets/onboarding/light/analytics/fr.webp'),
      en: require('../assets/onboarding/light/analytics/en.webp'),
      de: require('../assets/onboarding/light/analytics/de.webp'),
      it: require('../assets/onboarding/light/analytics/it.webp'),
      es: require('../assets/onboarding/light/analytics/es.webp'),
      pt: require('../assets/onboarding/light/analytics/pt.webp'),
    },
    coach: {
      fr: require('../assets/onboarding/light/coach/fr.webp'),
      en: require('../assets/onboarding/light/coach/en.webp'),
      de: require('../assets/onboarding/light/coach/de.webp'),
      it: require('../assets/onboarding/light/coach/it.webp'),
      es: require('../assets/onboarding/light/coach/es.webp'),
      pt: require('../assets/onboarding/light/coach/pt.webp'),
    },
    fridge: {
      fr: require('../assets/onboarding/light/fridge/fr.webp'),
      en: require('../assets/onboarding/light/fridge/en.webp'),
      de: require('../assets/onboarding/light/fridge/de.webp'),
      it: require('../assets/onboarding/light/fridge/it.webp'),
      es: require('../assets/onboarding/light/fridge/es.webp'),
      pt: require('../assets/onboarding/light/fridge/pt.webp'),
    },
    scanner: {
      fr: require('../assets/onboarding/light/scanner/fr.webp'),
      en: require('../assets/onboarding/light/scanner/en.webp'),
      de: require('../assets/onboarding/light/scanner/de.webp'),
      it: require('../assets/onboarding/light/scanner/it.webp'),
      es: require('../assets/onboarding/light/scanner/es.webp'),
      pt: require('../assets/onboarding/light/scanner/pt.webp'),
    },
    social: {
      fr: require('../assets/onboarding/light/social/fr.webp'),
      en: require('../assets/onboarding/light/social/en.webp'),
      de: require('../assets/onboarding/light/social/de.webp'),
      it: require('../assets/onboarding/light/social/it.webp'),
      es: require('../assets/onboarding/light/social/es.webp'),
      pt: require('../assets/onboarding/light/social/pt.webp'),
    },
  },
  dark: {
    analytics: {
      fr: require('../assets/onboarding/dark/analytics/fr.webp'),
      en: require('../assets/onboarding/dark/analytics/en.webp'),
      de: require('../assets/onboarding/dark/analytics/de.webp'),
      it: require('../assets/onboarding/dark/analytics/it.webp'),
      es: require('../assets/onboarding/dark/analytics/es.webp'),
      pt: require('../assets/onboarding/dark/analytics/pt.webp'),
    },
    coach: {
      fr: require('../assets/onboarding/dark/coach/fr.webp'),
      en: require('../assets/onboarding/dark/coach/en.webp'),
      de: require('../assets/onboarding/dark/coach/de.webp'),
      it: require('../assets/onboarding/dark/coach/it.webp'),
      es: require('../assets/onboarding/dark/coach/es.webp'),
      pt: require('../assets/onboarding/dark/coach/pt.webp'),
    },
    fridge: {
      fr: require('../assets/onboarding/dark/fridge/fr.webp'),
      en: require('../assets/onboarding/dark/fridge/en.webp'),
      de: require('../assets/onboarding/dark/fridge/de.webp'),
      it: require('../assets/onboarding/dark/fridge/it.webp'),
      es: require('../assets/onboarding/dark/fridge/es.webp'),
      pt: require('../assets/onboarding/dark/fridge/pt.webp'),
    },
    scanner: {
      fr: require('../assets/onboarding/dark/scanner/fr.webp'),
      en: require('../assets/onboarding/dark/scanner/en.webp'),
      de: require('../assets/onboarding/dark/scanner/de.webp'),
      it: require('../assets/onboarding/dark/scanner/it.webp'),
      es: require('../assets/onboarding/dark/scanner/es.webp'),
      pt: require('../assets/onboarding/dark/scanner/pt.webp'),
    },
    social: {
      fr: require('../assets/onboarding/dark/social/fr.webp'),
      en: require('../assets/onboarding/dark/social/en.webp'),
      de: require('../assets/onboarding/dark/social/de.webp'),
      it: require('../assets/onboarding/dark/social/it.webp'),
      es: require('../assets/onboarding/dark/social/es.webp'),
      pt: require('../assets/onboarding/dark/social/pt.webp'),
    },
  },
};

export const ONBOARDING_PROMO_ASSET_ASPECT_RATIO = 9 / 16;

export function getOnboardingPromoAsset(
  themeVariant: OnboardingPromoThemeVariant,
  slide: OnboardingPromoSlideKey,
  locale?: LocaleCode,
): ImageSourcePropType | null {
  const localized = locale
    ? LOCALIZED_ASSETS[themeVariant][slide][locale]
    : undefined;

  return localized ?? ONBOARDING_PROMO_ASSETS[themeVariant][slide] ?? null;
}
