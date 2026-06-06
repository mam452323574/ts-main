import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { AuthHero, type AuthInputStatus, AuthShell, UsernameField } from '@/components/auth';
import { Button } from '@/components/Button';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { Squircle } from '@/components/Squircle';
import { BORDER_RADIUS, SIZES, SPACING, withAlpha } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useStartupDiagnostics } from '@/contexts/StartupDiagnosticsContext';
import { useTheme } from '@/contexts/ThemeContext';
import { uploadAvatarFromLocalUri } from '@/services/avatar';
import {
  clearPreAuthOnboardingDraft,
  loadPreAuthOnboardingDraft,
  type PreAuthOnboardingDraft,
} from '@/utils/preAuthOnboarding';
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
    refreshUserProfile,
  } = useAuth();
  const { colors, setTheme } = useTheme();
  const { t } = useLanguage();
  const { markStartup, settleStartup } = useStartupDiagnostics();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [draft, setDraft] = useState<PreAuthOnboardingDraft | null>(null);
  const [hydrating, setHydrating] = useState(true);
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [avatarUploadFailed, setAvatarUploadFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const [autoCompletingOAuthDraft, setAutoCompletingGoogleDraft] = useState(false);
  const checkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoCompletionStartedRef = useRef(false);

  const isOAuthUser =
    Boolean(user?.app_metadata?.provider) &&
    user?.app_metadata?.provider !== 'email';

  useEffect(() => {
    if (!user) {
      return;
    }

    markStartup('username-setup-rendered', {
      hasUsername: !!userProfile?.username,
      isNewSignup: !userProfile?.username,
    });
    settleStartup('username-setup-rendered');
  }, [markStartup, settleStartup, user, userProfile?.username]);

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
    }
  }, [isEmailVerified, router, user]);

  useEffect(() => {
    let mounted = true;
    const hydrate = async () => {
      const savedDraft = await loadPreAuthOnboardingDraft();
      if (!mounted) {
        return;
      }
      setDraft(savedDraft);
      setUsername(savedDraft.username);
      setAutoCompletingGoogleDraft(
        isOAuthUser &&
          (savedDraft.completionIntent === 'signup-google' ||
            savedDraft.completionIntent === 'signup-apple') &&
          validateCanonicalUsername(savedDraft.username).valid,
      );
      if (savedDraft.selectedTheme) {
        setTheme(savedDraft.selectedTheme);
      }
      setHydrating(false);
    };

    void hydrate();
    return () => {
      mounted = false;
    };
  }, [isOAuthUser, setTheme]);

  useEffect(() => {
    if (checkTimeoutRef.current) {
      clearTimeout(checkTimeoutRef.current);
    }

    if (autoCompletingOAuthDraft) {
      return;
    }

    if (!username) {
      setUsernameStatus('idle');
      return;
    }
    if (!validateCanonicalUsername(username).valid) {
      setUsernameStatus('invalid');
      return;
    }

    setUsernameStatus('checking');
    checkTimeoutRef.current = setTimeout(async () => {
      try {
        const available = await checkUsernameAvailability(username);
        setUsernameStatus(available ? 'available' : 'taken');
      } catch {
        setUsernameStatus('idle');
      }
    }, 300);

    return () => {
      if (checkTimeoutRef.current) {
        clearTimeout(checkTimeoutRef.current);
      }
    };
  }, [autoCompletingOAuthDraft, checkUsernameAvailability, username]);

  const handleUsernameChange = (text: string) => {
    setUsername(normalizeUsernameInput(text));
    setError(null);
    setAvatarUploadFailed(false);
  };

  const finishProfile = async (skipAvatarUpload = false) => {
    if (!user) {
      setError(t('onboarding.error_session'));
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
    if (!username) {
      setError(t('onboarding.error_username_empty'));
      return;
    }
    if (usernameStatus !== 'available') {
      setError(t('onboarding.error_username_taken'));
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setAvatarUploadFailed(false);
      let avatarReference: string | undefined;

      if (draft?.avatarLocalUri && !skipAvatarUpload) {
        try {
          const uploadedAvatar = await uploadAvatarFromLocalUri(
            user.id,
            draft.avatarLocalUri,
          );
          avatarReference = uploadedAvatar.avatarReference;
        } catch (uploadError) {
          console.error('[UsernameSetup] Failed to upload draft avatar:', uploadError);
          setAvatarUploadFailed(true);
          setError(t('onboarding.error_avatar_upload'));
          return;
        }
      }

      if (isOAuthUser) {
        await persistUsername(username, avatarReference);
      } else {
        await completeSignUp(user.id, username, avatarReference);
      }

      await markPostSignupOnboardingPending(user.id);
      await clearPreAuthOnboardingDraft();
      await refreshUserProfile();
      router.replace('/post-signup-onboarding' as any);
    } catch (profileError) {
      const message =
        profileError instanceof Error ? profileError.message : t('common.error_config');
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const finishAutomaticOAuthDraft = useCallback(
    async (skipAvatarUpload = false) => {
      if (!user || !draft) {
        setAutoCompletingGoogleDraft(false);
        return;
      }

      const { normalizedUsername, valid } = validateCanonicalUsername(draft.username);
      if (!valid) {
        setAutoCompletingGoogleDraft(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        setAvatarUploadFailed(false);

        const available = await checkUsernameAvailability(normalizedUsername);
        if (!available) {
          setUsername(normalizedUsername);
          setUsernameStatus('taken');
          setError(t('onboarding.error_username_taken'));
          setAutoCompletingGoogleDraft(false);
          return;
        }

        let avatarReference: string | undefined;
        if (draft.avatarLocalUri && !skipAvatarUpload) {
          try {
            const uploadedAvatar = await uploadAvatarFromLocalUri(
              user.id,
              draft.avatarLocalUri,
            );
            avatarReference = uploadedAvatar.avatarReference;
          } catch (uploadError) {
            console.error('[UsernameSetup] Failed to upload draft avatar:', uploadError);
            setAvatarUploadFailed(true);
            setError(t('onboarding.error_avatar_upload'));
            return;
          }
        }

        await persistUsername(normalizedUsername, avatarReference);
        await markPostSignupOnboardingPending(user.id);
        await clearPreAuthOnboardingDraft();
        await refreshUserProfile();
        router.replace('/post-signup-onboarding' as any);
      } catch (profileError) {
        const message =
          profileError instanceof Error ? profileError.message : t('common.error_config');
        setUsername(normalizedUsername);
        setError(message);
        setAutoCompletingGoogleDraft(false);
      } finally {
        setLoading(false);
      }
    },
    [
      checkUsernameAvailability,
      draft,
      persistUsername,
      refreshUserProfile,
      router,
      t,
      user,
    ],
  );

  useEffect(() => {
    if (
      hydrating ||
      !autoCompletingOAuthDraft ||
      autoCompletionStartedRef.current ||
      !draft ||
      !user ||
      !isEmailVerified
    ) {
      return;
    }

    autoCompletionStartedRef.current = true;
    void finishAutomaticOAuthDraft();
  }, [
    autoCompletingOAuthDraft,
    draft,
    finishAutomaticOAuthDraft,
    hydrating,
    isEmailVerified,
    user,
  ]);

  const usernameInputStatus: AuthInputStatus =
    usernameStatus === 'checking'
      ? 'checking'
      : usernameStatus === 'available'
        ? 'success'
        : usernameStatus === 'taken' || usernameStatus === 'invalid'
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

  if (!user) {
    return null;
  }

  if (hydrating) {
    return (
      <AuthShell showLanguage={false}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </AuthShell>
    );
  }

  if (autoCompletingOAuthDraft) {
    return (
      <AuthShell showLanguage={false} scroll>
        <View style={styles.page}>
          <View style={styles.body}>
            <AuthHero
              variant="step"
              title={t('onboarding.finalize_profile_title')}
              subtitle={t('onboarding.finalize_profile_subtitle')}
            />
            {draft?.avatarLocalUri ? (
              <View style={styles.avatarPreview}>
                <ProfileAvatar
                  avatarUrl={draft.avatarLocalUri}
                  username={username}
                  size={76}
                />
              </View>
            ) : null}
            {error ? (
              <Squircle style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </Squircle>
            ) : (
              <ActivityIndicator color={colors.primary} size="large" />
            )}
          </View>
          {avatarUploadFailed ? (
            <View style={styles.footer}>
              <Button
                title={t('onboarding.avatar_upload_retry')}
                onPress={() => void finishAutomaticOAuthDraft()}
                loading={loading}
                disabled={loading}
                variant="primary"
                size="lg"
                flat
              />
              <Button
                title={t('onboarding.avatar_upload_continue')}
                onPress={() => void finishAutomaticOAuthDraft(true)}
                disabled={loading}
                variant="ghost"
                flat
                testID="username-setup-continue-without-avatar"
              />
            </View>
          ) : null}
        </View>
      </AuthShell>
    );
  }

  return (
    <AuthShell showLanguage={false} scroll>
      <View style={styles.page}>
        <View style={styles.body}>
          <AuthHero
            variant="step"
            title={t('onboarding.finalize_profile_title')}
            subtitle={t('onboarding.finalize_profile_subtitle')}
          />
          {draft?.avatarLocalUri ? (
            <View style={styles.avatarPreview}>
              <ProfileAvatar
                avatarUrl={draft.avatarLocalUri}
                username={username}
                size={76}
              />
            </View>
          ) : null}
          <UsernameField
            value={username}
            onChangeText={handleUsernameChange}
            status={usernameInputStatus}
            statusMessage={usernameStatusMessage}
            testID="username-setup-input"
          />
          {error ? (
            <Squircle style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </Squircle>
          ) : null}
        </View>
        <View style={styles.footer}>
          <Button
            title={t('onboarding.finalize_profile_btn')}
            onPress={() => void finishProfile()}
            loading={loading}
            disabled={loading || usernameStatus !== 'available'}
            variant="primary"
            size="lg"
            flat
          />
          {avatarUploadFailed ? (
            <Button
              title={t('onboarding.avatar_upload_continue')}
              onPress={() => void finishProfile(true)}
              disabled={loading}
              variant="ghost"
              flat
              testID="username-setup-continue-without-avatar"
            />
          ) : null}
        </View>
      </View>
    </AuthShell>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    page: {
      flex: 1,
      justifyContent: 'space-between',
      gap: SPACING.lg,
    },
    body: {
      gap: SPACING.lg,
    },
    footer: {
      gap: SPACING.sm,
    },
    avatarPreview: {
      alignItems: 'center',
    },
    errorContainer: {
      backgroundColor: withAlpha(colors.error, 0.1),
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.lg,
      borderRadius: BORDER_RADIUS.lg,
      borderCurve: 'continuous',
    },
    errorText: {
      color: colors.error,
      fontSize: SIZES.sm,
      lineHeight: 20,
      textAlign: 'center',
    },
  });
