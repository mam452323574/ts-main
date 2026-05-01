import { Platform, ViewStyle } from 'react-native';
import {
  SHADOWS,
  SIZES,
  SPACING,
  ThemeColors,
  getAndroidLightSurface,
  mixColors,
  withAlpha,
} from '@/constants/theme';
import type { ResultSurfaceVariant } from '@/utils/resultVisualTheme';

export const RESULT_COMPACT_BREAKPOINT = 360;
export const RESULT_NARROW_BREAKPOINT = 336;
export const RESULT_TEXT_PROPS = {
  android_hyphenationFrequency: 'none' as const,
  lineBreakStrategyIOS: 'standard' as const,
  textBreakStrategy: 'simple' as const,
};

export const RESULT_SURFACE_RADII = {
  standard: 16,
  feature: 22,
  hero: 28,
} as const;

export type ResultSurfaceKind = keyof typeof RESULT_SURFACE_RADII;

export type ResultSurfaceChrome = ViewStyle;

export interface ResultLayoutState {
  isCompact: boolean;
  isNarrow: boolean;
  standardRadius: number;
  featureRadius: number;
  heroRadius: number;
  cardPadding: number;
  blockPadding: number;
  largeBlockPadding: number;
  contentGap: number;
  sectionGap: number;
  headerMinHeight: number;
  headerSlotSize: number;
  ctaMinHeight: number;
  ctaRadius: number;
  quickStatMinHeight: number;
  quickStatPaddingHorizontal: number;
  quickStatPaddingVertical: number;
  quickStatCardGap: number;
  quickStatTextGap: number;
  quickStatIconStrokeWidth: number;
  metricMinHeight: number;
  metricCardPaddingHorizontal: number;
  metricCardPaddingVertical: number;
  metricCardGap: number;
  metricCardTextGap: number;
  metricCardIconStrokeWidth: number;
  metricCardIconSize: number;
  metricCardIconGlyphSize: number;
  metricCardLabelFontSize: number;
  metricCardLabelLineHeight: number;
  metricCardValueFontSize: number;
  metricCardValueLineHeight: number;
  summaryMinHeight: number;
  headerTitleFontSize: number;
  headerTitleLineHeight: number;
  sectionTitleFontSize: number;
  sectionTitleLineHeight: number;
  heroTitleFontSize: number;
  heroTitleLineHeight: number;
  bodyTextFontSize: number;
  bodyTextLineHeight: number;
  emphasizedBodyLineHeight: number;
  quickStatIconSize: number;
  quickStatIconGlyphSize: number;
  quickStatLabelFontSize: number;
  quickStatLabelLineHeight: number;
  quickStatValueFontSize: number;
  quickStatValueLineHeight: number;
  typeIconSize: number;
  typeIconGlyphSize: number;
  scoreGaugeSize: number;
  gaugeValueFontSize: number;
  gaugeValueLineHeight: number;
  gaugeMaxFontSize: number;
  gaugeMaxLineHeight: number;
  heroScoreValueFontSize: number;
  heroScoreValueLineHeight: number;
  heroScoreSuffixFontSize: number;
  heroScoreSuffixLineHeight: number;
  heroBadgeFontSize: number;
  heroBadgeLineHeight: number;
  chartHeight: number;
  chartLockSize: number;
}

export function getResultScaledRadius(
  kind: ResultSurfaceKind,
  scale = 1,
) {
  return Math.round(RESULT_SURFACE_RADII[kind] * scale);
}

export function getResultSurfaceChrome(options: {
  colors: ThemeColors;
  isDark: boolean;
  kind: ResultSurfaceKind;
  accentColor?: string;
  surfaceVariant?: ResultSurfaceVariant;
}): ResultSurfaceChrome {
  const {
    colors,
    isDark,
    kind,
    accentColor = colors.primary,
    surfaceVariant = 'neutral',
  } = options;
  const isAndroidLight =
    Platform.OS === 'android' &&
    !isDark &&
    (kind !== 'standard' || surfaceVariant !== 'neutral');

  if (isAndroidLight) {
    const androidSurface = getAndroidLightSurface(colors, {
      accentColor,
      shadowColor: accentColor,
      backgroundAlpha:
        kind === 'hero'
          ? 0.1
          : surfaceVariant === 'emphasis'
            ? 0.09
            : kind === 'standard'
              ? 0.05
              : 0.06,
      borderAlpha:
        kind === 'hero'
          ? 0.18
          : surfaceVariant === 'emphasis'
            ? 0.18
            : kind === 'standard'
              ? 0.12
              : 0.14,
      overlayAlpha: kind === 'hero' ? 0.14 : 0.1,
      shadowOpacity: kind === 'hero' ? 0.14 : 0.1,
      shadowRadius: kind === 'hero' ? 20 : 18,
      shadowOffsetY: kind === 'hero' ? 10 : 8,
      elevation: kind === 'hero' ? 6 : 4,
    });

    return {
      backgroundColor: androidSurface.backgroundColor,
      borderColor: androidSurface.borderColor,
      ...androidSurface.shadowStyle,
    };
  }

  if (kind === 'standard') {
    if (surfaceVariant !== 'neutral') {
      const tintOpacity =
        surfaceVariant === 'emphasis'
          ? isDark
            ? 0.18
            : 0.1
          : isDark
            ? 0.11
            : 0.05;
      const borderOpacity =
        surfaceVariant === 'emphasis'
          ? isDark
            ? 0.32
            : 0.18
          : isDark
            ? 0.22
            : 0.12;

      return {
        backgroundColor: mixColors(colors.cardBackground, accentColor, tintOpacity),
        borderColor: withAlpha(accentColor, borderOpacity),
        ...SHADOWS.card,
      };
    }

    return {
      backgroundColor: colors.cardBackground,
      borderColor: isDark
        ? withAlpha(colors.white, 0.08)
        : withAlpha(colors.primaryText, 0.06),
      ...SHADOWS.card,
    };
  }

  const tintOpacity = kind === 'hero' ? (isDark ? 0.15 : 0.08) : isDark ? 0.1 : 0.05;
  const borderOpacity = kind === 'hero' ? (isDark ? 0.28 : 0.18) : isDark ? 0.18 : 0.12;

  return {
    backgroundColor: isDark
      ? mixColors(colors.cardBackground, accentColor, tintOpacity)
      : mixColors(colors.cardBackground, accentColor, tintOpacity),
    borderColor: withAlpha(accentColor, borderOpacity),
    ...(kind === 'hero' ? SHADOWS.cardHover : SHADOWS.card),
  };
}

export function getResultLayoutState(width: number): ResultLayoutState {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : RESULT_COMPACT_BREAKPOINT + 1;
  const isCompact = safeWidth <= RESULT_COMPACT_BREAKPOINT;
  const isNarrow = safeWidth <= RESULT_NARROW_BREAKPOINT;

  return {
    isCompact,
    isNarrow,
    standardRadius: RESULT_SURFACE_RADII.standard,
    featureRadius: RESULT_SURFACE_RADII.feature,
    heroRadius: RESULT_SURFACE_RADII.hero,
    cardPadding: isCompact ? SPACING.sm + 2 : SPACING.md,
    blockPadding: isCompact ? SPACING.md : SPACING.lg,
    largeBlockPadding: isNarrow ? SPACING.md : isCompact ? SPACING.lg : SPACING.xl,
    contentGap: isCompact ? SPACING.md : SPACING.lg,
    sectionGap: isCompact ? SPACING.sm + 2 : SPACING.md,
    headerMinHeight: 56,
    headerSlotSize: 44,
    ctaMinHeight: 54,
    ctaRadius: 18,
    quickStatMinHeight: isNarrow ? 94 : isCompact ? 100 : 104,
    quickStatPaddingHorizontal: isNarrow ? 10 : 12,
    quickStatPaddingVertical: isNarrow ? 7 : isCompact ? 8 : 8,
    quickStatCardGap: isNarrow ? 7 : isCompact ? 8 : 9,
    quickStatTextGap: isNarrow ? 1 : 2,
    quickStatIconStrokeWidth: 2.2,
    metricMinHeight: isNarrow ? 68 : isCompact ? 72 : 74,
    metricCardPaddingHorizontal: isCompact ? 12 : 14,
    metricCardPaddingVertical: isNarrow ? 6 : 7,
    metricCardGap: isNarrow ? 8 : isCompact ? 9 : 10,
    metricCardTextGap: isNarrow ? 1 : 2,
    metricCardIconStrokeWidth: 2.15,
    metricCardIconSize: isNarrow ? 52 : isCompact ? 54 : 56,
    metricCardIconGlyphSize: isNarrow ? 27 : isCompact ? 28 : 30,
    metricCardLabelFontSize: 14,
    metricCardLabelLineHeight: 17,
    metricCardValueFontSize: isCompact ? 17 : 18,
    metricCardValueLineHeight: isCompact ? 21 : 22,
    summaryMinHeight: isCompact ? 120 : 132,
    headerTitleFontSize: isCompact ? SIZES.md : SIZES.lg,
    headerTitleLineHeight: isCompact ? 22 : 24,
    sectionTitleFontSize: isCompact ? SIZES.md : SIZES.lg,
    sectionTitleLineHeight: isCompact ? 22 : 24,
    heroTitleFontSize: isNarrow ? SIZES.md : isCompact ? SIZES.lg : SIZES.xl,
    heroTitleLineHeight: isNarrow ? 22 : isCompact ? 24 : 28,
    bodyTextFontSize: isCompact ? SIZES.sm : SIZES.md,
    bodyTextLineHeight: isCompact ? 20 : 22,
    emphasizedBodyLineHeight: isCompact ? 22 : 24,
    quickStatIconSize: isNarrow ? 46 : isCompact ? 50 : 54,
    quickStatIconGlyphSize: isNarrow ? 25 : isCompact ? 27 : 30,
    quickStatLabelFontSize: isCompact ? 12 : 13,
    quickStatLabelLineHeight: 15,
    quickStatValueFontSize: isCompact ? 16 : 18,
    quickStatValueLineHeight: isCompact ? 20 : 22,
    typeIconSize: isCompact ? 56 : 60,
    typeIconGlyphSize: isCompact ? 28 : 30,
    scoreGaugeSize: isNarrow ? 146 : isCompact ? 152 : 160,
    gaugeValueFontSize: isNarrow ? 40 : isCompact ? 43 : 46,
    gaugeValueLineHeight: isNarrow ? 44 : isCompact ? 47 : 50,
    gaugeMaxFontSize: isCompact ? SIZES.md : SIZES.lg,
    gaugeMaxLineHeight: isCompact ? 22 : 24,
    heroScoreValueFontSize: isNarrow ? 44 : isCompact ? 47 : 50,
    heroScoreValueLineHeight: isNarrow ? 48 : isCompact ? 51 : 54,
    heroScoreSuffixFontSize: isCompact ? SIZES.md : SIZES.lg,
    heroScoreSuffixLineHeight: isCompact ? 22 : 24,
    heroBadgeFontSize: SIZES.xs,
    heroBadgeLineHeight: isCompact ? 15 : 16,
    chartHeight: isCompact ? 156 : 170,
    chartLockSize: isCompact ? 64 : 72,
  };
}
