import { useMemo, type ReactNode } from 'react';
import {
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import { FONT_WEIGHTS, SPACING, mixColors, withAlpha } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import {
  RESULT_TEXT_PROPS,
  getResultLayoutState,
} from '@/utils/resultLayout';

type ResultPillBadgeVariant = 'neutral' | 'accent' | 'premium';

interface ResultPillBadgeProps {
  label: string;
  icon?: ReactNode;
  accentColor?: string;
  variant?: ResultPillBadgeVariant;
  backgroundColor?: string;
  borderColor?: string;
  textColor?: string;
}

export function ResultPillBadge({
  label,
  icon,
  accentColor,
  variant = 'neutral',
  backgroundColor,
  borderColor,
  textColor,
}: ResultPillBadgeProps) {
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const layout = useMemo(() => getResultLayoutState(width), [width]);
  const styles = useMemo(() => createStyles(layout), [layout]);

  const resolvedAccent =
    variant === 'premium'
      ? mixColors(colors.gold, colors.white, isDark ? 0.08 : 0.28)
      : accentColor ?? colors.primary;
  const resolvedBackgroundColor =
    backgroundColor ??
    variant === 'neutral'
      ? isDark
        ? withAlpha(colors.white, 0.06)
        : withAlpha(colors.primaryText, 0.04)
      : withAlpha(resolvedAccent, variant === 'premium'
        ? isDark
          ? 0.16
          : 0.1
        : isDark
          ? 0.12
          : 0.07);
  const resolvedBorderColor =
    borderColor ??
    variant === 'neutral'
      ? isDark
        ? withAlpha(colors.white, 0.08)
        : withAlpha(colors.primaryText, 0.07)
      : withAlpha(resolvedAccent, variant === 'premium'
        ? isDark
          ? 0.26
          : 0.16
        : isDark
          ? 0.2
          : 0.12);
  const resolvedTextColor =
    textColor ??
    variant === 'neutral'
      ? isDark
        ? withAlpha(colors.white, 0.82)
        : mixColors(colors.primaryText, colors.gray, 0.22)
      : mixColors(
          resolvedAccent,
          colors.primaryText,
          isDark ? 0.08 : 0.18,
        );

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: resolvedBackgroundColor,
          borderColor: resolvedBorderColor,
        },
      ]}
    >
      {icon ? <View style={styles.iconSlot}>{icon}</View> : null}
      <Text
        {...RESULT_TEXT_PROPS}
        numberOfLines={1}
        style={[styles.label, { color: resolvedTextColor }]}
      >
        {label}
      </Text>
    </View>
  );
}

const createStyles = (layout: ReturnType<typeof getResultLayoutState>) =>
  StyleSheet.create({
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs - 1,
      paddingHorizontal: layout.isCompact ? SPACING.sm : SPACING.sm + 1,
      paddingVertical: layout.isCompact ? 4 : 5,
      borderRadius: 9999,
      borderWidth: 1,
      maxWidth: '100%', borderCurve: 'continuous',
    },
    iconSlot: {
      flexShrink: 0,
    },
    label: {
      fontSize: layout.heroBadgeFontSize,
      lineHeight: layout.heroBadgeLineHeight,
      fontWeight: FONT_WEIGHTS.semiBold,
      letterSpacing: layout.isCompact ? 0.24 : 0.32,
      textTransform: 'uppercase',
      includeFontPadding: false,
      flexShrink: 1,
    },
  });

export default ResultPillBadge;
