import {
  getOnboardingPromoAsset,
  ONBOARDING_PROMO_ASSET_ASPECT_RATIO,
  type OnboardingPromoSlideKey,
  type OnboardingPromoThemeVariant,
} from '@/constants/onboardingPromoAssets';
import { SUPPORTED_LOCALES } from '@/i18n/config';

const SLIDES: OnboardingPromoSlideKey[] = [
  'scanner',
  'coach',
  'social',
  'analytics',
  'fridge',
];

const THEMES: OnboardingPromoThemeVariant[] = ['light', 'dark'];

describe('onboarding promo asset manifest', () => {
  it.each(THEMES)(
    'returns one shared %s hero asset per slide for every locale',
    (theme) => {
      SLIDES.forEach((slide) => {
        const referenceAsset = getOnboardingPromoAsset(
          theme,
          SUPPORTED_LOCALES[0],
          slide,
        );

        expect(referenceAsset).toBeTruthy();

        SUPPORTED_LOCALES.forEach((locale) => {
          expect(getOnboardingPromoAsset(theme, locale, slide)).toBe(
            referenceAsset,
          );
        });
      });
    },
  );

  it('matches the final 9:16 hero aspect ratio', () => {
    expect(ONBOARDING_PROMO_ASSET_ASPECT_RATIO).toBeCloseTo(9 / 16);
  });
});
