import { DARK_COLORS, LIGHT_COLORS, mixColors, withAlpha } from '@/constants/theme';
import { resolveResultItemTheme } from '@/utils/resultVisualTheme';

describe('result visual theme accents', () => {
  it('uses soft light result fills and borders for emphasized metrics', () => {
    const theme = resolveResultItemTheme({
      colors: LIGHT_COLORS,
      isDark: false,
      theme: {
        tone: 'blue',
        surfaceVariant: 'emphasis',
        valueAccent: 'strong',
        iconAccent: 'strong',
      },
    });

    expect(theme.cardBackgroundColor).toBe(
      mixColors(LIGHT_COLORS.cardBackground, theme.accentColor, 0.04),
    );
    expect(theme.cardBorderColor).toBe(withAlpha(theme.accentColor, 0.1));
    expect(theme.iconSurfaceColor).toBe(withAlpha(theme.accentColor, 0.08));
    expect(theme.iconBorderColor).toBe(withAlpha(theme.accentColor, 0.13));
  });

  it('keeps dark soft metric accents secondary to the card surface', () => {
    const theme = resolveResultItemTheme({
      colors: DARK_COLORS,
      isDark: true,
      theme: {
        tone: 'emerald',
        surfaceVariant: 'soft',
        valueAccent: 'soft',
        iconAccent: 'soft',
      },
    });

    expect(theme.accentColor).not.toBe(DARK_COLORS.accentGreen);
    expect(theme.cardBackgroundColor).toBe(
      mixColors(DARK_COLORS.cardBackground, theme.accentColor, 0.045),
    );
    expect(theme.cardBorderColor).toBe(withAlpha(theme.accentColor, 0.1));
    expect(theme.iconSurfaceColor).toBe(withAlpha(theme.accentColor, 0.1));
  });
});
