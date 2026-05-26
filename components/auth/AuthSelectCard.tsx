import { ReactNode, useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Check } from 'lucide-react-native';

import {
  BORDER_RADIUS,
  FONT_FAMILIES,
  SIZES,
  SPACING,
  withAlpha,
} from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { Squircle } from '@/components/Squircle';

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
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <TouchableOpacity
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.card, selected && styles.cardSelected, disabled && styles.cardDisabled]}
      testID={testID}
      activeOpacity={0.85}
      disabled={disabled}
    >
      {visual ? <Squircle style={styles.visual}>{visual}</Squircle> : null}
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <View style={[styles.checkSlot, selected && styles.checkSlotSelected]}>
        {selected ? <Check color={colors.white} size={18} /> : null}
      </View>
    </TouchableOpacity>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    card: {
      minHeight: 78,
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.md,
      borderRadius: BORDER_RADIUS.xl,
      backgroundColor: colors.cardBackground,
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08),
      borderCurve: 'continuous',
    },
    cardSelected: {
      borderColor: withAlpha(colors.primary, 0.52),
      backgroundColor: colors.primaryLight,
    },
    cardDisabled: {
      opacity: 0.5,
    },
    visual: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceMuted ?? colors.cardBackground,
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08),
      borderCurve: 'continuous',
    },
    copy: {
      flex: 1,
      gap: 4,
    },
    title: {
      fontSize: SIZES.md,
      fontFamily: FONT_FAMILIES.display,
      color: colors.primaryText,
      letterSpacing: -0.2,
    },
    subtitle: {
      fontSize: SIZES.text12,
      lineHeight: 18,
      color: withAlpha(colors.gray, 0.96),
    },
    checkSlot: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center', borderCurve: 'continuous',
    },
    checkSlotSelected: {
      backgroundColor: colors.primary,
    },
  });
