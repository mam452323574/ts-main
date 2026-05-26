import { ReactNode, useMemo } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { useAuthPalette } from '@/components/auth/tokens';
import { FONT_FAMILIES, SIZES, SPACING, withAlpha } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';

interface AuthHeroProps {
  brand?: string;
  title: string;
  subtitle?: string;
  visual?: ReactNode;
  align?: 'left' | 'center';
  variant?: 'intro' | 'step' | 'status';
  style?: StyleProp<ViewStyle>;
}

export function AuthHero({
  brand,
  title,
  subtitle,
  visual,
  align,
  variant = 'step',
  style,
}: AuthHeroProps) {
  const { colors } = useTheme();
  const palette = useAuthPalette();
  const resolvedAlign =
    align ?? (variant === 'intro' || variant === 'status' ? 'center' : 'left');
  const styles = useMemo(
    () => createStyles(colors, palette, resolvedAlign, variant),
    [colors, palette, resolvedAlign, variant],
  );

  return (
    <View style={[styles.container, style]}>
      {visual ? <View style={styles.visual}>{visual}</View> : null}
      {brand ? (
        <View style={styles.brandPill}>
          <Text style={styles.brand}>{brand}</Text>
        </View>
      ) : null}
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const createStyles = (
  colors: any,
  palette: ReturnType<typeof useAuthPalette>,
  align: 'left' | 'center',
  variant: 'intro' | 'step' | 'status',
) =>
  StyleSheet.create({
    container: {
      alignItems: align === 'center' ? 'center' : 'flex-start',
      gap: variant === 'step' ? SPACING.sm : SPACING.md,
    },
    visual: {
      width: '100%',
      marginBottom: variant === 'step' ? 0 : SPACING.xs,
    },
    brandPill: {
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs,
      borderRadius: 999,
      backgroundColor: palette.surfaceSubtle,
      borderWidth: 1,
      borderColor: palette.divider, borderCurve: 'continuous',
    },
    brand: {
      fontSize: SIZES.text12,
      fontWeight: '600',
      letterSpacing: 1.8,
      color: withAlpha(colors.gray, 0.96),
      textTransform: 'uppercase',
    },
    title: {
      fontSize:
        variant === 'intro'
          ? SIZES.xxl
          : variant === 'status'
            ? SIZES.text28
            : SIZES.xl,
      lineHeight:
        variant === 'intro' ? 38 : variant === 'status' ? 34 : 30,
      fontFamily: FONT_FAMILIES.display,
      fontWeight: '700',
      color: colors.primaryText,
      textAlign: align,
      letterSpacing: -0.3,
      maxWidth: variant === 'intro' ? 330 : 520,
    },
    subtitle: {
      fontSize: variant === 'step' ? SIZES.sm : SIZES.md,
      lineHeight: variant === 'step' ? 21 : 23,
      color: withAlpha(colors.gray, 0.96),
      textAlign: align,
      maxWidth: variant === 'intro' || variant === 'status' ? 340 : 480,
    },
  });
