import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { UserRound } from 'lucide-react-native';

import {
  AuthHero,
  AuthInput,
  AuthInputStatus,
  AuthSelectCard,
  AuthShell,
  AuthThemeVisual,
} from '@/components/auth';
import { Button } from '@/components/Button';
import { BORDER_RADIUS, SIZES, SPACING, withAlpha } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useStartupDiagnostics } from '@/contexts/StartupDiagnosticsContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { markPostSignupOnboardingPending } from '@/utils/postSignupOnboarding';
import {
  normalizeUsernameInput,
  validateCanonicalUsername,
} from '@/utils/username';

type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

export default function UsernameSetupScreen() {
  const router = useRouter();
  const {
    user,
    userProfile,
    isEmailVerified,
    checkUsernameAvailability,
    setUsername: persistUsername,
    completeSignUp,
  } = useAuth();
  const { colors, isDark, setTheme } = useTheme();
  const { t } = useLanguage();
  const { showAlert, alertElement } = useCustomAlert();
  const { markStartup, settleStartup } = useStartupDiagnostics();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [step, setStep] = useState<'username' | 'theme'>('username');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const checkTimeoutRef = useRef<any>(null);

  const isNewSignup = !userProfile?.username;

  useEffect(() => {
    if (!user) {
      return;
    }

    markStartup('username-setup-rendered', {
      hasUsername: !!userProfile?.username,
      isNewSignup,
    });
    settleStartup('username-setup-rendered');
  }, [
    isNewSignup,
    markStartup,
    settleStartup,
    user,
    userProfile?.username,
  ]);

  useEffect(() => {
    if (!user) {
      router.replace('/login');
      return;
    }

    if (!isEmailVerified) {
      router.replace({
        pathname: '/email-verification',
        params: { email: user.email || '', userId: user.id, type: 'signup' },
      });
      return;
    }
  }, [user, isEmailVerified]);

  useEffect(() => {
    if (checkTimeoutRef.current) {
      clearTimeout(checkTimeoutRef.current);
    }

    if (!username) {
      setUsernameStatus('idle');
      return;
    }

    const { valid } = validateCanonicalUsername(username);

    if (!valid) {
      setUsernameStatus('invalid');
      return;
    }

    setUsernameStatus('checking');

    checkTimeoutRef.current = setTimeout(async () => {
      try {
        const isAvailable = await checkUsernameAvailability(username);
        setUsernameStatus(isAvailable ? 'available' : 'taken');
      } catch {
        setUsernameStatus('idle');
      }
    }, 300);

    return () => {
      if (checkTimeoutRef.current) {
        clearTimeout(checkTimeoutRef.current);
      }
    };
  }, [username, checkUsernameAvailability]);

  const handleUsernameChange = (text: string) => {
    setUsername(normalizeUsernameInput(text));
  };

  const handleContinue = async () => {
    if (!user) {
      setError(t('onboarding.error_session'));
      router.replace('/login');
      return;
    }

    if (!isEmailVerified) {
      setError(t('onboarding.error_email'));
      router.replace({
        pathname: '/email-verification',
        params: { email: user.email || '', userId: user.id, type: 'signup' },
      });
      return;
    }

    if (step === 'username') {
      if (!username) {
        setError(t('onboarding.error_username_empty'));
        return;
      }
      if (usernameStatus !== 'available') {
        setError(t('onboarding.error_username_taken'));
        return;
      }
      setStep('theme');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const isOAuthUser =
        user.app_metadata?.provider && user.app_metadata.provider !== 'email';

      if (isOAuthUser) {
        await persistUsername(username);
      } else {
        await completeSignUp(user.id, username, undefined);
      }

      try {
        await markPostSignupOnboardingPending(user.id);
      } catch (onboardingError) {
        console.error(
          '[UsernameSetup] Failed to persist post-signup onboarding flag:',
          onboardingError
        );
      }

      router.replace('/post-signup-onboarding' as any);
    } catch (err) {
      console.error('[UsernameSetup] Critical error during setup:', err);

      const errorMessage =
        err instanceof Error ? err.message : t('common.error_config');

      if (
        errorMessage.includes('Email must be verified') ||
        errorMessage.includes('verifier votre email')
      ) {
        router.replace({
          pathname: '/email-verification',
          params: { email: user.email || '', userId: user.id, type: 'signup' },
        });
        return;
      }

      setError(errorMessage);

      showAlert(
        t('common.error'),
        errorMessage,
        [{ text: t('common.ok'), style: 'default' }],
      );
    } finally {
      setLoading(false);
    }
  };

  const usernameInputStatus: AuthInputStatus =
    usernameStatus === 'checking'
      ? 'checking'
      : usernameStatus === 'available'
        ? 'success'
        : usernameStatus === 'taken'
          ? 'error'
          : usernameStatus === 'invalid'
            ? 'error'
            : 'idle';

  const usernameStatusMessage =
    usernameStatus === 'checking'
      ? t('onboarding.username_status.checking')
      : usernameStatus === 'available'
        ? t('onboarding.username_status.available')
        : usernameStatus === 'taken'
          ? t('onboarding.username_status.taken')
          : usernameStatus === 'invalid'
            ? t('onboarding.username_status.invalid')
            : undefined;

  if (!user) return null;

  return (
    <AuthShell>
      {alertElement}
      <AuthHero
        title={t('onboarding.welcome_title')}
        subtitle={
          step === 'username'
            ? t('onboarding.setup_profile')
            : t('onboarding.choose_style')
        }
      />

      <View style={styles.form}>
        {step === 'username' ? (
          <AuthInput
            label={t('onboarding.username_label')}
            icon={UserRound}
            placeholder={t('onboarding.username_placeholder')}
            value={username}
            onChangeText={handleUsernameChange}
            autoCapitalize="none"
            autoComplete="off"
            status={usernameInputStatus}
            statusMessage={usernameStatusMessage}
            testID="username-setup-input"
          />
        ) : (
          <View style={styles.themeContainer}>
            <AuthSelectCard
              selected={isDark}
              onPress={() => setTheme('dark')}
              title={t('onboarding.theme.dark')}
              subtitle={t('onboarding.theme.dark_desc')}
              testID="username-setup-theme-dark"
              visual={<AuthThemeVisual theme="dark" />}
            />
            <AuthSelectCard
              selected={!isDark}
              onPress={() => setTheme('light')}
              title={t('onboarding.theme.light')}
              subtitle={t('onboarding.theme.light_desc')}
              testID="username-setup-theme-light"
              visual={<AuthThemeVisual theme="light" />}
            />
          </View>
        )}

        {error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Button
          title={
            step === 'username'
              ? t('onboarding.next_btn')
              : t('onboarding.start_btn')
          }
          onPress={handleContinue}
          loading={loading}
          disabled={step === 'username' && usernameStatus !== 'available'}
          variant="primary"
          size="lg"
        />
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
    themeContainer: {
      gap: SPACING.md,
    },
    errorContainer: {
      backgroundColor: withAlpha(colors.error, 0.10),
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.lg,
      borderRadius: BORDER_RADIUS.xl,
    },
    errorText: {
      color: colors.error,
      fontSize: SIZES.sm,
      textAlign: 'center',
    },
  });
