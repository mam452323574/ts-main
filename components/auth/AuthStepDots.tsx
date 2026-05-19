import { useMemo } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { BORDER_RADIUS, SPACING } from '@/constants/theme';
import { useAuthPalette } from './tokens';

interface AuthStepDotsProps {
  total: number;
  current: number;
  style?: StyleProp<ViewStyle>;
}

export function AuthStepDots({ total, current, style }: AuthStepDotsProps) {
  const palette = useAuthPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);

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

const createStyles = (palette: ReturnType<typeof useAuthPalette>) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      gap: SPACING.xs + 2,
    },
    dot: {
      flex: 1,
      height: 5,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: palette.progressInactive, borderCurve: 'continuous',
    },
    dotActive: {
      backgroundColor: palette.progressActive,
    },
  });
