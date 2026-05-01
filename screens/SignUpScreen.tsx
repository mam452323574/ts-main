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
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { BORDER_RADIUS, SIZES, SPACING, ThemeType, mixColors, withAlpha } from '@/constants/theme';
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
  'theme',
  'username',
  'avatar',
  'account',
];

function isMediaLibraryGranted(permission: ImagePicker.MediaLibraryPermissionResponse) {
  return permission.granted || permission.accessPrivileges === 'limited';
}

export default function SignUpScreen() {
  const router = useRouter();
  const { signUp, sendVerificationEmail, isDisposableEmail } = useAuth();
  const { colors, isDark, setTheme, theme: activeTheme } = useTheme();
  const { t } = useLanguage();
  const { showAlert, alertElement } = useCustomAlert();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const [hydrating, setHydrating] = useState(true);
  const [step, setStep] = useState<PreAuthOnboardingStep>('theme');
  const initialTheme: ThemeType =
    activeTheme === 'light' || activeTheme === 'dark' ? activeTheme : 'dark';
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
  const [error, setError] = useState<string | null>(null);

  const usernameValidation = useMemo(
    () => validateCanonicalUsername(username),
    [username],
  );
  const usernameIsInvalid = username.length > 0 && !usernameValidation.valid;
  const currentStepIndex = Math.max(0, SIGNUP_STEPS.indexOf(step));

  useEffect(() => {
    let isMounted = true;

    const hydrateDraft = async () => {
      const draft = await loadPreAuthOnboardingDraft();
      if (!isMounted) {
        return;
      }

      const restoredTheme = draft.selectedTheme ?? initialTheme;
      setSelectedTheme(restoredTheme);
      setTheme(restoredTheme);
      setUsername(draft.username);
      setAvatarLocalUri(draft.avatarLocalUri);
      setAvatarSkipped(draft.avatarSkipped);
      setEmail(draft.email);
      setStep(draft.lastStep === 'verification' ? 'account' : draft.lastStep);
      setHydrating(false);
    };

    void hydrateDraft();

    return () => {
      isMounted = false;
    };
  }, []);

  // Debounce des sauvegardes AsyncStorage déclenchées à chaque keystroke.
  // Sans ce découplage, l'I/O AsyncStorage dans le handler onChangeText
  // ralentit la chaîne de re-render React Native et fait perdre le focus
  // au TextInput (clavier qui se ferme instantanément).
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDraftPatchRef = useRef<Partial<PreAuthOnboardingDraft> | null>(
    null,
  );

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

  useEffect(
    () => () => {
      flushPendingDraft();
    },
    [flushPendingDraft],
  );

  const persistStep = async (nextStep: PreAuthOnboardingStep) => {
    cancelPendingDraftSave();
    setError(null);
    setStep(nextStep);
    await updatePreAuthOnboardingDraft({ lastStep: nextStep });
  };

  const handleThemeSelect = async (nextTheme: ThemeType) => {
    setSelectedTheme(nextTheme);
    setTheme(nextTheme);
    await updatePreAuthOnboardingDraft({
      selectedTheme: nextTheme,
      lastStep: 'theme',
    });
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

  const handleEmailChange = useCallback(
    (value: string) => {
      setEmail(value);
      setError(null);
      scheduleDraftSave({
        email: value,
        lastStep: 'account',
      });
    },
    [scheduleDraftSave],
  );

  const togglePasswordVisible = useCallback(
    () => setShowPassword((prev) => !prev),
    [],
  );
  const toggleConfirmPasswordVisible = useCallback(
    () => setShowConfirmPassword((prev) => !prev),
    [],
  );

  // Stabilise les objets rightAction passés à AuthInput (memo) pour qu'un
  // keystroke sur email ne re-render pas les TextInput password/confirm.
  const passwordRightAction = useMemo(
    () => ({
      icon: showPassword ? EyeOff : Eye,
      onPress: togglePasswordVisible,
    }),
    [showPassword, togglePasswordVisible],
  );
  const confirmPasswordRightAction = useMemo(
    () => ({
      icon: showConfirmPassword ? EyeOff : Eye,
      onPress: toggleConfirmPasswordVisible,
    }),
    [showConfirmPassword, toggleConfirmPasswordVisible],
  );

  const handleBack = () => {
    if (step === 'theme') {
      router.back();
      return;
    }

    const previousStep = SIGNUP_STEPS[currentStepIndex - 1] ?? 'theme';
    void persistStep(previousStep);
  };

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
    setAvatarCropAsset({
      uri: asset.uri,
      width: asset.width,
      height: asset.height,
    });
  };

  const pickAvatarFromLibrary = async () => {
    try {
      const currentPermission =
        await ImagePicker.getMediaLibraryPermissionsAsync();
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

  const handleSkipAvatar = async () => {
    setAvatarLocalUri(null);
    setAvatarCropAsset(null);
    setAvatarSkipped(true);
    await updatePreAuthOnboardingDraft({
      avatarLocalUri: null,
      avatarSkipped: true,
      lastStep: 'account',
    });
    await persistStep('account');
  };

  const handleAvatarCropCancel = () => {
    setAvatarCropAsset(null);
  };

  const handleAvatarCropConfirm = async (cropSelection: AvatarCropSelection) => {
    const asset = avatarCropAsset;
    if (!asset?.uri || preparingAvatar) {
      return;
    }

    try {
      setPreparingAvatar(true);
      const preparedLocalUri = await createPreparedAvatarLocalUri(
        asset.uri,
        cropSelection,
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

  const handleAvatarContinue = async () => {
    if (!avatarLocalUri) {
      await handleSkipAvatar();
      return;
    }

    await updatePreAuthOnboardingDraft({
      avatarLocalUri,
      avatarSkipped: false,
      lastStep: 'account',
    });
    await persistStep('account');
  };

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

    if (loading) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      await updatePreAuthOnboardingDraft({
        selectedTheme,
        username,
        avatarLocalUri,
        avatarSkipped,
        email,
        lastStep: 'account',
      });

      const isDisposable = await isDisposableEmail(email);
      if (isDisposable) {
        setError(t('auth.errors.disposable_email'));
        return;
      }

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
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '';
      const errorName = err instanceof Error ? err.name : '';
      const lowerMessage = errorMessage.toLowerCase();
      
      const isIpLimitError =
        errorName === 'IpLimitError' ||
        lowerMessage.includes('limit reached') ||
        (lowerMessage.includes('limite') && lowerMessage.includes('atteinte'));

      const isNetworkError =
        lowerMessage.includes('network') ||
        lowerMessage.includes('fetch') ||
        lowerMessage.includes('timeout') ||
        lowerMessage.includes('offline') ||
        /\b5\d{2}\b/.test(errorMessage);

      if (isIpLimitError) {
        setError(errorMessage || t('auth.error_ip_limit_reached'));
      } else if (isNetworkError) {
        setError(errorMessage || t('auth.errors.general_error'));
      } else {
        setError(t('auth.errors.signup_followup'));
      }
    } finally {
      setLoading(false);
    }
  };

  const renderThemeStep = () => (
    <>
      <AuthHero
        brand="HEALTH SCAN"
        title={t('onboarding.theme_step_title')}
        subtitle={t('onboarding.theme_step_subtitle')}
      />
      <View style={styles.optionGroup}>
        <AuthSelectCard
          selected={selectedTheme === 'dark'}
          onPress={() => void handleThemeSelect('dark')}
          title={t('onboarding.theme.dark')}
          subtitle={t('onboarding.theme.dark_desc')}
          testID="signup-theme-dark"
          visual={<AuthThemeVisual theme="dark" />}
        />
        <AuthSelectCard
          selected={selectedTheme === 'light'}
          onPress={() => void handleThemeSelect('light')}
          title={t('onboarding.theme.light')}
          subtitle={t('onboarding.theme.light_desc')}
          testID="signup-theme-light"
          visual={<AuthThemeVisual theme="light" />}
        />
      </View>
      <Button
        title={t('common.next')}
        onPress={() => void persistStep('username')}
        variant="primary"
        size="lg"
      />
    </>
  );

  const renderUsernameStep = () => (
    <>
      <AuthHero
        brand="HEALTH SCAN"
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
          usernameIsInvalid
            ? 'error'
            : usernameValidation.valid
              ? 'success'
              : 'idle'
        }
        statusMessage={
          usernameIsInvalid
            ? t('onboarding.username_status.invalid')
            : usernameValidation.valid
              ? t('onboarding.username_status.ready')
              : undefined
        }
      />
      <Button
        title={t('common.next')}
        onPress={handleUsernameContinue}
        disabled={!usernameValidation.valid}
        variant="primary"
        size="lg"
      />
    </>
  );

  const renderAvatarStep = () => (
    <>
      <AuthHero
        brand="HEALTH SCAN"
        title={t('onboarding.avatar_pre_auth_title')}
        subtitle={t('onboarding.avatar_pre_auth_subtitle')}
      />
      <View style={styles.avatarStage}>
        <View style={styles.avatarHalo}>
          <ProfileAvatar
            avatarUrl={avatarLocalUri}
            username={username}
            size={148}
            testID="signup-avatar-preview"
          />
        </View>
        {avatarLocalUri ? (
          <Text style={styles.avatarSelectedText}>
            {t('onboarding.avatar_selected')}
          </Text>
        ) : null}
      </View>
      <View style={styles.avatarActions}>
        <Pressable
          accessibilityRole="button"
          onPress={() => void takeAvatarPhoto()}
          style={({ pressed }) => [
            styles.secondaryAction,
            pressed && styles.secondaryActionPressed,
          ]}
          testID="signup-avatar-camera"
        >
          <Camera color={colors.primaryText} size={20} />
          <Text style={styles.secondaryActionLabel}>
            {t('onboarding.avatar_take_photo')}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => void pickAvatarFromLibrary()}
          style={({ pressed }) => [
            styles.secondaryAction,
            pressed && styles.secondaryActionPressed,
          ]}
          testID="signup-avatar-library"
        >
          <ImagePlus color={colors.primaryText} size={20} />
          <Text style={styles.secondaryActionLabel}>
            {t('onboarding.avatar_choose_gallery')}
          </Text>
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => void handleSkipAvatar()}
        style={styles.skipPressable}
        testID="signup-avatar-skip"
      >
        <Text style={styles.skipLabel}>{t('onboarding.avatar_skip')}</Text>
      </Pressable>
      <Button
        title={avatarLocalUri ? t('common.next') : t('onboarding.avatar_skip')}
        onPress={() => void handleAvatarContinue()}
        variant="primary"
        size="lg"
      />
    </>
  );

  const renderAccountStep = () => (
    <>
      <AuthHero
        brand="HEALTH SCAN"
        title={t('onboarding.account_step_title')}
        subtitle={t('onboarding.account_step_subtitle')}
      />
      <View style={styles.accountForm}>
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
          autoComplete="password-new"
          rightAction={passwordRightAction}
        />

        <AuthInput
          label={t('auth.password_confirm')}
          icon={Lock}
          placeholder={t('auth.password_confirm_placeholder')}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry={!showConfirmPassword}
          autoComplete="password-new"
          rightAction={confirmPasswordRightAction}
        />
      </View>

      <View style={styles.infoContainer}>
        <Text style={styles.infoText}>{t('auth.verification_note')}</Text>
      </View>

      <Button
        title={t('auth.signup_btn')}
        onPress={handleSignUp}
        loading={loading}
        disabled={loading || !email || !password || !confirmPassword}
        variant="primary"
        size="lg"
      />
    </>
  );

  const renderCurrentStep = () => {
    switch (step) {
      case 'username':
        return renderUsernameStep();
      case 'avatar':
        return renderAvatarStep();
      case 'account':
        return renderAccountStep();
      case 'theme':
      default:
        return renderThemeStep();
    }
  };

  if (hydrating) {
    return (
      <AuthShell showBack={false} showLanguage={false} scroll={false}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primaryText} />
        </View>
      </AuthShell>
    );
  }

  return (
    <AuthShell showBack onBack={handleBack} backTestID="signup-back-button">
      {alertElement}
      <AvatarCropModal
        visible={!!avatarCropAsset}
        asset={avatarCropAsset}
        confirming={preparingAvatar}
        onCancel={handleAvatarCropCancel}
        onConfirm={(selection) => {
          void handleAvatarCropConfirm(selection);
        }}
      />
      <AuthStepDots
        total={SIGNUP_STEPS.length}
        current={currentStepIndex}
        style={styles.stepDots}
      />
      <View style={styles.stepContent}>
        {renderCurrentStep()}
        {error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
      </View>
      <Pressable
        style={styles.loginContainer}
        onPress={() => router.back()}
        accessibilityRole="button"
      >
        <Text style={styles.loginText}>
          {t('auth.has_account')}{' '}
          <Text style={styles.loginLink}>{t('auth.login_link')}</Text>
        </Text>
      </Pressable>
    </AuthShell>
  );
}

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepDots: {
      marginBottom: SPACING.md,
    },
    stepContent: {
      gap: SPACING.lg,
    },
    optionGroup: {
      gap: SPACING.md,
    },
    avatarStage: {
      alignItems: 'center',
      gap: SPACING.md,
    },
    avatarHalo: {
      padding: SPACING.md,
      borderRadius: 200,
      backgroundColor: mixColors(colors.cardBackground, colors.primary, isDark ? 0.10 : 0.06),
    },
    avatarSelectedText: {
      color: colors.success,
      fontSize: SIZES.sm,
      fontWeight: '600',
    },
    avatarActions: {
      gap: SPACING.sm,
    },
    secondaryAction: {
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.sm,
      paddingHorizontal: SPACING.md,
      borderRadius: BORDER_RADIUS.pill,
      borderWidth: 1,
      borderColor: withAlpha(colors.primary, isDark ? 0.30 : 0.20),
      backgroundColor: withAlpha(colors.primary, isDark ? 0.06 : 0.04),
    },
    secondaryActionPressed: {
      backgroundColor: withAlpha(colors.primary, isDark ? 0.14 : 0.10),
    },
    secondaryActionLabel: {
      color: colors.primaryText,
      fontSize: SIZES.md,
      fontWeight: '600',
    },
    skipPressable: {
      alignSelf: 'center',
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.md,
    },
    skipLabel: {
      color: colors.gray,
      fontSize: SIZES.sm,
      fontWeight: '600',
    },
    accountForm: {
      gap: SPACING.md,
    },
    infoContainer: {
      backgroundColor: mixColors(colors.cardBackground, colors.primary, isDark ? 0.08 : 0.05),
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.lg,
      borderRadius: BORDER_RADIUS.xl,
    },
    infoText: {
      color: colors.gray,
      fontSize: SIZES.sm,
      lineHeight: 20,
      textAlign: 'center',
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
    loginContainer: {
      alignSelf: 'center',
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.md,
    },
    loginText: {
      fontSize: SIZES.md,
      color: colors.gray,
      textAlign: 'center',
    },
    loginLink: {
      color: colors.primary,
      fontWeight: '700',
    },
  });
