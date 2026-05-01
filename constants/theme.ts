import { Platform } from 'react-native';

export const LIGHT_COLORS = {
  background: '#F5F6FA',
  cardBackground: '#FFFFFF',
  surfaceMuted: '#F7F8FC',
  surfaceAccent: '#EAF3FF',
  primaryText: '#1C1C1E',
  secondaryText: '#6E6E73',
  textMuted: '#6E6E73',
  accentGreen: '#34C759',
  accent: '#007AFF',
  lightGray: '#E3E7EF',
  gray: '#6E6E73',
  grayLight: '#F7F8FC',
  grayMedium: '#D5DBE7',
  darkGray: '#3B3F4A',
  borderSubtle: '#E3E7EF',
  borderStrong: '#D5DBE7',
  primary: '#007AFF',
  primaryLight: '#EAF3FF',
  primaryDark: '#0056B3',
  secondary: '#5856D6',
  white: '#FFFFFF',
  error: '#FF3B30',
  success: '#34C759',
  successLight: '#E8F9ED',
  warning: '#FF9500',
  gold: '#FFD700',
  goldLight: '#FFF8E1',
};

export const DARK_COLORS = {
  background: '#000000',
  cardBackground: '#1C1C1E',
  surfaceMuted: '#1C1C1E',
  surfaceAccent: '#002B5C',
  primaryText: '#FFFFFF',
  secondaryText: '#8E8E93',
  textMuted: '#8E8E93',
  accentGreen: '#30D158',
  accent: '#0A84FF',
  lightGray: '#2C2C2E',
  gray: '#8E8E93',
  grayLight: '#1C1C1E', // Often used for inputs or secondary cards
  grayMedium: '#48484A',
  darkGray: '#D1D1D6', // Using lighter gray for "darkGray" in dark mode for visibility
  borderSubtle: '#2C2C2E',
  borderStrong: '#48484A',
  primary: '#0A84FF',
  primaryLight: '#002B5C', // Darker shade of primary
  primaryDark: '#0040DD',
  secondary: '#5E5CE6',
  white: '#FFFFFF', // Keep white as white for specific usages
  error: '#FF453A',
  success: '#30D158',
  successLight: '#053312', // Dark green background
  warning: '#FF9F0A',
  gold: '#FFD60A',
  goldLight: '#4D3F00', // Dark gold background
};

export type ThemeType = 'light' | 'dark';

export const COLORS = LIGHT_COLORS; // Backward compatibility for now, will be removed/unused in refactored files


export const FONTS = {
  regular: 'System',
  semiBold: 'System',
  bold: 'System',
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
  text16: 16,
  text18: 18,
  text20: 20,
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
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  pill: 28,
  hero: 32,
  card: 12,
  button: 8,
  tag: 8,
  full: 9999,
};

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
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 3,
      },
      default: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.04,
        shadowRadius: 12,
        elevation: 2,
      },
    }) ?? {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.04,
      shadowRadius: 12,
      elevation: 2,
    }),
  },
  cardHover: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 5,
  },
  header: {
    ...(Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
      },
      default: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.025,
        shadowRadius: 8,
        elevation: 1,
      },
    }) ?? {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.025,
      shadowRadius: 8,
      elevation: 1,
    }),
  },
  button: {
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  soft: {
    ...(Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.06,
        shadowRadius: 20,
        elevation: 4,
      },
      default: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.04,
        shadowRadius: 24,
        elevation: 3,
      },
    }) ?? {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.04,
      shadowRadius: 24,
      elevation: 3,
    }),
  },
  lift: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 14,
    elevation: 6,
  },
};

export type ThemeColors = typeof LIGHT_COLORS;

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

export function getAndroidLightSurface(colors: ThemeColors, options: AndroidLightSurfaceOptions = {}) {
  const accentColor = options.accentColor ?? colors.primary;
  const shadowTint = options.shadowColor ?? accentColor;
  const backgroundBase = colors.surfaceMuted ?? colors.cardBackground;
  const borderBase = colors.borderSubtle ?? colors.lightGray;
  const backgroundColor = mixColors(backgroundBase, accentColor, options.backgroundAlpha ?? 0.06);
  const borderColor = mixColors(borderBase, accentColor, options.borderAlpha ?? 0.16);
  const overlayColor = withAlpha(accentColor, options.overlayAlpha ?? 0.1);

  return {
    backgroundColor,
    borderColor,
    overlayColor,
    shadowStyle: {
      shadowColor: mixColors(colors.gray, shadowTint, 0.24),
      shadowOffset: { width: 0, height: options.shadowOffsetY ?? 6 },
      shadowOpacity: options.shadowOpacity ?? 0.08,
      shadowRadius: options.shadowRadius ?? 16,
      elevation: options.elevation ?? 2,
    },
  };
}
