import { useMemo } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { ThemeColors, mixColors, withAlpha } from '@/constants/theme';
import { buildPremiumHealthPalette } from '@/constants/premiumHealth';

export interface AuthPalette {
  accent: string;
  accentSoft: string;
  accentSofter: string;
  accentRing: string;
  accentText: string;
  surface: string;
  surfaceStrong: string;
  surfaceGlass: string;
  surfaceSubtle: string;
  divider: string;
  inverseText: string;
  background: string;
  heroGlowPrimary: string;
  heroGlowSecondary: string;
  heroBorder: string;
  secondaryActionFill: string;
  secondaryActionBorder: string;
  progressInactive: string;
  progressActive: string;
  shadowColor: string;
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
  secondaryActionFill: string;
  secondaryActionBorder: string;
  progressActive: string;
  progressInactive: string;
  heroScrimStrong: string;
  heroScrimSoft: string;
  shadowColor: string;
}

export function buildAuthPalette(colors: ThemeColors, isDark: boolean): AuthPalette {
  const surfaceMuted = colors.surfaceMuted ?? colors.cardBackground;
  const accent = colors.primary;

  return {
    accent,
    accentSoft: withAlpha(accent, isDark ? 0.18 : 0.1),
    accentSofter: surfaceMuted,
    accentRing: accent,
    accentText: accent,
    surface: colors.cardBackground,
    surfaceStrong: mixColors(colors.cardBackground, accent, isDark ? 0.1 : 0.045),
    surfaceGlass: colors.cardBackground,
    surfaceSubtle: surfaceMuted,
    divider: colors.borderSubtle ?? withAlpha(colors.primaryText, isDark ? 0.12 : 0.08),
    inverseText: colors.background,
    background: colors.background,
    heroGlowPrimary: 'transparent',
    heroGlowSecondary: 'transparent',
    heroBorder: colors.borderSubtle ?? withAlpha(colors.primaryText, isDark ? 0.12 : 0.08),
    secondaryActionFill: surfaceMuted,
    secondaryActionBorder:
      colors.borderSubtle ?? withAlpha(colors.primaryText, isDark ? 0.12 : 0.08),
    progressInactive: isDark
      ? withAlpha(colors.white, 0.14)
      : withAlpha(colors.primaryText, 0.1),
    progressActive: accent,
    shadowColor: 'transparent',
  };
}

export function buildOnboardingPalette(
  colors: ThemeColors,
  isDark: boolean,
): OnboardingPalette {
  const premiumHealth = buildPremiumHealthPalette(colors, isDark);
  const background = premiumHealth.canvas;
  const backgroundMid = premiumHealth.canvasElevated;
  const backgroundDeep = premiumHealth.surfaceBase;
  const surface = premiumHealth.surfaceBase;
  const surfaceElevated = premiumHealth.surfaceRaised;
  const textPrimary = isDark ? '#F6FBFF' : '#16212B';
  const textSecondary = isDark ? '#B7C6D4' : '#60707D';
  const textMuted = isDark ? '#7F92A3' : '#86929D';
  const accent = premiumHealth.trustAccent;
  const accentSecondary = premiumHealth.premiumAccent;
  const accentStrong = mixColors(accent, colors.white, isDark ? 0.16 : 0.06);

  return {
    background,
    backgroundMid,
    backgroundDeep,
    surface,
    surfaceElevated,
    surfaceSoft: mixColors(surface, accent, isDark ? 0.12 : 0.08),
    surfaceGlass: premiumHealth.surfaceGlass,
    textPrimary,
    textSecondary,
    textMuted,
    accent,
    accentStrong,
    accentSoft: withAlpha(accent, isDark ? 0.24 : 0.18),
    accentSofter: withAlpha(accent, isDark ? 0.12 : 0.08),
    accentSecondary: accentSecondary,
    accentSecondarySoft: withAlpha(accentSecondary, isDark ? 0.16 : 0.12),
    border: premiumHealth.borderSubtle,
    borderStrong: premiumHealth.borderStrong,
    inactive: withAlpha(textSecondary, isDark ? 0.22 : 0.18),
    glow: withAlpha(accent, isDark ? 0.12 : 0.08),
    glowSecondary: withAlpha(accentSecondary, isDark ? 0.14 : 0.08),
    backgroundGradient: premiumHealth.moduleGradient,
    cardGradient: [
      mixColors(surfaceElevated, accent, isDark ? 0.18 : 0.12),
      mixColors(surfaceElevated, accentSecondary, isDark ? 0.1 : 0.08),
      surface,
    ],
    ctaFill: isDark ? '#F7FBFF' : '#16202A',
    secondaryActionFill: isDark
      ? withAlpha('#F7FBFF', 0.05)
      : withAlpha('#16202A', 0.035),
    secondaryActionBorder: isDark
      ? withAlpha('#F7FBFF', 0.12)
      : withAlpha('#16202A', 0.08),
    progressActive: accent,
    progressInactive: isDark
      ? withAlpha(textPrimary, 0.14)
      : withAlpha(textPrimary, 0.1),
    heroScrimStrong: withAlpha(background, isDark ? 0.88 : 0.74),
    heroScrimSoft: withAlpha(background, isDark ? 0.54 : 0.24),
    shadowColor: isDark ? accent : textPrimary,
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
