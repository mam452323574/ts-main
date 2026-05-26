import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  Camera,
  Eye,
  EyeOff,
  ImagePlus,
  Lock,
  Mail,
  UserRound,
} from 'lucide-react-native';

import {
  AuthHero,
  AuthInput,
  AuthSelectCard,
  AuthShell,
  AuthStepDots,
  AuthThemeVisual,
} from '@/components/auth';
import { AvatarCropModal, type AvatarCropAsset } from '@/components/AvatarCropModal';
import { Button } from '@/components/Button';
import { OAuthButton } from '@/components/OAuthButton';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { Squircle } from '@/components/Squircle';
import {
  BORDER_RADIUS,
  SIZES,
  SPACING,
  type ThemeType,
  withAlpha,
} from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { createPreparedAvatarLocalUri } from '@/services/avatar';
import { SignUpCredentialsSchema } from '@/utils/authSchemas';
import type { AvatarCropSelection } from '@/utils/avatarCrop';
import {
  loadPreAuthOnboardingDraft,
  updatePreAuthOnboardingDraft,
  type PreAuthOnboardingDraft,
  type PreAuthOnboardingStep,
} from '@/utils/preAuthOnboarding';
import {
  normalizeUsernameInput,
  validateCanonicalUsername,
} from '@/utils/username';

const SIGNUP_STEPS: PreAuthOnboardingStep[] = [
  'intro',
  'username',
  'avatar',
  'appearance',
  'accountMethod',
  'emailCredentials',
];

function isMediaLibraryGranted(permission: ImagePicker.MediaLibraryPermissionResponse) {
  return permission.granted || permission.accessPrivileges === 'limited';
}

export default function SignUpScreen() {
  const router = useRouter();
  const {
    signUp,
    signInWithGoogle,
    sendVerificationEmail,
    isDisposableEmail,
  } = useAuth();
  const { colors, setTheme, theme: activeTheme } = useTheme();
  const { t } = useLanguage();
  const { showAlert, alertElement } = useCustomAlert();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const initialTheme: ThemeType =
    activeTheme === 'light' || activeTheme === 'dark' ? activeTheme : 'dark';
  const [hydrating, setHydrating] = useState(true);
  const [step, setStep] = useState<PreAuthOnboardingStep>('intro');
  const [selectedTheme, setSelectedTheme] = useState<ThemeType>(initialTheme);
  const [username, setUsername] = useState('');
  const [avatarLocalUri, setAvatarLocalUri] = useState<string | null>(null);
  const [avatarCropAsset, setAvatarCropAsset] = useState<AvatarCropAsset | null>(null);
  const [preparingAvatar, setPreparingAvatar] = useState(false);
  const [avatarSkipped, setAvatarSkipped] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usernameValidation = useMemo(
    () => validateCanonicalUsername(username),
    [username],
  );
  const currentStepIndex = Math.max(0, SIGNUP_STEPS.indexOf(step));
  const usesKeyboardLayout = step === 'username' || step === 'emailCredentials';

  useEffect(() => {
    let mounted = true;

    const hydrateDraft = async () => {
      const draft = await loadPreAuthOnboardingDraft();
      if (!mounted) {
        return;
      }

      const restoredTheme = draft.selectedTheme ?? initialTheme;
      setSelectedTheme(restoredTheme);
      setTheme(restoredTheme);
      setUsername(draft.username);
      setAvatarLocalUri(draft.avatarLocalUri);
      setAvatarSkipped(draft.avatarSkipped);
      setEmail(draft.email);
      setStep(
        draft.lastStep === 'verification'
          ? 'emailCredentials'
          : draft.lastStep,
      );
      setHydrating(false);
    };

    void hydrateDraft();
    return () => {
      mounted = false;
    };
  }, []);

  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDraftPatchRef = useRef<Partial<PreAuthOnboardingDraft> | null>(null);

  const flushPendingDraft = useCallback(() => {
    if (draftSaveTimerRef.current) {
      clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }
    const patch = pendingDraftPatchRef.current;
    pendingDraftPatchRef.current = null;
    if (patch) {
      void updatePreAuthOnboardingDraft(patch);
    }
  }, []);

  const scheduleDraftSave = useCallback(
    (patch: Partial<PreAuthOnboardingDraft>) => {
      pendingDraftPatchRef.current = {
        ...(pendingDraftPatchRef.current ?? {}),
        ...patch,
      };
      if (draftSaveTimerRef.current) {
        clearTimeout(draftSaveTimerRef.current);
      }
      draftSaveTimerRef.current = setTimeout(() => {
        const queuedPatch = pendingDraftPatchRef.current;
        pendingDraftPatchRef.current = null;
        draftSaveTimerRef.current = null;
        if (queuedPatch) {
          void updatePreAuthOnboardingDraft(queuedPatch);
        }
      }, 400);
    },
    [],
  );

  const cancelPendingDraftSave = useCallback(() => {
    if (draftSaveTimerRef.current) {
      clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }
    pendingDraftPatchRef.current = null;
  }, []);

  useEffect(() => () => flushPendingDraft(), [flushPendingDraft]);

  const persistStep = async (nextStep: PreAuthOnboardingStep) => {
    cancelPendingDraftSave();
    setError(null);
    setStep(nextStep);
    await updatePreAuthOnboardingDraft({ lastStep: nextStep });
  };

  const handleBack = () => {
    if (step === 'intro') {
      router.back();
      return;
    }

    const previousStep = SIGNUP_STEPS[currentStepIndex - 1] ?? 'intro';
    void persistStep(previousStep);
  };

  const handleUsernameChange = useCallback(
    (value: string) => {
      const normalizedUsername = normalizeUsernameInput(value);
      setUsername(normalizedUsername);
      setError(null);
      scheduleDraftSave({
        username: normalizedUsername,
        lastStep: 'username',
      });
    },
    [scheduleDraftSave],
  );

  const handleUsernameContinue = () => {
    if (!username) {
      setError(t('onboarding.error_username_empty'));
      return;
    }
    if (!usernameValidation.valid) {
      setError(t('onboarding.username_status.invalid'));
      return;
    }
    void persistStep('avatar');
  };

  const showPermissionAlert = (message: string) => {
    showAlert(t('components.avatar.perm_title'), message, [
      { text: t('common.ok') },
    ]);
  };

  const openAvatarCropModal = (asset: ImagePicker.ImagePickerAsset) => {
    setAvatarCropAsset({ uri: asset.uri, width: asset.width, height: asset.height });
  };

  const pickAvatarFromLibrary = async () => {
    try {
      const currentPermission = await ImagePicker.getMediaLibraryPermissionsAsync();
      const permission = isMediaLibraryGranted(currentPermission)
        ? currentPermission
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!isMediaLibraryGranted(permission)) {
        showPermissionAlert(t('components.avatar.perm_gallery'));
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
      });
      const selectedAsset = result.canceled ? null : result.assets?.[0];
      if (selectedAsset?.uri) {
        openAvatarCropModal(selectedAsset);
      }
    } catch (avatarError) {
      console.error('[SignUp] Failed to pick pre-auth avatar:', avatarError);
      setError(t('components.avatar.error_picker_launch'));
    }
  };

  const takeAvatarPhoto = async () => {
    try {
      const currentPermission = await ImagePicker.getCameraPermissionsAsync();
      const permission = currentPermission.granted
        ? currentPermission
        : await ImagePicker.requestCameraPermissionsAsync();

      if (!permission.granted) {
        showPermissionAlert(t('components.avatar.perm_camera'));
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.8,
      });
      const selectedAsset = result.canceled ? null : result.assets?.[0];
      if (selectedAsset?.uri) {
        openAvatarCropModal(selectedAsset);
      }
    } catch (avatarError) {
      console.error('[SignUp] Failed to capture pre-auth avatar:', avatarError);
      setError(t('components.avatar.error_camera_unavailable'));
    }
  };

  const handleAvatarCropConfirm = async (selection: AvatarCropSelection) => {
    if (!avatarCropAsset?.uri || preparingAvatar) {
      return;
    }

    try {
      setPreparingAvatar(true);
      const preparedLocalUri = await createPreparedAvatarLocalUri(
        avatarCropAsset.uri,
        selection,
      );
      setAvatarLocalUri(preparedLocalUri);
      setAvatarSkipped(false);
      setError(null);
      await updatePreAuthOnboardingDraft({
        avatarLocalUri: preparedLocalUri,
        avatarSkipped: false,
        lastStep: 'avatar',
      });
      setAvatarCropAsset(null);
    } catch (avatarError) {
      console.error('[SignUp] Failed to crop pre-auth avatar:', avatarError);
      setError(t('components.avatar.error_download'));
    } finally {
      setPreparingAvatar(false);
    }
  };

  const handleSkipAvatar = async () => {
    setAvatarLocalUri(null);
    setAvatarCropAsset(null);
    setAvatarSkipped(true);
    setError(null);
    setStep('appearance');
    await updatePreAuthOnboardingDraft({
      avatarLocalUri: null,
      avatarSkipped: true,
      lastStep: 'appearance',
    });
  };

  const handleThemeSelect = async (nextTheme: ThemeType) => {
    setSelectedTheme(nextTheme);
    setTheme(nextTheme);
    await updatePreAuthOnboardingDraft({
      selectedTheme: nextTheme,
      lastStep: 'appearance',
    });
  };

  const handleEmailChange = useCallback(
    (value: string) => {
      setEmail(value);
      setError(null);
      scheduleDraftSave({ email: value, lastStep: 'emailCredentials' });
    },
    [scheduleDraftSave],
  );

  const passwordRightAction = useMemo(
    () => ({
      icon: showPassword ? EyeOff : Eye,
      onPress: () => setShowPassword((visible) => !visible),
      accessibilityLabel: showPassword
        ? t('auth.password_hide')
        : t('auth.password_show'),
    }),
    [showPassword, t],
  );
  const confirmPasswordRightAction = useMemo(
    () => ({
      icon: showConfirmPassword ? EyeOff : Eye,
      onPress: () => setShowConfirmPassword((visible) => !visible),
      accessibilityLabel: showConfirmPassword
        ? t('auth.password_hide')
        : t('auth.password_show'),
    }),
    [showConfirmPassword, t],
  );

  const handleSignUp = async () => {
    cancelPendingDraftSave();
    setError(null);

    if (!email || !password || !confirmPassword) {
      setError(t('auth.errors.fill_all'));
      return;
    }

    const parsed = SignUpCredentialsSchema.safeParse({
      email,
      password,
      confirmPassword,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const path = issue?.path?.[0];
      if (path === 'email') {
        setError(t('auth.errors.invalid_email'));
      } else if (issue?.message === 'passwords_do_not_match') {
        setError(t('auth.errors.password_mismatch'));
      } else if (issue?.message === 'password_too_common') {
        setError(t('auth.errors.password_too_common'));
      } else if (path === 'password') {
        setError(t('auth.errors.password_short'));
      } else {
        setError(t('auth.errors.general_error'));
      }
      return;
    }

    if (loading || googleLoading) {
      return;
    }

    try {
      setLoading(true);
      await updatePreAuthOnboardingDraft({
        selectedTheme,
        username,
        avatarLocalUri,
        avatarSkipped,
        email,
        createdUserId: null,
        completionIntent: null,
        lastStep: 'emailCredentials',
      });

      if (await isDisposableEmail(email)) {
        setError(t('auth.errors.disposable_email'));
        return;
      }

      await updatePreAuthOnboardingDraft({
        completionIntent: 'signup-email',
      });
      const { userId, email: userEmail } = await signUp(email, password);
      await updatePreAuthOnboardingDraft({
        email: userEmail,
        createdUserId: userId,
        lastStep: 'verification',
      });

      let initialSendFailed = false;
      try {
        await sendVerificationEmail();
      } catch (sendError) {
        initialSendFailed = true;
        console.error('[SignUp] Failed to send verification email:', sendError);
      }

      router.push({
        pathname: '/email-verification',
        params: {
          email: userEmail,
          userId,
          type: 'signup',
          ...(initialSendFailed ? { initialSendFailed: 'true' } : {}),
        },
      });
    } catch (signUpError) {
      const message = signUpError instanceof Error ? signUpError.message : '';
      const name = signUpError instanceof Error ? signUpError.name : '';
      const lowerMessage = message.toLowerCase();
      const isIpLimit =
        name === 'IpLimitError' ||
        lowerMessage.includes('limit reached') ||
        (lowerMessage.includes('limite') && lowerMessage.includes('atteinte'));
      const isNetwork =
        lowerMessage.includes('network') ||
        lowerMessage.includes('fetch') ||
        lowerMessage.includes('timeout') ||
        lowerMessage.includes('offline') ||
        /\b5\d{2}\b/.test(message);

      if (isIpLimit) {
        setError(message || t('auth.error_ip_limit_reached'));
      } else if (isNetwork) {
        setError(message || t('auth.errors.general_error'));
      } else {
        setError(t('auth.errors.signup_followup'));
      }
      await updatePreAuthOnboardingDraft({
        completionIntent: null,
        createdUserId: null,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    if (loading || googleLoading) {
      return;
    }

    cancelPendingDraftSave();
    try {
      setGoogleLoading(true);
      setError(null);
      await updatePreAuthOnboardingDraft({
        selectedTheme,
        username,
        avatarLocalUri,
        avatarSkipped,
        email,
        createdUserId: null,
        completionIntent: 'signup-google',
        lastStep: 'accountMethod',
      });
      await signInWithGoogle();
    } catch (oauthError) {
      await updatePreAuthOnboardingDraft({
        completionIntent: null,
        createdUserId: null,
      });
      setError(
        oauthError instanceof Error
          ? oauthError.message
          : t('auth.errors.oauth_login', { provider: 'google' }),
      );
    } finally {
      setGoogleLoading(false);
    }
  };

  const renderError = () =>
    error ? (
      <Squircle style={styles.errorContainer}>
        <Text style={styles.errorText}>{error}</Text>
      </Squircle>
    ) : null;

  const renderIntro = () => (
    <View style={styles.simplePage}>
      <View style={styles.introBody}>
        <AuthHero
          variant="intro"
          brand="HEALTH SCAN"
          title={t('onboarding.intro_step_title')}
          subtitle={t('onboarding.intro_step_subtitle')}
        />
      </View>
      <View style={styles.footer}>
        <Text style={styles.supportText}>{t('onboarding.intro_step_note')}</Text>
        <Button
          title={t('onboarding.intro_cta')}
          onPress={() => void persistStep('username')}
          variant="primary"
          size="lg"
          flat
          testID="signup-start"
        />
        <Pressable
          onPress={() => router.push('/login')}
          accessibilityRole="button"
          style={styles.linkButton}
        >
          <Text style={styles.linkText}>{t('onboarding.existing_account_cta')}</Text>
        </Pressable>
      </View>
    </View>
  );

  const renderUsername = () => (
    <View style={styles.simplePage}>
      <View style={styles.body}>
        <AuthHero
          variant="step"
          title={t('onboarding.username_step_title')}
          subtitle={t('onboarding.username_step_subtitle')}
        />
        <AuthInput
          label={t('onboarding.username_label')}
          icon={UserRound}
          placeholder={t('onboarding.username_placeholder')}
          value={username}
          onChangeText={handleUsernameChange}
          autoCapitalize="none"
          autoComplete="off"
          testID="signup-username-input"
          status={
            username.length > 0 && !usernameValidation.valid
              ? 'error'
              : usernameValidation.valid
                ? 'success'
                : 'idle'
          }
          statusMessage={
            username.length > 0 && !usernameValidation.valid
              ? t('onboarding.username_status.invalid')
              : usernameValidation.valid
                ? t('onboarding.username_status.ready')
                : undefined
          }
        />
        {renderError()}
      </View>
      <Button
        title={t('common.next')}
        onPress={handleUsernameContinue}
        variant="primary"
        size="lg"
        flat
      />
    </View>
  );

  const renderAvatar = () => (
    <View style={styles.simplePage}>
      <View style={styles.body}>
        <AuthHero
          variant="step"
          title={t('onboarding.avatar_title')}
          subtitle={t('onboarding.avatar_pre_auth_subtitle')}
        />
        <View style={styles.avatarStage}>
          <ProfileAvatar
            avatarUrl={avatarLocalUri}
            username={username}
            size={104}
            testID="signup-avatar-preview"
          />
          {avatarLocalUri ? (
            <Text style={styles.selectedText}>{t('onboarding.avatar_selected')}</Text>
          ) : null}
        </View>
        <View style={styles.avatarActions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => void takeAvatarPhoto()}
            style={styles.secondaryAction}
            testID="signup-avatar-camera"
          >
            <Camera color={colors.primaryText} size={19} />
            <Text style={styles.secondaryLabel}>{t('onboarding.avatar_take_photo')}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => void pickAvatarFromLibrary()}
            style={styles.secondaryAction}
            testID="signup-avatar-library"
          >
            <ImagePlus color={colors.primaryText} size={19} />
            <Text style={styles.secondaryLabel}>{t('onboarding.avatar_choose_gallery')}</Text>
          </Pressable>
        </View>
        {renderError()}
      </View>
      <View style={styles.footer}>
        <Button
          title={t('common.next')}
          onPress={() => void persistStep('appearance')}
          disabled={!avatarLocalUri}
          variant="primary"
          size="lg"
          flat
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => void handleSkipAvatar()}
          style={styles.linkButton}
          testID="signup-avatar-skip"
        >
          <Text style={styles.linkText}>{t('onboarding.avatar_skip')}</Text>
        </Pressable>
      </View>
    </View>
  );

  const renderAppearance = () => (
    <View style={styles.simplePage}>
      <View style={styles.body}>
        <AuthHero
          variant="step"
          title={t('onboarding.profile_theme_title')}
          subtitle={t('onboarding.profile_theme_subtitle')}
        />
        <View style={styles.themeChoices}>
          <AuthSelectCard
            selected={selectedTheme === 'light'}
            onPress={() => void handleThemeSelect('light')}
            title={t('onboarding.theme.light')}
            subtitle={t('onboarding.theme.light_desc')}
            testID="signup-theme-light"
            visual={<AuthThemeVisual theme="light" size={42} />}
          />
          <AuthSelectCard
            selected={selectedTheme === 'dark'}
            onPress={() => void handleThemeSelect('dark')}
            title={t('onboarding.theme.dark')}
            subtitle={t('onboarding.theme.dark_desc')}
            testID="signup-theme-dark"
            visual={<AuthThemeVisual theme="dark" size={42} />}
          />
        </View>
      </View>
      <Button
        title={t('common.next')}
        onPress={() => void persistStep('accountMethod')}
        variant="primary"
        size="lg"
        flat
      />
    </View>
  );

  const renderAccountMethod = () => (
    <View style={styles.simplePage}>
      <View style={styles.body}>
        <AuthHero
          variant="step"
          title={t('onboarding.account_method_title')}
          subtitle={t('onboarding.account_method_subtitle')}
        />
        <OAuthButton
          provider="google"
          onPress={handleGoogleSignUp}
          loading={googleLoading}
          disabled={googleLoading || loading}
        />
        {renderError()}
      </View>
      <View style={styles.footer}>
        <Button
          title={t('onboarding.account_email_cta')}
          onPress={() => void persistStep('emailCredentials')}
          variant="outline"
          tone="neutral"
          size="lg"
          flat
        />
        <Pressable
          onPress={() => router.push('/login')}
          accessibilityRole="button"
          style={styles.linkButton}
        >
          <Text style={styles.linkText}>{t('onboarding.existing_account_cta')}</Text>
        </Pressable>
      </View>
    </View>
  );

  const renderEmailCredentials = () => (
    <View style={styles.simplePage}>
      <View style={styles.body}>
        <AuthHero
          variant="step"
          title={t('auth.signup_title')}
          subtitle={t('auth.verification_note')}
        />
        <View style={styles.form}>
          <AuthInput
            label={t('auth.email_label')}
            icon={Mail}
            placeholder={t('auth.email_placeholder')}
            value={email}
            onChangeText={handleEmailChange}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          <AuthInput
            label={t('common.password')}
            icon={Lock}
            placeholder={t('auth.password_min_placeholder')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            autoComplete="new-password"
            rightAction={passwordRightAction}
          />
          <AuthInput
            label={t('auth.password_confirm')}
            icon={Lock}
            placeholder={t('auth.password_confirm_placeholder')}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry={!showConfirmPassword}
            autoComplete="new-password"
            rightAction={confirmPasswordRightAction}
          />
        </View>
        {renderError()}
      </View>
      <Button
        title={t('auth.signup_btn')}
        onPress={handleSignUp}
        loading={loading}
        disabled={loading || googleLoading}
        variant="primary"
        size="lg"
        flat
      />
    </View>
  );

  const renderStep = () => {
    switch (step) {
      case 'username':
        return renderUsername();
      case 'avatar':
        return renderAvatar();
      case 'appearance':
        return renderAppearance();
      case 'accountMethod':
        return renderAccountMethod();
      case 'emailCredentials':
        return renderEmailCredentials();
      default:
        return renderIntro();
    }
  };

  if (hydrating) {
    return (
      <AuthShell showLanguage={false}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      showBack={step !== 'intro'}
      onBack={handleBack}
      backTestID="signup-back-button"
      showLanguage={step === 'intro'}
      scroll={usesKeyboardLayout}
    >
      {alertElement}
      <AvatarCropModal
        visible={!!avatarCropAsset}
        asset={avatarCropAsset}
        confirming={preparingAvatar}
        onCancel={() => setAvatarCropAsset(null)}
        onConfirm={(selection) => void handleAvatarCropConfirm(selection)}
      />
      {step !== 'intro' ? (
        <AuthStepDots
          total={SIGNUP_STEPS.length - 1}
          current={currentStepIndex - 1}
          style={styles.stepDots}
        />
      ) : null}
      {renderStep()}
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
    stepDots: {
      marginBottom: SPACING.lg,
    },
    simplePage: {
      flex: 1,
      justifyContent: 'space-between',
      gap: SPACING.lg,
    },
    body: {
      gap: SPACING.lg,
    },
    introBody: {
      flex: 1,
      justifyContent: 'center',
      paddingBottom: SPACING.xl,
    },
    footer: {
      gap: SPACING.md,
    },
    supportText: {
      fontSize: SIZES.sm,
      lineHeight: 20,
      color: colors.gray,
      textAlign: 'center',
    },
    linkButton: {
      minHeight: 42,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: SPACING.md,
    },
    linkText: {
      color: colors.primary,
      fontSize: SIZES.sm,
      fontWeight: '600',
      textAlign: 'center',
    },
    form: {
      gap: SPACING.md,
    },
    avatarStage: {
      alignItems: 'center',
      gap: SPACING.sm,
    },
    selectedText: {
      color: colors.gray,
      fontSize: SIZES.sm,
    },
    avatarActions: {
      flexDirection: 'row',
      gap: SPACING.sm,
    },
    secondaryAction: {
      flex: 1,
      minHeight: 52,
      paddingHorizontal: SPACING.sm,
      borderRadius: BORDER_RADIUS.pill,
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08),
      backgroundColor: colors.surfaceMuted ?? colors.cardBackground,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.xs,
      borderCurve: 'continuous',
    },
    secondaryLabel: {
      color: colors.primaryText,
      fontSize: SIZES.text12,
      fontWeight: '600',
      textAlign: 'center',
      flexShrink: 1,
    },
    themeChoices: {
      gap: SPACING.sm,
    },
    errorContainer: {
      backgroundColor: withAlpha(colors.error, 0.1),
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.md,
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
