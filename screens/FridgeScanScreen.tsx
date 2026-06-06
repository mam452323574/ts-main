import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  CameraView,
  CameraType,
  useCameraPermissions,
  type CameraMountError,
} from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Camera,
  ChefHat,
  Check,
  Image as ImageIcon,
  RefreshCw,
} from 'lucide-react-native';

import { Button } from '@/components/Button';
import { CameraFlipIcon } from '@/components/CameraFlipIcon';
import { ContextualPaywall } from '@/components/ContextualPaywall';
import { FridgeChefPersonaCard } from '@/components/fridge/FridgeChefPersonaCard';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { OptimizedImage } from '@/components/OptimizedImage';
import { PUBLIC_PRIVACY_POLICY_URL } from '@/constants/privacyPolicy';
import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SHADOWS,
  SIZES,
  SPACING,
  mixColors,
  withAlpha,
} from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { ApiError } from '@/services/api';
import { submitFridgeScanCapture } from '@/services/fridgeScan';
import type {
  FridgeMealMode,
  FridgeScanCaptureSource,
  FridgeScanSubmission,
} from '@/types/fridgeScan';
import {
  buildFridgeScanLimitMessage,
  formatScanLimitTime,
} from '@/utils/scanLimitI18n';
import { logOperationalError, logOperationalInfo } from '@/utils/observability';
import { getMinimumBottomInsetPadding } from '@/utils/mobileLayout';
import {
  hasPremiumAccessFromProfile,
  resolvePremiumRenderStateFromProfile,
} from '@/utils/subscription';
import { FRIDGE_CHEF_PERSONAS } from '@/shared/fridgeChefPersonas';
import {
  resolveChefFlowVisualTheme,
  resolveChefSurfaceColors,
} from '@/utils/scanFlowVisualTheme';
import { Squircle } from '@/components/Squircle';

const CAPTURE_PICTURE_OPTIONS = {
  quality: 1,
} as const;
const DEFAULT_FRIDGE_MEAL_MODE: FridgeMealMode = 'diet';
const FRIDGE_GUIDE_HEIGHT_RATIO = 1.14;

type ReviewState = {
  imageUri: string;
  source: FridgeScanCaptureSource;
} | null;

type ReviewImageFallback = {
  imageUri: string;
  base64: string;
  width: number;
  height: number;
  source: FridgeScanCaptureSource;
};

type FridgeScanEligibilityLike = {
  message?: string;
  message_key?: string;
  next_available_date?: number;
};

const FRIDGE_SCAN_SUBMIT_FUNCTION_NAME = 'fridge-scan-submit';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readFridgeScanErrorStage(error: ApiError) {
  if (!isRecord(error.context)) {
    return null;
  }

  const stage = error.context.stage;
  return typeof stage === 'string' && stage.trim().length > 0
    ? stage.trim()
    : null;
}

function readFridgeScanErrorFunctionName(error: ApiError) {
  if (!isRecord(error.context)) {
    return null;
  }

  const functionName = error.context.functionName;
  return typeof functionName === 'string' && functionName.trim().length > 0
    ? functionName.trim()
    : null;
}

function isFridgeScanNetworkError(error: unknown) {
  if (error instanceof ApiError) {
    return (
      error.type === 'NETWORK' ||
      error.code === 'edge_function_network_error' ||
      ApiError.isNetworkError(error.originalError ?? error)
    );
  }

  return ApiError.isNetworkError(error);
}

function shouldShowFridgeScanDevDebugInfo() {
  const nodeEnv =
    typeof process !== 'undefined' ? process.env.NODE_ENV : undefined;

  return (
    typeof __DEV__ !== 'undefined' &&
    __DEV__ &&
    nodeEnv !== 'test'
  );
}

function buildFridgeScanDevDebugInfo(error: unknown) {
  if (!shouldShowFridgeScanDevDebugInfo()) {
    return null;
  }

  const parts: string[] = [];

  if (error instanceof ApiError) {
    parts.push(`type=${error.type}`);

    if (error.code) {
      parts.push(`code=${error.code}`);
    }

    if (typeof error.status === 'number') {
      parts.push(`status=${error.status}`);
    }

    if (error.requestId) {
      parts.push(`requestId=${error.requestId}`);
    }

    const stage = readFridgeScanErrorStage(error);
    if (stage) {
      parts.push(`stage=${stage}`);
    }

    const functionName = readFridgeScanErrorFunctionName(error);
    if (functionName) {
      parts.push(`function=${functionName}`);
    }
  } else if (error instanceof Error && error.message) {
    parts.push(`message=${error.message}`);
  }

  return parts.length > 0 ? `Debug: ${parts.join(' | ')}` : null;
}

function appendFridgeScanDevDebugInfo(message: string, error: unknown) {
  const debugInfo = buildFridgeScanDevDebugInfo(error);
  return debugInfo ? `${message}\n\n${debugInfo}` : message;
}

function buildFridgeScanGalleryPickerOptions(): ImagePicker.ImagePickerOptions {
  const preferredAssetRepresentationMode =
    Platform.OS === 'ios'
      ? ImagePicker.UIImagePickerPreferredAssetRepresentationMode?.Compatible
      : undefined;

  return {
    mediaTypes: ['images'],
    quality: 0.85,
    base64: true,
    ...(preferredAssetRepresentationMode
      ? { preferredAssetRepresentationMode }
      : {}),
  };
}

function readGalleryImageFallback(
  asset: ImagePicker.ImagePickerAsset,
): ReviewImageFallback | null {
  if (!asset.base64) {
    return null;
  }

  return {
    imageUri: asset.uri,
    base64: asset.base64,
    width: asset.width,
    height: asset.height,
    source: 'gallery',
  };
}

export default function FridgeScanScreen() {
  const router = useRouter();
  const { colors: appColors, isDark } = useTheme();
  const { userProfile, loading: authLoading } = useAuth();
  const { t, locale } = useLanguage();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { showAlert, alertElement } = useCustomAlert();
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [hasCameraError, setHasCameraError] = useState(false);
  const [cameraSessionKey, setCameraSessionKey] = useState(0);
  const [review, setReview] = useState<ReviewState>(null);
  const [submission, setSubmission] = useState<FridgeScanSubmission | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [selectedMode, setSelectedMode] = useState<FridgeMealMode>(
    DEFAULT_FRIDGE_MEAL_MODE,
  );
  const cameraRef = useRef<CameraView>(null);
  const reviewImageFallbackRef = useRef<ReviewImageFallback | null>(null);
  const frameWidth = Math.min(windowWidth - SPACING.page * 2, 362);
  const frameHeight = Math.min(
    frameWidth * FRIDGE_GUIDE_HEIGHT_RATIO,
    windowHeight * 0.48,
  );
  const isCompactFeedback = windowHeight < 760;
  const useStackedFeedbackActions = windowWidth < 360;
  const feedbackImageHeight = Math.min(
    isCompactFeedback ? 202 : 268,
    Math.max(
      isCompactFeedback ? 168 : 226,
      windowHeight * (isCompactFeedback ? 0.28 : 0.32),
    ),
  );
  const chefFlowTheme = useMemo(
    () => resolveChefFlowVisualTheme(appColors, isDark),
    [appColors, isDark],
  );
  const chefColors = useMemo(
    () => resolveChefSurfaceColors(appColors, isDark),
    [appColors, isDark],
  );
  const styles = useMemo(
    () => createStyles(appColors, chefFlowTheme, insets, isCompactFeedback, isDark),
    [appColors, chefFlowTheme, insets, isCompactFeedback, isDark],
  );
  const premiumRenderState = resolvePremiumRenderStateFromProfile(
    userProfile,
    authLoading,
  );
  const hasPremiumAccess = hasPremiumAccessFromProfile(userProfile, authLoading);
  const canRetakeFromReview = premiumRenderState === 'unlocked';

  const handleBack = useCallback(() => {
    if (typeof router.canGoBack === 'function' && router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/(tabs)' as any);
  }, [router]);

  const handleReturnHomeFromReview = useCallback(() => {
    router.replace('/(tabs)' as any);
  }, [router]);

  const handleCameraMountError = useCallback(
    (error: CameraMountError) => {
      console.warn('[FridgeScanScreen] camera mount failed', {
        locale,
        message: error.message,
      });
      setHasCameraError(true);
    },
    [locale],
  );

  const handleRetryCamera = useCallback(() => {
    setHasCameraError(false);
    setCameraSessionKey((current) => current + 1);
  }, []);

  const handleRequestPermission = useCallback(() => {
    void requestPermission();
  }, [requestPermission]);

  const handleOpenPrivacyPolicy = useCallback(() => {
    router.push('/privacy-policy' as any);
  }, [router]);

  const handleResetReview = useCallback(() => {
    setReview(null);
    setSubmission(null);
    setIsSubmitting(false);
    reviewImageFallbackRef.current = null;
  }, []);

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current) {
      return;
    }

    try {
      const photo = await cameraRef.current.takePictureAsync(
        CAPTURE_PICTURE_OPTIONS,
      );

      if (!photo?.uri) {
        throw new Error('CAPTURE_URI_MISSING');
      }

      setSubmission(null);
      reviewImageFallbackRef.current = null;
      setReview({
        imageUri: photo.uri,
        source: 'camera',
      });
    } catch {
      showAlert(
        t('common.error'),
        t('fridge_scan.capture_error'),
        undefined,
        undefined,
        { variant: 'warning' },
      );
    }
  }, [showAlert, t]);

  const handlePickFromGallery = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync(
        buildFridgeScanGalleryPickerOptions(),
      );

      if (result.canceled || !result.assets?.[0]?.uri) {
        return;
      }

      const asset = result.assets[0];
      setSubmission(null);
      reviewImageFallbackRef.current = readGalleryImageFallback(asset);
      setReview({
        imageUri: asset.uri,
        source: 'gallery',
      });
    } catch {
      showAlert(
        t('common.error'),
        t('fridge_scan.gallery_error'),
        undefined,
        undefined,
        { variant: 'warning' },
      );
    }
  }, [showAlert, t]);

  const handleFlipCamera = useCallback(() => {
    setFacing((current) => (current === 'back' ? 'front' : 'back'));
  }, []);

  const handleSubmitReview = useCallback(async () => {
    if (!review || isSubmitting) {
      return;
    }

    if (!hasPremiumAccess) {
      setPaywallVisible(true);
      return;
    }

    setIsSubmitting(true);
    const reviewImageFallback =
      reviewImageFallbackRef.current?.imageUri === review.imageUri &&
      reviewImageFallbackRef.current.source === review.source
        ? reviewImageFallbackRef.current
        : null;
    const preEncodedJpeg = reviewImageFallback
      ? {
          base64: reviewImageFallback.base64,
          width: reviewImageFallback.width,
          height: reviewImageFallback.height,
          source: reviewImageFallback.source,
        }
      : undefined;
    logOperationalInfo('[FridgeScanScreen] Fridge scan submission started', {
      source: review.source,
      selected_mode: selectedMode,
      locale,
    });

    try {
      const result = await submitFridgeScanCapture({
        imageUri: review.imageUri,
        source: review.source,
        selectedMode,
        locale,
        ...(preEncodedJpeg ? { preEncodedJpeg } : {}),
        clientMetadata: {
          screen: 'fridge_scan',
          submitted_from: 'review_sheet',
        },
      });

      setSubmission(result);
      logOperationalInfo('[FridgeScanScreen] Fridge scan submission queued', {
        fridge_scan_id: result.fridgeScanId,
        status: result.status,
        selected_mode: result.selectedMode,
        source: result.source,
        remaining: result.remaining,
        limit: result.limit,
        locale,
      });
      router.replace({
        pathname: '/fridge-scan-result' as any,
        params: {
          fridgeScanId: result.fridgeScanId,
          selectedMode: result.selectedMode,
          imageUri: review.imageUri,
        },
      });
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.code === 'fridge_scan_premium_required'
      ) {
        setPaywallVisible(true);
      } else if (
        error instanceof ApiError &&
        error.code === 'fridge_scan_limit_reached'
      ) {
        const eligibility = error.context?.eligibility as
          | FridgeScanEligibilityLike
          | undefined;
        const time =
          typeof eligibility?.next_available_date === 'number'
            ? formatScanLimitTime(eligibility.next_available_date, t)
            : undefined;
        const message = buildFridgeScanLimitMessage(
          {
            message:
              eligibility?.message ?? t('fridge_scan.limit_reached_fallback'),
            message_key: eligibility?.message_key,
          },
          t,
          time,
        );

        showAlert(
          t('fridge_scan.limit_reached_title'),
          message,
          undefined,
          undefined,
          { variant: 'warning' },
        );
      } else if (
        error instanceof ApiError &&
        readFridgeScanErrorStage(error) === 'image_normalization'
      ) {
        logOperationalError(
          '[FridgeScanScreen] Fridge scan image processing failed',
          error,
          {
            failure_bucket: 'image_normalization',
            function_name: readFridgeScanErrorFunctionName(error) ?? undefined,
            selected_mode: selectedMode,
            source: review.source,
            locale,
          },
        );
        showAlert(
          t('common.error'),
          appendFridgeScanDevDebugInfo(
            t('fridge_scan.submission_image_error'),
            error,
          ),
          undefined,
          undefined,
          { variant: 'warning' },
        );
      } else if (
        error instanceof ApiError &&
        (error.type === 'AUTH' ||
          error.code === 'auth_session_missing' ||
          error.status === 401)
      ) {
        logOperationalError(
          '[FridgeScanScreen] Fridge scan submission blocked by auth',
          error,
          {
            failure_bucket: 'auth',
            function_name: readFridgeScanErrorFunctionName(error) ?? undefined,
            selected_mode: selectedMode,
            source: review.source,
            locale,
          },
        );
        showAlert(
          t('common.error'),
          appendFridgeScanDevDebugInfo(
            t('fridge_scan.submission_auth_error'),
            error,
          ),
          undefined,
          undefined,
          { variant: 'warning' },
        );
      } else if (isFridgeScanNetworkError(error)) {
        logOperationalError(
          '[FridgeScanScreen] Fridge scan submission network failure',
          error,
          {
            failure_bucket: 'network',
            selected_mode: selectedMode,
            source: review.source,
            locale,
          },
        );
        showAlert(
          t('common.error'),
          appendFridgeScanDevDebugInfo(
            t('fridge_scan.submission_network_error'),
            error,
          ),
          undefined,
          undefined,
          { variant: 'warning' },
        );
      } else if (
        error instanceof ApiError &&
        readFridgeScanErrorFunctionName(error) ===
          FRIDGE_SCAN_SUBMIT_FUNCTION_NAME
      ) {
        logOperationalError(
          '[FridgeScanScreen] Fridge scan submission server failure',
          error,
          {
            failure_bucket: 'edge_function',
            function_name: readFridgeScanErrorFunctionName(error) ?? undefined,
            selected_mode: selectedMode,
            source: review.source,
            locale,
          },
        );
        showAlert(
          t('common.error'),
          appendFridgeScanDevDebugInfo(
            t('fridge_scan.submission_service_error'),
            error,
          ),
          undefined,
          undefined,
          { variant: 'warning' },
        );
      } else {
        logOperationalError('[FridgeScanScreen] Fridge scan submission failed', error, {
          function_name:
            error instanceof ApiError && typeof error.context?.functionName === 'string'
              ? error.context.functionName
              : undefined,
          selected_mode: selectedMode,
          source: review.source,
          locale,
        });
        showAlert(
          t('common.error'),
          appendFridgeScanDevDebugInfo(
            t('fridge_scan.submission_error'),
            error,
          ),
          undefined,
          undefined,
          { variant: 'warning' },
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [hasPremiumAccess, isSubmitting, locale, review, router, selectedMode, showAlert, t]);

  if (!permission) {
    return <LoadingSpinner />;
  }

  if (!permission.granted) {
    const permissionTitle =
      permission.canAskAgain === false
        ? t('fridge_scan.permission_denied_title')
        : t('fridge_scan.permission_title');
    const permissionBody =
      permission.canAskAgain === false
        ? t('fridge_scan.permission_denied_body')
        : t('fridge_scan.permission_body');

    return (
      <View style={styles.stateScreen}>
        {alertElement}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('fridge_scan.back_accessibility')}
          onPress={handleBack}
          style={styles.backButtonStandalone}
          testID="fridge-scan-back-button"
        >
          <ArrowLeft
            color={chefColors.primaryText}
            size={20}
            strokeWidth={2.2}
          />
        </TouchableOpacity>

        <Squircle style={styles.stateCard} testID="fridge-scan-permission-card">
          <Squircle style={styles.stateIconBadge}>
            <Camera color={appColors.primary} size={28} strokeWidth={2.1} />
          </Squircle>
          <Text style={styles.stateTitle}>{permissionTitle}</Text>
          <Text style={styles.stateBody}>{permissionBody}</Text>
          <Text style={styles.stateSupportText}>{PUBLIC_PRIVACY_POLICY_URL}</Text>

          <View style={styles.stateButtonStack}>
            <Button
              title={t('settings.privacy_policy')}
              onPress={handleOpenPrivacyPolicy}
              variant="outline"
            />
            <Button
              title={t('fridge_scan.permission_cta')}
              onPress={handleRequestPermission}
            />
          </View>
        </Squircle>
      </View>
    );
  }

  if (hasCameraError) {
    return (
      <View style={styles.stateScreen}>
        {alertElement}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('fridge_scan.back_accessibility')}
          onPress={handleBack}
          style={styles.backButtonStandalone}
          testID="fridge-scan-back-button"
        >
          <ArrowLeft
            color={chefColors.primaryText}
            size={20}
            strokeWidth={2.2}
          />
        </TouchableOpacity>

        <Squircle style={styles.stateCard} testID="fridge-scan-error-card">
          <Squircle style={styles.stateIconBadge}>
            <RefreshCw color={appColors.warning} size={28} strokeWidth={2.1} />
          </Squircle>
          <Text style={styles.stateTitle}>
            {t('fridge_scan.camera_unavailable_title')}
          </Text>
          <Text style={styles.stateBody}>{t('fridge_scan.camera_unavailable_body')}</Text>

          <View style={styles.stateButtonStack}>
            <Button title={t('common.retry')} onPress={handleRetryCamera} />
            <Button
              title={t('common.back')}
              onPress={handleBack}
              variant="outline"
            />
          </View>
        </Squircle>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {alertElement}

      <CameraView
        key={`fridge-camera-${cameraSessionKey}`}
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
        autofocus="on"
        animateShutter={false}
        mirror={false}
        onMountError={handleCameraMountError}
        testID="fridge-scan-camera-view"
      />

      <View style={styles.cameraTint} pointerEvents="none" />

      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('fridge_scan.back_accessibility')}
          onPress={handleBack}
          style={styles.headerButton}
          testID="fridge-scan-back-button"
        >
          <ArrowLeft color="#FFFFFF" size={20} strokeWidth={2.2} />
        </TouchableOpacity>
      </View>

      {!review ? (
        <View style={styles.overlayContainer} pointerEvents="none">
          <Squircle
            style={[
              styles.overlayFrame,
              { width: frameWidth, height: frameHeight },
            ]}
            testID="fridge-scan-overlay-frame"
          >
            <View style={styles.overlayShelfLineTop} />
            <View style={styles.overlayShelfLineMiddle} />
            <View style={styles.overlayShelfLineBottom} />
          </Squircle>

          <Text style={styles.overlayHint}>{t('fridge_scan.overlay_hint')}</Text>
        </View>
      ) : null}

      <View style={styles.controlsOverlay} testID="fridge-scan-controls-overlay">
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('fridge_scan.gallery_accessibility')}
          activeOpacity={0.8}
          onPress={handlePickFromGallery}
          style={styles.sideButton}
          testID="fridge-scan-gallery-button"
        >
          <ImageIcon color="#FFFFFF" size={24} strokeWidth={2} />
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('fridge_scan.capture_accessibility')}
          activeOpacity={0.85}
          onPress={handleCapture}
          style={styles.captureButton}
          testID="fridge-scan-capture-button"
        >
          <Squircle style={styles.captureButtonOuter}>
            <Squircle style={styles.captureButtonInner} />
          </Squircle>
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('fridge_scan.flip_accessibility')}
          activeOpacity={0.8}
          onPress={handleFlipCamera}
          style={styles.sideButton}
          testID="fridge-scan-flip-button"
        >
          <CameraFlipIcon size={28} color="#FFFFFF" strokeWidth={2} />
        </TouchableOpacity>
      </View>

      {review ? (
        <View style={styles.feedbackOverlay} testID="fridge-scan-feedback-overlay">
          <LinearGradient
            colors={chefFlowTheme.reviewOverlayGradient}
            start={{ x: 0.08, y: 0 }}
            end={{ x: 0.95, y: 1 }}
            style={styles.feedbackOverlayGradient}
          />

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t('fridge_scan.back_accessibility')}
            activeOpacity={0.84}
            onPress={handleBack}
            style={styles.feedbackBackButton}
            testID="fridge-scan-feedback-back-button"
          >
            <ArrowLeft color={chefFlowTheme.textPrimary} size={18} strokeWidth={2.2} />
            <Text style={styles.feedbackBackButtonText}>{t('common.back')}</Text>
          </TouchableOpacity>

          <Squircle style={styles.feedbackCard} testID="fridge-scan-feedback-card">
            <LinearGradient
              colors={chefFlowTheme.reviewCardGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.feedbackCardGradient}
            />

            <ScrollView
              bounces={false}
              showsVerticalScrollIndicator={false}
              style={styles.feedbackScroll}
              contentContainerStyle={styles.feedbackScrollContent}
            >
              <View style={styles.feedbackHeader}>
                <Squircle style={styles.feedbackHeaderIcon}>
                  <ChefHat
                    color={chefFlowTheme.warmAccent}
                    size={20}
                    strokeWidth={2.2}
                  />
                </Squircle>
                <View style={styles.feedbackHeaderCopy}>
                  <Text style={styles.feedbackEyebrow}>{t('fridge_scan.title')}</Text>
                  <Text style={styles.feedbackTitle}>
                    {submission
                      ? t('fridge_scan.submission_queued_title')
                      : t('fridge_scan.feedback_title')}
                  </Text>
                </View>
              </View>

              <View style={styles.feedbackImageShell}>
                <LinearGradient
                  colors={chefFlowTheme.imageBorderGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.feedbackImageBorder}
                >
                  <Squircle style={styles.feedbackImageFrame}>
                    <OptimizedImage
                      source={{ uri: review.imageUri }}
                      contentFit="cover"
                      recyclingKey={review.imageUri}
                      style={[styles.feedbackImage, { height: feedbackImageHeight }]}
                      testID="fridge-scan-feedback-image"
                    />

                    <LinearGradient
                      colors={chefFlowTheme.imageVignetteGradient}
                      start={{ x: 0.5, y: 0 }}
                      end={{ x: 0.5, y: 1 }}
                      style={styles.feedbackImageVignette}
                      pointerEvents="none"
                    />

                    <View
                      style={[
                        styles.feedbackBadge,
                        submission ? styles.feedbackBadgeSuccess : null,
                      ]}
                      >
                      {submission ? (
                        <Check color={appColors.success} size={16} strokeWidth={2.4} />
                      ) : (
                        <Camera
                          color={chefFlowTheme.warmAccent}
                          size={16}
                          strokeWidth={2.1}
                        />
                      )}
                      <Text style={styles.feedbackBadgeText}>
                        {submission
                          ? t('fridge_scan.submission_queued_badge')
                          : review.source === 'camera'
                            ? t('fridge_scan.feedback_camera_badge')
                            : t('fridge_scan.feedback_gallery_badge')}
                      </Text>
                    </View>
                  </Squircle>
                </LinearGradient>
              </View>

              <Text style={styles.feedbackBody}>
                {submission
                  ? t('fridge_scan.submission_queued_body', {
                      remaining: submission.remaining,
                      limit: submission.limit,
                    })
                  : t('fridge_scan.feedback_body')}
              </Text>

              {!submission ? (
                <>
                  <View style={styles.chefSelectorHeader}>
                    <Text style={styles.chefSelectorEyebrow}>
                      {t('fridge_scan.chef_selector_eyebrow')}
                    </Text>
                    <Text style={styles.chefSelectorTitle}>
                      {t('fridge_scan.chef_selector_title')}
                    </Text>
                  </View>
                  <View style={styles.chefSelector} testID="fridge-scan-chef-selector">
                    {FRIDGE_CHEF_PERSONAS.map((persona) => (
                      <FridgeChefPersonaCard
                        key={persona.mode}
                        persona={persona}
                        title={t(persona.nameTranslationKey)}
                        label={t(persona.labelTranslationKey)}
                        description={t(persona.descriptionTranslationKey)}
                        selected={selectedMode === persona.mode}
                        disabled={isSubmitting}
                        onPress={() => setSelectedMode(persona.mode)}
                        testID={`fridge-scan-chef-${persona.testIdSuffix}`}
                      />
                    ))}
                  </View>
                </>
              ) : null}
            </ScrollView>

            <View style={styles.feedbackFooter}>
              <LinearGradient
                colors={chefFlowTheme.footerGradient}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={styles.feedbackFooterGradient}
              />

              {submission ? (
                <Button
                  title={t('fridge_scan.submission_queued_cta')}
                  onPress={handleResetReview}
                  variant="premium"
                  size="lg"
                />
              ) : premiumRenderState === 'loading' ? null : (
                <View
                  style={[
                    styles.feedbackFooterActions,
                    useStackedFeedbackActions ? styles.feedbackFooterActionsStacked : null,
                  ]}
                >
                  <View
                    style={[
                      styles.feedbackFooterSecondaryAction,
                      useStackedFeedbackActions ? styles.feedbackFooterActionStacked : null,
                    ]}
                    testID={
                      canRetakeFromReview
                        ? 'fridge-scan-retake-action'
                        : 'fridge-scan-home-action'
                    }
                  >
                    <Button
                      title={t(
                        canRetakeFromReview
                          ? 'fridge_scan.feedback_secondary_cta'
                          : 'fridge_scan.feedback_home_cta',
                      )}
                      onPress={
                        canRetakeFromReview
                          ? handleResetReview
                          : handleReturnHomeFromReview
                      }
                      variant="outline"
                      tone="neutral"
                      disabled={isSubmitting}
                    />
                  </View>
                  <View
                    style={[
                      styles.feedbackFooterPrimaryAction,
                      useStackedFeedbackActions ? styles.feedbackFooterActionStacked : null,
                    ]}
                  >
                    <Button
                      title={t('fridge_scan.feedback_primary_cta')}
                      onPress={handleSubmitReview}
                      variant="premium"
                      size="lg"
                      loading={isSubmitting}
                      testID="fridge-scan-submit-button"
                    />
                  </View>
                </View>
              )}
            </View>
          </Squircle>
        </View>
      ) : null}

      <ContextualPaywall
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        title={t('fridge_scan.paywall_title')}
        subtitle={t('fridge_scan.paywall_subtitle')}
        description={t('fridge_scan.paywall_body')}
        bulletPoints={[
          t('fridge_scan.paywall_bullet_identify'),
          t('fridge_scan.paywall_bullet_meal'),
          t('fridge_scan.paywall_bullet_limit'),
        ]}
        primaryButtonText={t('premium.subscription_page.contextual_cta')}
      />
    </View>
  );
}

const createStyles = (
  colors: any,
  chefFlowTheme: ReturnType<typeof resolveChefFlowVisualTheme>,
  insets: { top: number; bottom: number },
  isCompactFeedback: boolean,
  isDark: boolean,
) => {
  const safeBottomInset = getMinimumBottomInsetPadding(insets.bottom, SPACING.sm);
  const isAndroid = Platform.OS === 'android';
  const overlayFrameBorderColor = isAndroid
    ? isDark
      ? 'rgba(255, 255, 255, 0.84)'
      : 'rgba(255, 255, 255, 0.8)'
    : 'rgba(255, 255, 255, 0.92)';
  const overlayFrameBackgroundColor = isAndroid
    ? isDark
      ? 'rgba(255, 255, 255, 0.04)'
      : 'rgba(255, 255, 255, 0.05)'
    : 'rgba(255, 255, 255, 0.06)';
  const overlayFrameChrome = isAndroid
    ? {
        elevation: 0,
        shadowColor: 'transparent',
        shadowOpacity: 0,
        shadowRadius: 0,
        shadowOffset: { width: 0, height: 0 },
      }
    : {
        ...SHADOWS.cardHover,
        shadowColor: colors.primary,
        shadowOpacity: 0.18,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 12 },
      };

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: chefFlowTheme.screenBackground,
    },
    camera: {
      ...StyleSheet.absoluteFillObject,
    },
    cameraTint: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(2, 6, 12, 0.22)',
    },
    header: {
      position: 'absolute',
      top: insets.top + SPACING.sm,
      left: SPACING.page,
      right: SPACING.page,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
    },
    headerButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: chefFlowTheme.chromeButtonBackground,
      borderWidth: 1,
      borderColor: chefFlowTheme.chromeButtonBorder,
      alignItems: 'center',
      justifyContent: 'center', borderCurve: 'continuous',
    },
    overlayContainer: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: SPACING.page,
    },
    overlayFrame: {
      borderRadius: 32,
      borderWidth: isAndroid ? 1.25 : 1.5,
      borderColor: overlayFrameBorderColor,
      backgroundColor: overlayFrameBackgroundColor,
      overflow: 'hidden',
      ...overlayFrameChrome, borderCurve: 'continuous',
    },
    overlayShelfLineTop: {
      position: 'absolute',
      left: SPACING.lg,
      right: SPACING.lg,
      top: '30%',
      height: 1,
      backgroundColor: 'rgba(255, 255, 255, 0.38)',
    },
    overlayShelfLineMiddle: {
      position: 'absolute',
      left: SPACING.lg,
      right: SPACING.lg,
      top: '54%',
      height: 1,
      backgroundColor: 'rgba(255, 255, 255, 0.32)',
    },
    overlayShelfLineBottom: {
      position: 'absolute',
      left: SPACING.lg,
      right: SPACING.lg,
      bottom: '16%',
      height: 1,
      backgroundColor: 'rgba(255, 255, 255, 0.24)',
    },
    overlayHint: {
      marginTop: SPACING.md,
      maxWidth: 320,
      textAlign: 'center',
      fontSize: SIZES.text12,
      lineHeight: 20,
      color: 'rgba(255, 255, 255, 0.72)',
    },
    controlsOverlay: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: safeBottomInset + SPACING.xl,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 36,
      paddingHorizontal: SPACING.xl,
    },
    sideButton: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: chefFlowTheme.chromeButtonBackground,
      borderWidth: 1,
      borderColor: chefFlowTheme.chromeButtonBorder, borderCurve: 'continuous',
    },
    captureButton: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    captureButtonOuter: {
      width: 84,
      height: 84,
      borderRadius: 42,
      borderWidth: 4,
      borderColor: chefFlowTheme.textInverse,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255, 255, 255, 0.08)', borderCurve: 'continuous',
    },
    captureButtonInner: {
      width: 66,
      height: 66,
      borderRadius: 33,
      backgroundColor: chefFlowTheme.textInverse, borderCurve: 'continuous',
    },
    feedbackOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'flex-start',
      paddingHorizontal: SPACING.md,
      paddingTop: insets.top + (isCompactFeedback ? 44 : 56),
      paddingBottom: safeBottomInset,
      backgroundColor: chefFlowTheme.overlayBackground,
    },
    feedbackOverlayGradient: {
      ...StyleSheet.absoluteFillObject,
    },
    feedbackBackButton: {
      position: 'absolute',
      top: insets.top + SPACING.sm,
      left: SPACING.md,
      zIndex: 2,
      minHeight: 42,
      paddingHorizontal: SPACING.md,
      borderRadius: BORDER_RADIUS.full,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.xs,
      backgroundColor: chefFlowTheme.chromeButtonBackground,
      borderWidth: 1,
      borderColor: chefFlowTheme.chromeButtonBorder, borderCurve: 'continuous',
    },
    feedbackBackButtonText: {
      fontSize: SIZES.text14,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: chefFlowTheme.textPrimary,
    },
    feedbackCard: {
      width: '100%',
      maxWidth: 430,
      maxHeight: '100%',
      flexShrink: 1,
      position: 'relative',
      borderRadius: 30,
      backgroundColor: chefFlowTheme.surfaceBackground,
      borderWidth: 1,
      borderColor: chefFlowTheme.borderColor,
      overflow: 'hidden',
      ...SHADOWS.cardHover,
      shadowColor: mixColors(chefFlowTheme.warmAccent, colors.primary, 0.18),
      shadowOpacity: isDark ? 0.28 : 0.12,
      shadowRadius: 30,
      shadowOffset: { width: 0, height: 16 }, borderCurve: 'continuous',
    },
    feedbackCardGradient: {
      ...StyleSheet.absoluteFillObject,
    },
    feedbackScroll: {
      width: '100%',
      flexShrink: 1,
    },
    feedbackScrollContent: {
      alignItems: 'stretch',
      gap: SPACING.md,
      paddingHorizontal: SPACING.md,
      paddingTop: SPACING.md,
      paddingBottom: SPACING.lg,
    },
    feedbackHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      paddingHorizontal: SPACING.xs,
    },
    feedbackHeaderIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: chefFlowTheme.warmAccentSoft,
      borderWidth: 1,
      borderColor: withAlpha(chefFlowTheme.warmAccent, isDark ? 0.36 : 0.28), borderCurve: 'continuous',
    },
    feedbackHeaderCopy: {
      flex: 1,
      minWidth: 0,
    },
    feedbackEyebrow: {
      color: chefFlowTheme.warmAccent,
      fontSize: SIZES.text12,
      lineHeight: 15,
      fontWeight: FONT_WEIGHTS.bold,
      letterSpacing: 0,
      textTransform: 'uppercase',
    },
    feedbackTitle: {
      marginTop: 2,
      fontSize: SIZES.text20,
      lineHeight: 25,
      fontWeight: FONT_WEIGHTS.bold,
      color: chefFlowTheme.textPrimary,
      letterSpacing: 0,
    },
    feedbackImageShell: {
      width: '100%',
      ...SHADOWS.card,
      shadowColor: isDark ? '#000000' : mixColors(colors.gray, chefFlowTheme.warmAccent, 0.28),
      shadowOpacity: isDark ? 0.34 : 0.12,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 12 },
    },
    feedbackImageBorder: {
      width: '100%',
      padding: 1.5,
      borderRadius: 28, borderCurve: 'continuous',
    },
    feedbackImageFrame: {
      width: '100%',
      borderRadius: 26,
      overflow: 'hidden',
      backgroundColor: chefFlowTheme.imageBackground, borderCurve: 'continuous',
    },
    feedbackImage: {
      width: '100%',
    },
    feedbackImageVignette: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: 26, borderCurve: 'continuous',
    },
    feedbackBadge: {
      position: 'absolute',
      left: SPACING.md,
      bottom: SPACING.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      paddingHorizontal: SPACING.sm + 2,
      paddingVertical: SPACING.xs + 2,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: chefFlowTheme.imageBadgeBackground,
      borderWidth: 1,
      borderColor: chefFlowTheme.imageBadgeBorder, borderCurve: 'continuous',
    },
    feedbackBadgeSuccess: {
      backgroundColor: isDark
        ? 'rgba(8, 22, 13, 0.78)'
        : mixColors('#1A2B20', colors.success, 0.18),
      borderColor: withAlpha(colors.success, 0.34),
    },
    feedbackBadgeText: {
      fontSize: SIZES.text12,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: '#FFFFFF',
      textTransform: 'uppercase',
      letterSpacing: 0,
    },
    feedbackBody: {
      fontSize: SIZES.text14,
      lineHeight: 22,
      color: chefFlowTheme.textSecondary,
      textAlign: 'center',
      maxWidth: 340,
      alignSelf: 'center',
      marginTop: -SPACING.xs,
    },
    feedbackFooter: {
      width: '100%',
      position: 'relative',
      paddingHorizontal: SPACING.md,
      paddingTop: SPACING.md,
      paddingBottom: safeBottomInset,
      backgroundColor: chefFlowTheme.footerBackground,
      borderTopWidth: 1,
      borderTopColor: chefFlowTheme.footerBorder,
      overflow: 'hidden',
    },
    feedbackFooterGradient: {
      ...StyleSheet.absoluteFillObject,
    },
    feedbackFooterActions: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    feedbackFooterActionsStacked: {
      flexDirection: 'column',
    },
    feedbackFooterSecondaryAction: {
      flex: 0.86,
    },
    feedbackFooterPrimaryAction: {
      flex: 1.28,
    },
    feedbackFooterActionStacked: {
      flex: 0,
      width: '100%',
    },
    chefSelectorHeader: {
      width: '100%',
      marginTop: SPACING.md + 2,
      marginBottom: SPACING.sm,
      gap: 6,
      alignItems: 'flex-start',
    },
    chefSelectorEyebrow: {
      fontSize: SIZES.text10,
      letterSpacing: 1.6,
      fontWeight: FONT_WEIGHTS.bold,
      textTransform: 'uppercase',
      color: isDark
        ? withAlpha(colors.white, 0.45)
        : withAlpha(colors.primaryText, 0.5),
    },
    chefSelectorTitle: {
      fontSize: 22,
      lineHeight: 26,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
      letterSpacing: -0.3,
    },
    chefSelector: {
      width: '100%',
      gap: SPACING.sm + 2,
      marginTop: SPACING.xs,
    },
    stateScreen: {
      flex: 1,
      backgroundColor: chefFlowTheme.screenBackground,
      justifyContent: 'center',
      paddingHorizontal: SPACING.page,
    },
    backButtonStandalone: {
      position: 'absolute',
      top: insets.top + SPACING.sm,
      left: SPACING.page,
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: chefFlowTheme.chromeButtonBackground,
      borderWidth: 1,
      borderColor: chefFlowTheme.chromeButtonBorder,
      alignItems: 'center',
      justifyContent: 'center', borderCurve: 'continuous',
    },
    stateCard: {
      borderRadius: 28,
      paddingVertical: SPACING.xl,
      paddingHorizontal: SPACING.lg,
      backgroundColor: chefFlowTheme.surfaceElevated,
      borderWidth: 1,
      borderColor: chefFlowTheme.borderColor,
      alignItems: 'center',
      gap: SPACING.md,
      ...SHADOWS.cardHover,
      shadowColor: isDark ? '#000000' : mixColors(colors.gray, chefFlowTheme.warmAccent, 0.26),
      shadowOpacity: isDark ? 0.32 : 0.12,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 14 }, borderCurve: 'continuous',
    },
    stateIconBadge: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: chefFlowTheme.warmAccentSoft,
      borderWidth: 1,
      borderColor: withAlpha(chefFlowTheme.warmAccent, 0.24),
      alignItems: 'center',
      justifyContent: 'center', borderCurve: 'continuous',
    },
    stateTitle: {
      fontSize: SIZES.text20,
      fontWeight: FONT_WEIGHTS.bold,
      color: chefFlowTheme.textPrimary,
      textAlign: 'center',
    },
    stateBody: {
      fontSize: SIZES.text14,
      lineHeight: 22,
      color: chefFlowTheme.textSecondary,
      textAlign: 'center',
    },
    stateSupportText: {
      fontSize: SIZES.text12,
      color: withAlpha(colors.primary, isDark ? 0.92 : 0.82),
      textAlign: 'center',
    },
    stateButtonStack: {
      width: '100%',
      gap: SPACING.sm,
      marginTop: SPACING.xs,
    },
  });
};
