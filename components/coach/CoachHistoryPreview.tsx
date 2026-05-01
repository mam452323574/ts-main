import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Clock, ChevronRight } from 'lucide-react-native';

import { useTheme } from '@/contexts/ThemeContext';
import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SHADOWS,
  SIZES,
  SPACING,
  withAlpha,
} from '@/constants/theme';

interface CoachHistoryPreviewProps {
  eyebrow: string;
  title: string;
  countLabel?: string | null;
  latestLabel?: string | null;
  ctaLabel: string;
  onPress: () => void;
  testID?: string;
}

export function CoachHistoryPreview({
  eyebrow,
  title,
  countLabel,
  latestLabel,
  ctaLabel,
  onPress,
  testID = 'coach-history-preview',
}: CoachHistoryPreviewProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${ctaLabel}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed ? styles.cardPressed : null]}
      testID={testID}
    >
      <View style={styles.iconWrap}>
        <Clock color={colors.primary} size={18} strokeWidth={2.2} />
      </View>

      <View style={styles.copy}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text numberOfLines={1} style={styles.title}>
          {title}
        </Text>
        <View style={styles.metaRow}>
          {countLabel ? (
            <Text numberOfLines={1} style={styles.meta}>
              {countLabel}
            </Text>
          ) : null}
          {countLabel && latestLabel ? (
            <Text style={styles.metaDot}>·</Text>
          ) : null}
          {latestLabel ? (
            <Text numberOfLines={1} style={styles.meta}>
              {latestLabel}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.trailing} accessibilityLabel={ctaLabel}>
        <ChevronRight
          color={withAlpha(colors.primaryText, 0.42)}
          size={18}
          strokeWidth={2.2}
        />
      </View>
    </Pressable>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      padding: SPACING.md,
      borderRadius: BORDER_RADIUS.xl,
      backgroundColor: withAlpha(colors.primary, 0.03),
      ...SHADOWS.card,
    },
    cardPressed: {
      backgroundColor: withAlpha(colors.primary, 0.08),
      transform: [{ scale: 0.992 }],
    },
    iconWrap: {
      width: 40,
      height: 40,
      borderRadius: BORDER_RADIUS.lg,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(colors.primary, 0.12),
    },
    copy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    eyebrow: {
      fontSize: 11,
      lineHeight: 14,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: withAlpha(colors.primaryText, 0.6),
      textTransform: 'uppercase',
      letterSpacing: 0.45,
    },
    title: {
      fontSize: SIZES.text14,
      lineHeight: 18,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
    },
    meta: {
      fontSize: SIZES.text12,
      lineHeight: 16,
      color: withAlpha(colors.primaryText, 0.68),
    },
    metaDot: {
      fontSize: SIZES.text12,
      lineHeight: 16,
      color: withAlpha(colors.primaryText, 0.4),
    },
    trailing: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
