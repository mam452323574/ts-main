import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight, Clock } from 'lucide-react-native';

import { useTheme } from '@/contexts/ThemeContext';
import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SIZES,
  SPACING,
  getCoachPaperSurface,
  withAlpha,
} from '@/constants/theme';
import { Squircle } from '@/components/Squircle';

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
  const { colors, isDark } = useTheme();
  const paper = useMemo(() => getCoachPaperSurface(isDark), [isDark]);
  const styles = useMemo(() => createStyles(colors, paper), [colors, paper]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${ctaLabel}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed ? styles.cardPressed : null]}
      testID={testID}
    >
      <Squircle style={styles.iconWrap}>
        <Clock
          color={withAlpha(colors.primary, 0.85)}
          size={18}
          strokeWidth={2.2}
        />
      </Squircle>

      <View style={styles.copy}>
        <Text style={styles.eyebrow} numberOfLines={1}>
          {eyebrow}
        </Text>
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

      <Squircle style={styles.trailing} accessibilityLabel={ctaLabel}>
        <ChevronRight color={paper.inkMuted} size={16} strokeWidth={2} />
      </Squircle>
    </Pressable>
  );
}

const createStyles = (
  colors: any,
  paper: ReturnType<typeof getCoachPaperSurface>,
) =>
  StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      paddingVertical: SPACING.md + 2,
      paddingHorizontal: SPACING.lg,
      borderRadius: 14,
      backgroundColor: paper.canvas,
      borderWidth: 1,
      borderColor: paper.border, borderCurve: 'continuous',
    },
    cardPressed: {
      backgroundColor: paper.raised,
      transform: [{ scale: 0.992 }],
    },
    iconWrap: {
      width: 40,
      height: 40,
      borderRadius: BORDER_RADIUS.lg,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(colors.primary, 0.08), borderCurve: 'continuous',
    },
    copy: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    eyebrow: {
      fontSize: 10,
      lineHeight: 14,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: withAlpha(colors.primary, 0.85),
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    title: {
      fontSize: SIZES.text15,
      lineHeight: 22,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: paper.ink,
      letterSpacing: -0.1,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs + 2,
    },
    meta: {
      fontSize: SIZES.text12,
      lineHeight: 16,
      color: paper.inkMuted,
    },
    metaDot: {
      fontSize: 10,
      lineHeight: 14,
      color: paper.inkSubtle,
    },
    trailing: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center', borderCurve: 'continuous',
    },
  });
