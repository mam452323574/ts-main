import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowRight, Crown } from 'lucide-react-native';

import { Squircle } from '@/components/Squircle';
import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SIZES,
  SPACING,
  withAlpha,
} from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';

interface CoachPremiumUpsellInlineProps {
  title: string;
  body: string;
  ctaLabel: string;
  onPress: () => void;
  testID?: string;
}

function CoachPremiumUpsellInlineComponent({
  title,
  body,
  ctaLabel,
  onPress,
  testID = 'coach-premium-upsell-inline',
}: CoachPremiumUpsellInlineProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.pressable, pressed ? styles.pressed : null]}
      testID={testID}
    >
      <Squircle style={styles.card}>
        <View style={styles.iconShell}>
          <Crown color={colors.gold} size={18} strokeWidth={2.2} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
        </View>
        <View style={styles.ctaRow}>
          <Text style={styles.ctaLabel}>{ctaLabel}</Text>
          <ArrowRight color={colors.gold} size={16} strokeWidth={2.4} />
        </View>
      </Squircle>
    </Pressable>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    pressable: {
      paddingHorizontal: SPACING.page,
      paddingTop: SPACING.sm,
    },
    pressed: {
      opacity: 0.92,
    },
    card: {
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.md,
      borderRadius: BORDER_RADIUS.xl,
      backgroundColor: withAlpha(colors.gold, 0.12),
      borderWidth: 1,
      borderColor: withAlpha(colors.gold, 0.4),
      gap: SPACING.xs,
    },
    iconShell: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(colors.gold, 0.22),
    },
    copy: {
      gap: 4,
    },
    title: {
      fontSize: SIZES.text16,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
    },
    body: {
      fontSize: SIZES.text14,
      lineHeight: 20,
      color: withAlpha(colors.primaryText, 0.65),
    },
    ctaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingTop: SPACING.xs,
    },
    ctaLabel: {
      fontSize: SIZES.text14,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.gold,
    },
  });

export const CoachPremiumUpsellInline = memo(CoachPremiumUpsellInlineComponent);
