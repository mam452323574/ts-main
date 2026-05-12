import type { ImageSourcePropType } from 'react-native';

import { SUPPORTED_LOCALES, type LocaleCode } from '@/i18n/config';

export type OnboardingPromoThemeVariant = 'light' | 'dark';
export type OnboardingPromoSlideKey =
  | 'scanner'
  | 'coach'
  | 'social'
  | 'analytics'
  | 'fridge';

type OnboardingPromoThemeAssets = Partial<
  Record<
    LocaleCode,
    Partial<Record<OnboardingPromoSlideKey, ImageSourcePropType>>
  >
>;

const LIGHT_HERO_ASSETS: Record<
  OnboardingPromoSlideKey,
  ImageSourcePropType
> = {
  analytics: require('../assets/onboarding/light/analytics/hero.png'),
  coach: require('../assets/onboarding/light/coach/hero.png'),
  fridge: require('../assets/onboarding/light/fridge/hero.png'),
  scanner: require('../assets/onboarding/light/scanner/hero.png'),
  social: require('../assets/onboarding/light/social/hero.png'),
};

const DARK_HERO_ASSETS: Record<OnboardingPromoSlideKey, ImageSourcePropType> = {
  analytics: require('../assets/onboarding/dark/analytics/hero.png'),
  coach: require('../assets/onboarding/dark/coach/hero.png'),
  fridge: require('../assets/onboarding/dark/fridge/hero.png'),
  scanner: require('../assets/onboarding/dark/scanner/hero.png'),
  social: require('../assets/onboarding/dark/social/hero.png'),
};

function createThemeAssets(
  assets: Record<OnboardingPromoSlideKey, ImageSourcePropType>,
): OnboardingPromoThemeAssets {
  return SUPPORTED_LOCALES.reduce<OnboardingPromoThemeAssets>(
    (themeAssets, locale) => {
      themeAssets[locale] = assets;
      return themeAssets;
    },
    {},
  );
}

const ONBOARDING_PROMO_ASSETS: Record<
  OnboardingPromoThemeVariant,
  OnboardingPromoThemeAssets
> = {
  light: createThemeAssets(LIGHT_HERO_ASSETS),
  dark: createThemeAssets(DARK_HERO_ASSETS),
};

export const ONBOARDING_PROMO_ASSET_ASPECT_RATIO = 9 / 16;

export function getOnboardingPromoAsset(
  themeVariant: OnboardingPromoThemeVariant,
  locale: LocaleCode,
  slide: OnboardingPromoSlideKey,
): ImageSourcePropType | null {
  return ONBOARDING_PROMO_ASSETS[themeVariant][locale]?.[slide] ?? null;
}
