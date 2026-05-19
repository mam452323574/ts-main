import { View, Text, StyleSheet } from 'react-native';
import { useMemo } from 'react';
import { Crown } from 'lucide-react-native';
import { AccountTier } from '@/types';
import {
  SIZES,
  SPACING,
  BORDER_RADIUS,
  FONT_WEIGHTS,
  getThemeTokens,
} from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';

interface AccountBadgeProps {
  tier: AccountTier;
  size?: 'small' | 'medium' | 'large';
}

export function AccountBadge({ tier, size = 'medium' }: AccountBadgeProps) {
  const isPremium = tier === 'premium' || tier === 'admin';
  const { colors, isDark } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const tokens = getThemeTokens(isDark);

  const sizeStyles = {
    small: {
      container: styles.containerSmall,
      text: styles.textSmall,
      icon: 16,
    },
    medium: {
      container: styles.containerMedium,
      text: styles.textMedium,
      icon: 20,
    },
    large: {
      container: styles.containerLarge,
      text: styles.textLarge,
      icon: 24,
    },
  };

  const currentSize = sizeStyles[size];

  return (
    <View style={[styles.container, currentSize.container, isPremium ? styles.premium : styles.free]}>
      {isPremium && (
        <Crown
          color={tokens.premium.foreground}
          size={currentSize.icon}
          fill={tokens.premium.foreground}
          style={styles.icon}
        />
      )}
      <Text
        style={[
          styles.text,
          isPremium ? styles.textPremium : styles.textFree,
          currentSize.text,
        ]}
      >
        {isPremium ? t('common.account_premium') : t('common.account_free')}
      </Text>
    </View>
  );
}

const createStyles = (colors: any, isDark: boolean) => {
  const tokens = getThemeTokens(isDark);

  return StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BORDER_RADIUS.button, borderCurve: 'continuous',
  },
  containerSmall: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
  },
  containerMedium: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  containerLarge: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  premium: {
    backgroundColor: tokens.premium.accent,
    borderWidth: 1,
    borderColor: tokens.premium.border,
  },
  free: {
    backgroundColor: tokens.surfaceMuted.base,
    borderWidth: 1,
    borderColor: tokens.border.subtle,
  },
  icon: {
    marginRight: SPACING.xs,
  },
  text: {
    fontWeight: FONT_WEIGHTS.semiBold,
  },
  textPremium: {
    color: tokens.premium.foreground,
  },
  textFree: {
    color: colors.primaryText,
  },
  textSmall: {
    fontSize: SIZES.text12,
  },
  textMedium: {
    fontSize: SIZES.text14,
  },
  textLarge: {
    fontSize: SIZES.text16,
  },
  });
};
