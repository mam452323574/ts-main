import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Surface } from '@/components/Surface';
import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SIZES,
  SPACING,
  type SurfaceVariant,
} from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';

interface ScreenSectionProps {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  variant?: SurfaceVariant;
  framed?: boolean;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

export function ScreenSection({
  title,
  subtitle,
  children,
  variant = 'inset',
  framed = true,
  padded = false,
  style,
  contentStyle,
  testID,
}: ScreenSectionProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.section, style]} testID={testID}>
      {title || subtitle ? (
        <View style={styles.header}>
          {title ? <Text style={[styles.title, { color: colors.primaryText }]}>{title}</Text> : null}
          {subtitle ? (
            <Text style={[styles.subtitle, { color: colors.textMuted ?? colors.gray }]}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      ) : null}

      {framed ? (
        <Surface
          variant={variant}
          radius={BORDER_RADIUS.xl}
          padded={padded}
          shadow={variant !== 'inset'}
          style={[styles.surface, contentStyle]}
        >
          {children}
        </Surface>
      ) : (
        <View style={contentStyle}>{children}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: SPACING.page,
    gap: SPACING.sm,
  },
  header: {
    gap: 2,
  },
  title: {
    fontSize: SIZES.text14,
    lineHeight: 18,
    fontWeight: FONT_WEIGHTS.bold,
  },
  subtitle: {
    fontSize: SIZES.text12,
    lineHeight: 17,
    fontWeight: FONT_WEIGHTS.medium,
  },
  surface: {
    gap: 0,
  },
});
