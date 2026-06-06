import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MessageSquarePlus } from 'lucide-react-native';

import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SIZES,
  SPACING,
  mixColors,
  withAlpha,
} from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { getCoachPersonaVisual } from '@/shared/coachPersonaVisuals';
import type { CoachPersonaKey } from '@/shared/coachPersonas';

interface CoachConversationHeroFooterProps {
  personaKey: CoachPersonaKey;
  secondaryLabel?: string | null;
  onSecondaryPress?: () => void;
  viewConversationsLabel?: string | null;
  onViewConversationsPress?: () => void;
  testID?: string;
}

function CoachConversationHeroFooterComponent({
  personaKey,
  secondaryLabel,
  onSecondaryPress,
  viewConversationsLabel,
  onViewConversationsPress,
  testID = 'coach-conversation-hero-footer',
}: CoachConversationHeroFooterProps) {
  const { colors, isDark } = useTheme();
  const visual = getCoachPersonaVisual(personaKey);

  const showSecondary =
    typeof secondaryLabel === 'string' &&
    secondaryLabel.trim().length > 0 &&
    typeof onSecondaryPress === 'function';
  const showViewAll =
    typeof viewConversationsLabel === 'string' &&
    viewConversationsLabel.trim().length > 0 &&
    typeof onViewConversationsPress === 'function';

  const styles = useMemo(
    () => createStyles(colors, isDark, visual.haloTint),
    [colors, isDark, visual.haloTint],
  );

  if (!showSecondary && !showViewAll) {
    return null;
  }

  return (
    <View style={styles.container} testID={testID}>
      {showSecondary ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={secondaryLabel ?? undefined}
          onPress={onSecondaryPress}
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed ? styles.secondaryButtonPressed : null,
          ]}
          testID={`${testID}-secondary`}
        >
          <MessageSquarePlus
            color={styles.secondaryLabel.color as string}
            size={16}
            strokeWidth={2.2}
            testID={`${testID}-secondary-icon`}
          />
          <Text
            numberOfLines={1}
            style={styles.secondaryLabel}
            testID={`${testID}-secondary-label`}
          >
            {secondaryLabel}
          </Text>
        </Pressable>
      ) : null}
      {showViewAll ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={viewConversationsLabel ?? undefined}
          onPress={onViewConversationsPress}
          style={({ pressed }) => [
            styles.viewAllButton,
            pressed ? styles.viewAllButtonPressed : null,
          ]}
          testID={`${testID}-view-all`}
        >
          <Text
            numberOfLines={1}
            style={styles.viewAllLabel}
            testID={`${testID}-view-all-label`}
          >
            {viewConversationsLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function createStyles(colors: any, isDark: boolean, haloTint: string) {
  const ghostBorder = withAlpha(haloTint, isDark ? 0.42 : 0.32);
  const ghostBg = withAlpha(haloTint, isDark ? 0.12 : 0.06);
  const ghostLabel = isDark
    ? mixColors(haloTint, colors.white ?? '#ffffff', 0.25)
    : haloTint;

  return StyleSheet.create({
    container: {
      width: '100%',
      flexDirection: 'column',
      gap: SPACING.sm,
      paddingTop: SPACING.md,
    },
    secondaryButton: {
      width: '100%',
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.xs,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderRadius: BORDER_RADIUS.pill,
      borderWidth: 1,
      borderColor: ghostBorder,
      backgroundColor: ghostBg,
    },
    secondaryButtonPressed: {
      opacity: 0.85,
    },
    secondaryLabel: {
      fontSize: SIZES.text14,
      lineHeight: 18,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: ghostLabel,
      letterSpacing: 0.2,
    },
    viewAllButton: {
      width: '100%',
      paddingVertical: SPACING.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    viewAllButtonPressed: {
      opacity: 0.7,
    },
    viewAllLabel: {
      fontSize: SIZES.text14,
      lineHeight: 18,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.primary,
      letterSpacing: 0.1,
    },
  });
}

export const CoachConversationHeroFooter = memo(CoachConversationHeroFooterComponent);
