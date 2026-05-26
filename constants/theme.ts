import { Platform, type ViewStyle } from 'react-native';

export const LIGHT_COLORS = {
  background: '#F6F6F3',
  cardBackground: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  surfaceGlass: 'rgba(255, 255, 255, 0.86)',
  surfaceMuted: '#F0F1EE',
  surfaceAccent: '#EDF2F8',
  primaryText: '#1C1C1E',
  secondaryText: '#63666D',
  textMuted: '#63666D',
  accentGreen: '#3F8B6D',
  accent: '#3D6FAF',
  lightGray: '#E0E1DD',
  gray: '#63666D',
  grayLight: '#F0F1EE',
  grayMedium: '#D6D8D2',
  darkGray: '#34363A',
  borderSubtle: '#E0E1DD',
  borderStrong: '#CACCC5',
  borderGlow: 'rgba(47, 102, 197, 0.1)',
  edgeHighlight: 'rgba(255, 255, 255, 0.92)',
  primary: '#2F66C5',
  primaryLight: '#EDF3FC',
  primaryDark: '#244F9F',
  secondary: '#68749C',
  white: '#FFFFFF',
  error: '#D84A43',
  success: '#3F8B6D',
  successLight: '#EDF6F1',
  warning: '#A86F2D',
  gold: '#B8955D',
  goldLight: '#F4E8D2',
};

export const DARK_COLORS = {
  background: '#000000',
  cardBackground: '#121212',
  surfaceElevated: '#1C1C1E',
  surfaceGlass: 'rgba(18, 18, 18, 0.88)',
  surfaceMuted: '#242426',
  surfaceAccent: '#142238',
  primaryText: '#F7F7F7',
  secondaryText: '#B8B8BE',
  textMuted: '#8E8E93',
  accentGreen: '#6EC8A5',
  accent: '#7EA6D8',
  lightGray: '#242426',
  gray: '#8E8E93',
  grayLight: '#1C1C1E',
  grayMedium: '#3A3A3C',
  darkGray: '#D1D1D6',
  borderSubtle: 'rgba(255, 255, 255, 0.1)',
  borderStrong: 'rgba(255, 255, 255, 0.18)',
  borderGlow: 'rgba(126, 166, 216, 0.16)',
  edgeHighlight: 'rgba(255, 255, 255, 0.14)',
  primary: '#65A9F3',
  primaryLight: '#102538',
  primaryDark: '#4589D2',
  secondary: '#9AA7CB',
  white: '#FFFFFF', // Keep white as white for specific usages
  error: '#FF5E57',
  success: '#6EC8A5',
  successLight: '#102A22',
  warning: '#D49A55',
  gold: '#D7BD76',
  goldLight: '#322817',
};

export type ThemeType = 'light' | 'dark';

export const COLORS = LIGHT_COLORS; // Backward compatibility for now, will be removed/unused in refactored files


const SYSTEM_FONT_FAMILY = Platform.select({
  ios: 'System',
  android: 'sans-serif',
  web: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  default: 'System',
}) as string;

const SERIF_FONT_FAMILY = Platform.select({
  ios: 'Georgia',
  android: 'serif',
  web: 'Georgia, "Times New Roman", serif',
  default: 'serif',
}) as string;

const MONO_FONT_FAMILY = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  web: '"SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
  default: 'monospace',
}) as string;

export const FONT_FAMILIES = {
  body: SYSTEM_FONT_FAMILY,
  display: SYSTEM_FONT_FAMILY,
  accent: SYSTEM_FONT_FAMILY,
  serif: SERIF_FONT_FAMILY,
  mono: MONO_FONT_FAMILY,
};

export const FONTS = {
  regular: FONT_FAMILIES.body,
  semiBold: FONT_FAMILIES.body,
  bold: FONT_FAMILIES.body,
  display: FONT_FAMILIES.display,
  accent: FONT_FAMILIES.accent,
};

export const FONT_WEIGHTS = {
  regular: '400' as const,
  medium: '500' as const,
  semiBold: '600' as const,
  bold: '700' as const,
};

export const SIZES = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  text10: 10,
  text12: 12,
  text14: 14,
  text15: 15,
  text16: 16,
  text18: 18,
  text20: 20,
  text22: 22,
  text24: 24,
  text26: 26,
  text28: 28,
  scoreNumber: 48,
  scoreSub: 14,
};

export const SPACING = {
  page: 16,
  block: 24,
  card: 12,
  benefit: 8,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const BORDER_RADIUS = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 24,
  pill: 9999,
  hero: 32,
  card: 24,
  button: 9999,
  tag: 9999,
  full: 9999,
};

export const SQUIRCLE_SMOOTHING = {
  default: 0.6,
  soft: 0.5,
  sharp: 0.7,
} as const;

export const SQUIRCLE_PILL_THRESHOLD = 999;

export const SCANNER_TOKENS = {
  captureLightInner: '#FFFFFF',
  superSelectedBackground: '#FFD33D',
  superSelectedBorder: '#FFE45C',
  superSelectedForeground: '#2B2115',
} as const;

export const SHADOWS = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  card: {
    ...(Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.2,
        shadowRadius: 24,
        elevation: 3,
      },
      default: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.18,
        shadowRadius: 24,
        elevation: 2,
      },
    }) ?? {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.18,
      shadowRadius: 24,
      elevation: 2,
    }),
  },
  cardHover: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.28,
    shadowRadius: 30,
    elevation: 5,
  },
  header: {
    ...(Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.16,
        shadowRadius: 20,
        elevation: 2,
      },
      default: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.14,
        shadowRadius: 20,
        elevation: 1,
      },
    }) ?? {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.14,
      shadowRadius: 20,
      elevation: 1,
    }),
  },
  button: {
    shadowColor: '#59B8FF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.24,
    shadowRadius: 18,
    elevation: 4,
  },
  soft: {
    ...(Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 14 },
        shadowOpacity: 0.2,
        shadowRadius: 28,
        elevation: 4,
      },
      default: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 14 },
        shadowOpacity: 0.16,
        shadowRadius: 28,
        elevation: 3,
      },
    }) ?? {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 14 },
      shadowOpacity: 0.16,
      shadowRadius: 28,
      elevation: 3,
    }),
  },
  lift: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.28,
    shadowRadius: 26,
    elevation: 6,
  },
  glow: {
    shadowColor: '#59B8FF',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 5,
  },
  goldGlow: {
    shadowColor: '#F5D77A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 5,
  },
};

type ThemeOptionalSurfaceToken =
  | 'surfaceElevated'
  | 'surfaceGlass'
  | 'borderGlow'
  | 'edgeHighlight';

export type ThemeColors = Omit<typeof LIGHT_COLORS, ThemeOptionalSurfaceToken> &
  Partial<Pick<typeof LIGHT_COLORS, ThemeOptionalSurfaceToken>>;

export const THEME_TOKENS = {
  light: {
    screen: {
      background: LIGHT_COLORS.background,
      backgroundElevated: '#EFEFEB',
      foreground: LIGHT_COLORS.primaryText,
      foregroundMuted: LIGHT_COLORS.textMuted,
    },
    surface: {
      base: LIGHT_COLORS.cardBackground,
      raised: LIGHT_COLORS.surfaceElevated,
      inset: LIGHT_COLORS.surfaceMuted,
      accent: LIGHT_COLORS.surfaceAccent,
      glass: LIGHT_COLORS.surfaceGlass,
    },
    surfaceMuted: {
      base: LIGHT_COLORS.surfaceMuted,
      pressed: '#E9EAE6',
      selected: LIGHT_COLORS.primaryLight,
    },
    surfaceGlass: {
      base: LIGHT_COLORS.surfaceGlass,
      strong: 'rgba(255, 255, 255, 0.94)',
      border: 'rgba(20, 21, 23, 0.08)',
    },
    border: {
      subtle: LIGHT_COLORS.borderSubtle,
      strong: LIGHT_COLORS.borderStrong,
      glow: LIGHT_COLORS.borderGlow,
    },
    divider: LIGHT_COLORS.borderSubtle,
    scrim: 'rgba(10, 16, 32, 0.42)',
    cta: {
      background: LIGHT_COLORS.primaryText,
      foreground: LIGHT_COLORS.background,
      secondaryBackground: LIGHT_COLORS.surfaceMuted,
      secondaryForeground: LIGHT_COLORS.primaryText,
      border: 'rgba(20, 21, 23, 0.1)',
    },
    premium: {
      accent: LIGHT_COLORS.gold,
      foreground: '#3F2914',
      background: LIGHT_COLORS.goldLight,
      border: 'rgba(201, 164, 106, 0.34)',
      glow: 'rgba(201, 164, 106, 0.18)',
    },
    danger: {
      accent: LIGHT_COLORS.error,
      background: '#FCEBE9',
      border: 'rgba(216, 74, 67, 0.28)',
      foreground: '#8D2722',
    },
    success: {
      accent: LIGHT_COLORS.success,
      background: LIGHT_COLORS.successLight,
      border: 'rgba(63, 139, 109, 0.18)',
      foreground: '#285D48',
    },
    chart: {
      grid: 'rgba(20, 21, 23, 0.08)',
      axis: LIGHT_COLORS.gray,
      fill: 'rgba(47, 102, 197, 0.08)',
      line: LIGHT_COLORS.primary,
    },
    tabBar: {
      background: 'rgba(255, 255, 255, 0.94)',
      border: 'rgba(20, 21, 23, 0.08)',
      active: LIGHT_COLORS.primaryText,
      inactive: LIGHT_COLORS.gray,
      indicator: LIGHT_COLORS.primaryText,
    },
  },
  dark: {
    screen: {
      background: DARK_COLORS.background,
      backgroundElevated: '#090B10',
      foreground: DARK_COLORS.primaryText,
      foregroundMuted: DARK_COLORS.textMuted,
    },
    surface: {
      base: DARK_COLORS.cardBackground,
      raised: DARK_COLORS.surfaceElevated,
      inset: DARK_COLORS.surfaceMuted,
      accent: DARK_COLORS.surfaceAccent,
      glass: DARK_COLORS.surfaceGlass,
    },
    surfaceMuted: {
      base: DARK_COLORS.surfaceMuted,
      pressed: '#1D222D',
      selected: DARK_COLORS.primaryLight,
    },
    surfaceGlass: {
      base: DARK_COLORS.surfaceGlass,
      strong: 'rgba(16, 18, 22, 0.94)',
      border: 'rgba(255, 255, 255, 0.1)',
    },
    border: {
      subtle: DARK_COLORS.borderSubtle,
      strong: DARK_COLORS.borderStrong,
      glow: DARK_COLORS.borderGlow,
    },
    divider: DARK_COLORS.borderSubtle,
    scrim: 'rgba(3, 8, 16, 0.72)',
    cta: {
      background: DARK_COLORS.primaryText,
      foreground: DARK_COLORS.background,
      secondaryBackground: DARK_COLORS.surfaceMuted,
      secondaryForeground: DARK_COLORS.primaryText,
      border: 'rgba(255, 255, 255, 0.2)',
    },
    premium: {
      accent: DARK_COLORS.gold,
      foreground: '#2C210D',
      background: DARK_COLORS.goldLight,
      border: 'rgba(245, 215, 122, 0.34)',
      glow: 'rgba(245, 215, 122, 0.22)',
    },
    danger: {
      accent: DARK_COLORS.error,
      background: 'rgba(255, 94, 87, 0.1)',
      border: 'rgba(255, 94, 87, 0.28)',
      foreground: '#FFB3AE',
    },
    success: {
      accent: DARK_COLORS.success,
      background: DARK_COLORS.successLight,
      border: 'rgba(110, 200, 165, 0.2)',
      foreground: '#A8DCC8',
    },
    chart: {
      grid: 'rgba(255, 255, 255, 0.08)',
      axis: DARK_COLORS.gray,
      fill: 'rgba(101, 169, 243, 0.11)',
      line: DARK_COLORS.primary,
    },
    tabBar: {
      background: 'rgba(16, 18, 22, 0.94)',
      border: 'rgba(255, 255, 255, 0.1)',
      active: DARK_COLORS.primaryText,
      inactive: DARK_COLORS.gray,
      indicator: DARK_COLORS.primaryText,
    },
  },
} as const;

export type ThemeTokens = (typeof THEME_TOKENS)[ThemeType];
export type SurfaceVariant = 'flat' | 'inset' | 'raised' | 'glass' | 'premium' | 'danger' | 'success';

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeHex(color: string | null | undefined) {
  if (!color || typeof color !== 'string' || !color.startsWith('#')) {
    return null;
  }

  const hex = color.slice(1);
  if (hex.length === 3) {
    return hex
      .split('')
      .map((char) => char + char)
      .join('');
  }

  if (hex.length === 6) {
    return hex;
  }

  return null;
}

function hexToRgb(color: string | null | undefined) {
  const normalized = normalizeHex(color);
  if (!normalized) {
    return null;
  }

  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function rgbToHex(value: number) {
  return clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0');
}

export function withAlpha(color: string | null | undefined, alpha: number) {
  if (!color) {
    return 'transparent';
  }
  const rgb = hexToRgb(color);
  if (!rgb) {
    return color;
  }

  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${clamp(alpha, 0, 1)})`;
}

export function mixColors(baseColor: string, tintColor: string, tintOpacity: number) {
  const base = hexToRgb(baseColor);
  const tint = hexToRgb(tintColor);

  if (!base || !tint) {
    return baseColor;
  }

  const opacity = clamp(tintOpacity, 0, 1);
  const mixChannel = (baseValue: number, tintValue: number) =>
    baseValue + (tintValue - baseValue) * opacity;

  return `#${rgbToHex(mixChannel(base.r, tint.r))}${rgbToHex(mixChannel(base.g, tint.g))}${rgbToHex(
    mixChannel(base.b, tint.b)
  )}`;
}

export type AccentSoftness = 'subtle' | 'standard' | 'selected';

export function softenAccentColor(
  colors: ThemeColors,
  isDark: boolean,
  accentColor: string,
  strength: AccentSoftness = 'standard',
) {
  const neutralAnchor = isDark
    ? colors.gray ?? colors.secondaryText ?? colors.primaryText
    : colors.gray ?? colors.darkGray ?? colors.primaryText;
  const primaryAnchor = colors.primary ?? accentColor;
  const neutralMixByStrength: Record<AccentSoftness, number> = {
    subtle: isDark ? 0.42 : 0.48,
    standard: isDark ? 0.3 : 0.34,
    selected: isDark ? 0.18 : 0.22,
  };
  const primaryMixByStrength: Record<AccentSoftness, number> = {
    subtle: 0.08,
    standard: 0.06,
    selected: 0.04,
  };

  return mixColors(
    mixColors(accentColor, neutralAnchor, neutralMixByStrength[strength]),
    primaryAnchor,
    primaryMixByStrength[strength],
  );
}

export function getThemeTokens(isDark: boolean): ThemeTokens {
  return isDark ? THEME_TOKENS.dark : THEME_TOKENS.light;
}

export interface ThemedSurfaceOptions {
  colors: ThemeColors;
  isDark: boolean;
  variant?: SurfaceVariant;
  accentColor?: string;
  border?: boolean;
  shadow?: boolean;
}

export function getThemedSurface({
  colors,
  isDark,
  variant = 'raised',
  accentColor,
  border = true,
  shadow = true,
}: ThemedSurfaceOptions): ViewStyle {
  const tokens = getThemeTokens(isDark);
  const resolvedAccent =
    softenAccentColor(
      colors,
      isDark,
      accentColor ??
        (variant === 'premium'
          ? tokens.premium.accent
          : variant === 'danger'
            ? tokens.danger.accent
            : variant === 'success'
              ? tokens.success.accent
              : colors.primary),
      variant === 'premium' ? 'selected' : 'standard',
    );

  if (variant === 'flat') {
    return {
      backgroundColor: tokens.surface.base,
      borderColor: border ? tokens.border.subtle : 'transparent',
      ...(shadow ? SHADOWS.none : {}),
    };
  }

  if (variant === 'inset') {
    return {
      backgroundColor: tokens.surface.inset,
      borderColor: border ? tokens.border.subtle : 'transparent',
      ...(shadow ? SHADOWS.none : {}),
    };
  }

  if (variant === 'glass') {
    return {
      backgroundColor: tokens.surfaceGlass.base,
      borderColor: border ? tokens.surfaceGlass.border : 'transparent',
      ...(shadow
        ? {
            shadowColor: '#000000',
            shadowOffset: { width: 0, height: isDark ? 12 : 8 },
            shadowOpacity: isDark ? 0.24 : 0.1,
            shadowRadius: isDark ? 24 : 18,
            elevation: 4,
          }
        : {}),
    };
  }

  if (variant === 'danger') {
    return {
      backgroundColor: tokens.danger.background,
      borderColor: border ? tokens.danger.border : 'transparent',
      ...(shadow
        ? {
            shadowColor: tokens.danger.accent,
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: isDark ? 0.1 : 0.05,
            shadowRadius: 18,
            elevation: 3,
          }
        : {}),
    };
  }

  if (variant === 'success') {
    return {
      backgroundColor: tokens.success.background,
      borderColor: border ? tokens.success.border : 'transparent',
      ...(shadow
        ? {
            shadowColor: tokens.success.accent,
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: isDark ? 0.1 : 0.05,
            shadowRadius: 18,
            elevation: 3,
          }
        : {}),
    };
  }

  const tintOpacity =
    variant === 'premium'
      ? isDark ? 0.075 : 0.055
      : isDark ? 0.028 : 0.016;
  const borderOpacity =
    variant === 'premium'
      ? isDark ? 0.24 : 0.18
      : isDark ? 0.1 : 0.07;

  return {
    backgroundColor:
      variant === 'premium'
        ? mixColors(tokens.surface.raised, resolvedAccent, tintOpacity)
        : tokens.surface.raised,
    borderColor: border ? withAlpha(resolvedAccent, borderOpacity) : 'transparent',
    ...(shadow
      ? {
          shadowColor: variant === 'premium' ? resolvedAccent : '#000000',
          shadowOffset: { width: 0, height: variant === 'premium' ? 12 : 10 },
          shadowOpacity: variant === 'premium' ? (isDark ? 0.16 : 0.08) : (isDark ? 0.14 : 0.05),
          shadowRadius: variant === 'premium' ? 28 : 22,
          elevation: variant === 'premium' ? 5 : 3,
        }
      : {}),
  };
}

export function getCtaColors(colors: ThemeColors, isDark: boolean) {
  const tokens = getThemeTokens(isDark);

  return {
    primaryBackground: tokens.cta.background,
    primaryForeground: tokens.cta.foreground,
    primaryBorder: tokens.cta.border,
    secondaryBackground: tokens.cta.secondaryBackground,
    secondaryForeground: tokens.cta.secondaryForeground,
    premiumBackground: tokens.premium.accent,
    premiumForeground: isDark ? colors.background : tokens.premium.foreground,
    premiumBorder: tokens.premium.border,
  };
}

export type VisualMood = 'obsidian' | 'softClinical' | 'premium';
export type VisualMoodIntensity = 'subtle' | 'card' | 'hero';

interface VisualMoodSurfaceOptions {
  mood: VisualMood;
  accentColor?: string;
  intensity?: VisualMoodIntensity;
  shadow?: boolean;
}

export function getVisualMoodSurface(
  colors: ThemeColors,
  isDark: boolean,
  {
    mood,
    accentColor,
    intensity = 'card',
    shadow = true,
  }: VisualMoodSurfaceOptions,
) {
  const tokens = getThemeTokens(isDark);
  const resolvedAccent =
    softenAccentColor(
      colors,
      isDark,
      accentColor ?? (mood === 'premium' ? tokens.premium.accent : colors.primary),
      mood === 'premium' ? 'selected' : 'standard',
    );

  if (mood === 'obsidian') {
    const backgroundAlpha =
      intensity === 'hero' ? (isDark ? 0.07 : 0.045) : intensity === 'card' ? (isDark ? 0.038 : 0.026) : 0.018;
    const borderAlpha =
      intensity === 'hero' ? (isDark ? 0.2 : 0.13) : intensity === 'card' ? (isDark ? 0.11 : 0.08) : 0.06;

    return {
      backgroundColor: mixColors(tokens.surface.raised, resolvedAccent, backgroundAlpha),
      borderColor: withAlpha(resolvedAccent, borderAlpha),
      ...(shadow
        ? {
            shadowColor: intensity === 'hero' ? resolvedAccent : '#000000',
            shadowOffset: { width: 0, height: intensity === 'hero' ? 14 : 10 },
            shadowOpacity: intensity === 'hero' ? (isDark ? 0.18 : 0.08) : (isDark ? 0.12 : 0.05),
            shadowRadius: intensity === 'hero' ? 28 : 22,
            elevation: intensity === 'hero' ? 6 : 3,
          }
        : {}),
    };
  }

  if (mood === 'softClinical') {
    const clinicalBase = isDark
      ? mixColors(tokens.surface.raised, colors.white, 0.035)
      : mixColors(tokens.surface.base, colors.white, 0.12);
    const tintAlpha =
      intensity === 'hero' ? (isDark ? 0.075 : 0.09) : intensity === 'card' ? (isDark ? 0.048 : 0.055) : 0.032;
    const borderBase = isDark ? tokens.border.strong : tokens.border.subtle;

    return {
      backgroundColor: mixColors(clinicalBase, resolvedAccent, tintAlpha),
      borderColor: mixColors(borderBase, resolvedAccent, intensity === 'hero' ? 0.22 : 0.13),
      ...(shadow
        ? {
            shadowColor: mixColors(resolvedAccent, colors.gray, 0.18),
            shadowOffset: { width: 0, height: intensity === 'hero' ? 14 : 10 },
            shadowOpacity: intensity === 'hero' ? (isDark ? 0.11 : 0.07) : (isDark ? 0.07 : 0.045),
            shadowRadius: intensity === 'hero' ? 26 : 18,
            elevation: intensity === 'hero' ? 5 : 2,
          }
        : {}),
    };
  }

  const premiumBackgroundAlpha =
    intensity === 'hero' ? (isDark ? 0.11 : 0.075) : intensity === 'card' ? (isDark ? 0.07 : 0.05) : 0.035;
  const premiumBorderAlpha =
    intensity === 'hero' ? (isDark ? 0.28 : 0.22) : intensity === 'card' ? (isDark ? 0.22 : 0.17) : 0.12;

  return {
    backgroundColor: mixColors(tokens.surface.raised, resolvedAccent, premiumBackgroundAlpha),
    borderColor: withAlpha(resolvedAccent, premiumBorderAlpha),
    ...(shadow
      ? {
          shadowColor: resolvedAccent,
          shadowOffset: { width: 0, height: intensity === 'hero' ? 16 : 10 },
          shadowOpacity: intensity === 'hero' ? (isDark ? 0.16 : 0.09) : (isDark ? 0.12 : 0.06),
          shadowRadius: intensity === 'hero' ? 30 : 22,
          elevation: intensity === 'hero' ? 6 : 4,
        }
      : {}),
  };
}

export function getVisualMoodGradient(
  colors: ThemeColors,
  isDark: boolean,
  mood: VisualMood,
  accentColor?: string,
): [string, string, string] {
  const resolvedAccent = softenAccentColor(
    colors,
    isDark,
    accentColor ?? (mood === 'premium' ? colors.gold : colors.primary),
    mood === 'premium' ? 'selected' : 'standard',
  );

  if (mood === 'obsidian') {
    return isDark
      ? [
          mixColors(colors.cardBackground, resolvedAccent, 0.1),
          mixColors(colors.surfaceElevated ?? colors.cardBackground, colors.primaryText, 0.055),
          colors.background,
        ]
      : [
          mixColors(colors.cardBackground, resolvedAccent, 0.075),
          mixColors(colors.surfaceMuted ?? colors.cardBackground, colors.white, 0.4),
          colors.background,
        ];
  }

  if (mood === 'softClinical') {
    return isDark
      ? [
          mixColors(colors.surfaceElevated ?? colors.cardBackground, resolvedAccent, 0.09),
          mixColors(colors.cardBackground, colors.white, 0.08),
          mixColors(colors.background, colors.primary, 0.035),
        ]
      : [
          mixColors(colors.cardBackground, resolvedAccent, 0.065),
          mixColors(colors.cardBackground, colors.gold, 0.045),
          colors.background,
        ];
  }

  return isDark
    ? [
        mixColors(colors.cardBackground, colors.gold, 0.12),
        mixColors(colors.cardBackground, resolvedAccent, 0.06),
        colors.background,
      ]
    : [
        mixColors(colors.cardBackground, colors.gold, 0.1),
        mixColors(colors.cardBackground, resolvedAccent, 0.045),
        colors.background,
      ];
}

interface AndroidLightSurfaceOptions {
  accentColor?: string;
  shadowColor?: string;
  backgroundAlpha?: number;
  borderAlpha?: number;
  overlayAlpha?: number;
  shadowOpacity?: number;
  shadowRadius?: number;
  shadowOffsetY?: number;
  elevation?: number;
}

type ObsidianSurfaceIntensity = 'flat' | 'raised' | 'glow' | 'premium';

interface ObsidianSurfaceOptions {
  accentColor?: string;
  intensity?: ObsidianSurfaceIntensity;
  backgroundAlpha?: number;
  borderAlpha?: number;
  shadowOpacity?: number;
  shadowRadius?: number;
  shadowOffsetY?: number;
  elevation?: number;
}

type WellnessPremiumSurfaceKind = 'standard' | 'feature' | 'hero';

interface WellnessPremiumSurfaceOptions {
  accentColor?: string;
  kind?: WellnessPremiumSurfaceKind;
}

export function getObsidianSurface(colors: ThemeColors, options: ObsidianSurfaceOptions = {}) {
  const inferredDark = colors.background === DARK_COLORS.background || colors.background === '#000000';
  const accentColor = softenAccentColor(colors, inferredDark, options.accentColor ?? colors.primary, 'standard');
  const intensity = options.intensity ?? 'raised';
  const backgroundAlpha =
    options.backgroundAlpha ??
    (intensity === 'premium' ? 0.08 : intensity === 'glow' ? 0.052 : intensity === 'flat' ? 0.014 : 0.032);
  const borderAlpha =
    options.borderAlpha ??
    (intensity === 'premium' ? 0.24 : intensity === 'glow' ? 0.16 : intensity === 'flat' ? 0.055 : 0.1);
  const shadowOpacity =
    options.shadowOpacity ??
    (intensity === 'flat' ? 0.07 : intensity === 'premium' ? 0.16 : intensity === 'glow' ? 0.13 : 0.1);
  const shadowRadius =
    options.shadowRadius ??
    (intensity === 'flat' ? 14 : intensity === 'premium' ? 30 : intensity === 'glow' ? 26 : 22);
  const shadowOffsetY =
    options.shadowOffsetY ??
    (intensity === 'flat' ? 6 : intensity === 'premium' ? 14 : intensity === 'glow' ? 12 : 10);

  return {
    backgroundColor: mixColors(colors.cardBackground, accentColor, backgroundAlpha),
    borderColor: withAlpha(accentColor, borderAlpha),
    highlightColor: withAlpha(colors.white, intensity === 'premium' ? 0.18 : 0.1),
    shadowStyle: {
      shadowColor: accentColor,
      shadowOffset: { width: 0, height: shadowOffsetY },
      shadowOpacity,
      shadowRadius,
      elevation:
        options.elevation ??
        (intensity === 'flat' ? 1 : intensity === 'premium' ? 6 : intensity === 'glow' ? 5 : 3),
    },
  };
}

export function getAndroidLightSurface(colors: ThemeColors, options: AndroidLightSurfaceOptions = {}) {
  const accentColor = softenAccentColor(colors, false, options.accentColor ?? colors.primary, 'standard');
  const shadowTint = softenAccentColor(colors, false, options.shadowColor ?? accentColor, 'subtle');
  const backgroundBase = colors.surfaceMuted ?? colors.cardBackground;
  const borderBase = colors.borderSubtle ?? colors.lightGray;
  const backgroundColor = mixColors(backgroundBase, accentColor, options.backgroundAlpha ?? 0.035);
  const borderColor = mixColors(borderBase, accentColor, options.borderAlpha ?? 0.1);
  const overlayColor = withAlpha(accentColor, options.overlayAlpha ?? 0.06);

  return {
    backgroundColor,
    borderColor,
    overlayColor,
    shadowStyle: {
      shadowColor: mixColors(colors.gray, shadowTint, 0.24),
      shadowOffset: { width: 0, height: options.shadowOffsetY ?? 6 },
      shadowOpacity: options.shadowOpacity ?? 0.05,
      shadowRadius: options.shadowRadius ?? 16,
      elevation: options.elevation ?? 2,
    },
  };
}

export function getWellnessPremiumSurface(
  colors: ThemeColors,
  isDark: boolean,
  options: WellnessPremiumSurfaceOptions = {},
) {
  const accentColor = softenAccentColor(colors, isDark, options.accentColor ?? colors.primary, 'standard');
  const kind = options.kind ?? 'feature';
  const champagneAccent = softenAccentColor(
    colors,
    isDark,
    mixColors(colors.gold, colors.white, isDark ? 0.22 : 0.48),
    'selected',
  );
  const bronzeAccent = softenAccentColor(
    colors,
    isDark,
    mixColors(colors.warning, colors.gold, isDark ? 0.32 : 0.16),
    'standard',
  );
  const refinedAccent = mixColors(accentColor, champagneAccent, isDark ? 0.1 : 0.08);
  const borderAccent = mixColors(refinedAccent, bronzeAccent, 0.14);

  if (Platform.OS === 'android' && !isDark) {
    const androidSurface = getAndroidLightSurface(colors, {
      accentColor: refinedAccent,
      shadowColor: borderAccent,
      backgroundAlpha: kind === 'hero' ? 0.065 : kind === 'feature' ? 0.05 : 0.035,
      borderAlpha: kind === 'hero' ? 0.16 : kind === 'feature' ? 0.12 : 0.1,
      overlayAlpha: kind === 'hero' ? 0.08 : 0.05,
      shadowOpacity: kind === 'hero' ? 0.08 : 0.055,
      shadowRadius: kind === 'hero' ? 22 : 18,
      shadowOffsetY: kind === 'hero' ? 9 : 7,
      elevation: kind === 'hero' ? 5 : 3,
    });

    return {
      backgroundColor: mixColors(androidSurface.backgroundColor, colors.white, 0.18),
      borderColor: mixColors(androidSurface.borderColor, colors.goldLight, 0.18),
      highlightColor: withAlpha(colors.white, 0.94),
      shadowStyle: androidSurface.shadowStyle,
    };
  }

  if (isDark) {
    const obsidianSurface = getObsidianSurface(colors, {
      accentColor: refinedAccent,
      intensity: kind === 'hero' ? 'premium' : 'glow',
      backgroundAlpha:
        kind === 'hero' ? 0.09 : kind === 'feature' ? 0.06 : 0.048,
      borderAlpha:
        kind === 'hero' ? 0.22 : kind === 'feature' ? 0.15 : 0.12,
      shadowOpacity: kind === 'hero' ? 0.16 : 0.11,
      shadowRadius: kind === 'hero' ? 30 : 24,
      shadowOffsetY: kind === 'hero' ? 14 : 10,
      elevation: kind === 'hero' ? 6 : 4,
    });

    return {
      backgroundColor: mixColors(
        obsidianSurface.backgroundColor,
        colors.cardBackground,
        kind === 'hero' ? 0.16 : 0.1,
      ),
      borderColor: withAlpha(borderAccent, kind === 'hero' ? 0.2 : 0.13),
      highlightColor: withAlpha(colors.white, kind === 'hero' ? 0.18 : 0.12),
      shadowStyle: {
        ...obsidianSurface.shadowStyle,
        shadowColor: mixColors(borderAccent, colors.background, 0.18),
      },
    };
  }

  const backgroundBase = mixColors(colors.cardBackground, colors.goldLight, kind === 'hero' ? 0.16 : 0.09);
  const backgroundColor = mixColors(backgroundBase, refinedAccent, kind === 'hero' ? 0.05 : 0.03);
  const borderColor = withAlpha(borderAccent, kind === 'hero' ? 0.16 : 0.11);

  return {
    backgroundColor,
    borderColor,
    highlightColor: withAlpha(colors.white, 0.96),
    shadowStyle: {
      ...SHADOWS.card,
      shadowColor: mixColors(borderAccent, colors.gray, 0.22),
      shadowOpacity: kind === 'hero' ? 0.09 : 0.06,
      shadowRadius: kind === 'hero' ? 26 : 20,
      shadowOffset: { width: 0, height: kind === 'hero' ? 12 : 8 },
      elevation: kind === 'hero' ? 6 : 3,
    },
  };
}

export type MainPageChromeTone =
  | 'trust'
  | 'analytics'
  | 'coach'
  | 'scanner'
  | 'social'
  | 'nutrition'
  | 'fitness'
  | 'premium';

interface MainPageSurfaceChrome {
  backgroundColor: string;
  borderColor: string;
  shadowStyle: ViewStyle;
}

interface MainPageChipChrome {
  backgroundColor: string;
  borderColor: string;
  textColor: string;
}

interface MainPageActionChrome extends MainPageChipChrome {
  iconColor: string;
  shadowColor: string;
}

export interface MainPageChrome {
  tone: MainPageChromeTone;
  accentColor: string;
  canvas: string;
  canvasElevated: string;
  headerBackground: string;
  headerBorder: string;
  divider: string;
  mutedText: string;
  surface: MainPageSurfaceChrome;
  elevatedSurface: MainPageSurfaceChrome;
  heroSurface: MainPageSurfaceChrome;
  mutedSurface: MainPageSurfaceChrome;
  chip: MainPageChipChrome;
  chipActive: MainPageChipChrome;
  ctaPrimary: MainPageActionChrome;
  ctaSecondary: MainPageActionChrome;
  chart: {
    grid: string;
    axis: string;
    line: string;
    fill: string;
    emptyBackground: string;
  };
}

function resolveMainPageAccent(
  colors: ThemeColors,
  isDark: boolean,
  tone: MainPageChromeTone,
) {
  const opalAccent = colors.accent ?? colors.secondary ?? colors.primary;
  const neutralBlue = mixColors(colors.primary, colors.gray, isDark ? 0.28 : 0.34);
  const analyticNeutral = mixColors(colors.gray, colors.primary, isDark ? 0.32 : 0.26);

  switch (tone) {
    case 'analytics':
      return softenAccentColor(colors, isDark, analyticNeutral, 'standard');
    case 'coach':
      return softenAccentColor(colors, isDark, mixColors(opalAccent, colors.primary, isDark ? 0.22 : 0.18), 'standard');
    case 'scanner':
      return softenAccentColor(colors, isDark, isDark ? mixColors(colors.primary, opalAccent, 0.24) : colors.primary, 'selected');
    case 'social':
      return softenAccentColor(colors, isDark, mixColors(colors.primary, opalAccent, isDark ? 0.28 : 0.18), 'standard');
    case 'nutrition':
      return softenAccentColor(colors, isDark, mixColors(colors.warning, colors.gold, isDark ? 0.16 : 0.1), 'standard');
    case 'fitness':
      return softenAccentColor(colors, isDark, mixColors(colors.success, colors.gray, isDark ? 0.3 : 0.36), 'standard');
    case 'premium':
      return softenAccentColor(colors, isDark, colors.gold, 'selected');
    case 'trust':
    default:
      return softenAccentColor(colors, isDark, neutralBlue, 'standard');
  }
}

function buildMainPageSurface(
  colors: ThemeColors,
  isDark: boolean,
  accentColor: string,
  kind: 'muted' | 'standard' | 'elevated' | 'hero',
): MainPageSurfaceChrome {
  const baseColor =
    isDark
      ? kind === 'muted'
        ? '#0E0E12'
        : kind === 'hero'
          ? '#111118'
          : '#121216'
      : kind === 'muted'
        ? colors.surfaceMuted ?? colors.cardBackground
        : kind === 'hero'
          ? colors.surfaceElevated ?? colors.cardBackground
          : colors.cardBackground;
  const backgroundAlpha =
    kind === 'hero'
      ? isDark ? 0.11 : 0.045
      : kind === 'elevated'
        ? isDark ? 0.07 : 0.026
        : kind === 'muted'
          ? isDark ? 0.048 : 0.022
          : isDark ? 0.04 : 0.016;
  const borderAlpha =
    kind === 'hero'
      ? isDark ? 0.22 : 0.12
      : kind === 'elevated'
        ? isDark ? 0.16 : 0.09
        : kind === 'muted'
          ? isDark ? 0.11 : 0.07
          : isDark ? 0.12 : 0.065;
  const shadowOpacity =
    kind === 'hero'
      ? isDark ? 0.16 : 0.06
      : kind === 'muted'
        ? isDark ? 0.06 : 0.025
        : isDark ? 0.1 : 0.04;
  const shadowRadius = kind === 'hero' ? 28 : kind === 'muted' ? 14 : 22;
  const shadowOffsetY = kind === 'hero' ? 14 : kind === 'muted' ? 6 : 10;

  return {
    backgroundColor: mixColors(baseColor, accentColor, backgroundAlpha),
    borderColor: withAlpha(accentColor, borderAlpha),
    shadowStyle: {
      shadowColor: isDark ? mixColors(accentColor, '#000000', 0.18) : mixColors(colors.gray, accentColor, 0.2),
      shadowOffset: { width: 0, height: shadowOffsetY },
      shadowOpacity,
      shadowRadius,
      elevation: kind === 'hero' ? 5 : kind === 'muted' ? 1 : 3,
    },
  };
}

export function getMainPageChrome(
  colors: ThemeColors,
  isDark: boolean,
  tone: MainPageChromeTone = 'trust',
): MainPageChrome {
  const tokens = getThemeTokens(isDark);
  const accentColor = resolveMainPageAccent(colors, isDark, tone);
  const warmCanvas = isDark ? '#000000' : '#F7F3ED';
  const canvas = mixColors(warmCanvas, accentColor, isDark ? 0.016 : 0.014);
  const canvasElevated = isDark
    ? mixColors('#08080C', accentColor, 0.035)
    : mixColors('#FFFBF6', accentColor, 0.014);
  const mutedText = isDark
    ? withAlpha(colors.primaryText, 0.68)
    : withAlpha(colors.primaryText, 0.62);
  const surface = buildMainPageSurface(colors, isDark, accentColor, 'standard');
  const elevatedSurface = buildMainPageSurface(colors, isDark, accentColor, 'elevated');
  const heroSurface = buildMainPageSurface(colors, isDark, accentColor, 'hero');
  const mutedSurface = buildMainPageSurface(colors, isDark, accentColor, 'muted');
  const chipBackground = isDark
    ? withAlpha(colors.white, 0.064)
    : withAlpha(colors.white, 0.82);
  const chipBorder = isDark
    ? withAlpha(colors.white, 0.12)
    : withAlpha(colors.primaryText, 0.08);
  const activeChipBackground = isDark
    ? withAlpha(accentColor, 0.11)
    : mixColors(colors.cardBackground, accentColor, 0.045);

  return {
    tone,
    accentColor,
    canvas,
    canvasElevated,
    headerBackground: isDark ? withAlpha(canvasElevated, 0.92) : withAlpha('#FFFCF8', 0.94),
    headerBorder: isDark
      ? withAlpha(colors.white, 0.1)
      : withAlpha(colors.primaryText, 0.07),
    divider: tokens.divider,
    mutedText,
    surface,
    elevatedSurface,
    heroSurface,
    mutedSurface,
    chip: {
      backgroundColor: chipBackground,
      borderColor: chipBorder,
      textColor: mutedText,
    },
    chipActive: {
      backgroundColor: activeChipBackground,
      borderColor: withAlpha(accentColor, isDark ? 0.18 : 0.12),
      textColor: isDark ? mixColors(accentColor, colors.white, 0.2) : mixColors(accentColor, colors.primaryText, 0.26),
    },
    ctaPrimary: {
      backgroundColor: isDark
        ? mixColors(colors.primaryText, accentColor, 0.12)
        : colors.primaryText,
      borderColor: isDark ? withAlpha(accentColor, 0.14) : withAlpha(colors.primaryText, 0.08),
      textColor: colors.background,
      iconColor: colors.background,
      shadowColor: accentColor,
    },
    ctaSecondary: {
      backgroundColor: activeChipBackground,
      borderColor: withAlpha(accentColor, isDark ? 0.14 : 0.1),
      textColor: colors.primaryText,
      iconColor: colors.primaryText,
      shadowColor: accentColor,
    },
    chart: {
      grid: isDark ? withAlpha(colors.white, 0.09) : tokens.chart.grid,
      axis: isDark ? withAlpha(colors.primaryText, 0.58) : tokens.chart.axis,
      line: accentColor,
      fill: withAlpha(accentColor, isDark ? 0.12 : 0.07),
      emptyBackground: isDark
        ? withAlpha(colors.white, 0.045)
        : withAlpha(colors.primaryText, 0.035),
    },
  };
}

/**
 * Coach card "paper" surface tokens.
 * Iteration 5 — re-aligned on the app's native palette (no parchment cream).
 * Light surfaces are pure white / off-white in the spirit of Opal; dark
 * surfaces match the app's warm dark canvas so the coach card stays homogeneous
 * with HomeScreen, ScannerScreen and result screens.
 */
export const COACH_PAPER_PALETTE = {
  light: {
    canvas: '#FFFFFF',
    raised: '#F6F6F3',
    border: 'rgba(28, 28, 30, 0.08)',
    hairline: 'rgba(28, 28, 30, 0.06)',
    ink: '#1C1C1E',
    inkMuted: '#63666D',
    inkSubtle: 'rgba(28, 28, 30, 0.42)',
  },
  dark: {
    canvas: '#121212',
    raised: '#1B1B1B',
    border: 'rgba(255, 255, 255, 0.08)',
    hairline: 'rgba(255, 255, 255, 0.06)',
    ink: '#F7F7F7',
    inkMuted: '#8E8E93',
    inkSubtle: 'rgba(247, 247, 247, 0.5)',
  },
} as const;

export interface CoachPaperSurface {
  canvas: string;
  raised: string;
  border: string;
  hairline: string;
  ink: string;
  inkMuted: string;
  inkSubtle: string;
}

export function getCoachPaperSurface(isDark: boolean): CoachPaperSurface {
  return isDark ? COACH_PAPER_PALETTE.dark : COACH_PAPER_PALETTE.light;
}

// Tokens for text and overlays rendered ON TOP of imagery (coach portraits,
// prompt artworks). Centralising them here keeps the contrast strategy
// consistent across Hero/Persona/Prompt cards instead of having each card
// invent its own rgba scrim. The values are calibrated to match the
// existing Coach look — applying these tokens does not visibly change the
// current rendering, but every new surface on imagery can now opt-in.
export const COACH_ON_MEDIA_PALETTE = {
  light: {
    textPrimary: '#FFFFFF',
    textSecondary: 'rgba(255, 255, 255, 0.88)',
    scrimTransparent: 'rgba(0, 0, 0, 0)',
    scrimSoft: 'rgba(0, 0, 0, 0.32)',
    scrimMedium: 'rgba(0, 0, 0, 0.5)',
    scrimStrong: 'rgba(0, 0, 0, 0.7)',
    textShadowColor: 'rgba(0, 0, 0, 0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  dark: {
    textPrimary: '#FFFFFF',
    textSecondary: 'rgba(255, 255, 255, 0.86)',
    scrimTransparent: 'rgba(0, 0, 0, 0)',
    scrimSoft: 'rgba(0, 0, 0, 0.4)',
    scrimMedium: 'rgba(0, 0, 0, 0.55)',
    scrimStrong: 'rgba(0, 0, 0, 0.78)',
    textShadowColor: 'rgba(0, 0, 0, 0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
} as const;

export interface CoachOnMediaTokens {
  textPrimary: string;
  textSecondary: string;
  scrimTransparent: string;
  scrimSoft: string;
  scrimMedium: string;
  scrimStrong: string;
  textShadowColor: string;
  textShadowOffset: { width: number; height: number };
  textShadowRadius: number;
}

export type CoachOnMediaScrimIntensity = 'soft' | 'medium' | 'strong';

export function getCoachOnMediaTokens(isDark: boolean): CoachOnMediaTokens {
  return isDark ? COACH_ON_MEDIA_PALETTE.dark : COACH_ON_MEDIA_PALETTE.light;
}

/**
 * Returns a `[transparent, scrim]` tuple ready to feed `LinearGradient` so a
 * surface can protect text rendered over an image. Pass `intensity` to pick
 * the scrim strength.
 */
export function getCoachOnMediaGradient(
  isDark: boolean,
  intensity: CoachOnMediaScrimIntensity = 'medium',
): readonly [string, string] {
  const tokens = getCoachOnMediaTokens(isDark);
  const end =
    intensity === 'soft'
      ? tokens.scrimSoft
      : intensity === 'strong'
        ? tokens.scrimStrong
        : tokens.scrimMedium;
  return [tokens.scrimTransparent, end] as const;
}
