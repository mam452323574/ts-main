import { DARK_COLORS, LIGHT_COLORS, mixColors } from '@/constants/theme';
import {
  resolveFatDistributionDominantMetricId,
  resolveFatDistributionSuperScanPalette,
  resolveLegacySuperScanPalette,
  resolveSuperScanAreaTheme,
} from '@/utils/superScanVisualTheme';

describe('super scan visual theme', () => {
  const colors = LIGHT_COLORS;

  it('prioritizes urgency over low-risk legacy scores', () => {
    const palette = resolveLegacySuperScanPalette({
      colors,
      isDark: false,
      globalRiskScore: 18,
      urgencyFlag: true,
    });

    expect(palette.key).toBe('danger');
  });

  it('maps legacy score thresholds to caution and recovery palettes', () => {
    const cautionPalette = resolveLegacySuperScanPalette({
      colors,
      isDark: false,
      globalRiskScore: 62,
      urgencyFlag: false,
    });
    const recoveryPalette = resolveLegacySuperScanPalette({
      colors,
      isDark: false,
      globalRiskScore: 31,
      urgencyFlag: false,
    });

    expect(cautionPalette.key).toBe('caution');
    expect(recoveryPalette.key).toBe('recovery');
  });

  it('detects the dominant fat metric and falls back to default on ties', () => {
    expect(
      resolveFatDistributionDominantMetricId({
        bodyFat: 24.6,
        facialFat: 18,
        waterRetention: 11,
      }),
    ).toBe('body_fat');
    expect(
      resolveFatDistributionDominantMetricId({
        bodyFat: 16,
        facialFat: 16,
        waterRetention: 12,
      }),
    ).toBeNull();
  });

  it('maps dominant fat metrics to semantic screen palettes', () => {
    const aquaPalette = resolveFatDistributionSuperScanPalette({
      colors,
      isDark: false,
      bodyFat: 12,
      facialFat: 9,
      waterRetention: 19,
    });
    const sculptPalette = resolveFatDistributionSuperScanPalette({
      colors,
      isDark: false,
      bodyFat: 13,
      facialFat: 17,
      waterRetention: 8,
    });
    const fallbackPalette = resolveFatDistributionSuperScanPalette({
      colors,
      isDark: false,
      bodyFat: null,
      facialFat: null,
      waterRetention: null,
    });

    expect(aquaPalette.key).toBe('aqua');
    expect(sculptPalette.key).toBe('sculpt');
    expect(fallbackPalette.key).toBe('default');
  });

  it('anchors legacy palettes on neutral premium surfaces instead of a gold wash', () => {
    const palette = resolveLegacySuperScanPalette({
      colors,
      isDark: false,
      globalRiskScore: 62,
      urgencyFlag: false,
    });

    expect(palette.sectionSurfaceVariant).toBe('neutral');
    expect(palette.backgroundGradient[0]).not.toBe(
      mixColors(colors.background, colors.gold, 0.28),
    );
    expect(palette.heroGradient[0]).not.toBe(
      mixColors(colors.cardBackground, colors.gold, 0.16),
    );
    expect(palette.shareBackgroundColor).not.toBe(
      mixColors(colors.cardBackground, colors.gold, 0.05),
    );
    expect(palette.heroIconColor).not.toBe(colors.gold);
  });

  it('keeps dark-mode premium palettes controlled and avoids warm-tinting all surfaces', () => {
    const palette = resolveLegacySuperScanPalette({
      colors: DARK_COLORS,
      isDark: true,
      globalRiskScore: 84,
      urgencyFlag: true,
    });

    expect(palette.backgroundGradient[0]).not.toBe(
      mixColors(DARK_COLORS.background, DARK_COLORS.gold, 0.16),
    );
    expect(palette.heroGradient[0]).not.toBe(
      mixColors(DARK_COLORS.cardBackground, DARK_COLORS.gold, 0.22),
    );
    expect(palette.sectionBackgroundColor).not.toBe(
      mixColors(DARK_COLORS.cardBackground, palette.accentColor, 0.1),
    );
    expect(palette.secondarySurfaceBackgroundColor).not.toBe(
      mixColors(DARK_COLORS.cardBackground, DARK_COLORS.gold, 0.1),
    );
  });

  it('detects zone palettes from dominant type text before local metric fallback', () => {
    const waterTheme = resolveSuperScanAreaTheme({
      colors,
      isDark: false,
      area: {
        dominantType: 'Retencion moderada de agua',
        subcutaneousFatPercent: '31%',
        waterRetentionPercent: '12%',
        definitionPercent: '44%',
      },
    });
    const contourTheme = resolveSuperScanAreaTheme({
      colors,
      isDark: false,
      area: {
        dominantType: 'Subcutanea',
        subcutaneousFatPercent: '20%',
        waterRetentionPercent: '18%',
        definitionPercent: '39%',
      },
    });

    expect(waterTheme.key).toBe('aqua');
    expect(waterTheme.highlightMetricKey).toBe('definition');
    expect(contourTheme.key).toBe('contour');
    expect(contourTheme.highlightMetricKey).toBe('definition');
  });

  it('falls back to the local dominant metric and then the screen palette for areas', () => {
    const metricDrivenTheme = resolveSuperScanAreaTheme({
      colors,
      isDark: false,
      area: {
        dominantType: '',
        subcutaneousFatPercent: '14%',
        waterRetentionPercent: '11%',
        definitionPercent: '52%',
      },
    });
    const screenPalette = resolveFatDistributionSuperScanPalette({
      colors,
      isDark: false,
      bodyFat: 12,
      facialFat: 9,
      waterRetention: 19,
    });
    const fallbackTheme = resolveSuperScanAreaTheme({
      colors,
      isDark: false,
      area: {
        dominantType: '',
        subcutaneousFatPercent: null,
        waterRetentionPercent: null,
        definitionPercent: null,
      },
      screenPalette,
    });

    expect(metricDrivenTheme.key).toBe('sculpt');
    expect(metricDrivenTheme.highlightMetricKey).toBe('definition');
    expect(fallbackTheme.key).toBe('aqua');
  });
});
