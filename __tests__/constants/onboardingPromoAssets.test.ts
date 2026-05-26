import {
  getOnboardingPromoAsset,
  ONBOARDING_PROMO_ASSET_ASPECT_RATIO,
  type OnboardingPromoSlideKey,
  type OnboardingPromoThemeVariant,
} from '@/constants/onboardingPromoAssets';
import { SUPPORTED_LOCALES } from '@/i18n/config';
import * as fs from 'fs';
import * as path from 'path';

const SLIDES: OnboardingPromoSlideKey[] = [
  'scanner',
  'analytics',
  'coach',
  'social',
  'fridge',
];

const THEMES: OnboardingPromoThemeVariant[] = ['light', 'dark'];

describe('onboarding promo asset manifest', () => {
  it.each(THEMES)(
    'returns one %s hero asset per slide',
    (theme) => {
      SLIDES.forEach((slide) => {
        expect(getOnboardingPromoAsset(theme, slide)).toBeTruthy();
      });
    },
  );

  it.each(THEMES)('returns localized %s assets distinct from hero fallbacks', (theme) => {
    SLIDES.forEach((slide) => {
      const fallback = getOnboardingPromoAsset(theme, slide);

      SUPPORTED_LOCALES.forEach((locale) => {
        const localized = getOnboardingPromoAsset(theme, slide, locale);

        expect(localized).toBeTruthy();
        expect(localized).not.toBe(fallback);
      });
    });
  });

  it('matches the final 9:16 hero aspect ratio', () => {
    expect(ONBOARDING_PROMO_ASSET_ASPECT_RATIO).toBeCloseTo(9 / 16);
  });

  it('uses WebP assets only for app-loaded onboarding promo images', () => {
    const manifestSource = fs.readFileSync(
      path.join(__dirname, '../../constants/onboardingPromoAssets.ts'),
      'utf8',
    );

    expect(manifestSource).toContain('hero.webp');
    SUPPORTED_LOCALES.forEach((locale) => {
      expect(manifestSource).toContain(`/${locale}.webp`);
    });
    expect(manifestSource).not.toContain('hero.png');
    expect(manifestSource).not.toMatch(/\/fr\.jpeg/);
    expect(manifestSource).not.toMatch(/\/(?:en|de|it|es|pt)\.png/);
  });
});
