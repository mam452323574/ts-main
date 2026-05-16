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
}

export function resolveLoadingMiniGameHeight(
  compact: boolean,
  variant: LoadingMiniGameVariant,
) {
  if (compact) {
    return 160;
  }

  return variant === 'superScan' ? 174 : 210;
}

export function createLoadingMiniGameChrome({
  accentColor,
  colors,
  compact,
  isDark,
  variant,
}: LoadingMiniGameChromeOptions) {
  const pageChrome = getMainPageChrome(
    colors,
    isDark,
    variant === 'superScan' ? 'premium' : 'coach',
  );
  const accent = accentColor ?? pageChrome.accentColor;
  const secondaryAccent =
    variant === 'superScan'
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

  const styles = StyleSheet.create({
    card: {
      alignSelf: 'stretch',
      backgroundColor: cardBackground,
      borderColor: withAlpha(accent, isDark ? 0.22 : 0.13),
      borderRadius: compact ? BORDER_RADIUS.lg : BORDER_RADIUS.xl,
      borderWidth: 1,
      height: resolveLoadingMiniGameHeight(compact, variant),
      overflow: 'hidden',
      padding: compact ? SPACING.sm : SPACING.md,
      shadowColor: accent,
      shadowOffset: { width: 0, height: compact ? 8 : 10 },
      shadowOpacity: isDark ? 0.14 : 0.06,
      shadowRadius: compact ? 16 : 22,
      elevation: compact ? 2 : 3,
    },
    header: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: SPACING.sm,
      justifyContent: 'space-between',
      marginBottom: compact ? SPACING.sm : SPACING.md,
      minHeight: compact ? 32 : 38,
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
      backgroundColor: withAlpha(accent, isDark ? 0.15 : 0.08),
      borderColor: withAlpha(accent, isDark ? 0.24 : 0.13),
      borderRadius: BORDER_RADIUS.full,
      borderWidth: 1,
      color: mixColors(colors.primaryText, accent, isDark ? 0.18 : 0.1),
      flexShrink: 0,
      fontSize: SIZES.text10,
      fontWeight: FONT_WEIGHTS.bold,
      lineHeight: 14,
      overflow: 'hidden',
      paddingHorizontal: SPACING.xs,
      paddingVertical: 3,
      textAlign: 'center',
      width: compact ? 78 : 92,
    },
    playfield: {
      backgroundColor: playfieldBackground,
      borderColor: playfieldBorder,
      borderRadius: compact ? BORDER_RADIUS.md : BORDER_RADIUS.lg,
      borderWidth: 1,
      flex: 1,
      overflow: 'hidden',
      position: 'relative',
    },
    trackLine: {
      backgroundColor: withAlpha(accent, isDark ? 0.1 : 0.12),
      height: 1,
      left: 0,
      position: 'absolute',
      right: 0,
    },
    trackLineTop: {
      top: '34%',
    },
    trackLineBottom: {
      top: '68%',
    },
    marker: {
      borderWidth: 1,
      position: 'absolute',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: isDark ? 0.42 : 0.14,
      shadowRadius: 10,
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
      borderColor: withAlpha(colors.gold, isDark ? 0.82 : 0.54),
      borderWidth: 2,
      shadowColor: colors.gold,
      shadowOpacity: isDark ? 0.5 : 0.2,
      shadowRadius: 13,
    },
    markerDanger: {
      backgroundColor: withAlpha(dangerAccent, isDark ? 0.38 : 0.16),
      borderColor: withAlpha(dangerAccent, isDark ? 0.62 : 0.32),
      shadowColor: dangerAccent,
    },
    player: {
      backgroundColor: mixColors(accent, colors.white, isDark ? 0.14 : 0.28),
      borderColor: signalBorder,
      borderRadius: compact ? 9 : 11,
      borderWidth: 1,
      height: compact ? 22 : 26,
      left: '17%',
      marginTop: compact ? -11 : -13,
      position: 'absolute',
      shadowColor: accent,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: isDark ? 0.42 : 0.14,
      shadowRadius: 10,
      width: compact ? 30 : 36,
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
      position: 'absolute',
      width: '100%',
    },
    obstacleSegmentHit: {
      backgroundColor: withAlpha(dangerAccent, isDark ? 0.36 : 0.18),
      borderColor: withAlpha(dangerAccent, isDark ? 0.52 : 0.34),
    },
  });

  return {
    accentColor: accent,
    dangerAccentColor: dangerAccent,
    secondaryAccentColor: secondaryAccent,
    styles,
  };
}
