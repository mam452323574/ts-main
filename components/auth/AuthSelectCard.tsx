import { ReactNode, useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Check } from 'lucide-react-native';

import {
  BORDER_RADIUS,
  FONT_FAMILIES,
  SHADOWS,
  SIZES,
  SPACING,
  withAlpha,
} from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuthPalette } from '@/components/auth/tokens';

interface AuthSelectCardProps {
  selected: boolean;
  onPress: () => void;
  title: string;
  subtitle?: string;
  visual?: ReactNode;
  testID?: string;
  disabled?: boolean;
}

export function AuthSelectCard({
  selected,
  onPress,
  title,
  subtitle,
  visual,
  testID,
  disabled,
}: AuthSelectCardProps) {
  const { colors } = useTheme();
  const palette = useAuthPalette();
  const styles = useMemo(
    () => createStyles(colors, palette),
    [colors, palette],
  );

  return (
    <TouchableOpacity
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.card, selected && styles.cardSelected, disabled && styles.cardDisabled]}
      testID={testID}
      activeOpacity={0.85}
      disabled={disabled}
    >
      {visual ? <View style={styles.visual}>{visual}</View> : null}
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <View style={[styles.checkSlot, selected && styles.checkSlotSelected]}>
        {selected ? <Check color={colors.primaryText} size={22} /> : null}
      </View>
    </TouchableOpacity>
  );
}

const createStyles = (colors: any, palette: ReturnType<typeof useAuthPalette>) =>
  StyleSheet.create({
    card: {
      minHeight: 108,
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.lg,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.lg,
      borderRadius: BORDER_RADIUS.hero,
      backgroundColor: palette.surfaceGlass,
      borderWidth: 1,
      borderColor: palette.secondaryActionBorder,
      ...SHADOWS.soft,
      shadowColor: palette.shadowColor,
      shadowOpacity: 0.07,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 2,
    },
    cardSelected: {
      borderColor: palette.accentRing,
      backgroundColor: palette.surfaceStrong,
      shadowColor: palette.accentRing,
      shadowOpacity: 0.12,
    },
    cardDisabled: {
      opacity: 0.5,
    },
    visual: {
      width: 60,
      height: 60,
      borderRadius: 30,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.accentSofter,
      borderWidth: 1,
      borderColor: withAlpha(palette.accentRing, 0.16),
    },
    copy: {
      flex: 1,
      gap: 4,
    },
    title: {
      fontSize: SIZES.lg,
      fontFamily: FONT_FAMILIES.display,
      color: colors.primaryText,
      letterSpacing: -0.2,
    },
    subtitle: {
      fontSize: SIZES.text14,
      lineHeight: 20,
      color: withAlpha(colors.gray, 0.96),
    },
    checkSlot: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkSlotSelected: {
      backgroundColor: palette.accentSoft,
    },
  });
