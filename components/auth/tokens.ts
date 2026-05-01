import { useMemo } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { ThemeColors, mixColors, withAlpha } from '@/constants/theme';

export interface AuthPalette {
  accent: string;
  accentSoft: string;
  accentSofter: string;
  accentRing: string;
  accentText: string;
  surface: string;
  surfaceSubtle: string;
  divider: string;
  inverseText: string;
  background: string;
}

export interface OnboardingPalette {
  background: string;
  backgroundMid: string;
  backgroundDeep: string;
  surface: string;
  surfaceElevated: string;
  surfaceSoft: string;
  surfaceGlass: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentStrong: string;
  accentSoft: string;
  accentSofter: string;
  accentSecondary: string;
  accentSecondarySoft: string;
  border: string;
  borderStrong: string;
  inactive: string;
  glow: string;
  glowSecondary: string;
  backgroundGradient: [string, string, string];
  cardGradient: [string, string, string];
  ctaFill: string;
}

export function buildAuthPalette(colors: ThemeColors, isDark: boolean): AuthPalette {
  return {
    accent: colors.primary,
    accentSoft: withAlpha(colors.primary, isDark ? 0.18 : 0.12),
    accentSofter: mixColors(colors.cardBackground, colors.primary, isDark ? 0.10 : 0.05),
    accentRing: colors.primary,
    accentText: colors.primary,
    surface: colors.cardBackground,
    surfaceSubtle: mixColors(colors.cardBackground, colors.primary, isDark ? 0.05 : 0.03),
    divider: withAlpha(colors.primary, isDark ? 0.18 : 0.14),
    inverseText: colors.background,
    background: colors.background,
  };
}

export function buildOnboardingPalette(
  colors: ThemeColors,
  _isDark: boolean,
): OnboardingPalette {
  const background = '#050B14';
  const backgroundMid = '#081322';
  const backgroundDeep = '#0D1B2E';
  const surface = '#0B1628';
  const surfaceElevated = '#101F36';
  const textPrimary = '#F8FBFF';
  const textSecondary = '#A9BAD6';
  const textMuted = '#6F86A8';
  const accentStrong = mixColors(colors.primary, colors.white, 0.14);

  return {
    background,
    backgroundMid,
    backgroundDeep,
    surface,
    surfaceElevated,
    surfaceSoft: mixColors(surface, colors.primary, 0.1),
    surfaceGlass: withAlpha(surfaceElevated, 0.88),
    textPrimary,
    textSecondary,
    textMuted,
    accent: colors.primary,
    accentStrong,
    accentSoft: withAlpha(colors.primary, 0.22),
    accentSofter: withAlpha(colors.primary, 0.1),
    accentSecondary: colors.secondary,
    accentSecondarySoft: withAlpha(colors.secondary, 0.16),
    border: withAlpha(textSecondary, 0.18),
    borderStrong: withAlpha(colors.primary, 0.34),
    inactive: withAlpha(textSecondary, 0.22),
    glow: withAlpha(colors.primary, 0.16),
    glowSecondary: withAlpha(colors.secondary, 0.12),
    backgroundGradient: [background, backgroundMid, backgroundDeep],
    cardGradient: [
      mixColors(surfaceElevated, colors.primary, 0.2),
      mixColors(surfaceElevated, colors.secondary, 0.14),
      surface,
    ],
    ctaFill: mixColors(colors.primary, colors.secondary, 0.22),
  };
}

export function useAuthPalette(): AuthPalette {
  const { colors, isDark } = useTheme();
  return useMemo(() => buildAuthPalette(colors, isDark), [colors, isDark]);
}

export function useOnboardingPalette(): OnboardingPalette {
  const { colors, isDark } = useTheme();
  return useMemo(
    () => buildOnboardingPalette(colors, isDark),
    [colors, isDark],
  );
}
