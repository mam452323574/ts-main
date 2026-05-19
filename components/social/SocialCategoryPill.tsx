import { useMemo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { BORDER_RADIUS, FONT_WEIGHTS, SIZES, SPACING, withAlpha } from '@/constants/theme';
import type { SocialCategoryFilter } from '@/types';

interface SocialCategoryPillProps {
  category: SocialCategoryFilter;
  selected?: boolean;
  onPress?: () => void;
  compact?: boolean;
}

export function SocialCategoryPill({
  category,
  selected = false,
  onPress,
  compact = false,
}: SocialCategoryPillProps) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[
        styles.pill,
        compact ? styles.pillCompact : styles.pillDefault,
        selected ? styles.pillSelected : styles.pillIdle,
      ]}
      testID={`social-category-pill-${category}`}
    >
      <Text
        style={[
          styles.label,
          compact ? styles.labelCompact : null,
          selected ? styles.labelSelected : styles.labelIdle,
        ]}
      >
        {t(`social.categories.${category}`)}
      </Text>
    </Pressable>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    pill: {
      borderRadius: BORDER_RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1, borderCurve: 'continuous',
    },
    pillDefault: {
      minHeight: 38,
      paddingHorizontal: SPACING.md,
    },
    pillCompact: {
      minHeight: 34,
      paddingHorizontal: SPACING.sm + 2,
    },
    pillIdle: {
      backgroundColor: colors.surfaceMuted ?? colors.cardBackground,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08),
    },
    pillSelected: {
      backgroundColor: colors.surfaceAccent ?? withAlpha(colors.primary, 0.12),
      borderColor: withAlpha(colors.primary, 0.22),
    },
    label: {
      fontSize: SIZES.text14,
      fontWeight: FONT_WEIGHTS.semiBold,
    },
    labelCompact: {
      fontSize: 13,
    },
    labelIdle: {
      color: colors.primaryText,
    },
    labelSelected: {
      color: colors.primary,
    },
  });

export default SocialCategoryPill;
