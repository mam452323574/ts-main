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
  analytics: require('../assets/onboarding/light/analytics/hero.png'),
  coach: require('../assets/onboarding/light/coach/hero.png'),
  fridge: require('../assets/onboarding/light/fridge/hero.png'),
  scanner: require('../assets/onboarding/light/scanner/hero.png'),
  social: require('../assets/onboarding/light/social/hero.png'),
};

const DARK_HERO_ASSETS: OnboardingPromoThemeAssets = {
  analytics: require('../assets/onboarding/dark/analytics/hero.png'),
  coach: require('../assets/onboarding/dark/coach/hero.png'),
  fridge: require('../assets/onboarding/dark/fridge/hero.png'),
  scanner: require('../assets/onboarding/dark/scanner/hero.png'),
  social: require('../assets/onboarding/dark/social/hero.png'),
};

const ONBOARDING_PROMO_ASSETS: Record<
  OnboardingPromoThemeVariant,
  OnboardingPromoThemeAssets
> = {
  light: LIGHT_HERO_ASSETS,
  dark: DARK_HERO_ASSETS,
};

export const ONBOARDING_PROMO_ASSET_ASPECT_RATIO = 9 / 16;

export function getOnboardingPromoAsset(
  themeVariant: OnboardingPromoThemeVariant,
  slide: OnboardingPromoSlideKey,
): ImageSourcePropType | null {
  return ONBOARDING_PROMO_ASSETS[themeVariant][slide] ?? null;
}
