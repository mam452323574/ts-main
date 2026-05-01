import { Text, StyleSheet, ActivityIndicator, Pressable, View, Platform } from 'react-native';
import { useMemo } from 'react';
import * as Haptics from 'expo-haptics';
import { BORDER_RADIUS, SHADOWS, SIZES, SPACING, mixColors, withAlpha } from '@/constants/theme';
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
}: ButtonProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

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
  const isNeutralOutline = isOutline && tone === 'neutral';

  const indicatorColor = isMonochrome
    ? colors.background
    : isPremium
      ? colors.white
      : isGhost
        ? colors.gray
        : isOutline
          ? (isNeutralOutline ? colors.primaryText : colors.primary)
          : colors.white;

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
        )}
      </View>
    </Pressable>
  );
}

const createStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  button: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.md,
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
    backgroundColor: colors.primary,
  },
  secondaryButton: {
    backgroundColor: colors.secondary,
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
    backgroundColor: mixColors(colors.primary, colors.secondary, 0.22),
    borderRadius: BORDER_RADIUS.pill,
    minHeight: 52,
    paddingVertical: SPACING.md + 2,
    borderWidth: 1,
    borderColor: withAlpha(colors.white, isDark ? 0.16 : 0.18),
    ...SHADOWS.button,
    shadowColor: colors.primary,
    shadowOpacity: isDark ? 0.3 : 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
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
    color: colors.white,
  },
  secondaryText: {
    color: colors.white,
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
    color: colors.white,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  ghostText: {
    color: colors.textMuted ?? colors.gray,
    fontWeight: '600',
  },
});
