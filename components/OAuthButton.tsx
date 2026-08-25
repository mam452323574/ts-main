import { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';

import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  BORDER_RADIUS,
  SIZES,
  SPACING,
  withAlpha,
} from '@/constants/theme';
import { Squircle } from '@/components/Squircle';

type AppleOAuthButtonType = 'signIn' | 'signUp' | 'continue';

interface OAuthButtonProps {
  provider: 'google' | 'apple';
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  appleButtonType?: AppleOAuthButtonType;
}

export function OAuthButton({
  provider,
  onPress,
  loading = false,
  disabled = false,
  appleButtonType = 'continue',
}: OAuthButtonProps) {
  const { colors, isDark } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isDisabled = disabled || loading;
  const appleLabel = t('auth.oauth_apple');
  const config = useMemo(() => {
    return {
      label: t('auth.oauth_google'),
      backgroundColor: colors.cardBackground,
      borderColor:
        colors.borderSubtle ?? withAlpha(colors.primaryText, isDark ? 0.12 : 0.08),
      textColor: colors.primaryText,
      loaderColor: colors.primary,
    };
  }, [colors, isDark, t]);

  if (provider === 'apple') {
    const buttonType = getAppleButtonType(appleButtonType);
    const buttonStyle = isDark
      ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
      : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK;

    return (
      <AppleAuthentication.AppleAuthenticationButton
        accessibilityLabel={appleLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled: isDisabled, busy: loading }}
        buttonStyle={buttonStyle}
        buttonType={buttonType}
        cornerRadius={28}
        onPress={isDisabled ? () => undefined : onPress}
        style={[styles.appleButton, isDisabled ? styles.disabled : null]}
        testID="oauth-apple-button"
      />
    );
  }

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
          <GoogleMark styles={styles} />
          <Text style={[styles.label, { color: config.textColor }]}>
            {config.label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function getAppleButtonType(type: AppleOAuthButtonType) {
  switch (type) {
    case 'signIn':
      return AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN;
    case 'signUp':
      return AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP;
    case 'continue':
    default:
      return AppleAuthentication.AppleAuthenticationButtonType.CONTINUE;
  }
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

const createStyles = (colors: any) =>
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
    appleButton: {
      width: '100%',
      height: 56,
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
    label: {
      flexShrink: 1,
      fontSize: SIZES.md,
      fontWeight: '700',
      textAlign: 'center',
      letterSpacing: 0,
    },
  });
