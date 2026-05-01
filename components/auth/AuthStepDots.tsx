import { useMemo } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { BORDER_RADIUS, SPACING, withAlpha } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';

interface AuthStepDotsProps {
  total: number;
  current: number;
  style?: StyleProp<ViewStyle>;
}

export function AuthStepDots({ total, current, style }: AuthStepDotsProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  return (
    <View style={[styles.row, style]}>
      {Array.from({ length: total }).map((_, index) => (
        <View
          key={index}
          style={[styles.dot, index <= current && styles.dotActive]}
        />
      ))}
    </View>
  );
}

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      gap: SPACING.sm,
    },
    dot: {
      flex: 1,
      height: 4,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: withAlpha(colors.primaryText, isDark ? 0.12 : 0.10),
    },
    dotActive: {
      backgroundColor: colors.primaryText,
    },
  });
