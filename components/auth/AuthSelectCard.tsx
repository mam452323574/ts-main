import { ReactNode, useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Check } from 'lucide-react-native';

import { BORDER_RADIUS, SHADOWS, SIZES, SPACING } from '@/constants/theme';
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
      <View style={styles.checkSlot}>
        {selected ? <Check color={colors.primaryText} size={22} /> : null}
      </View>
    </TouchableOpacity>
  );
}

const createStyles = (colors: any, palette: ReturnType<typeof useAuthPalette>) =>
  StyleSheet.create({
    card: {
      minHeight: 84,
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.lg,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.lg,
      borderRadius: BORDER_RADIUS.hero,
      backgroundColor: palette.accentSofter,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    cardSelected: {
      borderColor: palette.accentRing,
      backgroundColor: palette.accentSoft,
      ...SHADOWS.soft,
    },
    cardDisabled: {
      opacity: 0.5,
    },
    visual: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    copy: {
      flex: 1,
    },
    title: {
      fontSize: SIZES.lg,
      fontWeight: '700',
      color: colors.primaryText,
      marginBottom: 2,
    },
    subtitle: {
      fontSize: SIZES.text14,
      lineHeight: 20,
      color: colors.gray,
    },
    checkSlot: {
      width: 22,
      alignItems: 'center',
    },
  });
