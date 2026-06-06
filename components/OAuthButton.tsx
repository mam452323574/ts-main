import { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  BORDER_RADIUS,
  SIZES,
  SPACING,
  withAlpha,
} from '@/constants/theme';
import { Squircle } from '@/components/Squircle';

interface OAuthButtonProps {
  provider: 'google' | 'apple';
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}

export function OAuthButton({
  provider,
  onPress,
  loading = false,
  disabled = false,
}: OAuthButtonProps) {
  const { colors, isDark } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const isDisabled = disabled || loading;

  const config = useMemo(() => {
    if (provider === 'google') {
      return {
        label: t('auth.oauth_google'),
        backgroundColor: colors.cardBackground,
        borderColor:
          colors.borderSubtle ?? withAlpha(colors.primaryText, isDark ? 0.12 : 0.08),
        textColor: colors.primaryText,
        loaderColor: colors.primary,
      };
    }

    return {
      label: t('auth.oauth_apple'),
      backgroundColor: isDark ? '#F7F7F7' : '#111111',
      borderColor: isDark
        ? withAlpha(colors.white, 0.26)
        : withAlpha(colors.primaryText, 0.12),
      textColor: isDark ? '#111111' : '#FFFFFF',
      loaderColor: isDark ? '#111111' : '#FFFFFF',
    };
  }, [colors, isDark, provider, t]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={config.label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      testID={`oauth-${provider}-button`}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: config.backgroundColor,
          borderColor: config.borderColor,
        },
        pressed && !isDisabled ? styles.buttonPressed : null,
        isDisabled ? styles.disabled : null,
      ]}
      onPress={onPress}
      disabled={isDisabled}
    >
      {loading ? (
        <ActivityIndicator color={config.loaderColor} />
      ) : (
        <View style={styles.content}>
          {provider === 'google' ? (
            <GoogleMark styles={styles} />
          ) : (
            <Squircle style={styles.appleMark}>
              <Text style={styles.appleMarkText}>A</Text>
            </Squircle>
          )}
          <Text style={[styles.label, { color: config.textColor }]}>
            {config.label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function GoogleMark({
  styles,
}: {
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Squircle style={styles.googleMark} testID="oauth-google-mark">
      <Text style={styles.googleLetter}>G</Text>
      <View style={[styles.googleAccent, styles.googleAccentBlue]} />
      <View style={[styles.googleAccent, styles.googleAccentRed]} />
      <View style={[styles.googleAccent, styles.googleAccentYellow]} />
      <View style={[styles.googleAccent, styles.googleAccentGreen]} />
    </Squircle>
  );
}

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    button: {
      width: '100%',
      minHeight: 56,
      borderRadius: BORDER_RADIUS.pill,
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.lg,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderCurve: 'continuous',
    },
    buttonPressed: {
      transform: [{ translateY: 1 }],
      opacity: 0.92,
    },
    disabled: {
      opacity: 0.62,
    },
    content: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.sm,
    },
    googleMark: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: withAlpha('#1C1C1E', 0.08),
      overflow: 'hidden', borderCurve: 'continuous',
    },
    googleLetter: {
      color: '#202124',
      fontSize: SIZES.md,
      fontWeight: '800',
      lineHeight: 20,
      zIndex: 2,
    },
    googleAccent: {
      position: 'absolute',
      width: 16,
      height: 4,
      borderRadius: 999, borderCurve: 'continuous',
    },
    googleAccentBlue: {
      right: -2,
      top: 12,
      backgroundColor: '#4285F4',
    },
    googleAccentRed: {
      top: 3,
      left: 7,
      transform: [{ rotate: '20deg' }],
      backgroundColor: '#EA4335',
    },
    googleAccentYellow: {
      left: -2,
      bottom: 8,
      transform: [{ rotate: '-20deg' }],
      backgroundColor: '#FBBC05',
    },
    googleAccentGreen: {
      right: 4,
      bottom: 3,
      transform: [{ rotate: '-28deg' }],
      backgroundColor: '#34A853',
    },
    appleMark: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#111111' : '#FFFFFF', borderCurve: 'continuous',
    },
    appleMarkText: {
      color: isDark ? '#FFFFFF' : '#111111',
      fontSize: SIZES.sm,
      fontWeight: '800',
    },
    label: {
      flexShrink: 1,
      fontSize: SIZES.md,
      fontWeight: '700',
      textAlign: 'center',
      letterSpacing: 0,
    },
  });
