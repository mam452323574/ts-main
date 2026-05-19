import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import {
  BORDER_RADIUS,
  SPACING,
  type SurfaceVariant,
  getThemedSurface,
} from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';

interface SurfaceProps {
  children: ReactNode;
  variant?: SurfaceVariant;
  accentColor?: string;
  padded?: boolean;
  radius?: number;
  border?: boolean;
  shadow?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Surface({
  children,
  variant = 'raised',
  accentColor,
  padded = true,
  radius = BORDER_RADIUS.xl,
  border = true,
  shadow = true,
  style,
  testID,
}: SurfaceProps) {
  const { colors, isDark } = useTheme();
  const surface = getThemedSurface({
    colors,
    isDark,
    variant,
    accentColor,
    border,
    shadow,
  });

  return (
    <View
      testID={testID}
      style={[
        styles.base,
        padded ? styles.padded : null,
        {
          borderRadius: radius,
          borderWidth: border ? 1 : 0, borderCurve: 'continuous',
        },
        surface,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
  },
  padded: {
    padding: SPACING.lg,
  },
});
