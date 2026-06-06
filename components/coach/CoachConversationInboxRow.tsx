import { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { CoachPersonaAvatar } from '@/components/coach/CoachPersonaAvatar';
import { SquirclePressable } from '@/components/Squircle';
import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  mixColors,
  softenAccentColor,
  SIZES,
  SPACING,
  withAlpha,
} from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import type { CoachConversationInboxItem } from '@/shared/coachConversation';
import { getCoachPersonaVisual } from '@/shared/coachPersonaVisuals';
import { getCoachConversationTint } from '@/utils/coachConversationTint';

interface CoachConversationInboxRowProps {
  conversation: CoachConversationInboxItem;
  title: string;
  preview: string;
  dateLabel?: string | null;
  statusLabel?: string | null;
  variant?: 'featured' | 'compact';
  accentTint?: string;
  onPress: () => void;
  testID?: string;
}

function CoachConversationInboxRowComponent({
  conversation,
  title,
  preview,
  dateLabel,
  statusLabel,
  variant = 'compact',
  accentTint,
  onPress,
  testID,
}: CoachConversationInboxRowProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const visual = getCoachPersonaVisual(conversation.persona_key);
  const isFeatured = variant === 'featured';
  const conversationTint = useMemo(
    () => accentTint ?? getCoachConversationTint(conversation.id, visual.haloTint),
    [accentTint, conversation.id, visual.haloTint],
  );
  const cardChrome = useMemo(
    () => getCoachInboxCardChrome(colors, isDark, conversationTint, isFeatured),
    [colors, conversationTint, isDark, isFeatured],
  );
  const accessibilityLabel = [title, preview, dateLabel, statusLabel]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join('. ');

  return (
    <SquirclePressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        isFeatured ? styles.cardFeatured : styles.cardCompact,
        {
          backgroundColor: cardChrome.backgroundColor,
          borderColor: cardChrome.borderColor,
          shadowColor: cardChrome.shadowColor,
          shadowOffset: cardChrome.shadowOffset,
          shadowOpacity: pressed ? cardChrome.shadowOpacity * 0.72 : cardChrome.shadowOpacity,
          shadowRadius: cardChrome.shadowRadius,
          elevation: pressed ? Math.max(1, cardChrome.elevation - 1) : cardChrome.elevation,
          transform: [{ scale: pressed ? 0.986 : 1 }],
        },
      ]}
      testID={testID}
    >
      <CoachPersonaAvatar
        imageSource={visual.imageSource}
        fallbackLabel={visual.fallbackLabel}
        haloTint={conversationTint}
        size={isFeatured ? 58 : 48}
        emphasis={isFeatured ? 'featured' : 'subtle'}
        testID={testID ? `${testID}-avatar` : undefined}
      />
      <View style={styles.body}>
        <View style={styles.headerRow}>
          <Text
            style={[styles.title, isFeatured ? styles.titleFeatured : null]}
            numberOfLines={isFeatured ? 2 : 1}
          >
            {title}
          </Text>
          {dateLabel ? (
            <View
              style={[
                styles.dateChip,
                {
                  backgroundColor: cardChrome.chipBackgroundColor,
                  borderColor: cardChrome.chipBorderColor,
                },
              ]}
            >
              <Text
                style={[styles.date, { color: cardChrome.chipTextColor }]}
                numberOfLines={1}
              >
                {dateLabel}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.previewRow}>
          <Text
            style={[styles.preview, isFeatured ? styles.previewFeatured : null]}
            numberOfLines={isFeatured ? 2 : 1}
          >
            {preview}
          </Text>
          {statusLabel ? (
            <View
              style={[
                styles.statusBadge,
                {
                  backgroundColor: cardChrome.statusBackgroundColor,
                  borderColor: cardChrome.statusBorderColor,
                },
              ]}
            >
              <Text style={[styles.status, { color: cardChrome.statusTextColor }]}>
                {statusLabel}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </SquirclePressable>
  );
}

function getCoachInboxCardChrome(
  colors: any,
  isDark: boolean,
  baseTint: string,
  featured: boolean,
) {
  const accentColor = softenAccentColor(
    colors,
    isDark,
    baseTint,
    featured ? 'selected' : 'standard',
  );
  const surfaceBase = isDark
    ? colors.surfaceElevated ?? colors.cardBackground
    : colors.cardBackground;
  const mutedBase = colors.surfaceMuted ?? colors.grayLight ?? colors.cardBackground;
  const backgroundColor = mixColors(
    featured ? surfaceBase : mutedBase,
    accentColor,
    featured ? (isDark ? 0.18 : 0.11) : (isDark ? 0.12 : 0.075),
  );
  const shadowAnchor = isDark
    ? mixColors(accentColor, colors.background, 0.22)
    : mixColors(colors.gray ?? colors.primaryText, accentColor, 0.28);

  return {
    accentColor,
    backgroundColor,
    borderColor: withAlpha(accentColor, featured ? (isDark ? 0.34 : 0.22) : (isDark ? 0.22 : 0.14)),
    shadowColor: shadowAnchor,
    shadowOffset: { width: 0, height: featured ? 12 : 7 },
    shadowOpacity: featured ? (isDark ? 0.2 : 0.1) : (isDark ? 0.12 : 0.055),
    shadowRadius: featured ? 26 : 18,
    elevation: featured ? 5 : 2,
    chipBackgroundColor: isDark
      ? withAlpha(accentColor, featured ? 0.18 : 0.12)
      : mixColors(colors.cardBackground, accentColor, featured ? 0.16 : 0.1),
    chipBorderColor: withAlpha(accentColor, featured ? 0.26 : 0.18),
    chipTextColor: isDark
      ? mixColors(colors.white, accentColor, 0.16)
      : mixColors(colors.primaryText, accentColor, 0.18),
    statusBackgroundColor: isDark
      ? withAlpha(colors.primaryText, 0.075)
      : withAlpha(colors.white ?? colors.cardBackground, 0.7),
    statusBorderColor: withAlpha(accentColor, featured ? 0.22 : 0.14),
    statusTextColor: isDark
      ? withAlpha(colors.primaryText, 0.74)
      : withAlpha(colors.primaryText, 0.62),
  };
}

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    card: {
      position: 'relative',
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      overflow: 'hidden',
      borderCurve: 'continuous',
    },
    cardFeatured: {
      minHeight: 112,
      gap: SPACING.md,
      paddingLeft: SPACING.lg,
      paddingRight: SPACING.md + 2,
      paddingVertical: SPACING.md,
      borderRadius: BORDER_RADIUS.xl + 6,
    },
    cardCompact: {
      minHeight: 82,
      gap: SPACING.sm + 2,
      paddingLeft: SPACING.md + 2,
      paddingRight: SPACING.md,
      paddingVertical: SPACING.sm + 2,
      borderRadius: BORDER_RADIUS.xl,
    },
    body: {
      flex: 1,
      minWidth: 0,
      gap: 7,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    title: {
      flex: 1,
      minWidth: 0,
      color: colors.primaryText,
      fontSize: SIZES.text15,
      lineHeight: 20,
      fontWeight: FONT_WEIGHTS.semiBold,
    },
    titleFeatured: {
      fontSize: SIZES.text18,
      lineHeight: 23,
      fontWeight: FONT_WEIGHTS.bold,
      letterSpacing: -0.15,
    },
    dateChip: {
      flexShrink: 0,
      paddingHorizontal: SPACING.sm,
      paddingVertical: 4,
      borderRadius: BORDER_RADIUS.pill,
      borderWidth: 1,
      borderCurve: 'continuous',
    },
    date: {
      fontSize: SIZES.text12,
      lineHeight: 17,
      fontWeight: FONT_WEIGHTS.semiBold,
    },
    previewRow: {
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: SPACING.xs,
    },
    preview: {
      flex: 1,
      minWidth: 0,
      color: withAlpha(colors.primaryText, isDark ? 0.66 : 0.6),
      fontSize: SIZES.text14,
      lineHeight: 19,
      fontWeight: FONT_WEIGHTS.medium,
    },
    previewFeatured: {
      color: withAlpha(colors.primaryText, isDark ? 0.76 : 0.66),
      lineHeight: 20,
    },
    statusBadge: {
      flexShrink: 0,
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: BORDER_RADIUS.pill,
      borderWidth: 1,
      borderCurve: 'continuous',
    },
    status: {
      fontSize: SIZES.text12,
      lineHeight: 16,
      fontWeight: FONT_WEIGHTS.semiBold,
    },
  });

export const CoachConversationInboxRow = memo(CoachConversationInboxRowComponent);
