import {
  getOnboardingPromoAsset,
  ONBOARDING_PROMO_ASSET_ASPECT_RATIO,
  type OnboardingPromoSlideKey,
  type OnboardingPromoThemeVariant,
} from '@/constants/onboardingPromoAssets';
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

  it('matches the final 9:16 hero aspect ratio', () => {
    expect(ONBOARDING_PROMO_ASSET_ASPECT_RATIO).toBeCloseTo(9 / 16);
  });

  it('uses WebP hero assets for the app-loaded promo images', () => {
    const manifestSource = fs.readFileSync(
      path.join(__dirname, '../../constants/onboardingPromoAssets.ts'),
      'utf8',
    );

    expect(manifestSource).toContain('hero.webp');
    expect(manifestSource).not.toContain('hero.png');
  });
});
