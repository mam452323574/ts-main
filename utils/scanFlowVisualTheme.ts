import {
  type ThemeColors,
  mixColors,
  withAlpha,
} from '@/constants/theme';
import type { ScanType } from '@/types';

const CHEF_SOFT_GOLD = '#C9A46A';
const CHEF_LIGHT_BASE = '#FFF8EF';
const CHEF_LIGHT_SURFACE = '#FFFDF8';
const CHEF_LIGHT_SURFACE_ELEVATED = '#FBF2E5';
const CHEF_LIGHT_SURFACE_STRONG = '#F5EAD8';
const CHEF_LIGHT_BORDER = '#E6D7C1';
const CHEF_LIGHT_BORDER_STRONG = '#D7C3A3';
const CHEF_LIGHT_TEXT = '#3B3126';
const CHEF_LIGHT_TEXT_SECONDARY = '#6E5B46';
const CHEF_LIGHT_TEXT_MUTED = '#8E7A63';
const CHEF_DARK_BASE = '#08090C';
const CHEF_DARK_SURFACE = '#151820';
const CHEF_DARK_SURFACE_ELEVATED = '#1B1F28';
const CHEF_DARK_SURFACE_STRONG = '#10130D';
const CHEF_DARK_BORDER = '#4C412D';
const CHEF_DARK_BORDER_STRONG = '#6A593C';

export interface ScanPreviewVisualTheme {
  screenBackground: string;
  closeButtonBackground: string;
  closeButtonBorder: string;
  closeButtonIcon: string;
  actionPanelTint: 'light' | 'dark';
  actionPanelBackground: string;
  actionPanelShadowColor: string;
  infoLabelColor: string;
  infoValueColor: string;
  secondaryButtonBackground: string;
  secondaryButtonText: string;
  loadingOverlayBackground: string;
  progressCardBackground: string;
  progressCardBorder: string;
  progressCardShadowColor: string;
  loadingStepText: string;
  loadingSubtext: string;
  progressTrackBackground: string;
  progressTrackBorder: string;
  dotBackground: string;
}

export interface ScanFlowAccentTheme {
  accentColor: string;
  accentStrongColor: string;
  accentSoftBackground: string;
  accentBadgeBackground: string;
  progressGradient: [string, string];
  dotActiveColor: string;
  dotCompletedColor: string;
}

export interface ChefFlowVisualTheme {
  screenBackground: string;
  overlayBackground: string;
  surfaceBackground: string;
  surfaceElevated: string;
  surfaceStrong: string;
  borderColor: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;
  warmAccent: string;
  warmAccentSoft: string;
  chromeButtonBackground: string;
  chromeButtonBorder: string;
  footerBackground: string;
  footerBorder: string;
  imageBackground: string;
  imageBorder: string;
  imageBadgeBackground: string;
  imageBadgeBorder: string;
  reviewOverlayGradient: [string, string, string];
  reviewCardGradient: [string, string, string];
  imageBorderGradient: [string, string, string];
  imageVignetteGradient: [string, string, string];
  footerGradient: [string, string, string];
  progressTrackBackground: string;
  progressTrackBorder: string;
}

export function resolveScanPreviewVisualTheme(
  colors: ThemeColors,
  isDark: boolean,
): ScanPreviewVisualTheme {
  return {
    screenBackground: isDark ? '#050505' : colors.background,
    closeButtonBackground: isDark
      ? withAlpha('#000000', 0.4)
      : withAlpha(colors.white, 0.82),
    closeButtonBorder: isDark
      ? withAlpha(colors.white, 0.1)
      : withAlpha(colors.primaryText, 0.08),
    closeButtonIcon: isDark ? colors.white : colors.primaryText,
    actionPanelTint: isDark ? 'dark' : 'light',
    actionPanelBackground: isDark
      ? 'rgba(20, 20, 22, 0.4)'
      : withAlpha(colors.cardBackground, 0.84),
    actionPanelShadowColor: isDark
      ? '#000000'
      : mixColors(colors.gray, colors.primary, 0.18),
    infoLabelColor: isDark
      ? withAlpha(colors.white, 0.7)
      : colors.secondaryText,
    infoValueColor: isDark ? colors.white : colors.primaryText,
    secondaryButtonBackground: isDark
      ? withAlpha(colors.white, 0.12)
      : colors.surfaceMuted,
    secondaryButtonText: isDark ? colors.white : colors.primaryText,
    loadingOverlayBackground: isDark
      ? 'rgba(0, 0, 0, 0.85)'
      : withAlpha(colors.background, 0.9),
    progressCardBackground: isDark ? 'rgba(28, 28, 30, 0.98)' : colors.cardBackground,
    progressCardBorder: isDark
      ? withAlpha(colors.white, 0.08)
      : withAlpha(colors.primaryText, 0.06),
    progressCardShadowColor: isDark
      ? '#000000'
      : mixColors(colors.gray, colors.primary, 0.18),
    loadingStepText: isDark ? colors.white : colors.primaryText,
    loadingSubtext: isDark
      ? withAlpha(colors.white, 0.5)
      : colors.secondaryText,
    progressTrackBackground: isDark
      ? withAlpha(colors.white, 0.1)
      : colors.surfaceMuted,
    progressTrackBorder: isDark
      ? withAlpha(colors.white, 0.04)
      : withAlpha(colors.primaryText, 0.06),
    dotBackground: isDark
      ? withAlpha(colors.white, 0.2)
      : withAlpha(colors.primaryText, 0.14),
  };
}

export function resolveScanFlowAccentTheme(
  colors: ThemeColors,
  isDark: boolean,
  scanType: ScanType,
): ScanFlowAccentTheme {
  if (scanType === 'super') {
    const accentColor = isDark
      ? colors.gold
      : mixColors(CHEF_SOFT_GOLD, colors.warning, 0.16);
    const accentStrongColor = isDark
      ? colors.goldLight
      : mixColors('#FFF5DF', accentColor, 0.52);

    return {
      accentColor,
      accentStrongColor,
      accentSoftBackground: withAlpha(accentColor, isDark ? 0.12 : 0.14),
      accentBadgeBackground: withAlpha(accentColor, isDark ? 0.15 : 0.16),
      progressGradient: [accentStrongColor, accentColor],
      dotActiveColor: accentColor,
      dotCompletedColor: withAlpha(accentColor, isDark ? 0.62 : 0.5),
    };
  }

  const accentColor = colors.primary;
  const accentStrongColor = isDark
    ? colors.primaryDark
    : mixColors(colors.primary, colors.primaryDark, 0.2);

  return {
    accentColor,
    accentStrongColor,
    accentSoftBackground: withAlpha(accentColor, isDark ? 0.1 : 0.12),
    accentBadgeBackground: withAlpha(accentColor, isDark ? 0.15 : 0.14),
    progressGradient: [accentColor, accentStrongColor],
    dotActiveColor: accentStrongColor,
    dotCompletedColor: withAlpha(accentColor, isDark ? 0.6 : 0.46),
  };
}

export function resolveChefFlowVisualTheme(
  colors: ThemeColors,
  isDark: boolean,
): ChefFlowVisualTheme {
  if (isDark) {
    return {
      screenBackground: CHEF_DARK_BASE,
      overlayBackground: '#050508',
      surfaceBackground: CHEF_DARK_SURFACE,
      surfaceElevated: CHEF_DARK_SURFACE_ELEVATED,
      surfaceStrong: CHEF_DARK_SURFACE_STRONG,
      borderColor: CHEF_DARK_BORDER,
      borderStrong: CHEF_DARK_BORDER_STRONG,
      textPrimary: colors.white,
      textSecondary: '#D1D1D6',
      textMuted: '#A6A6AF',
      textInverse: colors.white,
      warmAccent: colors.gold,
      warmAccentSoft: withAlpha(colors.gold, 0.16),
      chromeButtonBackground: 'rgba(13, 15, 14, 0.78)',
      chromeButtonBorder: withAlpha(colors.gold, 0.18),
      footerBackground: 'rgba(12, 15, 20, 0.98)',
      footerBorder: withAlpha(colors.gold, 0.12),
      imageBackground: withAlpha(colors.white, 0.08),
      imageBorder: withAlpha(colors.white, 0.12),
      imageBadgeBackground: 'rgba(10, 13, 12, 0.82)',
      imageBadgeBorder: withAlpha(colors.gold, 0.24),
      reviewOverlayGradient: [
        'rgba(8, 10, 8, 0.96)',
        'rgba(12, 15, 19, 0.94)',
        'rgba(5, 5, 8, 0.98)',
      ],
      reviewCardGradient: [
        'rgba(245, 214, 127, 0.14)',
        'rgba(24, 30, 25, 0.98)',
        'rgba(12, 15, 20, 0.99)',
      ],
      imageBorderGradient: [
        'rgba(245, 214, 127, 0.44)',
        'rgba(47, 130, 236, 0.18)',
        'rgba(255, 255, 255, 0.1)',
      ],
      imageVignetteGradient: [
        'rgba(3, 7, 12, 0)',
        'rgba(3, 7, 12, 0.1)',
        'rgba(3, 7, 12, 0.46)',
      ],
      footerGradient: [
        'rgba(255, 255, 255, 0)',
        'rgba(255, 215, 10, 0.05)',
        'rgba(255, 215, 10, 0.08)',
      ],
      progressTrackBackground: withAlpha(colors.white, 0.12),
      progressTrackBorder: withAlpha(colors.white, 0.16),
    };
  }

  return {
    screenBackground: mixColors(colors.background, CHEF_LIGHT_BASE, 0.58),
    overlayBackground: CHEF_LIGHT_BASE,
    surfaceBackground: CHEF_LIGHT_SURFACE,
    surfaceElevated: CHEF_LIGHT_SURFACE_ELEVATED,
    surfaceStrong: CHEF_LIGHT_SURFACE_STRONG,
    borderColor: CHEF_LIGHT_BORDER,
    borderStrong: CHEF_LIGHT_BORDER_STRONG,
    textPrimary: CHEF_LIGHT_TEXT,
    textSecondary: CHEF_LIGHT_TEXT_SECONDARY,
    textMuted: CHEF_LIGHT_TEXT_MUTED,
    textInverse: colors.white,
    warmAccent: CHEF_SOFT_GOLD,
    warmAccentSoft: withAlpha(CHEF_SOFT_GOLD, 0.14),
    chromeButtonBackground: withAlpha(colors.white, 0.84),
    chromeButtonBorder: withAlpha(CHEF_SOFT_GOLD, 0.28),
    footerBackground: withAlpha(CHEF_LIGHT_SURFACE, 0.96),
    footerBorder: withAlpha(CHEF_SOFT_GOLD, 0.14),
    imageBackground: '#F2E8D8',
    imageBorder: withAlpha(CHEF_SOFT_GOLD, 0.22),
    imageBadgeBackground: 'rgba(59, 49, 38, 0.78)',
    imageBadgeBorder: withAlpha(colors.white, 0.22),
    reviewOverlayGradient: [
      withAlpha('#FFF8EF', 0.98),
      withAlpha('#F8F1E4', 0.96),
      withAlpha('#F3E7D7', 0.94),
    ],
    reviewCardGradient: [
      withAlpha(CHEF_SOFT_GOLD, 0.14),
      CHEF_LIGHT_SURFACE,
      '#F8F0E4',
    ],
    imageBorderGradient: [
      withAlpha(CHEF_SOFT_GOLD, 0.34),
      withAlpha(colors.primary, 0.12),
      withAlpha(colors.white, 0.92),
    ],
    imageVignetteGradient: [
      'rgba(255, 255, 255, 0)',
      'rgba(245, 237, 224, 0.12)',
      'rgba(214, 194, 158, 0.3)',
    ],
    footerGradient: [
      'rgba(255, 255, 255, 0)',
      'rgba(201, 164, 106, 0.05)',
      'rgba(201, 164, 106, 0.08)',
    ],
    progressTrackBackground: '#EFE4D2',
    progressTrackBorder: withAlpha(CHEF_SOFT_GOLD, 0.18),
  };
}

export function resolveChefSurfaceColors(
  colors: ThemeColors,
  isDark: boolean,
): ThemeColors {
  const palette = resolveChefFlowVisualTheme(colors, isDark);

  return {
    ...colors,
    background: palette.screenBackground,
    cardBackground: palette.surfaceBackground,
    surfaceMuted: palette.surfaceElevated,
    surfaceAccent: mixColors(
      palette.surfaceElevated,
      isDark ? colors.gold : CHEF_SOFT_GOLD,
      isDark ? 0.1 : 0.06,
    ),
    primaryText: palette.textPrimary,
    secondaryText: palette.textSecondary,
    textMuted: palette.textMuted,
    lightGray: palette.borderColor,
    gray: palette.textSecondary,
    grayLight: palette.surfaceElevated,
    grayMedium: palette.borderStrong,
    darkGray: palette.textMuted,
    borderSubtle: palette.borderColor,
    borderStrong: palette.borderStrong,
    gold: isDark ? colors.gold : CHEF_SOFT_GOLD,
    goldLight: isDark ? colors.goldLight : '#F7EEDB',
  };
}
