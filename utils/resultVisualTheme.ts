import {
  mixColors,
  ThemeColors,
  withAlpha,
} from '@/constants/theme';
import { normalizeContractToken } from '@/constants/resultCatalogContract';
import type {
  ResultMetricIconToken,
  ResultScanIconToken,
} from '@/utils/resultIconCatalog';

export const RESULT_TONE_KEYS = [
  'neutral',
  'blue',
  'emerald',
  'amber',
  'gold',
  'indigo',
  'coral',
  'rose',
  'teal',
  'slate',
  'violet',
] as const;

export type ResultToneKey = (typeof RESULT_TONE_KEYS)[number];

export const RESULT_SURFACE_VARIANTS = [
  'neutral',
  'soft',
  'emphasis',
] as const;

export type ResultSurfaceVariant = (typeof RESULT_SURFACE_VARIANTS)[number];

export const RESULT_ACCENT_LEVELS = ['none', 'soft', 'strong'] as const;

export type ResultAccentLevel = (typeof RESULT_ACCENT_LEVELS)[number];

export interface ResultItemThemeSpec {
  tone: ResultToneKey;
  surfaceVariant: ResultSurfaceVariant;
  valueAccent: ResultAccentLevel;
  iconAccent: ResultAccentLevel;
}

export interface ResolvedResultItemTheme extends ResultItemThemeSpec {
  accentColor: string;
  iconColor: string;
  iconSurfaceColor: string;
  iconBorderColor: string;
  cardBackgroundColor: string;
  cardBorderColor: string;
  valueColor: string;
}

export interface ResolvedScanTypeTheme {
  tone: ResultToneKey;
  accentColor: string;
  iconColor: string;
  chipColor: string;
}

const createThemeSpec = (
  tone: ResultToneKey,
  surfaceVariant: ResultSurfaceVariant,
  valueAccent: ResultAccentLevel,
  iconAccent: ResultAccentLevel,
): ResultItemThemeSpec => ({
  tone,
  surfaceVariant,
  valueAccent,
  iconAccent,
});

export const DEFAULT_RESULT_ITEM_THEME_SPEC = createThemeSpec(
  'neutral',
  'neutral',
  'none',
  'soft',
);

const SCAN_TYPE_THEME_TONES: Record<ResultScanIconToken, ResultToneKey> = {
  face: 'blue',
  body: 'emerald',
  nutrition: 'amber',
};

const RESULT_ITEM_THEME_BY_TOKEN: Record<ResultMetricIconToken, ResultItemThemeSpec> =
  {
    perceived_age: createThemeSpec('slate', 'soft', 'soft', 'soft'),
    face_shape: createThemeSpec('teal', 'neutral', 'none', 'soft'),
    symmetry: createThemeSpec('teal', 'soft', 'soft', 'strong'),
    fatigue: createThemeSpec('indigo', 'soft', 'soft', 'strong'),
    hydration: createThemeSpec('blue', 'soft', 'strong', 'strong'),
    photogenic: createThemeSpec('violet', 'soft', 'soft', 'strong'),
    skin_quality: createThemeSpec('teal', 'soft', 'soft', 'strong'),
    glow: createThemeSpec('gold', 'emphasis', 'strong', 'strong'),
    collagen: createThemeSpec('rose', 'soft', 'soft', 'strong'),
    body_type: createThemeSpec('teal', 'soft', 'soft', 'strong'),
    muscle_mass: createThemeSpec('emerald', 'soft', 'soft', 'strong'),
    waist: createThemeSpec('blue', 'soft', 'none', 'soft'),
    strength: createThemeSpec('emerald', 'soft', 'strong', 'strong'),
    bmi: createThemeSpec('amber', 'soft', 'soft', 'strong'),
    metabolic_age: createThemeSpec('indigo', 'soft', 'soft', 'soft'),
    body_fat: createThemeSpec('coral', 'emphasis', 'strong', 'strong'),
    posture: createThemeSpec('blue', 'soft', 'soft', 'strong'),
    body_symmetry: createThemeSpec('teal', 'soft', 'soft', 'strong'),
    calories: createThemeSpec('amber', 'emphasis', 'strong', 'strong'),
    verdict: createThemeSpec('emerald', 'emphasis', 'strong', 'strong'),
    satiety: createThemeSpec('emerald', 'soft', 'soft', 'strong'),
    ingredients: createThemeSpec('teal', 'soft', 'soft', 'strong'),
    glycemic: createThemeSpec('amber', 'soft', 'soft', 'strong'),
    vitamins: createThemeSpec('blue', 'soft', 'soft', 'strong'),
    proteins: createThemeSpec('emerald', 'emphasis', 'strong', 'strong'),
    carbs: createThemeSpec('amber', 'emphasis', 'strong', 'strong'),
    fats: createThemeSpec('rose', 'emphasis', 'strong', 'strong'),
  };

const VERDICT_TONE_BY_KEY: Partial<Record<string, ResultToneKey>> = {
  balanced: 'emerald',
  smoothie_ideal: 'teal',
  protein_dense: 'emerald',
  light: 'blue',
  processed: 'coral',
  sugary: 'coral',
  indulgent: 'rose',
  unknown: 'amber',
};

const INGREDIENT_QUALITY_TONE_BY_KEY: Partial<Record<string, ResultToneKey>> = {
  natural: 'emerald',
  excellent: 'emerald',
  good: 'teal',
  average: 'amber',
  poor: 'coral',
  bad: 'coral',
  processed: 'coral',
  ultra_processed: 'coral',
  unknown: 'amber',
};

const GLYCEMIC_TONE_BY_KEY: Partial<Record<string, ResultToneKey>> = {
  low: 'emerald',
  moderate: 'amber',
  high: 'coral',
  unknown: 'amber',
};

const DYNAMIC_TONE_BY_TOKEN: Partial<
  Record<ResultMetricIconToken, Partial<Record<string, ResultToneKey>>>
> = {
  verdict: VERDICT_TONE_BY_KEY,
  ingredients: INGREDIENT_QUALITY_TONE_BY_KEY,
  glycemic: GLYCEMIC_TONE_BY_KEY,
};

function resolveToneColor(
  tone: ResultToneKey,
  colors: ThemeColors,
  isDark: boolean,
) {
  switch (tone) {
    case 'blue':
      return colors.primary;
    case 'emerald':
      return colors.accentGreen ?? colors.success;
    case 'amber':
      return colors.warning;
    case 'gold':
      return colors.gold;
    case 'indigo':
      return colors.secondary;
    case 'coral':
      return mixColors(colors.error, colors.warning, isDark ? 0.24 : 0.2);
    case 'rose':
      return mixColors(colors.error, colors.secondary, isDark ? 0.48 : 0.38);
    case 'teal':
      return mixColors(
        colors.accentGreen ?? colors.success,
        colors.primary,
        isDark ? 0.46 : 0.42,
      );
    case 'slate':
      return isDark
        ? mixColors(colors.darkGray, colors.white, 0.08)
        : mixColors(colors.darkGray, colors.primary, 0.08);
    case 'violet':
      return mixColors(colors.secondary, colors.primary, isDark ? 0.2 : 0.12);
    case 'neutral':
    default:
      return isDark
        ? mixColors(colors.gray, colors.white, 0.2)
        : mixColors(colors.gray, colors.primaryText, 0.16);
  }
}

function resolveSurfaceTint(
  surfaceVariant: ResultSurfaceVariant,
  accentColor: string,
  colors: ThemeColors,
  isDark: boolean,
) {
  if (surfaceVariant === 'neutral') {
    return {
      backgroundColor: colors.cardBackground,
      borderColor: isDark
        ? withAlpha(colors.white, 0.08)
        : withAlpha(colors.primaryText, 0.06),
    };
  }

  const backgroundAlpha =
    surfaceVariant === 'emphasis'
      ? isDark
        ? 0.18
        : 0.1
      : isDark
        ? 0.11
        : 0.05;
  const borderAlpha =
    surfaceVariant === 'emphasis'
      ? isDark
        ? 0.32
        : 0.18
      : isDark
        ? 0.22
        : 0.12;

  return {
    backgroundColor: mixColors(colors.cardBackground, accentColor, backgroundAlpha),
    borderColor: withAlpha(accentColor, borderAlpha),
  };
}

function resolveAccentSurfaceColor(
  accentColor: string,
  accentLevel: ResultAccentLevel,
  colors: ThemeColors,
  isDark: boolean,
) {
  switch (accentLevel) {
    case 'strong':
      return withAlpha(accentColor, isDark ? 0.24 : 0.13);
    case 'soft':
      return withAlpha(accentColor, isDark ? 0.16 : 0.09);
    case 'none':
    default:
      return isDark
        ? withAlpha(colors.white, 0.06)
        : withAlpha(colors.primaryText, 0.04);
  }
}

function resolveAccentBorderColor(
  accentColor: string,
  accentLevel: ResultAccentLevel,
  colors: ThemeColors,
  isDark: boolean,
) {
  switch (accentLevel) {
    case 'strong':
      return withAlpha(accentColor, isDark ? 0.42 : 0.18);
    case 'soft':
      return withAlpha(accentColor, isDark ? 0.28 : 0.14);
    case 'none':
    default:
      return isDark
        ? withAlpha(colors.white, 0.08)
        : withAlpha(colors.primaryText, 0.08);
  }
}

function resolveIconColor(
  accentColor: string,
  accentLevel: ResultAccentLevel,
  colors: ThemeColors,
) {
  if (accentLevel === 'none') {
    return colors.primaryText;
  }

  return accentColor;
}

function resolveValueColor(
  accentColor: string,
  accentLevel: ResultAccentLevel,
  colors: ThemeColors,
  isDark: boolean,
) {
  switch (accentLevel) {
    case 'strong':
      return accentColor;
    case 'soft':
      return mixColors(colors.primaryText, accentColor, isDark ? 0.32 : 0.26);
    case 'none':
    default:
      return colors.primaryText;
  }
}

function resolveDynamicTone(
  metricId: ResultMetricIconToken,
  semanticValueKey: string | null | undefined,
  fallbackTone: ResultToneKey,
) {
  const normalizedValue = semanticValueKey
    ? normalizeContractToken(semanticValueKey)
    : '';
  const toneMap = DYNAMIC_TONE_BY_TOKEN[metricId];

  if (!normalizedValue || !toneMap) {
    return fallbackTone;
  }

  return toneMap[normalizedValue] ?? fallbackTone;
}

export function resolveResultItemThemeSpec(options: {
  scanType: ResultScanIconToken;
  metricId: ResultMetricIconToken;
  semanticValueKey?: string | null;
  overrides?: Partial<ResultItemThemeSpec>;
}): ResultItemThemeSpec {
  const {
    scanType,
    metricId,
    semanticValueKey,
    overrides,
  } = options;
  const baseTheme =
    RESULT_ITEM_THEME_BY_TOKEN[metricId] ?? DEFAULT_RESULT_ITEM_THEME_SPEC;
  const dynamicTone =
    scanType === 'nutrition'
      ? resolveDynamicTone(metricId, semanticValueKey, baseTheme.tone)
      : baseTheme.tone;

  return {
    ...baseTheme,
    tone: dynamicTone,
    ...overrides,
  };
}

export function resolveResultItemTheme(options: {
  colors: ThemeColors;
  isDark: boolean;
  theme?: ResultItemThemeSpec | null;
}): ResolvedResultItemTheme {
  const { colors, isDark, theme } = options;
  const resolvedSpec = theme ?? DEFAULT_RESULT_ITEM_THEME_SPEC;
  const accentColor = resolveToneColor(resolvedSpec.tone, colors, isDark);
  const cardSurface = resolveSurfaceTint(
    resolvedSpec.surfaceVariant,
    accentColor,
    colors,
    isDark,
  );

  return {
    ...resolvedSpec,
    accentColor,
    iconColor: resolveIconColor(accentColor, resolvedSpec.iconAccent, colors),
    iconSurfaceColor: resolveAccentSurfaceColor(
      accentColor,
      resolvedSpec.iconAccent,
      colors,
      isDark,
    ),
    iconBorderColor: resolveAccentBorderColor(
      accentColor,
      resolvedSpec.iconAccent,
      colors,
      isDark,
    ),
    cardBackgroundColor: cardSurface.backgroundColor,
    cardBorderColor: cardSurface.borderColor,
    valueColor: resolveValueColor(
      accentColor,
      resolvedSpec.valueAccent,
      colors,
      isDark,
    ),
  };
}

export function resolveScanTypeTheme(
  scanType: ResultScanIconToken,
  colors: ThemeColors,
  isDark: boolean,
): ResolvedScanTypeTheme {
  const tone = SCAN_TYPE_THEME_TONES[scanType];
  const accentColor = resolveToneColor(tone, colors, isDark);

  return {
    tone,
    accentColor,
    chipColor: accentColor,
    iconColor: colors.white,
  };
}
