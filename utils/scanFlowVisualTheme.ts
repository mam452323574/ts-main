import {
  type ThemeColors,
  mixColors,
  softenAccentColor,
  withAlpha,
} from '@/constants/theme';
import { buildPremiumHealthPalette } from '@/constants/premiumHealth';
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
  loadingOverlayGradient: [string, string, string];
  loadingVignetteBackground: string;
  loadingVignetteBorder: string;
  loadingVignetteShadowColor: string;
  loadingVignetteMetaBackground: string;
  loadingVignetteMetaBorder: string;
  loadingVignetteMetaText: string;
  loadingPhaseEyebrow: string;
  loadingProgressValue: string;
  loadingInsightsLabel: string;
  loadingHeroShadowColor: string;
  loadingHeroScrimGradient: [string, string, string];
  loadingStepBackground: string;
  loadingStepBorder: string;
  loadingStepLabel: string;
  loadingTrustLineBackground: string;
  loadingTrustLineBorder: string;
  loadingTrustLineText: string;
}

export interface ScanFlowAccentTheme {
  accentColor: string;
  accentStrongColor: string;
  accentSoftBackground: string;
  accentBadgeBackground: string;
  progressGradient: [string, string];
  dotActiveColor: string;
  dotCompletedColor: string;
  chipBackground: string;
  chipBorder: string;
  chipText: string;
  vignetteFrameBorder: string;
  completionGlow: string;
  completionGlowSoft: string;
  guideStroke: string;
  guideWarning: string;
  guideSuccess: string;
  instructionBackground: string;
  instructionBorder: string;
  instructionText: string;
  countdownText: string;
  countdownRing: string;
  heroPreviewGradient: [string, string, string];
  heroPreviewMetaBackground: string;
  heroPreviewMetaBorder: string;
  heroPreviewMetaText: string;
  trustLineAccent: string;
}

export interface ScanCaptureVisualTheme {
  screenBackground: string;
  topScrimGradient: [string, string];
  bottomScrimGradient: [string, string, string];
  chromeBackground: string;
  chromeBorder: string;
  chromeText: string;
  chromeMutedText: string;
  instructionCardBackground: string;
  instructionCardBorder: string;
  instructionTitle: string;
  instructionBody: string;
  secondaryButtonBackground: string;
  secondaryButtonBorder: string;
  secondaryButtonText: string;
  primaryButtonBackground: string;
  primaryButtonBorder: string;
  primaryButtonText: string;
  countdownBackground: string;
  countdownText: string;
  countdownRing: string;
  shutterOuter: string;
  shutterInner: string;
  shadowColor: string;
  overlayTint: string;
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
  _isDark: boolean,
): ScanPreviewVisualTheme {
  const premium = buildPremiumHealthPalette(colors, true);
  const textPrimary = '#F6FBFF';
  const textSecondary = '#B7C6D4';
  const textMuted = '#7F92A3';

  return {
    screenBackground: premium.canvas,
    closeButtonBackground: withAlpha('#02070C', 0.62),
    closeButtonBorder: withAlpha(colors.white, 0.1),
    closeButtonIcon: textPrimary,
    actionPanelTint: 'dark',
    actionPanelBackground: withAlpha('#0B131B', 0.94),
    actionPanelShadowColor: premium.shadowColor,
    infoLabelColor: textSecondary,
    infoValueColor: textPrimary,
    secondaryButtonBackground: withAlpha(colors.white, 0.04),
    secondaryButtonText: textPrimary,
    loadingOverlayBackground: withAlpha('#02070C', 0.94),
    progressCardBackground: withAlpha('#0C141C', 0.96),
    progressCardBorder: premium.borderSubtle,
    progressCardShadowColor: premium.shadowColor,
    loadingStepText: textPrimary,
    loadingSubtext: textSecondary,
    progressTrackBackground: withAlpha(colors.white, 0.08),
    progressTrackBorder: premium.borderSubtle,
    dotBackground: withAlpha(colors.white, 0.16),
    loadingOverlayGradient: [
      withAlpha('#02070C', 0.96),
      withAlpha(premium.canvasElevated, 0.98),
      premium.canvas,
    ],
    loadingVignetteBackground: withAlpha('#0C141B', 0.42),
    loadingVignetteBorder: premium.borderStrong,
    loadingVignetteShadowColor: premium.shadowColor,
    loadingVignetteMetaBackground: withAlpha('#050B11', 0.78),
    loadingVignetteMetaBorder: premium.borderStrong,
    loadingVignetteMetaText: textPrimary,
    loadingPhaseEyebrow: textMuted,
    loadingProgressValue: textPrimary,
    loadingInsightsLabel: textMuted,
    loadingHeroShadowColor: premium.shadowColor,
    loadingHeroScrimGradient: [
      withAlpha('#030A10', 0),
      withAlpha('#030A10', 0.18),
      withAlpha('#030A10', 0.78),
    ],
    loadingStepBackground: withAlpha(colors.white, 0.04),
    loadingStepBorder: premium.borderSubtle,
    loadingStepLabel: textSecondary,
    loadingTrustLineBackground: withAlpha(colors.white, 0.04),
    loadingTrustLineBorder: premium.borderSubtle,
    loadingTrustLineText: textSecondary,
  };
}

export function resolveScanCaptureVisualTheme(
  colors: ThemeColors,
  _isDark: boolean,
): ScanCaptureVisualTheme {
  const premium = buildPremiumHealthPalette(colors, true);
  const textPrimary = '#F6FBFF';
  const textSecondary = '#B7C6D4';

  return {
    screenBackground: premium.canvas,
    topScrimGradient: [withAlpha(premium.canvas, 0.42), withAlpha(premium.canvas, 0)],
    bottomScrimGradient: [
      withAlpha(premium.canvas, 0),
      withAlpha(premium.canvasElevated, 0.12),
      withAlpha(premium.canvas, 0.46),
    ],
    chromeBackground: withAlpha('#0A1219', 0.76),
    chromeBorder: withAlpha(colors.white, 0.08),
    chromeText: textPrimary,
    chromeMutedText: textSecondary,
    instructionCardBackground: withAlpha('#0A1219', 0.88),
    instructionCardBorder: withAlpha(colors.white, 0.1),
    instructionTitle: textPrimary,
    instructionBody: textSecondary,
    secondaryButtonBackground: withAlpha(colors.white, 0.04),
    secondaryButtonBorder: withAlpha(colors.white, 0.08),
    secondaryButtonText: textPrimary,
    primaryButtonBackground: premium.primaryActionBackground,
    primaryButtonBorder: premium.primaryActionBorder,
    primaryButtonText: premium.primaryActionText,
    countdownBackground: withAlpha(premium.canvasElevated, 0.84),
    countdownText: textPrimary,
    countdownRing: withAlpha(colors.white, 0.12),
    shutterOuter: withAlpha(colors.white, 0.68),
    shutterInner: textPrimary,
    shadowColor: premium.shadowColor,
    overlayTint: 'transparent',
  };
}

export function resolveScanFlowAccentTheme(
  colors: ThemeColors,
  isDark: boolean,
  scanType: ScanType,
): ScanFlowAccentTheme {
  const premium = buildPremiumHealthPalette(colors, true);
  const buildAccentTheme = (
    accentColor: string,
    accentStrongColor: string,
  ): ScanFlowAccentTheme => {
    const softenedAccent = softenAccentColor(colors, isDark, accentColor, 'standard');
    const softenedStrong = softenAccentColor(colors, isDark, accentStrongColor, 'selected');

    return {
      accentColor: softenedAccent,
      accentStrongColor: softenedStrong,
      accentSoftBackground: withAlpha(softenedAccent, isDark ? 0.075 : 0.045),
      accentBadgeBackground: withAlpha(softenedAccent, isDark ? 0.1 : 0.06),
      progressGradient: [softenedStrong, softenedAccent],
      dotActiveColor: softenedStrong,
      dotCompletedColor: withAlpha(softenedAccent, 0.38),
      chipBackground: withAlpha(softenedAccent, isDark ? 0.09 : 0.055),
      chipBorder: withAlpha(softenedStrong, isDark ? 0.16 : 0.11),
      chipText: '#F6FBFF',
      vignetteFrameBorder: withAlpha(softenedStrong, isDark ? 0.24 : 0.16),
      completionGlow: softenedStrong,
      completionGlowSoft: withAlpha(softenedAccent, isDark ? 0.12 : 0.07),
      guideStroke: withAlpha(softenedStrong, 0.88),
      guideWarning: premium.coralAccent,
      guideSuccess: premium.trustAccent,
      instructionBackground: withAlpha(softenedAccent, isDark ? 0.07 : 0.045),
      instructionBorder: withAlpha(softenedStrong, isDark ? 0.14 : 0.1),
      instructionText: '#F6FBFF',
      countdownText: '#F6FBFF',
      countdownRing: withAlpha(softenedStrong, 0.2),
      heroPreviewGradient: [
        withAlpha(softenedStrong, isDark ? 0.18 : 0.11),
        withAlpha(softenedAccent, isDark ? 0.07 : 0.045),
        withAlpha('#050B11', 0),
      ],
      heroPreviewMetaBackground: withAlpha('#050B11', 0.82),
      heroPreviewMetaBorder: withAlpha(softenedStrong, 0.18),
      heroPreviewMetaText: '#F6FBFF',
      trustLineAccent: softenedStrong,
    };
  };

  if (scanType === 'body') {
    const accentColor = mixColors(colors.success ?? colors.accentGreen, colors.gray, isDark ? 0.18 : 0.26);
    const accentStrongColor = isDark
      ? mixColors(accentColor, colors.primary, 0.12)
      : mixColors(accentColor, colors.primaryText, 0.04);

    return buildAccentTheme(accentColor, accentStrongColor);
  }

  if (scanType === 'nutrition') {
    const accentColor = mixColors(colors.warning, colors.gray, isDark ? 0.12 : 0.18);
    const accentStrongColor = isDark
      ? mixColors(colors.gold, accentColor, 0.14)
      : mixColors(accentColor, colors.gold, 0.08);

    return buildAccentTheme(accentColor, accentStrongColor);
  }

  if (scanType === 'super') {
    const accentColor = isDark
      ? colors.gold
      : mixColors(CHEF_SOFT_GOLD, colors.warning, 0.1);
    const accentStrongColor = isDark
      ? colors.goldLight
      : mixColors('#FFF5DF', accentColor, 0.34);

    return buildAccentTheme(accentColor, accentStrongColor);
  }

  const accentColor = mixColors(colors.primary, colors.secondary, isDark ? 0.1 : 0.055);
  const accentStrongColor = isDark
    ? colors.primaryDark
    : mixColors(colors.primary, colors.primaryDark, 0.14);

  return buildAccentTheme(accentColor, accentStrongColor);
}

export function resolveChefFlowVisualTheme(
  colors: ThemeColors,
  isDark: boolean,
): ChefFlowVisualTheme {
  const premium = buildPremiumHealthPalette(colors, isDark);

  if (isDark) {
    return {
      screenBackground: premium.canvas,
      overlayBackground: premium.canvas,
      surfaceBackground: mixColors(premium.surfaceRaised, colors.gold, 0.06),
      surfaceElevated: mixColors(premium.surfaceRaised, colors.gold, 0.1),
      surfaceStrong: premium.canvasElevated,
      borderColor: withAlpha(colors.gold, 0.18),
      borderStrong: withAlpha(colors.gold, 0.28),
      textPrimary: colors.white,
      textSecondary: '#D7DCE2',
      textMuted: '#A4AFBA',
      textInverse: colors.white,
      warmAccent: colors.gold,
      warmAccentSoft: withAlpha(colors.gold, 0.12),
      chromeButtonBackground: withAlpha(premium.surfaceGlass, 0.9),
      chromeButtonBorder: withAlpha(colors.gold, 0.16),
      footerBackground: withAlpha(premium.surfaceGlass, 0.98),
      footerBorder: withAlpha(colors.gold, 0.1),
      imageBackground: withAlpha(colors.white, 0.08),
      imageBorder: withAlpha(colors.white, 0.12),
      imageBadgeBackground: 'rgba(10, 13, 12, 0.82)',
      imageBadgeBorder: withAlpha(colors.gold, 0.24),
      reviewOverlayGradient: [
        withAlpha(premium.canvas, 0.96),
        withAlpha(premium.canvasElevated, 0.94),
        withAlpha(premium.canvas, 0.98),
      ],
      reviewCardGradient: [
        withAlpha(colors.gold, 0.1),
        withAlpha(premium.surfaceRaised, 0.98),
        premium.canvasElevated,
      ],
      imageBorderGradient: [
        withAlpha(colors.goldLight, 0.3),
        withAlpha(premium.trustAccent, 0.12),
        withAlpha(colors.white, 0.08),
      ],
      imageVignetteGradient: [
        'rgba(3, 7, 12, 0)',
        'rgba(3, 7, 12, 0.1)',
        'rgba(3, 7, 12, 0.46)',
      ],
      footerGradient: [
        'rgba(255, 255, 255, 0)',
        'rgba(255, 215, 10, 0.04)',
        'rgba(255, 215, 10, 0.06)',
      ],
      progressTrackBackground: withAlpha(colors.white, 0.12),
      progressTrackBorder: withAlpha(colors.white, 0.16),
    };
  }

  return {
    screenBackground: premium.canvas,
    overlayBackground: CHEF_LIGHT_BASE,
    surfaceBackground: '#FFFCF7',
    surfaceElevated: '#FBF6EE',
    surfaceStrong: '#F7EEDF',
    borderColor: withAlpha(CHEF_SOFT_GOLD, 0.22),
    borderStrong: withAlpha(CHEF_SOFT_GOLD, 0.3),
    textPrimary: CHEF_LIGHT_TEXT,
    textSecondary: CHEF_LIGHT_TEXT_SECONDARY,
    textMuted: CHEF_LIGHT_TEXT_MUTED,
    textInverse: colors.white,
    warmAccent: CHEF_SOFT_GOLD,
    warmAccentSoft: withAlpha(CHEF_SOFT_GOLD, 0.12),
    chromeButtonBackground: withAlpha(colors.white, 0.9),
    chromeButtonBorder: withAlpha(CHEF_SOFT_GOLD, 0.22),
    footerBackground: withAlpha('#FFFCF7', 0.98),
    footerBorder: withAlpha(CHEF_SOFT_GOLD, 0.12),
    imageBackground: '#F2E8D8',
    imageBorder: withAlpha(CHEF_SOFT_GOLD, 0.22),
    imageBadgeBackground: 'rgba(59, 49, 38, 0.78)',
    imageBadgeBorder: withAlpha(colors.white, 0.22),
    reviewOverlayGradient: [
      withAlpha('#FFF8EF', 0.98),
      withAlpha('#F9F1E4', 0.96),
      withAlpha('#F2E6D6', 0.94),
    ],
    reviewCardGradient: [
      withAlpha(CHEF_SOFT_GOLD, 0.12),
      '#FFFCF7',
      '#F8F0E4',
    ],
    imageBorderGradient: [
      withAlpha(CHEF_SOFT_GOLD, 0.28),
      withAlpha(premium.trustAccent, 0.1),
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
