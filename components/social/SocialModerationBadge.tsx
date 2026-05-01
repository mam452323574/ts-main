import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { BORDER_RADIUS, FONT_WEIGHTS, SIZES, SPACING, withAlpha } from '@/constants/theme';
import type { ModerationState } from '@/types';

interface SocialModerationBadgeProps {
  moderationState?: ModerationState | null;
}

export function SocialModerationBadge({
  moderationState,
}: SocialModerationBadgeProps) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (!moderationState || moderationState === 'approved') {
    return null;
  }

  const tone =
    moderationState === 'rejected' || moderationState === 'removed'
      ? {
          backgroundColor: withAlpha(colors.error, 0.12),
          borderColor: withAlpha(colors.error, 0.22),
          textColor: colors.error,
        }
      : moderationState === 'flagged' || moderationState === 'hidden'
        ? {
            backgroundColor: withAlpha(colors.warning, 0.14),
            borderColor: withAlpha(colors.warning, 0.24),
            textColor: colors.warning,
          }
        : {
            backgroundColor: withAlpha(colors.primary, 0.1),
            borderColor: withAlpha(colors.primary, 0.18),
            textColor: colors.primary,
          };

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: tone.backgroundColor,
          borderColor: tone.borderColor,
        },
      ]}
    >
      <Text style={[styles.label, { color: tone.textColor }]}>
        {t(`social.moderation.${moderationState}`)}
      </Text>
    </View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    badge: {
      alignSelf: 'flex-start',
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.xs,
      borderRadius: BORDER_RADIUS.full,
      borderWidth: 1,
      backgroundColor: withAlpha(colors.primary, 0.1),
    },
    label: {
      fontSize: SIZES.text12,
      fontWeight: FONT_WEIGHTS.semiBold,
    },
  });

export default SocialModerationBadge;
