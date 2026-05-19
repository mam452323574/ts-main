import { StyleSheet } from 'react-native';

import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SIZES,
  SPACING,
  getMainPageChrome,
  mixColors,
  type ThemeColors,
  withAlpha,
} from '@/constants/theme';

import type { LoadingMiniGameVariant } from './LoadingMiniGame';

interface LoadingMiniGameChromeOptions {
  accentColor?: string;
  colors: ThemeColors;
  compact: boolean;
  isDark: boolean;
  variant: LoadingMiniGameVariant;
  cardHeight?: number;
}

export function resolveLoadingMiniGameHeight(
  compact: boolean,
  variant: LoadingMiniGameVariant,
) {
  if (compact) {
    return 160;
  }

  return variant === 'scan' ? 174 : 210;
}

export function createLoadingMiniGameChrome({
  accentColor,
  colors,
  compact,
  isDark,
  variant,
  cardHeight,
}: LoadingMiniGameChromeOptions) {
  const pageChrome = getMainPageChrome(colors, isDark, 'coach');
  const accent = accentColor ?? pageChrome.accentColor;
  const secondaryAccent =
    variant === 'scan'
      ? mixColors(colors.warning, accent, isDark ? 0.16 : 0.1)
      : mixColors(colors.success, accent, isDark ? 0.1 : 0.06);
  const dangerAccent = colors.error;
  const cardBackground = mixColors(
    pageChrome.elevatedSurface.backgroundColor,
    accent,
    isDark ? 0.044 : 0.026,
  );
  const playfieldBackground = mixColors(
    pageChrome.mutedSurface.backgroundColor,
    accent,
    isDark ? 0.08 : 0.052,
  );
  const playfieldBorder = isDark
    ? withAlpha(colors.white, 0.09)
    : withAlpha(colors.primaryText, 0.075);
  const signalBorder = withAlpha(colors.white, isDark ? 0.54 : 0.76);

  const markerHighlight = withAlpha(colors.white, isDark ? 0.42 : 0.62);

  const gradients = {
    card: [
      withAlpha(accent, isDark ? 0.1 : 0.05),
      'transparent',
    ] as readonly [string, string],
    score: [accent, secondaryAccent] as readonly [string, string],
    playfieldAmbient: [
      withAlpha(accent, isDark ? 0.16 : 0.08),
      'transparent',
      withAlpha(secondaryAccent, isDark ? 0.14 : 0.06),
    ] as readonly [string, string, string],
    markerPrimary: [
      markerHighlight,
      mixColors(accent, colors.white, isDark ? 0.08 : 0.18),
    ] as readonly [string, string],
    markerSecondary: [
      markerHighlight,
      mixColors(secondaryAccent, colors.white, isDark ? 0.08 : 0.16),
    ] as readonly [string, string],
    markerBonus: [
      withAlpha(colors.white, isDark ? 0.62 : 0.78),
      mixColors(colors.gold, colors.white, isDark ? 0.0 : 0.12),
    ] as readonly [string, string],
    markerDanger: [
      withAlpha(colors.white, isDark ? 0.28 : 0.46),
      withAlpha(dangerAccent, isDark ? 0.62 : 0.34),
    ] as readonly [string, string],
    obstacle: [
      withAlpha(secondaryAccent, isDark ? 0.54 : 0.32),
      withAlpha(secondaryAccent, isDark ? 0.2 : 0.14),
    ] as readonly [string, string],
    obstacleHit: [
      withAlpha(dangerAccent, isDark ? 0.6 : 0.4),
      withAlpha(dangerAccent, isDark ? 0.28 : 0.18),
    ] as readonly [string, string],
    playerHighlight: [
      withAlpha(colors.white, isDark ? 0.42 : 0.64),
      'transparent',
    ] as readonly [string, string],
  };

  const styles = StyleSheet.create({
    card: {
      alignSelf: 'stretch',
      backgroundColor: cardBackground,
      borderColor: withAlpha(accent, isDark ? 0.26 : 0.16),
      borderRadius: compact ? BORDER_RADIUS.lg : BORDER_RADIUS.xl,
      borderWidth: 1,
      height: cardHeight ?? resolveLoadingMiniGameHeight(compact, variant),
      overflow: 'hidden',
      padding: compact ? SPACING.sm : SPACING.md,
      shadowColor: accent,
      shadowOffset: { width: 0, height: compact ? 12 : 16 },
      shadowOpacity: isDark ? 0.26 : 0.12,
      shadowRadius: compact ? 22 : 28,
      elevation: compact ? 5 : 6,
    },
    cardGradientOverlay: {
      ...StyleSheet.absoluteFillObject,
    },
    header: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: SPACING.sm,
      justifyContent: 'space-between',
      marginBottom: compact ? SPACING.sm : SPACING.md,
      minHeight: compact ? 32 : 38,
      zIndex: 1,
    },
    titleBlock: {
      flex: 1,
      minWidth: 0,
    },
    title: {
      color: colors.primaryText,
      fontSize: SIZES.text12,
      fontWeight: FONT_WEIGHTS.bold,
      lineHeight: 16,
    },
    prompt: {
      color: colors.textMuted ?? colors.gray,
      fontSize: SIZES.text10,
      fontWeight: FONT_WEIGHTS.medium,
      lineHeight: 14,
      marginTop: 1,
    },
    score: {
      borderRadius: BORDER_RADIUS.full,
      flexShrink: 0,
      overflow: 'hidden',
      shadowColor: accent,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.42 : 0.22,
      shadowRadius: 10,
      elevation: 4,
      width: compact ? 78 : 92,
    },
    scoreGradient: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: BORDER_RADIUS.full,
    },
    scoreText: {
      color: colors.white,
      fontSize: SIZES.text10,
      fontWeight: FONT_WEIGHTS.bold,
      letterSpacing: -0.2,
      lineHeight: 14,
      paddingHorizontal: SPACING.xs,
      paddingVertical: 4,
      textAlign: 'center',
      textShadowColor: withAlpha('#000000', 0.18),
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 1,
    },
    playfield: {
      backgroundColor: playfieldBackground,
      borderColor: playfieldBorder,
      borderRadius: compact ? BORDER_RADIUS.md : BORDER_RADIUS.lg,
      borderWidth: 1,
      flex: 1,
      overflow: 'hidden',
      position: 'relative',
      zIndex: 1,
    },
    playfieldAmbient: {
      ...StyleSheet.absoluteFillObject,
    },
    marker: {
      borderWidth: 1,
      overflow: 'hidden',
      position: 'absolute',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: isDark ? 0.5 : 0.18,
      shadowRadius: 12,
    },
    markerGradientFill: {
      ...StyleSheet.absoluteFillObject,
    },
    markerPrimary: {
      backgroundColor: mixColors(accent, colors.white, isDark ? 0.14 : 0.28),
      borderColor: signalBorder,
      shadowColor: accent,
    },
    markerSecondary: {
      backgroundColor: mixColors(secondaryAccent, colors.white, isDark ? 0.14 : 0.24),
      borderColor: signalBorder,
      shadowColor: secondaryAccent,
    },
    markerBonus: {
      backgroundColor: mixColors(colors.gold, colors.white, isDark ? 0.08 : 0.2),
      borderColor: withAlpha(colors.gold, isDark ? 0.9 : 0.6),
      borderWidth: 2,
      shadowColor: colors.gold,
      shadowOpacity: isDark ? 0.62 : 0.28,
      shadowRadius: 14,
    },
    markerDanger: {
      backgroundColor: withAlpha(dangerAccent, isDark ? 0.38 : 0.16),
      borderColor: withAlpha(dangerAccent, isDark ? 0.7 : 0.36),
      shadowColor: dangerAccent,
      shadowOpacity: isDark ? 0.55 : 0.22,
      shadowRadius: 12,
    },
    decoyPulseRing: {
      borderColor: withAlpha(dangerAccent, isDark ? 0.9 : 0.55),
      borderRadius: BORDER_RADIUS.full,
      borderWidth: 2,
      ...StyleSheet.absoluteFillObject,
    },
    player: {
      borderColor: signalBorder,
      borderRadius: compact ? 9 : 11,
      borderWidth: 1,
      height: compact ? 22 : 26,
      left: '17%',
      marginTop: compact ? -11 : -13,
      overflow: 'hidden',
      position: 'absolute',
      shadowColor: accent,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: isDark ? 0.62 : 0.22,
      shadowRadius: 16,
      width: compact ? 30 : 36,
    },
    playerBody: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: mixColors(accent, colors.white, isDark ? 0.16 : 0.3),
    },
    playerHighlight: {
      height: '55%',
      left: 0,
      position: 'absolute',
      right: 0,
      top: 0,
    },
    obstacleColumn: {
      bottom: 0,
      position: 'absolute',
      top: 0,
      width: compact ? 20 : 24,
    },
    obstacleSegment: {
      backgroundColor: withAlpha(secondaryAccent, isDark ? 0.34 : 0.22),
      borderColor: withAlpha(colors.white, isDark ? 0.1 : 0.44),
      borderRadius: BORDER_RADIUS.full,
      borderWidth: 1,
      overflow: 'hidden',
      position: 'absolute',
      width: '100%',
    },
    obstacleSegmentHit: {
      backgroundColor: withAlpha(dangerAccent, isDark ? 0.36 : 0.18),
      borderColor: withAlpha(dangerAccent, isDark ? 0.62 : 0.36),
    },
    obstacleGradientFill: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: BORDER_RADIUS.full,
    },
    playfieldFlashOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: dangerAccent,
    },
  });

  return {
    accentColor: accent,
    dangerAccentColor: dangerAccent,
    secondaryAccentColor: secondaryAccent,
    gradients,
    styles,
  };
}
