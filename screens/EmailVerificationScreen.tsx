import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  AppStateStatus,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Check, Mail, RefreshCw } from 'lucide-react-native';

import { AppScreen } from '@/components/AppScreen';
import {
  AuthHero,
  AuthOTPInput,
  AuthShell,
} from '@/components/auth';
import { Button } from '@/components/Button';
import { BORDER_RADIUS, SIZES, SPACING, mixColors, withAlpha } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useStartupDiagnostics } from '@/contexts/StartupDiagnosticsContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { uploadAvatarFromLocalUri } from '@/services/avatar';
import {
  clearPreAuthOnboardingDraft,
  loadPreAuthOnboardingDraft,
} from '@/utils/preAuthOnboarding';
import {
  markPostSignupOnboardingPending,
} from '@/utils/postSignupOnboarding';

const CODE_LENGTH = 6;
const RESEND_COOLDOWN = 60;

export default function EmailVerificationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    email?: string;
    userId?: string;
    type?: string;
    returnTo?: string;
    initialSendFailed?: string;
  }>();
  const {
    sendVerificationEmail,
    verifyEmailCode,
    refreshUserProfile,
    user,
    signOut,
    completeSignUp,
  } = useAuth();
  const { colors, isDark } = useTheme();
  const { t } = useLanguage();
  const { markStartup, settleStartup } = useStartupDiagnostics();
  const { showAlert, alertElement } = useCustomAlert();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const [code, setCode] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avatarUploadFailed, setAvatarUploadFailed] = useState(false);
  const [success, setSuccess] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [expiresIn, setExpiresIn] = useState(15 * 60);

  const cooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expiryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const redirectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const backgroundTimeRef = useRef<number>(0);
  const initialSendFailureAppliedRef = useRef(false);

  const email = params.email || user?.email || '';
  const initialSendFailed = params.initialSendFailed === 'true';
  const type = 'signup';

  useEffect(() => {
    markStartup('email-verification-rendered', { type });
    settleStartup('email-verification-rendered');
  }, [markStartup, settleStartup, type]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (cooldownRef.current) clearTimeout(cooldownRef.current);
      if (expiryRef.current) clearTimeout(expiryRef.current);
      if (redirectRef.current) clearTimeout(redirectRef.current);
    };
  }, []);

  useEffect(() => {
    if (!initialSendFailed || initialSendFailureAppliedRef.current) {
      return;
    }

    initialSendFailureAppliedRef.current = true;
    setError(t('auth.error_verification_send'));
  }, [initialSendFailed, t]);

  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        if (
          appStateRef.current === 'active' &&
          nextState.match(/inactive|background/)
        ) {
          backgroundTimeRef.current = Date.now();
        } else if (nextState === 'active' && backgroundTimeRef.current > 0) {
          const elapsedSeconds = Math.floor(
            (Date.now() - backgroundTimeRef.current) / 1000,
          );
          if (isMountedRef.current && elapsedSeconds > 0) {
            setExpiresIn((prev) => Math.max(0, prev - elapsedSeconds));
            setCooldown((prev) => Math.max(0, prev - elapsedSeconds));
          }
          backgroundTimeRef.current = 0;
        }
        appStateRef.current = nextState;
      },
    );

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (cooldown > 0) {
      cooldownRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          setCooldown(cooldown - 1);
        }
      }, 1000);
    }
    return () => {
      if (cooldownRef.current) clearTimeout(cooldownRef.current);
    };
  }, [cooldown]);

  useEffect(() => {
    if (expiresIn > 0 && !success) {
      expiryRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          setExpiresIn(expiresIn - 1);
        }
      }, 1000);
    }
    return () => {
      if (expiryRef.current) clearTimeout(expiryRef.current);
    };
  }, [expiresIn, success]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isUsernameConflictError = (value: unknown) => {
    const message = value instanceof Error ? value.message.toLowerCase() : '';
    return (
      message.includes('username') ||
      message.includes('utilisateur') ||
      message.includes('already taken') ||
      message.includes('deja pris') ||
      message.includes('déjà pris')
    );
  };

  const redirectAfterSuccess = () => {
    redirectRef.current = setTimeout(() => {
      if (!isMountedRef.current) return;
      router.replace('/post-signup-onboarding' as any);
    }, 1500);
  };

  const completeVerifiedSignup = async (
    options: { skipAvatarUpload?: boolean } = {},
  ) => {
    setFinalizing(true);
    setError(null);
    setAvatarUploadFailed(false);

    try {
      const draft = await loadPreAuthOnboardingDraft();
      const userId = user?.id || params.userId || draft.createdUserId;

      if (!userId) {
        throw new Error(t('onboarding.error_session'));
      }

      if (!draft.username) {
        await refreshUserProfile();
        router.replace('/username-setup');
        return true;
      }

      let avatarReference: string | undefined;

      if (draft.avatarLocalUri && !options.skipAvatarUpload) {
        try {
          const uploadResult = await uploadAvatarFromLocalUri(
            userId,
            draft.avatarLocalUri,
          );
          avatarReference = uploadResult.avatarReference;
        } catch (uploadError) {
          console.error(
            '[EmailVerification] Failed to upload pre-auth avatar:',
            uploadError,
          );
          setAvatarUploadFailed(true);
          setError(t('onboarding.error_avatar_upload'));
          return false;
        }
      }

      try {
        await completeSignUp(userId, draft.username, avatarReference);
      } catch (profileError) {
        if (isUsernameConflictError(profileError)) {
          await refreshUserProfile();
          router.replace('/username-setup');
          return true;
        }

        throw profileError;
      }

      await markPostSignupOnboardingPending(userId);
      await clearPreAuthOnboardingDraft();
      await refreshUserProfile();

      setSuccess(true);
      redirectAfterSuccess();
      return true;
    } finally {
      setFinalizing(false);
    }
  };

  const handleVerify = async () => {
    const fullCode = code.join('');
    if (fullCode.length !== CODE_LENGTH) {
      setError(t('auth.code_incomplete'));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const isValid = await verifyEmailCode(fullCode);

      if (isValid) {
        await completeVerifiedSignup();
      } else {
        setError(t('auth.code_invalid'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.error_login_generic'));
    } finally {
      setLoading(false);
    }
  };

  const handleRetryAvatarUpload = async () => {
    if (loading || finalizing) {
      return;
    }

    try {
      setLoading(true);
      await completeVerifiedSignup();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const handleContinueWithoutAvatar = async () => {
    if (loading || finalizing) {
      return;
    }

    try {
      setLoading(true);
      await completeVerifiedSignup({ skipAvatarUpload: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || resending) return;

    setResending(true);
    setError(null);

    try {
      await sendVerificationEmail();
      setCooldown(RESEND_COOLDOWN);
      setExpiresIn(15 * 60);
      setCode(Array(CODE_LENGTH).fill(''));
    } catch (err) {
      console.error('[EmailVerification] Failed to resend verification email:', err);
      setError(t('auth.error_verification_send'));
    } finally {
      setResending(false);
    }
  };

  const handleCancel = async () => {
    try {
      await signOut();
      router.back();
    } catch (err) {
      console.error('[EmailVerification] Error during cancel:', err);
      setError(t('common.error'));
    }
  };

  const handleCancelPrompt = () => {
    showAlert(
      t('auth.cancel_verification_title'),
      t('auth.cancel_verification_message'),
      [
        {
          text: t('settings.cancel'),
          style: 'cancel',
        },
        {
          text: t('auth.cancel_verification_confirm'),
          style: 'destructive',
          onPress: () => {
            void handleCancel();
          },
        },
      ],
      undefined,
      {
        variant: 'danger',
        dismissible: true,
      },
    );
  };

  if (success) {
    return (
      <AppScreen style={styles.successScreen}>
        <View style={styles.successContainer}>
          <View style={styles.successIcon}>
            <Check color={colors.white} size={48} />
          </View>
          <Text style={styles.successTitle}>
            {t('auth.verification_sent_title')}
          </Text>
          <Text style={styles.successSubtitle}>
            {t('auth.verification_sent_subtitle_signup')}
          </Text>
          <ActivityIndicator
            size="large"
            color={colors.primaryText}
            style={{ marginTop: SPACING.lg }}
          />
        </View>
      </AppScreen>
    );
  }

  return (
    <AuthShell
      showBack
      onBack={handleCancelPrompt}
      backTestID="email-verification-back"
      showLanguage={false}
    >
      {alertElement}
      <AuthHero
        brand="HEALTH SCAN"
        align="center"
        title={t('auth.verify_title')}
        subtitle={t('auth.verify_subtitle')}
        visual={
          <View style={styles.iconBubble}>
            <Mail color={colors.primary} size={32} />
          </View>
        }
      />
      {email ? (
        <Text style={styles.emailText} numberOfLines={1} ellipsizeMode="middle">
          {email}
        </Text>
      ) : null}

      <AuthOTPInput
        length={CODE_LENGTH}
        value={code}
        onChange={setCode}
        error={!!error && error === t('auth.code_invalid')}
      />

      <View style={styles.timerContainer}>
        <Text
          style={[
            styles.timerText,
            expiresIn < 60 ? styles.timerWarning : null,
          ]}
        >
          {t('auth.code_expired')} {formatTime(expiresIn)}
        </Text>
      </View>

      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {avatarUploadFailed ? (
        <View style={styles.avatarFailureActions}>
          <Button
            title={t('onboarding.avatar_upload_retry')}
            onPress={handleRetryAvatarUpload}
            loading={loading || finalizing}
            disabled={loading || finalizing}
            variant="primary"
            size="lg"
          />
          <Button
            title={t('onboarding.avatar_upload_continue')}
            onPress={handleContinueWithoutAvatar}
            disabled={loading || finalizing}
            variant="ghost"
            testID="verification-continue-without-avatar"
          />
        </View>
      ) : (
        <Button
          title={loading || finalizing ? t('auth.verifying') : t('auth.verify_btn')}
          onPress={handleVerify}
          loading={loading || finalizing}
          disabled={
            loading || finalizing || code.join('').length !== CODE_LENGTH
          }
          variant="primary"
          size="lg"
        />
      )}

      <Pressable
        style={({ pressed }) => [
          styles.resendButton,
          (cooldown > 0 || resending) && styles.resendDisabled,
          pressed && styles.resendPressed,
        ]}
        onPress={handleResend}
        disabled={cooldown > 0 || resending}
        accessibilityRole="button"
      >
        {resending ? (
          <ActivityIndicator size="small" color={colors.gray} />
        ) : (
          <>
            <RefreshCw
              color={cooldown > 0 ? colors.gray : colors.primary}
              size={18}
            />
            <Text
              style={[
                styles.resendText,
                cooldown > 0 && styles.resendTextDisabled,
              ]}
            >
              {cooldown > 0
                ? t('auth.resend_in', { seconds: cooldown.toString() })
                : t('auth.resend_code')}
            </Text>
          </>
        )}
      </Pressable>
    </AuthShell>
  );
}

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    successScreen: {
      flex: 1,
      backgroundColor: colors.background,
    },
    iconBubble: {
      width: 80,
      height: 80,
      borderRadius: 40,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: mixColors(colors.cardBackground, colors.primary, isDark ? 0.18 : 0.10),
    },
    emailText: {
      fontSize: SIZES.md,
      fontWeight: '600',
      color: colors.primaryText,
      textAlign: 'center',
    },
    timerContainer: {
      alignItems: 'center',
    },
    timerText: {
      fontSize: SIZES.sm,
      color: colors.gray,
      fontWeight: '500',
    },
    timerWarning: {
      color: colors.error,
      fontWeight: '600',
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
    avatarFailureActions: {
      gap: SPACING.md,
    },
    resendButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: SPACING.md,
      gap: SPACING.sm,
      borderRadius: BORDER_RADIUS.pill,
    },
    resendPressed: {
      backgroundColor: withAlpha(colors.primary, 0.08),
    },
    resendDisabled: {
      opacity: 0.6,
    },
    resendText: {
      fontSize: SIZES.md,
      color: colors.primaryText,
      fontWeight: '600',
    },
    resendTextDisabled: {
      color: colors.gray,
    },
    successContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: SPACING.lg,
    },
    successIcon: {
      width: 100,
      height: 100,
      borderRadius: 50,
      backgroundColor: colors.success,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: SPACING.lg,
    },
    successTitle: {
      fontSize: SIZES.xxl,
      fontWeight: '700',
      color: colors.primaryText,
      marginBottom: SPACING.sm,
      textAlign: 'center',
    },
    successSubtitle: {
      fontSize: SIZES.md,
      color: colors.gray,
      textAlign: 'center',
    },
  });
