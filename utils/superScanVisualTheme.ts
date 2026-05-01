import {
  ThemeColors,
  mixColors,
  withAlpha,
} from '@/constants/theme';
import { parseSafeNumber } from '@/utils/scanFormatters';
import type {
  ResultItemThemeSpec,
  ResultSurfaceVariant,
} from '@/utils/resultVisualTheme';

type SuperScanPaletteKey =
  | 'default'
  | 'danger'
  | 'caution'
  | 'recovery'
  | 'aqua'
  | 'contour'
  | 'sculpt';

type FatDistributionPrimaryMetricId =
  | 'body_fat'
  | 'facial_fat'
  | 'water_retention';

type SuperScanAreaHighlightMetric =
  | 'subcutaneousFat'
  | 'waterRetention'
  | 'definition';

export interface ResolvedSuperScanPalette {
  key: SuperScanPaletteKey;
  accentColor: string;
  accentColorSecondary: string;
  premiumWarmAccentColor: string;
  backgroundGradient: [string, string];
  heroGradient: [string, string];
  heroBorderColor: string;
  heroBadgeBackgroundColor: string;
  heroBadgeBorderColor: string;
  heroBadgeTextColor: string;
  heroIconBackgroundColor: string;
  heroIconBorderColor: string;
  heroIconColor: string;
  scoreColor: string;
  sectionAccentColor: string;
  sectionSurfaceVariant: ResultSurfaceVariant;
  sectionBackgroundColor: string;
  sectionBorderColor: string;
  chipBackgroundColor: string;
  chipBorderColor: string;
  chipTextColor: string;
  secondarySurfaceBackgroundColor: string;
  secondarySurfaceBorderColor: string;
  subtleBackgroundColor: string;
  subtleBorderColor: string;
  subtleTextColor: string;
  countBadgeBackgroundColor: string;
  countBadgeTextColor: string;
  shareBackgroundColor: string;
  shareBorderColor: string;
  shareIconColor: string;
  shareTextColor: string;
  disclaimerBackgroundColor: string;
  disclaimerBorderColor: string;
  disclaimerTextColor: string;
}

export interface ResolvedSuperScanAreaTheme {
  key: SuperScanPaletteKey;
  accentColor: string;
  cardBackgroundColor: string;
  cardBorderColor: string;
  dominantBadgeBackgroundColor: string;
  dominantBadgeBorderColor: string;
  dominantBadgeValueColor: string;
  chipBackgroundColor: string;
  chipBorderColor: string;
  chipTextColor: string;
  sectionBackgroundColor: string;
  sectionBorderColor: string;
  sectionLabelColor: string;
  highlightMetricKey: SuperScanAreaHighlightMetric;
  metricThemes: {
    subcutaneousFat: {
      backgroundColor: string;
      borderColor: string;
      valueColor: string;
    };
    waterRetention: {
      backgroundColor: string;
      borderColor: string;
      valueColor: string;
    };
    definition: {
      backgroundColor: string;
      borderColor: string;
      valueColor: string;
    };
    confidence: {
      backgroundColor: string;
      borderColor: string;
      valueColor: string;
    };
  };
}

const SUBCUTANEOUS_KEYWORDS = [
  'subcutaneous',
  'subcutanee',
  'subcutanea',
];

const WATER_KEYWORDS = [
  'water',
  'retention',
  'retencion',
  'edema',
];

const PREMIUM_NEUTRAL_DARK_BASE = '#10141D';
const PREMIUM_NEUTRAL_DARK_ELEVATED = '#161C28';
const PREMIUM_NEUTRAL_DARK_EDGE = '#212A38';
const PREMIUM_NEUTRAL_LIGHT_BASE = '#EEF1F6';
const PREMIUM_NEUTRAL_LIGHT_ELEVATED = '#F7F8FB';
const PREMIUM_NEUTRAL_LIGHT_EDGE = '#D7DEE8';
const PREMIUM_WARM_CHAMPAGNE = '#C9A46A';
const PREMIUM_WARM_BRONZE = '#8C6742';

function resolveAccentGreen(colors: ThemeColors) {
  return colors.accentGreen ?? colors.success;
}

function resolveSecondary(colors: ThemeColors) {
  return colors.secondary ?? colors.primary;
}

function clampPaletteKey(key: SuperScanPaletteKey | null | undefined) {
  return key ?? 'default';
}

function resolvePremiumWarmAccent(isDark: boolean) {
  return isDark
    ? mixColors(PREMIUM_WARM_BRONZE, PREMIUM_WARM_CHAMPAGNE, 0.58)
    : mixColors(PREMIUM_WARM_CHAMPAGNE, PREMIUM_WARM_BRONZE, 0.36);
}

function resolvePremiumBaseSurfaces(colors: ThemeColors, isDark: boolean) {
  if (isDark) {
    return {
      backgroundStart: mixColors(colors.background, PREMIUM_NEUTRAL_DARK_BASE, 0.92),
      backgroundEnd: mixColors(colors.background, PREMIUM_NEUTRAL_DARK_ELEVATED, 0.86),
      heroStart: mixColors(colors.cardBackground, PREMIUM_NEUTRAL_DARK_ELEVATED, 0.82),
      heroEnd: mixColors(colors.cardBackground, PREMIUM_NEUTRAL_DARK_EDGE, 0.74),
      sectionBackground: mixColors(colors.cardBackground, PREMIUM_NEUTRAL_DARK_EDGE, 0.38),
      secondaryBackground: mixColors(colors.cardBackground, PREMIUM_NEUTRAL_DARK_EDGE, 0.28),
      subtleBackground: mixColors(colors.cardBackground, PREMIUM_NEUTRAL_DARK_EDGE, 0.2),
      heroIconBackground: mixColors(colors.cardBackground, PREMIUM_NEUTRAL_DARK_EDGE, 0.56),
    };
  }

  return {
    backgroundStart: mixColors(colors.background, PREMIUM_NEUTRAL_LIGHT_BASE, 0.84),
    backgroundEnd: mixColors(colors.background, PREMIUM_NEUTRAL_LIGHT_ELEVATED, 0.68),
    heroStart: mixColors(colors.cardBackground, PREMIUM_NEUTRAL_LIGHT_ELEVATED, 0.38),
    heroEnd: mixColors(colors.cardBackground, PREMIUM_NEUTRAL_LIGHT_EDGE, 0.18),
    sectionBackground: mixColors(colors.cardBackground, PREMIUM_NEUTRAL_LIGHT_ELEVATED, 0.26),
    secondaryBackground: mixColors(colors.cardBackground, PREMIUM_NEUTRAL_LIGHT_BASE, 0.2),
    subtleBackground: mixColors(colors.cardBackground, PREMIUM_NEUTRAL_LIGHT_BASE, 0.12),
    heroIconBackground: mixColors(colors.cardBackground, PREMIUM_NEUTRAL_LIGHT_ELEVATED, 0.28),
  };
}

function resolvePaletteAccents(
  key: SuperScanPaletteKey,
  colors: ThemeColors,
  isDark: boolean,
) {
  const accentGreen = resolveAccentGreen(colors);
  const secondary = resolveSecondary(colors);
  const premiumWarmAccent = resolvePremiumWarmAccent(isDark);

  switch (key) {
    case 'danger':
      return {
        accentColor: mixColors(colors.error, premiumWarmAccent, isDark ? 0.12 : 0.08),
        accentColorSecondary: mixColors(colors.error, colors.warning, isDark ? 0.08 : 0.04),
      };
    case 'caution':
      return {
        accentColor: mixColors(colors.warning, premiumWarmAccent, isDark ? 0.2 : 0.14),
        accentColorSecondary: mixColors(colors.warning, premiumWarmAccent, isDark ? 0.12 : 0.08),
      };
    case 'recovery':
      return {
        accentColor: mixColors(accentGreen, colors.primary, isDark ? 0.2 : 0.14),
        accentColorSecondary: mixColors(accentGreen, colors.primary, isDark ? 0.08 : 0.12),
      };
    case 'aqua':
      return {
        accentColor: mixColors(colors.primary, accentGreen, isDark ? 0.3 : 0.26),
        accentColorSecondary: mixColors(
          colors.primary,
          accentGreen,
          isDark ? 0.18 : 0.22,
        ),
      };
    case 'contour':
      return {
        accentColor: mixColors(colors.warning, premiumWarmAccent, isDark ? 0.3 : 0.22),
        accentColorSecondary: mixColors(colors.warning, premiumWarmAccent, isDark ? 0.2 : 0.14),
      };
    case 'sculpt':
      return {
        accentColor: mixColors(secondary, premiumWarmAccent, isDark ? 0.12 : 0.08),
        accentColorSecondary: mixColors(
          secondary,
          colors.error,
          isDark ? 0.22 : 0.3,
        ),
      };
    case 'default':
    default:
      return {
        accentColor: mixColors(colors.primary, premiumWarmAccent, isDark ? 0.08 : 0.05),
        accentColorSecondary: mixColors(colors.primary, colors.secondary, isDark ? 0.1 : 0.08),
      };
  }
}

function buildScreenPalette(
  key: SuperScanPaletteKey,
  colors: ThemeColors,
  isDark: boolean,
): ResolvedSuperScanPalette {
  const { accentColor, accentColorSecondary } = resolvePaletteAccents(
    key,
    colors,
    isDark,
  );
  const premiumWarmAccentColor = resolvePremiumWarmAccent(isDark);
  const baseSurfaces = resolvePremiumBaseSurfaces(colors, isDark);
  const blendedAccentBorder = mixColors(accentColor, premiumWarmAccentColor, 0.18);
  const tonedAccentText = mixColors(
    accentColorSecondary,
    premiumWarmAccentColor,
    isDark ? 0.18 : 0.12,
  );

  return {
    key,
    accentColor,
    accentColorSecondary,
    premiumWarmAccentColor,
    backgroundGradient: [
      mixColors(
        baseSurfaces.backgroundStart,
        accentColorSecondary,
        isDark ? 0.08 : 0.035,
      ),
      mixColors(
        baseSurfaces.backgroundEnd,
        premiumWarmAccentColor,
        isDark ? 0.025 : 0.018,
      ),
    ],
    heroGradient: [
      mixColors(
        baseSurfaces.heroStart,
        premiumWarmAccentColor,
        isDark ? 0.06 : 0.025,
      ),
      mixColors(
        baseSurfaces.heroEnd,
        accentColor,
        isDark ? 0.12 : 0.05,
      ),
    ],
    heroBorderColor: withAlpha(blendedAccentBorder, isDark ? 0.22 : 0.16),
    heroBadgeBackgroundColor: mixColors(
      baseSurfaces.secondaryBackground,
      premiumWarmAccentColor,
      isDark ? 0.18 : 0.08,
    ),
    heroBadgeBorderColor: withAlpha(blendedAccentBorder, isDark ? 0.3 : 0.18),
    heroBadgeTextColor: tonedAccentText,
    heroIconBackgroundColor: baseSurfaces.heroIconBackground,
    heroIconBorderColor: withAlpha(blendedAccentBorder, isDark ? 0.24 : 0.18),
    heroIconColor: premiumWarmAccentColor,
    scoreColor: mixColors(accentColorSecondary, colors.primaryText, isDark ? 0.08 : 0.04),
    sectionAccentColor: accentColor,
    sectionSurfaceVariant: 'neutral',
    sectionBackgroundColor: baseSurfaces.sectionBackground,
    sectionBorderColor: withAlpha(
      mixColors(colors.gray, blendedAccentBorder, isDark ? 0.26 : 0.18),
      isDark ? 0.2 : 0.12,
    ),
    chipBackgroundColor: mixColors(
      baseSurfaces.secondaryBackground,
      accentColor,
      isDark ? 0.12 : 0.08,
    ),
    chipBorderColor: withAlpha(blendedAccentBorder, isDark ? 0.18 : 0.12),
    chipTextColor: tonedAccentText,
    secondarySurfaceBackgroundColor: baseSurfaces.secondaryBackground,
    secondarySurfaceBorderColor: withAlpha(
      mixColors(colors.gray, premiumWarmAccentColor, isDark ? 0.16 : 0.12),
      isDark ? 0.16 : 0.1,
    ),
    subtleBackgroundColor: baseSurfaces.subtleBackground,
    subtleBorderColor: withAlpha(
      mixColors(colors.gray, accentColor, isDark ? 0.2 : 0.12),
      isDark ? 0.14 : 0.1,
    ),
    subtleTextColor: mixColors(colors.gray, accentColorSecondary, isDark ? 0.16 : 0.12),
    countBadgeBackgroundColor: mixColors(
      baseSurfaces.secondaryBackground,
      premiumWarmAccentColor,
      isDark ? 0.08 : 0.045,
    ),
    countBadgeTextColor: mixColors(colors.primaryText, tonedAccentText, isDark ? 0.12 : 0.06),
    shareBackgroundColor: mixColors(
      baseSurfaces.secondaryBackground,
      premiumWarmAccentColor,
      isDark ? 0.06 : 0.03,
    ),
    shareBorderColor: withAlpha(blendedAccentBorder, isDark ? 0.18 : 0.12),
    shareIconColor: mixColors(premiumWarmAccentColor, accentColorSecondary, isDark ? 0.16 : 0.22),
    shareTextColor: mixColors(colors.primaryText, premiumWarmAccentColor, isDark ? 0.12 : 0.08),
    disclaimerBackgroundColor: mixColors(
      baseSurfaces.secondaryBackground,
      accentColor,
      isDark ? 0.05 : 0.025,
    ),
    disclaimerBorderColor: withAlpha(
      mixColors(colors.gray, accentColor, isDark ? 0.18 : 0.12),
      isDark ? 0.14 : 0.1,
    ),
    disclaimerTextColor: mixColors(
      colors.gray,
      colors.primaryText,
      isDark ? 0.16 : 0.08,
    ),
  };
}

function normalizeNumberish(value: unknown) {
  if (typeof value === 'string') {
    return value.replace(/[^0-9,.-]/g, '');
  }

  return value;
}

function resolveNumericValue(value: unknown) {
  return parseSafeNumber(normalizeNumberish(value));
}

function resolveWinningMetric<T extends string>(
  candidates: Array<{ id: T; value: unknown }>,
): T | null {
  const numericCandidates = candidates
    .map((candidate) => ({
      id: candidate.id,
      value: resolveNumericValue(candidate.value),
    }))
    .filter(
      (candidate): candidate is { id: T; value: number } =>
        candidate.value !== null,
    );

  if (numericCandidates.length === 0) {
    return null;
  }

  const maxValue = Math.max(...numericCandidates.map((candidate) => candidate.value));
  const winners = numericCandidates.filter(
    (candidate) => candidate.value === maxValue,
  );

  return winners.length === 1 ? winners[0].id : null;
}

function resolveAreaFamilyFromDominantType(
  dominantType: string | null | undefined,
): SuperScanPaletteKey | null {
  const normalized = normalizeSuperScanTextKey(dominantType);

  if (!normalized) {
    return null;
  }

  if (WATER_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return 'aqua';
  }

  if (SUBCUTANEOUS_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return 'contour';
  }

  return null;
}

function buildAreaMetricTheme(options: {
  colors: ThemeColors;
  isDark: boolean;
  paletteKey: SuperScanPaletteKey;
  highlighted: boolean;
}) {
  const accents = resolvePaletteAccents(
    options.paletteKey,
    options.colors,
    options.isDark,
  );

  return {
    backgroundColor: withAlpha(
      accents.accentColor,
      options.highlighted
        ? options.isDark
          ? 0.16
          : 0.08
        : options.isDark
          ? 0.08
          : 0.04,
    ),
    borderColor: withAlpha(
      accents.accentColor,
      options.highlighted
        ? options.isDark
          ? 0.28
          : 0.16
        : options.isDark
          ? 0.16
          : 0.08,
    ),
    valueColor: options.highlighted
      ? accents.accentColorSecondary
      : mixColors(
          options.colors.primaryText,
          accents.accentColorSecondary,
          options.isDark ? 0.2 : 0.14,
        ),
  };
}

export function normalizeSuperScanTextKey(value: string | null | undefined) {
  if (!value || typeof value !== 'string') {
    return '';
  }

  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function resolveDefaultSuperScanPalette(options: {
  colors: ThemeColors;
  isDark: boolean;
}) {
  return buildScreenPalette('default', options.colors, options.isDark);
}

export function resolveLegacySuperScanPalette(options: {
  colors: ThemeColors;
  isDark: boolean;
  globalRiskScore: unknown;
  urgencyFlag?: boolean | null;
}) {
  const score = resolveNumericValue(options.globalRiskScore) ?? 0;
  const key =
    options.urgencyFlag || score >= 70
      ? 'danger'
      : score >= 40
        ? 'caution'
        : 'recovery';

  return buildScreenPalette(key, options.colors, options.isDark);
}

export function resolveFatDistributionDominantMetricId(options: {
  bodyFat: unknown;
  facialFat: unknown;
  waterRetention: unknown;
}) {
  return resolveWinningMetric<FatDistributionPrimaryMetricId>([
    { id: 'body_fat', value: options.bodyFat },
    { id: 'facial_fat', value: options.facialFat },
    { id: 'water_retention', value: options.waterRetention },
  ]);
}

export function resolveFatDistributionSuperScanPalette(options: {
  colors: ThemeColors;
  isDark: boolean;
  bodyFat: unknown;
  facialFat: unknown;
  waterRetention: unknown;
}) {
  const dominantMetricId = resolveFatDistributionDominantMetricId({
    bodyFat: options.bodyFat,
    facialFat: options.facialFat,
    waterRetention: options.waterRetention,
  });

  const key =
    dominantMetricId === 'water_retention'
      ? 'aqua'
      : dominantMetricId === 'body_fat'
        ? 'contour'
        : dominantMetricId === 'facial_fat'
          ? 'sculpt'
          : 'default';

  return buildScreenPalette(key, options.colors, options.isDark);
}

export function resolveFatDistributionPrimaryMetricThemeSpec(options: {
  metricId: FatDistributionPrimaryMetricId;
  highlightedMetricId: FatDistributionPrimaryMetricId | null;
}): ResultItemThemeSpec {
  const isHighlighted = options.metricId === options.highlightedMetricId;

  switch (options.metricId) {
    case 'body_fat':
      return {
        tone: 'amber',
        surfaceVariant: 'soft',
        valueAccent: isHighlighted ? 'strong' : 'soft',
        iconAccent: isHighlighted ? 'strong' : 'soft',
      };
    case 'facial_fat':
      return {
        tone: 'rose',
        surfaceVariant: 'soft',
        valueAccent: isHighlighted ? 'strong' : 'soft',
        iconAccent: isHighlighted ? 'strong' : 'soft',
      };
    case 'water_retention':
    default:
      return {
        tone: 'teal',
        surfaceVariant: 'soft',
        valueAccent: isHighlighted ? 'strong' : 'soft',
        iconAccent: isHighlighted ? 'strong' : 'soft',
      };
  }
}

export function resolveSuperScanAreaTheme(options: {
  colors: ThemeColors;
  isDark: boolean;
  area: {
    dominantType?: string | null;
    subcutaneousFatPercent?: unknown;
    waterRetentionPercent?: unknown;
    definitionPercent?: unknown;
  };
  screenPalette?: ResolvedSuperScanPalette | null;
}) {
  const dominantTypePaletteKey = resolveAreaFamilyFromDominantType(
    options.area.dominantType,
  );
  const localWinningMetric = resolveWinningMetric<SuperScanAreaHighlightMetric>([
    {
      id: 'subcutaneousFat',
      value: options.area.subcutaneousFatPercent,
    },
    {
      id: 'waterRetention',
      value: options.area.waterRetentionPercent,
    },
    {
      id: 'definition',
      value: options.area.definitionPercent,
    },
  ]);

  const metricPaletteKey =
    localWinningMetric === 'waterRetention'
      ? 'aqua'
      : localWinningMetric === 'subcutaneousFat'
        ? 'contour'
        : localWinningMetric === 'definition'
          ? 'sculpt'
          : null;

  const paletteKey = clampPaletteKey(
    dominantTypePaletteKey ??
      metricPaletteKey ??
      options.screenPalette?.key ??
      'default',
  );
  const highlightMetricKey =
    localWinningMetric ??
    (dominantTypePaletteKey === 'aqua'
      ? 'waterRetention'
      : dominantTypePaletteKey === 'contour'
        ? 'subcutaneousFat'
        : 'definition');
  const accents = resolvePaletteAccents(
    paletteKey,
    options.colors,
    options.isDark,
  );

  return {
    key: paletteKey,
    accentColor: accents.accentColor,
    cardBackgroundColor: mixColors(
      options.colors.cardBackground,
      accents.accentColor,
      options.isDark ? 0.08 : 0.04,
    ),
    cardBorderColor: withAlpha(
      accents.accentColor,
      options.isDark ? 0.16 : 0.1,
    ),
    dominantBadgeBackgroundColor: withAlpha(
      accents.accentColor,
      options.isDark ? 0.18 : 0.1,
    ),
    dominantBadgeBorderColor: withAlpha(
      accents.accentColor,
      options.isDark ? 0.28 : 0.16,
    ),
    dominantBadgeValueColor: accents.accentColorSecondary,
    chipBackgroundColor: withAlpha(
      accents.accentColor,
      options.isDark ? 0.12 : 0.08,
    ),
    chipBorderColor: withAlpha(
      accents.accentColor,
      options.isDark ? 0.2 : 0.12,
    ),
    chipTextColor: accents.accentColorSecondary,
    sectionBackgroundColor: mixColors(
      options.colors.cardBackground,
      accents.accentColor,
      options.isDark ? 0.08 : 0.04,
    ),
    sectionBorderColor: withAlpha(
      accents.accentColor,
      options.isDark ? 0.16 : 0.1,
    ),
    sectionLabelColor: mixColors(
      options.colors.gray,
      accents.accentColorSecondary,
      options.isDark ? 0.16 : 0.12,
    ),
    highlightMetricKey,
    metricThemes: {
      subcutaneousFat: buildAreaMetricTheme({
        colors: options.colors,
        isDark: options.isDark,
        paletteKey: 'contour',
        highlighted: highlightMetricKey === 'subcutaneousFat',
      }),
      waterRetention: buildAreaMetricTheme({
        colors: options.colors,
        isDark: options.isDark,
        paletteKey: 'aqua',
        highlighted: highlightMetricKey === 'waterRetention',
      }),
      definition: buildAreaMetricTheme({
        colors: options.colors,
        isDark: options.isDark,
        paletteKey: 'sculpt',
        highlighted: highlightMetricKey === 'definition',
      }),
      confidence: buildAreaMetricTheme({
        colors: options.colors,
        isDark: options.isDark,
        paletteKey: 'default',
        highlighted: false,
      }),
    },
  } satisfies ResolvedSuperScanAreaTheme;
}
