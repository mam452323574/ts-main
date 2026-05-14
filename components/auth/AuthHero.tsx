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
  const palette = useAuthPalette();
  const styles = useMemo(
    () => createStyles(colors, palette, align),
    [colors, palette, align],
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
) =>
  StyleSheet.create({
    container: {
      alignItems: align === 'center' ? 'center' : 'flex-start',
      gap: SPACING.md,
    },
    visual: {
      width: '100%',
      marginBottom: SPACING.sm,
    },
    brandPill: {
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs + 1,
      borderRadius: 999,
      backgroundColor: palette.surfaceGlass,
      borderWidth: 1,
      borderColor: palette.divider,
    },
    brand: {
      fontSize: SIZES.text12,
      fontWeight: '700',
      letterSpacing: 2.4,
      color: withAlpha(palette.accentText, 0.86),
      textTransform: 'uppercase',
    },
    title: {
      fontSize: SIZES.xxxl,
      lineHeight: 44,
      fontFamily: FONT_FAMILIES.display,
      color: colors.primaryText,
      textAlign: align,
      letterSpacing: -0.4,
      maxWidth: 520,
    },
    subtitle: {
      fontSize: SIZES.md,
      lineHeight: 24,
      color: withAlpha(colors.gray, 0.96),
      textAlign: align,
      maxWidth: 480,
    },
  });
