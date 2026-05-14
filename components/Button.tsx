import React, { type ReactNode, useMemo } from 'react';
import { Text, StyleSheet, ActivityIndicator, Pressable, View, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  BORDER_RADIUS,
  SHADOWS,
  SIZES,
  SPACING,
  getCtaColors,
  withAlpha,
} from '@/constants/theme';
import { buildPremiumHealthPalette } from '@/constants/premiumHealth';
import { useTheme } from '@/contexts/ThemeContext';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'monochrome' | 'premium' | 'ghost';
type ButtonSize = 'md' | 'lg';
type ButtonTone = 'primary' | 'neutral';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  tone?: ButtonTone;
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
  icon?: ReactNode;
  iconPosition?: 'left' | 'right';
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  tone = 'primary',
  loading = false,
  disabled = false,
  testID,
  icon,
  iconPosition = 'left',
}: ButtonProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const premiumHealth = useMemo(
    () => buildPremiumHealthPalette(colors, isDark),
    [colors, isDark],
  );

  const handlePress = () => {
    if (disabled || loading) return;
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress();
  };

  const isMonochrome = variant === 'monochrome';
  const isPremium = variant === 'premium';
  const isGhost = variant === 'ghost';
  const isOutline = variant === 'outline';
  const isPrimary = variant === 'primary';
  const isNeutralOutline = isOutline && tone === 'neutral';
  const ctaColors = getCtaColors(colors, isDark);

  const indicatorColor = isMonochrome
    ? colors.background
    : isPremium
      ? premiumHealth.primaryActionText
      : isGhost
        ? colors.gray
        : isOutline
          ? (isNeutralOutline ? colors.primaryText : colors.primary)
          : isPrimary
            ? ctaColors.primaryForeground
            : colors.white;

  const renderIcon = () => {
    if (!icon || loading) {
      return null;
    }

    if (React.isValidElement(icon) && typeof icon.type !== 'string') {
      return React.cloneElement(
        icon as React.ReactElement<{ color?: string; size?: number }>,
        {
          color: indicatorColor,
          size: size === 'lg' ? 20 : 18,
        },
      );
    }

    return icon;
  };

  const resolvedIcon = renderIcon();

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled || loading}
      testID={testID}
      style={({ pressed }) => [
        { transform: [{ scale: pressed ? 0.96 : 1 }] }
      ]}
    >
      <View
        style={[
          styles.button,
          size === 'lg' && styles.buttonLg,
          variant === 'primary' && styles.primaryButton,
          variant === 'secondary' && styles.secondaryButton,
          variant === 'outline' && styles.outlineButton,
          isNeutralOutline && styles.outlineButtonNeutral,
          variant === 'monochrome' && styles.monochromeButton,
          variant === 'monochrome' && size === 'lg' && styles.monochromeButtonLg,
          variant === 'premium' && styles.premiumButton,
          variant === 'premium' && size === 'lg' && styles.premiumButtonLg,
          variant === 'ghost' && styles.ghostButton,
          (disabled || loading) && styles.disabledButton,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={indicatorColor} />
        ) : (
          <View style={styles.content}>
            {iconPosition === 'left' ? resolvedIcon : null}
            <Text
              adjustsFontSizeToFit
              minimumFontScale={0.86}
              numberOfLines={2}
              style={[
                styles.text,
                size === 'lg' && styles.textLg,
                variant === 'primary' && styles.primaryText,
                variant === 'secondary' && styles.secondaryText,
                variant === 'outline' && styles.outlineText,
                isNeutralOutline && styles.outlineTextNeutral,
                variant === 'monochrome' && styles.monochromeText,
                variant === 'premium' && styles.premiumText,
                variant === 'ghost' && styles.ghostText,
              ]}
            >
              {title}
            </Text>
            {iconPosition === 'right' ? resolvedIcon : null}
          </View>
        )}
      </View>
    </Pressable>
  );
}

const createStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  content: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
  },
  button: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.button,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonLg: {
    minHeight: 56,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xl,
  },
  primaryButton: {
    backgroundColor: getCtaColors(colors, isDark).primaryBackground,
    borderWidth: 1,
    borderColor: getCtaColors(colors, isDark).primaryBorder,
    ...SHADOWS.button,
    shadowColor: isDark ? colors.primaryText : colors.primary,
    shadowOpacity: isDark ? 0.18 : 0.12,
  },
  secondaryButton: {
    backgroundColor: isDark ? colors.surfaceElevated ?? colors.cardBackground : colors.secondary,
    borderWidth: 1,
    borderColor: isDark ? colors.borderSubtle : colors.secondary,
  },
  outlineButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: colors.primary,
  },
  outlineButtonNeutral: {
    borderWidth: 1,
    borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.18),
    backgroundColor: isDark
      ? withAlpha(colors.primaryText, 0.04)
      : (colors.surfaceMuted ?? withAlpha(colors.primaryText, 0.02)),
  },
  monochromeButton: {
    backgroundColor: colors.primaryText,
    borderRadius: BORDER_RADIUS.pill,
    minHeight: 52,
    paddingVertical: SPACING.md + 2,
    ...SHADOWS.lift,
  },
  monochromeButtonLg: {
    minHeight: 60,
    paddingVertical: SPACING.lg,
  },
  premiumButton: {
    backgroundColor: buildPremiumHealthPalette(colors, isDark).primaryActionBackground,
    borderRadius: BORDER_RADIUS.pill,
    minHeight: 52,
    paddingVertical: SPACING.md + 2,
    borderWidth: 1,
    borderColor: buildPremiumHealthPalette(colors, isDark).primaryActionBorder,
    ...SHADOWS.goldGlow,
    shadowColor: buildPremiumHealthPalette(colors, isDark).shadowColor,
    shadowOpacity: isDark ? 0.18 : 0.14,
    shadowRadius: isDark ? 20 : 14,
    shadowOffset: { width: 0, height: isDark ? 10 : 8 },
    elevation: 4,
  },
  premiumButtonLg: {
    minHeight: 60,
    paddingVertical: SPACING.lg,
  },
  ghostButton: {
    backgroundColor: 'transparent',
    borderRadius: BORDER_RADIUS.pill,
    minHeight: 44,
  },
  disabledButton: {
    opacity: 0.5,
  },
  text: {
    fontSize: SIZES.md,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 20,
  },
  textLg: {
    fontSize: SIZES.lg,
    lineHeight: 22,
    fontWeight: '700',
  },
  primaryText: {
    color: getCtaColors(colors, isDark).primaryForeground,
  },
  secondaryText: {
    color: colors.primaryText,
  },
  outlineText: {
    color: colors.primary,
  },
  outlineTextNeutral: {
    color: colors.primaryText,
  },
  monochromeText: {
    color: colors.background,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  premiumText: {
    color: buildPremiumHealthPalette(colors, isDark).primaryActionText,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  ghostText: {
    color: colors.textMuted ?? colors.gray,
    fontWeight: '600',
  },
});
