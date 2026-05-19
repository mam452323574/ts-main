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
import { LinearGradient } from 'expo-linear-gradient';
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
  AuthShell,
  AuthStepDots,
  AuthThemeVisual,
  OnboardingHeroStage,
  useAuthPalette,
} from '@/components/auth';
import { AvatarCropModal, type AvatarCropAsset } from '@/components/AvatarCropModal';
import { Button } from '@/components/Button';
import { OAuthButton } from '@/components/OAuthButton';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import {
  BORDER_RADIUS,
  FONT_FAMILIES,
  SIZES,
  SPACING,
  ThemeType,
  mixColors,
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
import { Squircle } from '@/components/Squircle';

const SIGNUP_STEPS: PreAuthOnboardingStep[] = [
  'intro',
  'profile',
  'account',
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
  const { colors, isDark, setTheme, theme: activeTheme } = useTheme();
  const { t } = useLanguage();
  const { showAlert, alertElement } = useCustomAlert();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const [hydrating, setHydrating] = useState(true);
  const [step, setStep] = useState<PreAuthOnboardingStep>('intro');
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
  const [googleLoading, setGoogleLoading] = useState(false);
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
      lastStep: 'profile',
    });
  };

  const handleUsernameChange = useCallback(
    (value: string) => {
      const normalizedUsername = normalizeUsernameInput(value);
      setUsername(normalizedUsername);
      setError(null);
      scheduleDraftSave({
        username: normalizedUsername,
        lastStep: 'profile',
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
    if (step === 'intro') {
      router.back();
      return;
    }

    const previousStep = SIGNUP_STEPS[currentStepIndex - 1] ?? 'intro';
    void persistStep(previousStep);
  };

  const handleProfileContinue = () => {
    if (!username) {
      setError(t('onboarding.error_username_empty'));
      return;
    }

    if (!usernameValidation.valid) {
      setError(t('onboarding.username_status.invalid'));
      return;
    }

    void persistStep('account');
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
      lastStep: 'profile',
    });
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
        lastStep: 'profile',
      });
      setAvatarCropAsset(null);
    } catch (avatarError) {
      console.error('[SignUp] Failed to crop pre-auth avatar:', avatarError);
      setError(t('components.avatar.error_download'));
    } finally {
      setPreparingAvatar(false);
    }
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

    if (loading || googleLoading) {
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
        lastStep: 'account',
      });
      await signInWithGoogle();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('auth.errors.oauth_login', { provider: 'google' }),
      );
    } finally {
      setGoogleLoading(false);
    }
  };

  const renderIntroStep = () => (
    <>
      <AuthHero
        brand="HEALTH SCAN"
        title={t('onboarding.intro_step_title')}
        subtitle={t('onboarding.intro_step_subtitle')}
        visual={<IntroStepVisual />}
      />
      <Squircle style={styles.infoContainer}>
        <Text style={styles.infoText}>{t('onboarding.intro_step_note')}</Text>
      </Squircle>
      <Button
        title={t('common.next')}
        onPress={() => void persistStep('profile')}
        variant="premium"
        size="lg"
      />
    </>
  );

  const renderProfileStep = () => (
    <>
      <AuthHero
        brand="HEALTH SCAN"
        title={t('onboarding.profile_step_title')}
        subtitle={t('onboarding.profile_step_subtitle')}
        visual={
          <ProfileStepVisual
            username={username}
            hasAvatar={!!avatarLocalUri}
          />
        }
      />
      <Squircle style={styles.profileSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            {t('onboarding.username_step_title')}
          </Text>
          <Text style={styles.sectionSubtitle}>
            {t('onboarding.username_step_subtitle')}
          </Text>
        </View>
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
      </Squircle>

      <Squircle style={styles.profileSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            {t('onboarding.avatar_pre_auth_title')}
          </Text>
          <Text style={styles.sectionSubtitle}>
            {t('onboarding.avatar_pre_auth_subtitle')}
          </Text>
        </View>
        <View style={styles.avatarStage}>
          <Squircle style={styles.avatarHalo}>
            <ProfileAvatar
              avatarUrl={avatarLocalUri}
              username={username}
              size={148}
              testID="signup-avatar-preview"
            />
          </Squircle>
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
        {!avatarLocalUri ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => void handleSkipAvatar()}
            style={styles.skipPressable}
            testID="signup-avatar-skip"
          >
            <Text style={styles.skipLabel}>{t('onboarding.avatar_skip')}</Text>
          </Pressable>
        ) : null}
      </Squircle>

      <Squircle style={styles.profileSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            {t('onboarding.profile_theme_title')}
          </Text>
          <Text style={styles.sectionSubtitle}>
            {t('onboarding.profile_theme_subtitle')}
          </Text>
        </View>
        <View style={styles.themeChoiceRow}>
          <Pressable
            accessibilityRole="button"
            onPress={() => void handleThemeSelect('dark')}
            style={({ pressed }) => [
              styles.themeChoiceCard,
              selectedTheme === 'dark' && styles.themeChoiceCardActive,
              pressed && styles.themeChoiceCardPressed,
            ]}
            testID="signup-theme-dark"
          >
            <AuthThemeVisual theme="dark" size={52} />
            <View style={styles.themeChoiceCopy}>
              <Text style={styles.themeChoiceTitle}>
                {t('onboarding.theme.dark')}
              </Text>
              <Text style={styles.themeChoiceSubtitle}>
                {t('onboarding.theme.dark_desc')}
              </Text>
            </View>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => void handleThemeSelect('light')}
            style={({ pressed }) => [
              styles.themeChoiceCard,
              selectedTheme === 'light' && styles.themeChoiceCardActive,
              pressed && styles.themeChoiceCardPressed,
            ]}
            testID="signup-theme-light"
          >
            <AuthThemeVisual theme="light" size={52} />
            <View style={styles.themeChoiceCopy}>
              <Text style={styles.themeChoiceTitle}>
                {t('onboarding.theme.light')}
              </Text>
              <Text style={styles.themeChoiceSubtitle}>
                {t('onboarding.theme.light_desc')}
              </Text>
            </View>
          </Pressable>
        </View>
      </Squircle>

      <Button
        title={t('common.next')}
        onPress={handleProfileContinue}
        disabled={!usernameValidation.valid}
        variant="premium"
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
        visual={<AccountStepVisual />}
      />

      <View style={styles.oauthSection}>
        <OAuthButton
          provider="google"
          onPress={handleGoogleSignUp}
          loading={googleLoading}
          disabled={loading || googleLoading}
        />
      </View>

      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>{t('auth.or_divider')}</Text>
        <View style={styles.dividerLine} />
      </View>

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

      <Squircle style={styles.infoContainer}>
        <Text style={styles.infoText}>{t('auth.verification_note')}</Text>
      </Squircle>

      <Button
        title={t('auth.signup_btn')}
        onPress={handleSignUp}
        loading={loading}
        disabled={
          loading || googleLoading || !email || !password || !confirmPassword
        }
        variant="premium"
        size="lg"
      />
    </>
  );

  const renderCurrentStep = () => {
    switch (step) {
      case 'profile':
        return renderProfileStep();
      case 'account':
        return renderAccountStep();
      case 'intro':
      default:
        return renderIntroStep();
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
          <Squircle style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </Squircle>
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

function IntroStepVisual() {
  const { colors, isDark } = useTheme();
  const palette = useAuthPalette();
  const styles = useMemo(
    () => createHeroVisualStyles(colors, isDark, palette),
    [colors, isDark, palette],
  );

  return (
    <OnboardingHeroStage
      accentColor={colors.primary}
      style={styles.visualStage}
      contentStyle={styles.visualStageContent}
    >
      <View style={styles.introHeroShell}>
        <LinearGradient
          colors={[
            withAlpha(colors.primary, isDark ? 0.18 : 0.1),
            withAlpha(colors.gold, isDark ? 0.08 : 0.12),
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.introHeroBackdrop}
        />
        <Squircle style={styles.introHeroCard}>
          <View style={styles.introHeroBadgeRow}>
            <View style={styles.introHeroBadge}>
              <Text style={styles.introHeroBadgeText}>SCAN</Text>
            </View>
            <View style={styles.introHeroBadge}>
              <Text style={styles.introHeroBadgeText}>COMPARE</Text>
            </View>
          </View>
          <View style={styles.introHeroHeadline}>
            <Squircle style={styles.introHeroIconWrap}>
              <Camera color={colors.primaryText} size={28} />
            </Squircle>
            <View style={styles.introHeroBars}>
              <View style={styles.introHeroBar} />
              <View style={[styles.introHeroBar, styles.introHeroBarShort]} />
            </View>
          </View>
          <View style={styles.introHeroMetricRow}>
            <Squircle style={styles.introHeroMetricCard}>
              <Squircle style={styles.introHeroMetricDot} />
              <View style={styles.introHeroMetricBars}>
                <View style={styles.introHeroMetricBar} />
                <View
                  style={[
                    styles.introHeroMetricBar,
                    styles.introHeroMetricBarShort,
                  ]}
                />
              </View>
            </Squircle>
            <Squircle
              style={[
                styles.introHeroMetricCard,
                styles.introHeroMetricCardSoft,
              ]}
            >
              <Squircle
                style={[
                  styles.introHeroMetricDot,
                  styles.introHeroMetricDotSoft,
                ]}
              />
              <View style={styles.introHeroMetricBars}>
                <View style={styles.introHeroMetricBar} />
                <View
                  style={[
                    styles.introHeroMetricBar,
                    styles.introHeroMetricBarShort,
                  ]}
                />
              </View>
            </Squircle>
          </View>
        </Squircle>
        <View style={styles.heroMicroRow}>
          <View style={styles.heroMicroChip} />
          <View style={[styles.heroMicroChip, styles.heroMicroChipWide]} />
          <View style={styles.heroMicroChip} />
        </View>
      </View>
    </OnboardingHeroStage>
  );
}

function ProfileStepVisual({
  username,
  hasAvatar,
}: {
  username: string;
  hasAvatar: boolean;
}) {
  const { colors, isDark } = useTheme();
  const palette = useAuthPalette();
  const styles = useMemo(
    () => createHeroVisualStyles(colors, isDark, palette),
    [colors, isDark, palette],
  );
  const handle = username.length > 0 ? `@${username}` : '@healthscan';

  return (
    <OnboardingHeroStage
      accentColor={colors.primary}
      style={styles.visualStage}
      contentStyle={styles.visualStageContent}
    >
      <View style={styles.usernameHeroShell}>
        <View style={styles.usernameChip}>
          <UserRound color={colors.primaryText} size={22} />
          <Text numberOfLines={1} style={styles.usernameChipLabel}>
            {handle}
          </Text>
        </View>
        <View style={styles.usernameMetricRow}>
          <Squircle style={styles.usernameMetricCard}>
            <Squircle style={styles.usernameMetricDot} />
            <View style={styles.usernameMetricBars}>
              <View style={styles.usernameMetricBar} />
              <View
                style={[styles.usernameMetricBar, styles.usernameMetricBarShort]}
              />
            </View>
          </Squircle>
        <Squircle style={[styles.usernameMetricCard, styles.usernameMetricCardSoft]}>
          <Squircle style={[styles.usernameMetricDot, styles.usernameMetricDotAlt]} />
          <View style={styles.usernameMetricBars}>
              <View style={styles.usernameMetricBar} />
              <View
                style={[styles.usernameMetricBar, styles.usernameMetricBarShort]}
              />
            </View>
          </Squircle>
        </View>
        <Squircle style={styles.profileHeroStatus}>
          <View
            style={[
              styles.profileHeroStatusDot,
              hasAvatar && styles.profileHeroStatusDotReady,
            ]}
          />
          <View style={styles.profileHeroStatusBars}>
            <View style={styles.profileHeroStatusBar} />
            <View
              style={[
                styles.profileHeroStatusBar,
                styles.profileHeroStatusBarShort,
              ]}
            />
          </View>
        </Squircle>
      </View>
    </OnboardingHeroStage>
  );
}

function AccountStepVisual() {
  const { colors, isDark } = useTheme();
  const palette = useAuthPalette();
  const styles = useMemo(
    () => createHeroVisualStyles(colors, isDark, palette),
    [colors, isDark, palette],
  );

  return (
    <OnboardingHeroStage
      accentColor={colors.gold}
      style={styles.visualStage}
      contentStyle={styles.visualStageContent}
    >
      <View style={styles.accountHeroShell}>
        <Squircle style={styles.accountHeroCardPrimary}>
          <Mail color={colors.primaryText} size={24} />
          <View style={styles.accountHeroCardBars}>
            <View style={styles.accountHeroBar} />
            <View style={[styles.accountHeroBar, styles.accountHeroBarShort]} />
          </View>
        </Squircle>
        <Squircle style={styles.accountHeroCardSecondary}>
          <Lock color={colors.primaryText} size={22} />
        </Squircle>
        <Squircle style={styles.accountHeroShield}>
          <Squircle style={styles.accountHeroShieldInner} />
        </Squircle>
      </View>
    </OnboardingHeroStage>
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
      marginBottom: SPACING.sm,
    },
    stepContent: {
      gap: SPACING.xl,
    },
    profileSection: {
      gap: SPACING.md,
      padding: SPACING.lg,
      borderRadius: BORDER_RADIUS.xl,
      borderWidth: 1,
      borderColor: withAlpha(colors.primaryText, isDark ? 0.1 : 0.06),
      backgroundColor: withAlpha(colors.primaryText, isDark ? 0.04 : 0.02), borderCurve: 'continuous',
    },
    sectionHeader: {
      gap: SPACING.xs,
    },
    sectionTitle: {
      color: colors.primaryText,
      fontSize: SIZES.lg,
      fontFamily: FONT_FAMILIES.display,
      letterSpacing: -0.2,
    },
    sectionSubtitle: {
      color: colors.gray,
      fontSize: SIZES.sm,
      lineHeight: 20,
    },
    avatarStage: {
      alignItems: 'center',
      gap: SPACING.md,
    },
    avatarHalo: {
      padding: SPACING.lg,
      borderRadius: 200,
      backgroundColor: mixColors(
        colors.cardBackground,
        colors.primary,
        isDark ? 0.1 : 0.06,
      ),
      borderWidth: 1,
      borderColor: withAlpha(colors.primary, isDark ? 0.18 : 0.1), borderCurve: 'continuous',
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
      borderColor: withAlpha(colors.primaryText, isDark ? 0.14 : 0.08),
      backgroundColor: withAlpha(colors.primaryText, isDark ? 0.05 : 0.03), borderCurve: 'continuous',
    },
    secondaryActionPressed: {
      backgroundColor: withAlpha(colors.primaryText, isDark ? 0.1 : 0.06),
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
    themeChoiceRow: {
      gap: SPACING.sm,
    },
    themeChoiceCard: {
      minHeight: 84,
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.md,
      borderRadius: BORDER_RADIUS.xl,
      borderWidth: 1,
      borderColor: withAlpha(colors.primaryText, isDark ? 0.12 : 0.08),
      backgroundColor: withAlpha(colors.primaryText, isDark ? 0.04 : 0.02), borderCurve: 'continuous',
    },
    themeChoiceCardActive: {
      borderColor: withAlpha(colors.primary, isDark ? 0.42 : 0.22),
      backgroundColor: withAlpha(colors.primary, isDark ? 0.1 : 0.06),
    },
    themeChoiceCardPressed: {
      backgroundColor: withAlpha(colors.primaryText, isDark ? 0.08 : 0.04),
    },
    themeChoiceCopy: {
      flex: 1,
      gap: 4,
    },
    themeChoiceTitle: {
      color: colors.primaryText,
      fontSize: SIZES.md,
      fontWeight: '700',
    },
    themeChoiceSubtitle: {
      color: colors.gray,
      fontSize: SIZES.sm,
      lineHeight: 18,
    },
    accountForm: {
      gap: SPACING.md,
    },
    oauthSection: {
      width: '100%',
    },
    divider: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: 0,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: withAlpha(colors.primaryText, isDark ? 0.12 : 0.08),
    },
    dividerText: {
      marginHorizontal: SPACING.md,
      fontSize: SIZES.sm,
      color: colors.gray,
      fontWeight: '600',
    },
    infoContainer: {
      backgroundColor: mixColors(
        colors.cardBackground,
        colors.primary,
        isDark ? 0.08 : 0.05,
      ),
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.lg,
      borderRadius: BORDER_RADIUS.xl,
      borderWidth: 1,
      borderColor: withAlpha(colors.primary, isDark ? 0.18 : 0.1), borderCurve: 'continuous',
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
      borderRadius: BORDER_RADIUS.xl, borderCurve: 'continuous',
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

const createHeroVisualStyles = (
  colors: any,
  isDark: boolean,
  palette: ReturnType<typeof useAuthPalette>,
) =>
  StyleSheet.create({
    visualStage: {
      minHeight: 248,
    },
    visualStageContent: {
      paddingHorizontal: SPACING.xl,
      paddingVertical: SPACING.lg,
      justifyContent: 'center',
      alignItems: 'center',
    },
    introHeroShell: {
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.lg,
    },
    introHeroBackdrop: {
      position: 'absolute',
      top: 10,
      left: '12%',
      width: '76%',
      height: 136,
      borderRadius: 999,
      transform: [{ scaleX: 1.16 }], borderCurve: 'continuous',
    },
    introHeroCard: {
      width: '100%',
      gap: SPACING.md,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.lg,
      borderRadius: BORDER_RADIUS.hero,
      backgroundColor: palette.surfaceGlass,
      borderWidth: 1,
      borderColor: palette.heroBorder, borderCurve: 'continuous',
    },
    introHeroBadgeRow: {
      flexDirection: 'row',
      gap: SPACING.sm,
      flexWrap: 'wrap',
    },
    introHeroBadge: {
      paddingHorizontal: SPACING.md,
      paddingVertical: 6,
      borderRadius: BORDER_RADIUS.pill,
      backgroundColor: withAlpha(colors.primaryText, isDark ? 0.08 : 0.05),
      borderWidth: 1,
      borderColor: withAlpha(colors.primaryText, isDark ? 0.1 : 0.06), borderCurve: 'continuous',
    },
    introHeroBadgeText: {
      color: colors.primaryText,
      fontSize: SIZES.xs,
      fontWeight: '800',
      letterSpacing: 1.1,
    },
    introHeroHeadline: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
    },
    introHeroIconWrap: {
      width: 64,
      height: 64,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(colors.primary, isDark ? 0.18 : 0.12),
      borderWidth: 1,
      borderColor: withAlpha(colors.primary, isDark ? 0.28 : 0.16), borderCurve: 'continuous',
    },
    introHeroBars: {
      flex: 1,
      gap: 8,
    },
    introHeroBar: {
      width: '100%',
      height: 10,
      borderRadius: 999,
      backgroundColor: withAlpha(colors.primaryText, isDark ? 0.18 : 0.08), borderCurve: 'continuous',
    },
    introHeroBarShort: {
      width: '56%',
    },
    introHeroMetricRow: {
      flexDirection: 'row',
      gap: SPACING.md,
    },
    introHeroMetricCard: {
      flex: 1,
      minHeight: 68,
      borderRadius: BORDER_RADIUS.xl,
      padding: SPACING.md,
      gap: SPACING.sm,
      backgroundColor: withAlpha(colors.primary, isDark ? 0.12 : 0.08),
      borderWidth: 1,
      borderColor: withAlpha(colors.primary, isDark ? 0.2 : 0.12), borderCurve: 'continuous',
    },
    introHeroMetricCardSoft: {
      backgroundColor: withAlpha(colors.gold, isDark ? 0.16 : 0.1),
      borderColor: withAlpha(colors.gold, isDark ? 0.24 : 0.16),
    },
    introHeroMetricDot: {
      width: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: colors.primary, borderCurve: 'continuous',
    },
    introHeroMetricDotSoft: {
      backgroundColor: colors.gold,
    },
    introHeroMetricBars: {
      gap: 7,
    },
    introHeroMetricBar: {
      width: '100%',
      height: 7,
      borderRadius: 999,
      backgroundColor: withAlpha(colors.primaryText, isDark ? 0.16 : 0.08), borderCurve: 'continuous',
    },
    introHeroMetricBarShort: {
      width: '58%',
    },
    themeVisualShell: {
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.lg,
    },
    themeOrbBackdrop: {
      position: 'absolute',
      top: 12,
      left: '16%',
      width: '68%',
      height: 124,
      borderRadius: 999,
      transform: [{ scaleX: 1.14 }], borderCurve: 'continuous',
    },
    themePreviewRow: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.md,
    },
    themePreviewOrb: {
      width: 92,
      height: 92,
      borderRadius: 46,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: withAlpha(colors.primaryText, isDark ? 0.1 : 0.06),
      backgroundColor: withAlpha(colors.white, isDark ? 0.04 : 0.7), borderCurve: 'continuous',
    },
    themePreviewOrbDark: {
      backgroundColor: withAlpha('#0F1622', isDark ? 0.92 : 0.82),
    },
    themePreviewOrbLight: {
      backgroundColor: withAlpha(colors.white, isDark ? 0.8 : 0.98),
    },
    themePreviewOrbActive: {
      borderColor: palette.accentRing,
      shadowColor: palette.accentRing,
      shadowOpacity: 0.12,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 3,
    },
    themeSelectionRail: {
      width: 44,
      height: 112,
      borderRadius: 999,
      padding: 6,
      justifyContent: 'flex-start',
      backgroundColor: palette.secondaryActionFill,
      borderWidth: 1,
      borderColor: palette.secondaryActionBorder, borderCurve: 'continuous',
    },
    themeSelectionKnob: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: palette.progressActive,
      shadowColor: palette.progressActive,
      shadowOpacity: 0.24,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 3, borderCurve: 'continuous',
    },
    themeSelectionKnobLight: {
      marginTop: 'auto',
    },
    heroMicroRow: {
      flexDirection: 'row',
      gap: SPACING.sm,
      alignItems: 'center',
    },
    heroMicroChip: {
      width: 52,
      height: 8,
      borderRadius: 999,
      backgroundColor: withAlpha(colors.primaryText, isDark ? 0.14 : 0.08), borderCurve: 'continuous',
    },
    heroMicroChipWide: {
      width: 82,
    },
    usernameHeroShell: {
      width: '100%',
      alignItems: 'center',
      gap: SPACING.lg,
    },
    usernameChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      maxWidth: '100%',
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.md,
      borderRadius: BORDER_RADIUS.pill,
      backgroundColor: palette.surfaceGlass,
      borderWidth: 1,
      borderColor: palette.heroBorder, borderCurve: 'continuous',
    },
    usernameChipLabel: {
      flexShrink: 1,
      fontFamily: FONT_FAMILIES.display,
      fontSize: 22,
      color: colors.primaryText,
      letterSpacing: -0.2,
    },
    usernameMetricRow: {
      width: '100%',
      flexDirection: 'row',
      gap: SPACING.md,
      justifyContent: 'center',
    },
    usernameMetricCard: {
      flex: 1,
      minHeight: 74,
      borderRadius: BORDER_RADIUS.xl,
      padding: SPACING.md,
      gap: SPACING.sm,
      backgroundColor: withAlpha(colors.primary, isDark ? 0.12 : 0.08),
      borderWidth: 1,
      borderColor: withAlpha(colors.primary, isDark ? 0.22 : 0.12), borderCurve: 'continuous',
    },
    usernameMetricCardSoft: {
      backgroundColor: withAlpha(colors.secondary, isDark ? 0.12 : 0.08),
      borderColor: withAlpha(colors.secondary, isDark ? 0.2 : 0.1),
    },
    usernameMetricDot: {
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: colors.primary, borderCurve: 'continuous',
    },
    usernameMetricDotAlt: {
      backgroundColor: colors.secondary,
    },
    usernameMetricBars: {
      gap: 8,
    },
    usernameMetricBar: {
      width: '100%',
      height: 8,
      borderRadius: 999,
      backgroundColor: withAlpha(colors.primaryText, isDark ? 0.18 : 0.1), borderCurve: 'continuous',
    },
    usernameMetricBarShort: {
      width: '58%',
    },
    profileHeroStatus: {
      flex: 1,
      minHeight: 74,
      borderRadius: BORDER_RADIUS.xl,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.md,
      gap: SPACING.sm,
      justifyContent: 'center',
      backgroundColor: palette.surfaceGlass,
      borderWidth: 1,
      borderColor: palette.secondaryActionBorder, borderCurve: 'continuous',
    },
    profileHeroStatusDot: {
      width: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: withAlpha(colors.gray, 0.64), borderCurve: 'continuous',
    },
    profileHeroStatusDotReady: {
      backgroundColor: colors.success,
    },
    profileHeroStatusBars: {
      gap: 6,
    },
    profileHeroStatusBar: {
      width: '100%',
      height: 7,
      borderRadius: 999,
      backgroundColor: withAlpha(colors.primaryText, isDark ? 0.14 : 0.08), borderCurve: 'continuous',
    },
    profileHeroStatusBarShort: {
      width: '58%',
    },
    avatarHeroShell: {
      width: '100%',
      minHeight: 180,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarHeroRing: {
      width: 138,
      height: 138,
      borderRadius: 69,
      alignItems: 'center',
      justifyContent: 'center',
      transform: [{ scaleX: 1.02 }], borderCurve: 'continuous',
    },
    avatarHeroCore: {
      width: 106,
      height: 106,
      borderRadius: 53,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.surfaceGlass,
      borderWidth: 1,
      borderColor: palette.heroBorder, borderCurve: 'continuous',
    },
    avatarOrbitDot: {
      position: 'absolute',
      width: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: withAlpha(colors.white, isDark ? 0.74 : 0.92),
      borderWidth: 1,
      borderColor: withAlpha(colors.secondary, isDark ? 0.28 : 0.18), borderCurve: 'continuous',
    },
    avatarOrbitDotTop: {
      top: 10,
    },
    avatarOrbitDotRight: {
      right: '18%',
      top: '42%',
    },
    avatarOrbitDotLeft: {
      left: '18%',
      top: '56%',
    },
    avatarHeroStatus: {
      position: 'absolute',
      right: '6%',
      bottom: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      minWidth: 108,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderRadius: BORDER_RADIUS.pill,
      backgroundColor: palette.surfaceGlass,
      borderWidth: 1,
      borderColor: palette.secondaryActionBorder, borderCurve: 'continuous',
    },
    avatarHeroStatusDot: {
      width: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: withAlpha(colors.gray, 0.6), borderCurve: 'continuous',
    },
    avatarHeroStatusDotReady: {
      backgroundColor: colors.success,
    },
    avatarHeroStatusBars: {
      flex: 1,
      gap: 6,
    },
    avatarHeroStatusBar: {
      width: '100%',
      height: 7,
      borderRadius: 999,
      backgroundColor: withAlpha(colors.primaryText, isDark ? 0.14 : 0.08), borderCurve: 'continuous',
    },
    avatarHeroStatusBarShort: {
      width: '58%',
    },
    accountHeroShell: {
      width: '100%',
      minHeight: 180,
      alignItems: 'center',
      justifyContent: 'center',
    },
    accountHeroCardPrimary: {
      width: '76%',
      minHeight: 110,
      borderRadius: BORDER_RADIUS.hero,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.lg,
      justifyContent: 'space-between',
      backgroundColor: palette.surfaceGlass,
      borderWidth: 1,
      borderColor: palette.heroBorder, borderCurve: 'continuous',
    },
    accountHeroCardBars: {
      gap: 10,
    },
    accountHeroBar: {
      width: '100%',
      height: 8,
      borderRadius: 999,
      backgroundColor: withAlpha(colors.primaryText, isDark ? 0.16 : 0.08), borderCurve: 'continuous',
    },
    accountHeroBarShort: {
      width: '52%',
    },
    accountHeroCardSecondary: {
      position: 'absolute',
      right: '12%',
      top: 24,
      width: 68,
      height: 68,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(colors.gold, isDark ? 0.18 : 0.12),
      borderWidth: 1,
      borderColor: withAlpha(colors.gold, isDark ? 0.28 : 0.18), borderCurve: 'continuous',
    },
    accountHeroShield: {
      position: 'absolute',
      left: '12%',
      bottom: 8,
      width: 72,
      height: 72,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(colors.success, isDark ? 0.18 : 0.12),
      borderWidth: 1,
      borderColor: withAlpha(colors.success, isDark ? 0.24 : 0.14),
      transform: [{ rotate: '-10deg' }], borderCurve: 'continuous',
    },
    accountHeroShieldInner: {
      width: 26,
      height: 32,
      borderTopLeftRadius: 13,
      borderTopRightRadius: 13,
      borderBottomLeftRadius: 8,
      borderBottomRightRadius: 8,
      backgroundColor: colors.success,
      transform: [{ rotate: '10deg' }], borderCurve: 'continuous',
    },
  });
