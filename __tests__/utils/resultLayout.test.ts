import {
  DARK_COLORS,
  LIGHT_COLORS,
  mixColors,
  softenAccentColor,
  withAlpha,
} from '@/constants/theme';
import {
  RESULT_TEXT_PROPS,
  getResultLayoutState,
  getResultScreenGradient,
  getResultSurfaceChrome,
} from '@/utils/resultLayout';

describe('result layout surfaces', () => {
  it('uses single-column result cards through mobile widths', () => {
    expect(getResultLayoutState(320)).toMatchObject({
      useSingleColumnResultCards: true,
      canSplitHero: false,
    });
    expect(getResultLayoutState(430)).toMatchObject({
      useSingleColumnResultCards: true,
      canSplitHero: false,
    });
    expect(getResultLayoutState(431)).toMatchObject({
      useSingleColumnResultCards: false,
      canSplitHero: true,
    });
  });

  it('keeps result text from using aggressive word breaking', () => {
    expect(RESULT_TEXT_PROPS).toMatchObject({
      android_hyphenationFrequency: 'none',
      lineBreakStrategyIOS: 'none',
      textBreakStrategy: 'simple',
    });
  });

  it('keeps the light wellness premium hero surface away from a gold wash', () => {
    const chrome = getResultSurfaceChrome({
      colors: LIGHT_COLORS,
      isDark: false,
      kind: 'hero',
      accentColor: LIGHT_COLORS.primary,
      surfaceVariant: 'wellnessPremium',
    });

    expect(chrome.backgroundColor).not.toBe(
      mixColors(LIGHT_COLORS.cardBackground, LIGHT_COLORS.gold, 0.18),
    );
    expect(chrome.backgroundColor).not.toBe(
      mixColors(LIGHT_COLORS.cardBackground, LIGHT_COLORS.goldLight, 0.28),
    );
  });

  it('keeps the dark wellness premium hero surface cool and controlled', () => {
    const chrome = getResultSurfaceChrome({
      colors: DARK_COLORS,
      isDark: true,
      kind: 'hero',
      accentColor: DARK_COLORS.primary,
      surfaceVariant: 'wellnessPremium',
    });

    expect(chrome.backgroundColor).not.toBe(
      mixColors(DARK_COLORS.cardBackground, DARK_COLORS.gold, 0.2),
    );
    expect(chrome.borderColor).not.toBe(DARK_COLORS.gold);
  });

  it('uses controlled soft and emphasis alphas for standard result cards', () => {
    const soft = getResultSurfaceChrome({
      colors: LIGHT_COLORS,
      isDark: false,
      kind: 'standard',
      accentColor: LIGHT_COLORS.primary,
      surfaceVariant: 'soft',
    });
    const emphasisDark = getResultSurfaceChrome({
      colors: DARK_COLORS,
      isDark: true,
      kind: 'standard',
      accentColor: DARK_COLORS.primary,
      surfaceVariant: 'emphasis',
    });

    expect(soft.backgroundColor).toBe(
      mixColors(LIGHT_COLORS.cardBackground, LIGHT_COLORS.primary, 0.022),
    );
    expect(soft.borderColor).toBe(withAlpha(LIGHT_COLORS.primary, 0.06));
    expect(emphasisDark.borderColor).toBe(
      withAlpha(softenAccentColor(DARK_COLORS, true, DARK_COLORS.primary), 0.14),
    );
  });

  it('builds a continuous screen gradient with only a subtle scan accent', () => {
    const lightGradient = getResultScreenGradient({
      colors: LIGHT_COLORS,
      isDark: false,
      accentColor: LIGHT_COLORS.warning,
    });
    const darkGradient = getResultScreenGradient({
      colors: DARK_COLORS,
      isDark: true,
      accentColor: DARK_COLORS.error,
    });

    expect(lightGradient).toEqual([
      mixColors(
        mixColors(LIGHT_COLORS.background, LIGHT_COLORS.cardBackground, 0.42),
        mixColors(LIGHT_COLORS.warning, LIGHT_COLORS.primaryText, 0.035),
        0.012,
      ),
      mixColors(
        mixColors(LIGHT_COLORS.background, LIGHT_COLORS.surfaceMuted, 0.2),
        mixColors(LIGHT_COLORS.warning, LIGHT_COLORS.primaryText, 0.035),
        0.01,
      ),
      mixColors(LIGHT_COLORS.background, LIGHT_COLORS.cardBackground, 0.16),
    ]);
    expect(darkGradient).toEqual([
      mixColors(
        mixColors(DARK_COLORS.background, DARK_COLORS.surfaceElevated, 0.42),
        mixColors(DARK_COLORS.error, DARK_COLORS.secondary, 0.08),
        0.022,
      ),
      mixColors(
        mixColors(DARK_COLORS.background, DARK_COLORS.cardBackground, 0.34),
        mixColors(DARK_COLORS.error, DARK_COLORS.secondary, 0.08),
        0.014,
      ),
      mixColors(DARK_COLORS.background, DARK_COLORS.surfaceMuted, 0.12),
    ]);
  });
});
