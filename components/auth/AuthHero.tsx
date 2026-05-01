import { ReactNode, useMemo } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { SIZES, SPACING, withAlpha } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';

interface AuthHeroProps {
  brand?: string;
  title: string;
  subtitle?: string;
  visual?: ReactNode;
  align?: 'left' | 'center';
  style?: StyleProp<ViewStyle>;
}

export function AuthHero({
  brand,
  title,
  subtitle,
  visual,
  align = 'left',
  style,
}: AuthHeroProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors, align), [colors, align]);

  return (
    <View style={[styles.container, style]}>
      {visual ? <View style={styles.visual}>{visual}</View> : null}
      {brand ? <Text style={styles.brand}>{brand}</Text> : null}
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const createStyles = (colors: any, align: 'left' | 'center') =>
  StyleSheet.create({
    container: {
      alignItems: align === 'center' ? 'center' : 'flex-start',
      gap: SPACING.sm,
    },
    visual: {
      marginBottom: SPACING.md,
    },
    brand: {
      fontSize: SIZES.text12,
      fontWeight: '700',
      letterSpacing: 3,
      color: withAlpha(colors.primaryText, 0.5),
      textTransform: 'uppercase',
    },
    title: {
      fontSize: SIZES.xxxl,
      lineHeight: 44,
      fontWeight: '700',
      color: colors.primaryText,
      textAlign: align,
      letterSpacing: -0.5,
    },
    subtitle: {
      fontSize: SIZES.md,
      lineHeight: 22,
      color: colors.gray,
      textAlign: align,
      maxWidth: 480,
    },
  });
