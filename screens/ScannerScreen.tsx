import { useState, useRef, useCallback, useMemo, useEffect, type ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { CameraView, CameraType, useCameraPermissions, type CameraPictureOptions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useRouter, useFocusEffect } from 'expo-router';
import { Camera, Image as ImageIcon, Crown, Gift, WifiOff, RefreshCw } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useNotificationContext } from '@/contexts/NotificationContext';
import { Button } from '@/components/Button';
import { SuperScanFeatureIcon } from '@/components/FeatureIcons';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { CameraGuide } from '@/components/CameraGuide';
import { NextScanTimer } from '@/components/NextScanTimer';
import { useAllScanEligibility } from '@/hooks/queries';
import { ScanEligibilityResponse, ScanType } from '@/types';
import { SCAN_TYPE_LABELS } from '@/constants/scan';
import { SIZES, SPACING, FONT_WEIGHTS } from '@/constants/theme';
import { ContextualPaywall } from '@/components/ContextualPaywall';
import { paywallSession } from '@/utils/paywallSession';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { CameraFlipIcon } from '@/components/CameraFlipIcon';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { PUBLIC_PRIVACY_POLICY_URL } from '@/constants/privacyPolicy';
import {
  buildScanLimitMessage,
  buildScanLimitPaywallTitle,
  formatScanLimitTime,
  getScanLimitUpgradeSubtitle,
} from '@/utils/scanLimitI18n';
import { useScanValidationFeedback } from '@/hooks/useScanValidationFeedback';
import {
  getScanQuotaStatusLabelKey,
  hasScanQuotaPayload,
  resolveScanQuotaState,
} from '@/utils/scanQuotaState';
import { hasPremiumAccess } from '@/utils/subscription';
import { ApiError, isConnectivityApiError } from '@/services/api';
import { getMinimumBottomInsetPadding } from '@/utils/mobileLayout';

const getCapturePictureOptions = (): CameraPictureOptions => {
  // Keep Expo processing enabled so the saved photo stays deterministic.
  // Reintroducing skipProcessing here previously let a mirror regression slip back in.
  return {
    quality: 1,
  };
};

function parseTimestampMs(value: number | string | undefined): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    return undefined;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function getEligibilityNextRechargeAt(
  eligibility?: Pick<
    ScanEligibilityResponse,
    'next_available_date' | 'next_recharge_at' | 'nextRechargeAt'
  > | null,
) {
  return (
    parseTimestampMs(eligibility?.next_recharge_at) ??
    parseTimestampMs(eligibility?.nextRechargeAt) ??
    parseTimestampMs(eligibility?.next_available_date)
  );
}

const SCANNER_REGULAR_CAPTURE_BUTTON_SIZE = 80;
const SCANNER_COMPACT_CAPTURE_BUTTON_SIZE = 76;

export default function ScannerScreen() {
  const router = useRouter();
  const { userProfile } = useAuth();
  const { scheduleSuperScanReset } = useNotificationContext();
  const { colors } = useTheme();
  const { t } = useLanguage();
  const { showAlert, alertElement } = useCustomAlert();
  const { playValidationFeedback } = useScanValidationFeedback();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const isCompactVerticalLayout = windowHeight < 760;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const styles = useMemo(
    () => createStyles(colors, insets, isCompactVerticalLayout),
    [colors, insets, isCompactVerticalLayout]
  );

  // Use shared React Query hook for scan eligibility (single source of truth)
  const {
    data: scanEligibility,
    errors: scanEligibilityErrors,
    loadingByScanType,
    isAuthReady,
    canQuery: canQueryEligibility,
    hasConnectivityError,
    refetchAll: refetchEligibility,
    refetchScanType: refetchScanEligibilityType,
  } = useAllScanEligibility();

  const [facing, setFacing] = useState<CameraType>('back');
  const [permission, requestPermission] = useCameraPermissions();
  const [selectedScanType, setSelectedScanType] = useState<ScanType | null>(null);
  const [checkingEligibility, setCheckingEligibility] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [showConnectivityBanner, setShowConnectivityBanner] = useState(false);
  const [captureSequenceActive, setCaptureSequenceActive] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const captureSequenceActiveRef = useRef(false);
  const gallerySelectionActiveRef = useRef(false);
  const completedRechargeRefetchKeysRef = useRef<Set<string>>(new Set());
  const connectivityBannerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [paywallConfig, setPaywallConfig] = useState<{
    visible: boolean;
    title: string;
    subtitle?: string;
    description?: string;
    bulletPoints?: string[];
    icon?: ReactNode;
    badgeIcon?: ReactNode | null;
  }>({ visible: false, title: '' });
  const accountTier = userProfile?.account_tier ?? null;
  const isAdmin = accountTier === 'admin';
  const isPremium = hasPremiumAccess(accountTier);

  const interactionsLocked = checkingEligibility || captureSequenceActive;
  const shouldShowConnectivityBanner = showConnectivityBanner || isRetrying;

  useEffect(() => {
    if (hasConnectivityError) {
      if (!connectivityBannerTimeoutRef.current) {
        connectivityBannerTimeoutRef.current = setTimeout(() => {
          setShowConnectivityBanner(true);
          connectivityBannerTimeoutRef.current = null;
        }, 800);
      }
      return;
    }

    if (connectivityBannerTimeoutRef.current) {
      clearTimeout(connectivityBannerTimeoutRef.current);
      connectivityBannerTimeoutRef.current = null;
    }
    setShowConnectivityBanner(false);
  }, [hasConnectivityError]);

  useEffect(() => {
    return () => {
      if (connectivityBannerTimeoutRef.current) {
        clearTimeout(connectivityBannerTimeoutRef.current);
      }
    };
  }, []);

  // Refetch eligibility when screen gains focus (syncs with HomeScreen via shared cache)
  useFocusEffect(
    useCallback(() => {
      if (isAuthReady && canQueryEligibility) {
        void refetchEligibility();
      }
    }, [canQueryEligibility, isAuthReady, refetchEligibility])
  );

  // Manual retry handler for network error banner
  const handleManualRetry = useCallback(() => {
    if (!canQueryEligibility) {
      return;
    }

    setIsRetrying(true);
    void refetchEligibility().finally(() => {
      setIsRetrying(false);
    });
  }, [canQueryEligibility, refetchEligibility]);

  const handleTimerComplete = useCallback((scanType: ScanType, nextRechargeAt: number) => {
    const refetchKey = `${scanType}:${nextRechargeAt}`;
    if (completedRechargeRefetchKeysRef.current.has(refetchKey)) {
      return;
    }

    completedRechargeRefetchKeysRef.current.add(refetchKey);
    if (canQueryEligibility) {
      void refetchScanEligibilityType(scanType);
    }
  }, [canQueryEligibility, refetchScanEligibilityType]);

  const getEligibilityErrorAlertContent = useCallback((error: ApiError) => {
    switch (error.type) {
      case 'AUTH':
        return {
          title: t('scanner.eligibility_error_title'),
          message: t('scanner.eligibility_auth_msg'),
        };
      case 'VALIDATION':
        return {
          title: t('scanner.eligibility_error_title'),
          message:
            error.message.startsWith('api_errors.')
              ? t(error.message)
              : error.message || t('scanner.eligibility_unavailable_msg'),
        };
      case 'DATABASE':
      case 'EDGE_FUNCTION':
      case 'UNKNOWN':
      default:
        return {
          title: t('scanner.eligibility_error_title'),
          message: t('scanner.eligibility_unavailable_msg'),
        };
    }
  }, [t]);

  const showEligibilityErrorAlert = useCallback((error: ApiError) => {
    const { title, message } = getEligibilityErrorAlertContent(error);
    showAlert(
      title,
      message,
      [
        {
          text: t('common.retry'),
          onPress: () => {
            if (canQueryEligibility) {
              void refetchEligibility();
            }
          },
        },
        { text: t('common.ok'), style: 'cancel' },
      ],
      undefined,
      { variant: 'warning', emoji: '\u26A0\uFE0F' }
    );
  }, [canQueryEligibility, getEligibilityErrorAlertContent, refetchEligibility, showAlert, t]);

  const normalizeCapturedPhotoUri = useCallback(async (photoUri: string, cameraFacing: CameraType) => {
    if (cameraFacing !== 'front') {
      return photoUri;
    }

    const normalizedPhoto = await ImageManipulator.manipulateAsync(
      photoUri,
      [{ flip: ImageManipulator.FlipType.Horizontal }],
      {
        compress: 1,
        format: ImageManipulator.SaveFormat.JPEG,
      }
    );

    return normalizedPhoto.uri;
  }, []);

  const openScanPreview = useCallback(
    async (scanType: ScanType, imageUri: string) => {
      if (scanType === 'super') {
        await scheduleSuperScanReset();
      }

      router.push({
        pathname: '/scan-preview',
        params: {
          imageUri,
          scanType,
        },
      });
    },
    [router, scheduleSuperScanReset]
  );

  const getTimedLimitContent = useCallback(
    (
      eligibility: Pick<
        ScanEligibilityResponse,
        'message' | 'message_key' | 'next_available_date' | 'next_recharge_at' | 'nextRechargeAt'
      >,
    ) => {
      const nextRechargeAt = getEligibilityNextRechargeAt(eligibility);

      if (!nextRechargeAt) {
        return null;
      }

      const timeMessage = formatScanLimitTime(nextRechargeAt, t);

      return {
        timeMessage,
        message: buildScanLimitMessage(eligibility, t, timeMessage),
        paywallTitle: buildScanLimitPaywallTitle(t, timeMessage),
        paywallSubtitle: getScanLimitUpgradeSubtitle(t),
      };
    },
    [t]
  );

  const handleScanTypeSelect = async (scanType: ScanType) => {
    if (interactionsLocked || captureSequenceActiveRef.current) {
      return;
    }

    // Unified logic for every scan type, including Super Scan.
    const eligibility = scanEligibility?.[scanType];
    const eligibilityError = scanEligibilityErrors[scanType];

    if (!eligibility) {
      if (loadingByScanType[scanType]) {
        return;
      }

      if (eligibilityError && !isConnectivityApiError(eligibilityError)) {
        showEligibilityErrorAlert(eligibilityError);
      }
      return;
    }

    const welcomeCredits = eligibility?.welcome_credits || 0;
    const hasWelcomeCredits = welcomeCredits > 0;

    if (!isAdmin && (!eligibility || (!eligibility.allowed && !hasWelcomeCredits))) {
      // Special case for Premium-only Super Scan (no next_available_date).
      if (scanType === 'super' && eligibility && !getEligibilityNextRechargeAt(eligibility)) {
        const premiumTitle = t('super_scan_features.premium_alert_title');
        const premiumMessage = t('super_scan_features.premium_alert_msg');
        if (paywallSession.canShowPaywall()) {
          setPaywallConfig({
            visible: true,
            title: premiumTitle,
            description: premiumMessage,
            bulletPoints: [
              t('premium.subscription_page.prem_feat_super'),
              t('premium.subscription_page.prem_feat_complete_analysis'),
            ],
            icon: <SuperScanFeatureIcon color="#D4A31D" size={31} />,
            badgeIcon: null,
          });
          paywallSession.markPaywallShown();
        } else {
          showAlert(
            premiumTitle,
            premiumMessage,
            [
              { text: t('common.later'), style: 'cancel' },
              {
                text: t('premium.upgrade_title'),
                onPress: () => router.push('/premium-upgrade'),
              },
            ],
            <SuperScanFeatureIcon color="#D4A31D" size={30} />,
            { variant: 'premium', emoji: null }
          );
        }
        return;
      }

      // Cas avec timestamp de recharge individuel (limite atteinte)
      if (eligibility && getEligibilityNextRechargeAt(eligibility)) {
        const limitContent = getTimedLimitContent(eligibility);
        if (!limitContent) {
          return;
        }

        // Dedicated message when Super Scan has already been used today.
        if (scanType === 'super') {
          showAlert(
            t('super_scan_features.used_alert_title'),
            `${t('super_scan_features.used_alert_msg')}\n\n${limitContent.timeMessage}`,
            [{ text: t('common.ok'), style: 'default' }],
            undefined,
            { variant: 'warning', emoji: '\uD83D\uDD52' }
          );
        } else {
          if (paywallSession.canShowPaywall()) {
            setPaywallConfig({
              visible: true,
              title: limitContent.paywallTitle,
              subtitle: limitContent.paywallSubtitle,
            });
            paywallSession.markPaywallShown();
          } else {
            showAlert(
              t('common.error'),
              `${limitContent.message}\n\n${limitContent.paywallSubtitle}`,
              [
                { text: t('common.ok'), style: 'cancel' },
                {
                  text: t('premium.upgrade_title'),
                  onPress: () => router.push('/premium-upgrade'),
                },
              ],
              undefined,
              { variant: 'premium', emoji: '\u2728' }
            );
          }
        }
      }
      return;
    }

    setSelectedScanType(scanType);
  };

  const performCameraCapture = useCallback(
    async (scanType: ScanType) => {
      if (!cameraRef.current) {
        return false;
      }

      const captureFacing = facing;
      const photo = await cameraRef.current.takePictureAsync(getCapturePictureOptions());

      if (!photo) {
        return false;
      }

      const normalizedPhotoUri = await normalizeCapturedPhotoUri(photo.uri, captureFacing);

      await openScanPreview(scanType, normalizedPhotoUri);

      return true;
    },
    [facing, normalizeCapturedPhotoUri, openScanPreview]
  );

  const takePicture = async () => {
    if (interactionsLocked || captureSequenceActiveRef.current) {
      return;
    }

    if (!selectedScanType) {
      showAlert(
        t('scanner.type_required_title'),
        t('scanner.type_required_msg'),
        undefined,
        undefined,
        { variant: 'info', emoji: '\uD83D\uDCF8' }
      );
      return;
    }

    // Unified eligibility check for every scan type.
    const eligibility = scanEligibility?.[selectedScanType];
    const hasWelcomeCredits = (eligibility?.welcome_credits || 0) > 0;
    const canScan = isAdmin || eligibility?.allowed || hasWelcomeCredits;
    const isSuperPremiumOnly =
      selectedScanType === 'super' &&
      eligibility &&
      !getEligibilityNextRechargeAt(eligibility);
    const limitContent = eligibility ? getTimedLimitContent(eligibility) : null;

    if (!canScan) {
      if (paywallSession.canShowPaywall()) {
        const titleText = isSuperPremiumOnly
          ? t('super_scan_features.premium_alert_title')
          : limitContent?.paywallTitle || t('scan_limit.limit_reached');
        const subtitleText = isSuperPremiumOnly
          ? undefined
          : limitContent?.paywallSubtitle || getScanLimitUpgradeSubtitle(t);
        const descriptionText = isSuperPremiumOnly
          ? t('super_scan_features.premium_alert_msg')
          : undefined;

        setPaywallConfig({
          visible: true,
          title: titleText,
          subtitle: subtitleText,
          description: descriptionText,
          bulletPoints: isSuperPremiumOnly
            ? [
                t('premium.subscription_page.prem_feat_super'),
                t('premium.subscription_page.prem_feat_complete_analysis'),
              ]
            : undefined,
          icon: isSuperPremiumOnly ? (
            <SuperScanFeatureIcon color="#D4A31D" size={31} />
          ) : undefined,
          badgeIcon: isSuperPremiumOnly ? null : undefined,
        });
        paywallSession.markPaywallShown();
      } else {
        showAlert(
          t('scan_limit.limit_reached'),
          isSuperPremiumOnly
            ? t('super_scan_features.premium_alert_msg')
            : limitContent?.message || eligibility?.message || t('scan_limit.limit_reached'),
          [
            { text: t('common.ok'), style: 'cancel' },
            {
              text: t('premium.upgrade_btn'),
              onPress: () => router.push('/premium-upgrade'),
            },
          ],
          isSuperPremiumOnly ? (
            <SuperScanFeatureIcon color="#D4A31D" size={30} />
          ) : undefined,
          { variant: 'premium', emoji: isSuperPremiumOnly ? null : '\u2728' }
        );
      }
      return;
    }

    captureSequenceActiveRef.current = true;
    setCaptureSequenceActive(true);
    setCheckingEligibility(true);

    try {
      await playValidationFeedback();
      const didNavigate = await performCameraCapture(selectedScanType);

      if (!didNavigate) {
        throw new Error('CAPTURE_FAILED');
      }
    } catch (error) {
      showAlert(
        t('common.error'),
        t('scanner.error_taking_photo'),
        undefined,
        undefined,
        { variant: 'warning', emoji: '\uD83D\uDCF7' }
      );
    } finally {
      setCheckingEligibility(false);
      captureSequenceActiveRef.current = false;
      setCaptureSequenceActive(false);
    }
  };

  const pickImage = async () => {
    if (
      interactionsLocked ||
      captureSequenceActiveRef.current ||
      gallerySelectionActiveRef.current
    ) {
      return;
    }

    if (!selectedScanType) {
      showAlert(
        t('scanner.type_required_title'),
        t('scanner.type_required_msg'),
        undefined,
        undefined,
        { variant: 'info', emoji: '\uD83D\uDDBC\uFE0F' }
      );
      return;
    }

    // Unified eligibility check for every scan type.
    const eligibility = scanEligibility?.[selectedScanType];
    const hasWelcomeCredits = (eligibility?.welcome_credits || 0) > 0;
    const canScan = isAdmin || eligibility?.allowed || hasWelcomeCredits;
    const isSuperPremiumOnly =
      selectedScanType === 'super' &&
      eligibility &&
      !getEligibilityNextRechargeAt(eligibility);
    const limitContent = eligibility ? getTimedLimitContent(eligibility) : null;

    if (!canScan) {
      if (paywallSession.canShowPaywall()) {
        const titleText = isSuperPremiumOnly
          ? t('super_scan_features.premium_alert_title')
          : limitContent?.paywallTitle || t('scan_limit.limit_reached');
        const subtitleText = isSuperPremiumOnly
          ? undefined
          : limitContent?.paywallSubtitle || getScanLimitUpgradeSubtitle(t);
        const descriptionText = isSuperPremiumOnly
          ? t('super_scan_features.premium_alert_msg')
          : undefined;

        setPaywallConfig({
          visible: true,
          title: titleText,
          subtitle: subtitleText,
          description: descriptionText,
          bulletPoints: isSuperPremiumOnly
            ? [
                t('premium.subscription_page.prem_feat_super'),
                t('premium.subscription_page.prem_feat_complete_analysis'),
              ]
            : undefined,
          icon: isSuperPremiumOnly ? (
            <SuperScanFeatureIcon color="#D4A31D" size={31} />
          ) : undefined,
          badgeIcon: isSuperPremiumOnly ? null : undefined,
        });
        paywallSession.markPaywallShown();
      } else {
        showAlert(
          t('scan_limit.limit_reached'),
          isSuperPremiumOnly
            ? t('super_scan_features.premium_alert_msg')
            : limitContent?.message || eligibility?.message || t('scan_limit.limit_reached'),
          [
            { text: t('common.ok'), style: 'cancel' },
            {
              text: t('premium.upgrade_btn'),
              onPress: () => router.push('/premium-upgrade'),
            },
          ],
          isSuperPremiumOnly ? (
            <SuperScanFeatureIcon color="#D4A31D" size={30} />
          ) : undefined,
          { variant: 'premium', emoji: isSuperPremiumOnly ? null : '\u2728' }
        );
      }
      return;
    }

    gallerySelectionActiveRef.current = true;
    setCheckingEligibility(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [9, 16],
        quality: 1,
      });

      if (!result.canceled) {
        await openScanPreview(selectedScanType, result.assets[0].uri);
      }
    } catch (error) {
      showAlert(
        t('common.error'),
        t('scanner.error_loading_image'),
        undefined,
        undefined,
        { variant: 'warning', emoji: '\uD83D\uDDBC\uFE0F' }
      );
    } finally {
      setCheckingEligibility(false);
      gallerySelectionActiveRef.current = false;
    }
  };

  const toggleCameraFacing = () => {
    if (interactionsLocked || captureSequenceActiveRef.current) {
      return;
    }

    setFacing((current) => (current === 'back' ? 'front' : 'back'));
  };

  const renderScanTypeButton = (scanType: ScanType) => {
    const isSelected = selectedScanType === scanType;
    const eligibility = scanEligibility?.[scanType];
    const quotaState = resolveScanQuotaState({
      scanType,
      accountTier,
      eligibility,
      error: scanEligibilityErrors[scanType],
      loading: loadingByScanType[scanType],
      isAuthReady,
      canQuery: canQueryEligibility,
    });
    const welcomeCredits = eligibility?.welcome_credits || 0;
    const hasWelcomeCredits = welcomeCredits > 0;
    const quotaStateLabelKey = getScanQuotaStatusLabelKey(quotaState);
    const hasQuotaPayload = hasScanQuotaPayload(quotaState);
    const nextRechargeAt = hasQuotaPayload
      ? quotaState.nextRechargeAt
      : getEligibilityNextRechargeAt(eligibility);
    const serverClockOffsetMs = hasQuotaPayload
      ? quotaState.serverClockOffsetMs
      : eligibility?.server_clock_offset_ms;
    // Admin buttons are never disabled
    const isDisabled = isAdmin ? false : (eligibility ? (!eligibility.allowed && !hasWelcomeCredits) : true);
    const showInlineTimer =
      !isAdmin &&
      hasQuotaPayload &&
      quotaState.limit > 0 &&
      quotaState.remaining < quotaState.limit &&
      !!nextRechargeAt &&
      !hasWelcomeCredits &&
      !loadingByScanType[scanType];
    // Check if admin has remaining scans
    const adminHasScans =
      isAdmin && hasQuotaPayload ? quotaState.remaining > 0 : false;

    return (
      <View key={scanType} style={styles.scanTypeContainer}>
        <TouchableOpacity
          style={[
            styles.scanTypeButton,
            isSelected && styles.scanTypeButtonSelected,
            isDisabled && styles.scanTypeButtonDisabled,
            hasWelcomeCredits && !isAdmin && styles.scanTypeButtonWelcome,
            isAdmin && !isSelected && adminHasScans && styles.scanTypeButtonAdmin,
          ]}
          onPress={() => handleScanTypeSelect(scanType)}
          disabled={interactionsLocked}
          activeOpacity={0.8}
        >
          <Text
            style={[styles.scanTypeText, isSelected && styles.scanTypeTextSelected]}
            numberOfLines={1}
          >
            {t(SCAN_TYPE_LABELS[scanType])}
          </Text>
          <View style={styles.scanTypeSecondarySlot}>
            {hasWelcomeCredits && !isAdmin ? (
              <View style={styles.welcomeCreditsContainer} testID="welcome-gift">
                <Gift color={colors.success} size={12} strokeWidth={2} />
              </View>
            ) : showInlineTimer ? (
              <NextScanTimer
                nextAvailableDate={nextRechargeAt!}
                mode="scannerChipCompact"
                serverClockOffsetMs={serverClockOffsetMs}
                onTimerComplete={() => handleTimerComplete(scanType, nextRechargeAt!)}
              />
            ) : (
              <View style={styles.scanTypeSecondarySpacer} />
            )}
          </View>
          <View style={styles.scanTypeFooterSlot}>
            <Text style={styles.countLabel}>
              {hasScanQuotaPayload(quotaState)
                ? `${quotaState.remaining}/${quotaState.limit}`
                : t(quotaStateLabelKey ?? 'scan_limit.missing_payload')}
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  const renderSuperScanButton = () => {
    const isSelected = selectedScanType === 'super';
    const superEligibility = scanEligibility?.['super'];
    const superQuotaState = resolveScanQuotaState({
      scanType: 'super',
      accountTier,
      eligibility: superEligibility,
      error: scanEligibilityErrors.super,
      loading: loadingByScanType.super,
      isAuthReady,
      canQuery: canQueryEligibility,
    });
    const superQuotaStateLabelKey = getScanQuotaStatusLabelKey(superQuotaState);
    const hasSuperQuotaPayload = hasScanQuotaPayload(superQuotaState);
    const superNextRechargeAt = hasSuperQuotaPayload
      ? superQuotaState.nextRechargeAt
      : getEligibilityNextRechargeAt(superEligibility);
    const superServerClockOffsetMs = hasSuperQuotaPayload
      ? superQuotaState.serverClockOffsetMs
      : superEligibility?.server_clock_offset_ms;
    const superScanUsed = superEligibility ? !superEligibility.allowed : false;
    // Admin buttons are never disabled
    const isDisabled = isAdmin ? false : (isPremium && superScanUsed);
    const showSuperInlineTimer =
      isPremium &&
      !isAdmin &&
      hasSuperQuotaPayload &&
      superQuotaState.limit > 0 &&
      superQuotaState.remaining < superQuotaState.limit &&
      !!superNextRechargeAt &&
      !loadingByScanType.super;

    return (
      <View style={styles.scanTypeContainer}>
        <TouchableOpacity
          style={[
            styles.scanTypeButton,
            styles.superScanButton,
            isSelected && styles.superScanButtonSelected,
            isDisabled && styles.scanTypeButtonDisabled,
          ]}
          onPress={() => handleScanTypeSelect('super')}
          disabled={interactionsLocked}
          activeOpacity={0.8}
        >
          <View style={styles.superScanHeader}>
            <SuperScanFeatureIcon
              color={isSelected ? '#FFFFFF' : '#FFD700'}
              size={12}
              strokeWidth={2.2}
            />
            <Text
              style={[styles.superScanText, isSelected && styles.scanTypeTextSelected]}
              numberOfLines={1}
            >
              Super
            </Text>
          </View>
          <View style={styles.scanTypeSecondarySlot}>
            {!isPremium ? (
              <View style={styles.premiumBadge}>
                <Crown color="#FFD700" size={8} fill="#FFD700" />
                <Text style={styles.premiumBadgeText}>{t('super_scan_features.premium_badge')}</Text>
              </View>
            ) : showSuperInlineTimer ? (
              <NextScanTimer
                nextAvailableDate={superNextRechargeAt!}
                mode="scannerChipCompact"
                serverClockOffsetMs={superServerClockOffsetMs}
                onTimerComplete={() => handleTimerComplete('super', superNextRechargeAt!)}
              />
            ) : (
              <View style={styles.scanTypeSecondarySpacer} />
            )}
          </View>
          <View style={styles.scanTypeFooterSlot}>
            {isPremium ? (
              <Text style={styles.superScanLimit}>
                {hasScanQuotaPayload(superQuotaState)
                  ? `${superQuotaState.remaining}/${superQuotaState.limit}`
                  : t(superQuotaStateLabelKey ?? 'scan_limit.missing_payload')}
              </Text>
            ) : (
              <View style={styles.scanTypeFooterSpacer} />
            )}
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  if (!permission) {
    return <LoadingSpinner />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <View style={styles.permissionCard}>
          <Camera color={colors.primary} size={64} />
          <Text style={styles.permissionTitle}>{t('scanner.camera_permission_msg')}</Text>
          <Text style={styles.permissionText}>{t('scanner.camera_permission_detail')}</Text>
          <Text style={styles.permissionSubtext}>{t('scanner.camera_permission_backend')}</Text>
          <Text style={styles.permissionUrl}>{PUBLIC_PRIVACY_POLICY_URL}</Text>
          <View style={styles.permissionButtonStack}>
            <View style={styles.permissionButtonWrapper}>
              <Button
                title={t('settings.privacy_policy')}
                onPress={() => router.push('/privacy-policy')}
                variant="outline"
              />
            </View>
            <View style={styles.permissionButtonWrapper}>
              <Button title={t('scanner.authorize_camera')} onPress={requestPermission} />
            </View>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {alertElement}

      <View style={{ flex: 1 }}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing={facing}
          autofocus={captureSequenceActive ? 'on' : 'off'}
          animateShutter={false}
          mirror={false}
          testID="scanner-camera-view"
        />

        <View style={styles.cameraInteractionLayer} pointerEvents="none" testID="scanner-focus-overlay">
          <CameraGuide scanType={selectedScanType} visible={!!selectedScanType} />
        </View>

        {/* Header removed on request */}

        {/* Network error banner */}
        {shouldShowConnectivityBanner && (
          <TouchableOpacity
            style={styles.networkErrorBanner}
            onPress={handleManualRetry}
            disabled={isRetrying}
            activeOpacity={0.8}
            testID="scanner-network-banner"
          >
            {isRetrying ? (
              <RefreshCw color={colors.warning} size={18} strokeWidth={2} />
            ) : (
              <WifiOff color={colors.warning} size={18} strokeWidth={2} />
            )}
            <Text style={styles.networkErrorText}>
              {isRetrying ? t('super_scan_features.connection_reconnecting') : t('super_scan_features.connection_unstable')}
            </Text>
          </TouchableOpacity>
        )}

        {/* Scan type selector moved to the bottom */}
        <View style={styles.scanTypeSelector} testID="scanner-scan-type-selector">
          {renderScanTypeButton('health')}
          {renderScanTypeButton('body')}
          {renderScanTypeButton('nutrition')}
          {renderSuperScanButton()}
        </View>

        {/* Transparent floating controls */}
        <View style={styles.controlsOverlay} testID="scanner-controls-overlay">
          <TouchableOpacity
            style={styles.sideButton}
            onPress={pickImage}
            activeOpacity={0.7}
            disabled={interactionsLocked}
            testID="scanner-gallery-button"
          >
            <ImageIcon color="#FFFFFF" size={26} strokeWidth={2} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.captureButton}
            onPress={takePicture}
            activeOpacity={0.8}
            disabled={interactionsLocked}
            testID="scanner-capture-button"
          >
            <View style={styles.captureButtonOuter}>
              <View style={styles.captureButtonInner} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.sideButton}
            onPress={toggleCameraFacing}
            activeOpacity={0.7}
            disabled={interactionsLocked}
            testID="scanner-flip-camera-button"
          >
            <CameraFlipIcon size={30} color="#FFFFFF" strokeWidth={2} />
          </TouchableOpacity>
        </View>
      </View>

      <ContextualPaywall
        visible={paywallConfig.visible}
        onClose={() => setPaywallConfig(prev => ({ ...prev, visible: false }))}
        title={paywallConfig.title}
        subtitle={paywallConfig.subtitle}
        description={paywallConfig.description}
        bulletPoints={paywallConfig.bulletPoints}
        icon={paywallConfig.icon}
        badgeIcon={paywallConfig.badgeIcon}
        primaryButtonText={t('premium.subscription_page.contextual_cta')}
      />
    </View>
  );
}

const createStyles = (
  colors: any,
  insets: { top: number; bottom: number },
  isCompactVerticalLayout: boolean
) => {
  const safeBottomInset = getMinimumBottomInsetPadding(insets.bottom, SPACING.sm);
  const captureButtonSize = isCompactVerticalLayout
    ? SCANNER_COMPACT_CAPTURE_BUTTON_SIZE
    : SCANNER_REGULAR_CAPTURE_BUTTON_SIZE;
  const controlsBottomPadding = isCompactVerticalLayout ? SPACING.md : SPACING.lg;
  const controlsBottomOffset = safeBottomInset + controlsBottomPadding;
  const selectorBottomOffset =
    controlsBottomOffset +
    captureButtonSize +
    (isCompactVerticalLayout ? SPACING.md : SPACING.lg);

  return StyleSheet.create({
  // === CONTAINER PRINCIPAL ===
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.page,
    backgroundColor: colors.background,
  },
  permissionCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.cardBackground,
    borderRadius: 24,
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.lightGray,
  },
  permissionTitle: {
    fontSize: SIZES.text20,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.primaryText,
    textAlign: 'center',
    marginTop: SPACING.lg,
    marginBottom: SPACING.md,
  },
  permissionText: {
    fontSize: SIZES.text16,
    color: colors.primaryText,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: SPACING.md,
  },
  permissionSubtext: {
    fontSize: SIZES.text14,
    color: colors.gray,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING.md,
  },
  permissionUrl: {
    fontSize: SIZES.text12,
    color: colors.primary,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  permissionButtonStack: {
    width: '100%',
    gap: SPACING.sm,
  },
  permissionButtonWrapper: {
    width: '100%',
  },

  // === FULLSCREEN CAMERA ===
  camera: {
    ...StyleSheet.absoluteFillObject,
  },
  cameraInteractionLayer: {
    ...StyleSheet.absoluteFillObject,
  },

  // === HEADER FLOTTANT ===
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: insets.top + SPACING.sm,
    paddingHorizontal: SPACING.page,
    paddingBottom: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  headerSpacer: {
    width: 44,
    height: 44,
  },
  cameraTitle: {
    fontSize: SIZES.text20,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  // === SCAN TYPE SELECTOR ===
  scanTypeSelector: {
    position: 'absolute',
    bottom: selectorBottomOffset,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'stretch',
    gap: 4,
    paddingHorizontal: SPACING.sm,
  },
  scanTypeContainer: {
    flex: 1,
    alignItems: 'center',
    minWidth: 0,
    maxWidth: 84,
  },
  scanTypeButton: {
    width: '100%',
    height: 58,
    paddingVertical: 2,
    paddingHorizontal: 3,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  scanTypeButtonSelected: {
    backgroundColor: 'rgba(0, 122, 255, 0.9)',
    borderColor: 'rgba(0, 122, 255, 0.95)',
  },
  scanTypeButtonDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderColor: 'rgba(255, 255, 255, 0.24)',
    opacity: 1,
  },
  scanTypeButtonWelcome: {
    borderWidth: 2,
    borderColor: colors.success,
    backgroundColor: 'rgba(34, 197, 94, 0.4)',
  },
  scanTypeButtonAdmin: {
    borderWidth: 2,
    borderColor: 'rgba(0, 122, 255, 0.8)',
    backgroundColor: 'rgba(0, 122, 255, 0.35)',
  },
  scanTypeText: {
    fontSize: SIZES.text10,
    fontWeight: FONT_WEIGHTS.semiBold,
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 11,
    width: '100%',
  },
  scanTypeTextSelected: {
    color: colors.white,
  },
  scanTypeSecondarySlot: {
    minHeight: 9,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanTypeSecondarySpacer: {
    height: 9,
    width: '100%',
  },
  scanTypeFooterSlot: {
    minHeight: 10,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  scanTypeFooterSpacer: {
    height: 10,
    width: '100%',
  },
  countLabel: {
    fontSize: 9,
    color: '#FFFFFF',
    fontWeight: FONT_WEIGHTS.bold,
    textAlign: 'center',
    lineHeight: 10,
  },
  welcomeCreditsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  welcomeCreditsLabel: {
    fontSize: SIZES.text10,
    color: colors.success,
    fontWeight: FONT_WEIGHTS.bold,
  },

  // === SUPER SCAN BUTTON ===
  superScanButton: {
    borderWidth: 2,
    borderColor: 'rgba(255, 200, 0, 0.8)',
    backgroundColor: 'rgba(255, 180, 0, 0.45)',
  },
  superScanButtonSelected: {
    backgroundColor: 'rgba(255, 180, 0, 0.95)',
    borderColor: 'rgba(255, 200, 0, 1)',
  },
  superScanHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    width: '100%',
  },
  superScanText: {
    fontSize: SIZES.text10,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#FFFFFF',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    lineHeight: 11,
  },
  superScanLimit: {
    fontSize: 9,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    lineHeight: 10,
  },
  premiumBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 8,
    gap: 2,
  },
  premiumBadgeText: {
    fontSize: 7,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#FFFFFF',
  },


  // === BANNERS ===
  networkErrorBanner: {
    position: 'absolute',
    top: insets.top + (isCompactVerticalLayout ? SPACING.md : SPACING.lg),
    left: SPACING.page,
    right: SPACING.page,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.9)',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: 12,
    gap: SPACING.sm,
  },
  networkErrorText: {
    fontSize: 13,
    color: colors.white,
    fontWeight: FONT_WEIGHTS.semiBold,
    flex: 1,
    textAlign: 'center',
  },

  // === FLOATING CONTROLS ===
  controlsOverlay: {
    position: 'absolute',
    bottom: controlsBottomOffset,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xxl,
    gap: 40,
  },
  sideButton: {
    width: isCompactVerticalLayout ? 48 : 52,
    height: isCompactVerticalLayout ? 48 : 52,
    borderRadius: isCompactVerticalLayout ? 24 : 26,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  captureButton: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonOuter: {
    width: captureButtonSize,
    height: captureButtonSize,
    borderRadius: captureButtonSize / 2,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  captureButtonInner: {
    width: isCompactVerticalLayout ? 60 : 64,
    height: isCompactVerticalLayout ? 60 : 64,
    borderRadius: isCompactVerticalLayout ? 30 : 32,
    backgroundColor: '#FFFFFF',
  },
  });
};
