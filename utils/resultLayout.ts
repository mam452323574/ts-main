import { Platform, ViewStyle } from 'react-native';
import {
  SHADOWS,
  SIZES,
  SPACING,
  ThemeColors,
  getAndroidLightSurface,
  getObsidianSurface,
  getWellnessPremiumSurface,
  mixColors,
  withAlpha,
} from '@/constants/theme';
import type { ResultSurfaceVariant } from '@/utils/resultVisualTheme';

export const RESULT_COMPACT_BREAKPOINT = 360;
export const RESULT_NARROW_BREAKPOINT = 336;
export const RESULT_SINGLE_COLUMN_BREAKPOINT = 430;
export const RESULT_TEXT_PROPS = {
  android_hyphenationFrequency: 'none' as const,
  lineBreakStrategyIOS: 'none' as const,
  textBreakStrategy: 'simple' as const,
};

export const RESULT_SURFACE_RADII = {
  standard: 18,
  feature: 24,
  hero: 32,
} as const;

export type ResultSurfaceKind = keyof typeof RESULT_SURFACE_RADII;

export type ResultSurfaceChrome = ViewStyle;

export interface ResultLayoutState {
  isCompact: boolean;
  isNarrow: boolean;
  useSingleColumnResultCards: boolean;
  canSplitHero: boolean;
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

  if (surfaceVariant === 'wellnessPremium') {
    const editorialAccent = isDark
      ? mixColors(accentColor, colors.secondary ?? colors.primary, 0.24)
      : mixColors(accentColor, colors.white, 0.18);
    const wellnessSurface = getWellnessPremiumSurface(colors, isDark, {
      accentColor: editorialAccent,
      kind,
    });
    const editorialBase = isDark
      ? kind === 'hero'
        ? '#0B0E15'
        : '#10131B'
      : kind === 'hero'
        ? mixColors(colors.cardBackground, colors.white, 0.16)
        : mixColors(colors.cardBackground, colors.white, 0.08);
    const backgroundColor = isDark
      ? mixColors(editorialBase, editorialAccent, kind === 'hero' ? 0.045 : 0.028)
      : mixColors(editorialBase, editorialAccent, kind === 'hero' ? 0.028 : 0.016);
    const borderColor = withAlpha(
      editorialAccent,
      kind === 'hero'
        ? isDark
          ? 0.16
          : 0.09
        : isDark
          ? 0.09
          : 0.06,
    );

    return {
      backgroundColor,
      borderColor,
      ...wellnessSurface.shadowStyle,
    };
  }

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
          ? 0.06
          : surfaceVariant === 'emphasis'
            ? 0.055
            : kind === 'standard'
              ? 0.032
              : 0.038,
      borderAlpha:
        kind === 'hero'
          ? 0.1
          : surfaceVariant === 'emphasis'
            ? 0.1
            : kind === 'standard'
              ? 0.07
              : 0.075,
      overlayAlpha: kind === 'hero' ? 0.06 : 0.04,
      shadowOpacity: kind === 'hero' ? 0.08 : 0.055,
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

  if (isDark) {
    const intensity =
      kind === 'hero' ? 'premium' : surfaceVariant === 'neutral' ? 'raised' : 'glow';
    const surface = getObsidianSurface(colors, {
      accentColor,
      intensity,
      borderAlpha:
        kind === 'hero'
          ? 0.16
          : surfaceVariant === 'emphasis'
            ? 0.14
            : kind === 'standard'
              ? 0.06
              : 0.095,
      backgroundAlpha:
        kind === 'hero'
          ? 0.055
          : surfaceVariant === 'emphasis'
            ? 0.048
            : kind === 'standard'
              ? 0.022
              : 0.034,
      shadowOpacity: kind === 'hero' ? 0.13 : 0.08,
      shadowRadius: kind === 'hero' ? 28 : 22,
      shadowOffsetY: kind === 'hero' ? 12 : 9,
      elevation: kind === 'hero' ? 5 : 3,
    });

    return {
      backgroundColor:
        kind === 'standard' && surfaceVariant === 'neutral'
          ? colors.surfaceElevated ?? colors.cardBackground
          : surface.backgroundColor,
      borderColor:
        kind === 'standard' && surfaceVariant === 'neutral'
          ? colors.borderSubtle ?? withAlpha(colors.white, 0.08)
          : surface.borderColor,
      ...surface.shadowStyle,
    };
  }

  if (kind === 'standard') {
    if (surfaceVariant !== 'neutral') {
      const tintOpacity =
        surfaceVariant === 'emphasis'
          ? isDark
            ? 0.075
            : 0.04
          : isDark
            ? 0.045
            : 0.022;
      const borderOpacity =
        surfaceVariant === 'emphasis'
          ? isDark
            ? 0.16
            : 0.1
          : isDark
            ? 0.1
            : 0.06;

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

  const tintOpacity = kind === 'hero' ? (isDark ? 0.06 : 0.035) : isDark ? 0.038 : 0.022;
  const borderOpacity = kind === 'hero' ? (isDark ? 0.16 : 0.1) : isDark ? 0.095 : 0.06;

  return {
    backgroundColor: isDark
      ? mixColors(colors.cardBackground, accentColor, tintOpacity)
      : mixColors(colors.cardBackground, accentColor, tintOpacity),
    borderColor: withAlpha(accentColor, borderOpacity),
    ...(kind === 'hero' ? SHADOWS.cardHover : SHADOWS.card),
  };
}

export function getResultScreenGradient(options: {
  colors: ThemeColors;
  isDark: boolean;
  accentColor?: string;
}): [string, string, string] {
  const { colors, isDark, accentColor = colors.primary } = options;
  const elevatedSurface = colors.surfaceElevated ?? colors.cardBackground;
  const mutedSurface = colors.surfaceMuted ?? colors.cardBackground;
  const resolvedAccent = isDark
    ? mixColors(accentColor, colors.secondary ?? colors.primary, 0.08)
    : mixColors(accentColor, colors.primaryText, 0.035);

  return isDark
    ? [
        mixColors(
          mixColors(colors.background, elevatedSurface, 0.42),
          resolvedAccent,
          0.022,
        ),
        mixColors(
          mixColors(colors.background, colors.cardBackground, 0.34),
          resolvedAccent,
          0.014,
        ),
        mixColors(colors.background, mutedSurface, 0.12),
      ]
    : [
        mixColors(
          mixColors(colors.background, colors.cardBackground, 0.42),
          resolvedAccent,
          0.012,
        ),
        mixColors(
          mixColors(colors.background, mutedSurface, 0.2),
          resolvedAccent,
          0.01,
        ),
        mixColors(colors.background, colors.cardBackground, 0.16),
      ];
}

export function getResultLayoutState(width: number): ResultLayoutState {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : RESULT_COMPACT_BREAKPOINT + 1;
  const isCompact = safeWidth <= RESULT_COMPACT_BREAKPOINT;
  const isNarrow = safeWidth <= RESULT_NARROW_BREAKPOINT;
  const useSingleColumnResultCards = safeWidth <= RESULT_SINGLE_COLUMN_BREAKPOINT;
  const canSplitHero = safeWidth > RESULT_SINGLE_COLUMN_BREAKPOINT;

  return {
    isCompact,
    isNarrow,
    useSingleColumnResultCards,
    canSplitHero,
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
    ctaRadius: 20,
    quickStatMinHeight: isNarrow ? 100 : isCompact ? 104 : 112,
    quickStatPaddingHorizontal: isNarrow ? 12 : isCompact ? 13 : 14,
    quickStatPaddingVertical: isNarrow ? 8 : isCompact ? 9 : 10,
    quickStatCardGap: isNarrow ? 8 : isCompact ? 9 : 10,
    quickStatTextGap: isNarrow ? 2 : 3,
    quickStatIconStrokeWidth: 2.2,
    metricMinHeight: isNarrow ? 72 : isCompact ? 78 : 84,
    metricCardPaddingHorizontal: isCompact ? 13 : 15,
    metricCardPaddingVertical: isNarrow ? 7 : isCompact ? 8 : 9,
    metricCardGap: isNarrow ? 8 : isCompact ? 9 : 11,
    metricCardTextGap: isNarrow ? 2 : 3,
    metricCardIconStrokeWidth: 2.15,
    metricCardIconSize: isNarrow ? 52 : isCompact ? 56 : 60,
    metricCardIconGlyphSize: isNarrow ? 27 : isCompact ? 29 : 32,
    metricCardLabelFontSize: 13,
    metricCardLabelLineHeight: 16,
    metricCardValueFontSize: isCompact ? 18 : 20,
    metricCardValueLineHeight: isCompact ? 22 : 24,
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
    quickStatIconSize: isNarrow ? 48 : isCompact ? 52 : 58,
    quickStatIconGlyphSize: isNarrow ? 26 : isCompact ? 29 : 32,
    quickStatLabelFontSize: 12,
    quickStatLabelLineHeight: isCompact ? 14 : 15,
    quickStatValueFontSize: isCompact ? 17 : 20,
    quickStatValueLineHeight: isCompact ? 21 : 24,
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
    heroBadgeFontSize: 11,
    heroBadgeLineHeight: isCompact ? 14 : 15,
    chartHeight: isCompact ? 156 : 170,
    chartLockSize: isCompact ? 64 : 72,
  };
}
