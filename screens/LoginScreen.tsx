import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react-native';

import { AuthHero, AuthInput, AuthShell } from '@/components/auth';
import { Button } from '@/components/Button';
import { OAuthButton } from '@/components/OAuthButton';
import { SIZES, SPACING, withAlpha } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useStartupDiagnostics } from '@/contexts/StartupDiagnosticsContext';
import { useTheme } from '@/contexts/ThemeContext';
import { LoginCredentialsSchema } from '@/utils/authSchemas';
import { isOAuthCancellationError } from '@/utils/oauthErrors';
import { updatePreAuthOnboardingDraft } from '@/utils/preAuthOnboarding';
import { Squircle } from '@/components/Squircle';

export default function LoginScreen() {
  const router = useRouter();
  const { signIn, signInWithGoogle, signInWithOAuth, sendVerificationEmail } =
    useAuth();
  const { colors } = useTheme();
  const { t } = useLanguage();
  const { markStartup, settleStartup } = useStartupDiagnostics();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    markStartup('login-rendered');
    settleStartup('login-rendered');
  }, [markStartup, settleStartup]);

  const handleLogin = async () => {
    if (!email || !password) {
      setError(t('auth.errors.fill_all'));
      return;
    }

    const parsed = LoginCredentialsSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(t('auth.errors.invalid_credentials'));
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await updatePreAuthOnboardingDraft({
        completionIntent: null,
        createdUserId: null,
      });
      const { nextStep, userId } = await signIn(email, password);

      if (nextStep === 'email_verification') {
        let initialSendFailed = false;
        try {
          await sendVerificationEmail();
        } catch (sendError) {
          initialSendFailed = true;
          console.error('[Login] Failed to send verification email:', sendError);
        }

        router.replace({
          pathname: '/email-verification',
          params: {
            email,
            userId,
            type: 'signup',
            ...(initialSendFailed ? { initialSendFailed: 'true' } : {}),
          },
        });
        return;
      }

      router.replace('/(tabs)');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '';
      const lowerMessage = errorMessage.toLowerCase();
      const isNetworkError =
        lowerMessage.includes('network') ||
        lowerMessage.includes('fetch') ||
        lowerMessage.includes('timeout') ||
        lowerMessage.includes('offline') ||
        /\b5\d{2}\b/.test(errorMessage);

      if (isNetworkError) {
        setError(errorMessage || t('common.error'));
      } else {
        setError(t('auth.errors.invalid_credentials'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      setGoogleLoading(true);
      setError(null);
      await updatePreAuthOnboardingDraft({
        completionIntent: null,
        createdUserId: null,
      });
      await signInWithGoogle();
    } catch (err) {
      // Annulation volontaire (l'utilisateur a fermé l'onglet Google) : on ne
      // montre pas de bandeau d'erreur, on retombe juste sur le formulaire.
      if (!isOAuthCancellationError(err)) {
        setError(
          err instanceof Error
            ? err.message
            : t('auth.errors.oauth_login', { provider: 'google' }),
        );
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleAppleLogin = async () => {
    try {
      setAppleLoading(true);
      setError(null);
      await updatePreAuthOnboardingDraft({
        completionIntent: null,
        createdUserId: null,
      });
      await signInWithOAuth('apple');
    } catch (err) {
      // Annulation volontaire (l'utilisateur a fermé l'onglet Apple) : on ne
      // montre pas de bandeau d'erreur, on retombe juste sur le formulaire.
      if (!isOAuthCancellationError(err)) {
        setError(
          err instanceof Error
            ? err.message
            : t('auth.errors.oauth_login', { provider: 'apple' }),
        );
      }
    } finally {
      setAppleLoading(false);
    }
  };

  return (
    <AuthShell scroll>
      <AuthHero
        variant="step"
        brand="SELFLENS"
        title={t('auth.login_title')}
        subtitle={t('auth.login_subtitle')}
      />

      <View style={styles.oauthSection}>
        <OAuthButton
          provider="google"
          onPress={handleGoogleLogin}
          loading={googleLoading}
          disabled={googleLoading || appleLoading || loading}
        />
        {Platform.OS === 'ios' ? (
          <OAuthButton
            provider="apple"
            onPress={handleAppleLogin}
            loading={appleLoading}
            disabled={googleLoading || appleLoading || loading}
          />
        ) : null}
      </View>

      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>{t('auth.or_divider')}</Text>
        <View style={styles.dividerLine} />
      </View>

      <View style={styles.form}>
        <AuthInput
          label={t('auth.email_label')}
          icon={Mail}
          placeholder={t('auth.email_placeholder')}
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            if (error) setError(null);
          }}
          keyboardType="email-address"
          autoComplete="email"
        />

        <AuthInput
          label={t('common.password')}
          icon={Lock}
          placeholder={t('auth.password_placeholder')}
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            if (error) setError(null);
          }}
          secureTextEntry={!showPassword}
          autoComplete="password"
          rightAction={{
            icon: showPassword ? EyeOff : Eye,
            onPress: () => setShowPassword((prev) => !prev),
            accessibilityLabel: showPassword
              ? t('auth.password_hide')
              : t('auth.password_show'),
          }}
        />

        {error ? (
          <Squircle style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </Squircle>
        ) : null}

        <Button
          title={t('auth.login_btn')}
          onPress={handleLogin}
          loading={loading}
          variant="primary"
          size="lg"
          flat
        />

        <Pressable
          style={styles.signupContainer}
          onPress={() => router.push('/signup')}
        >
          <Text style={styles.signupText}>
            {t('auth.no_account')}{' '}
            <Text style={styles.signupLink}>{t('auth.signup_link')}</Text>
          </Text>
        </Pressable>
      </View>
    </AuthShell>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    form: {
      width: '100%',
      gap: SPACING.lg,
    },
    oauthSection: {
      width: '100%',
      gap: SPACING.md,
    },
    divider: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: SPACING.sm,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: withAlpha(colors.primaryText, 0.08),
    },
    dividerText: {
      marginHorizontal: SPACING.md,
      fontSize: SIZES.sm,
      color: colors.gray,
      fontWeight: '500',
    },
    errorContainer: {
      backgroundColor: withAlpha(colors.error, 0.1),
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.lg,
      borderRadius: 18, borderCurve: 'continuous',
    },
    errorText: {
      color: colors.error,
      fontSize: SIZES.sm,
      textAlign: 'center',
    },
    signupContainer: {
      marginTop: SPACING.sm,
      alignItems: 'center',
      paddingVertical: SPACING.sm,
    },
    signupText: {
      fontSize: SIZES.md,
      color: colors.gray,
    },
    signupLink: {
      color: colors.primary,
      fontWeight: '700',
    },
  });
