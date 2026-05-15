import {
  useState,
  useRef,
  useCallback,
  useMemo,
  useEffect,
  type ReactNode,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import {
  CameraView,
  CameraType,
  useCameraPermissions,
  type CameraPictureOptions,
} from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useRouter, useFocusEffect, usePathname } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Camera,
  Crown,
  Gift,
  Image as ImageIcon,
  RefreshCw,
  WifiOff,
} from 'lucide-react-native';

import { useAuth } from '@/contexts/AuthContext';
import { useNotificationContext } from '@/contexts/NotificationContext';
import { ScreenState } from '@/components/ScreenState';
import {
  CameraGuide,
  type CameraGuideTone,
} from '@/components/CameraGuide';
import { NextScanTimer } from '@/components/NextScanTimer';
import { ResultIcon } from '@/components/ResultIcon';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { SuperScanFeatureIcon } from '@/components/FeatureIcons';
import { useAllScanEligibility } from '@/hooks/queries/useScanEligibility';
import { ScanEligibilityResponse, ScanType } from '@/types';
import { SCAN_TYPE_LABELS } from '@/constants/scan';
import {
  BORDER_RADIUS,
  FONTS,
  FONT_WEIGHTS,
  SCANNER_TOKENS,
  SIZES,
  SPACING,
  withAlpha,
} from '@/constants/theme';
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
import { getMainTabBarMetrics } from '@/utils/mainTabBarMetrics';
import {
  resolveScanCaptureVisualTheme,
  resolveScanFlowAccentTheme,
} from '@/utils/scanFlowVisualTheme';

const getCapturePictureOptions = (): CameraPictureOptions => ({
  quality: 1,
});

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
const SCANNER_REGULAR_SCAN_CHIP_HEIGHT = 76;
const SCANNER_COMPACT_SCAN_CHIP_HEIGHT = 72;
const SCANNER_GUIDE_BOTTOM_CLEARANCE = SPACING.lg;
const SCAN_ICON_TOKENS = {
  health: 'face',
  body: 'body',
  nutrition: 'nutrition',
} as const;
const MAIN_TABS_PATHNAMES = new Set([
  '/',
  '/index',
  '/coach',
  '/scanner',
  '/social',
  '/(tabs)',
  '/(tabs)/index',
  '/(tabs)/coach',
  '/(tabs)/scanner',
  '/(tabs)/social',
]);

const getScannerDockMetrics = (
  bottomInset: number,
  isCompactVerticalLayout: boolean,
) => {
  const tabBarMetrics = getMainTabBarMetrics(bottomInset);
  const dockGap = isCompactVerticalLayout ? SPACING.sm : SPACING.md;
  const captureButtonSize = isCompactVerticalLayout
    ? SCANNER_COMPACT_CAPTURE_BUTTON_SIZE
    : SCANNER_REGULAR_CAPTURE_BUTTON_SIZE;
  const scanChipHeight = isCompactVerticalLayout
    ? SCANNER_COMPACT_SCAN_CHIP_HEIGHT
    : SCANNER_REGULAR_SCAN_CHIP_HEIGHT;
  const dockBottomOffset = tabBarMetrics.topOffsetFromBottom + dockGap;
  const dockHeight = scanChipHeight + dockGap + captureButtonSize;

  return {
    captureButtonSize,
    dockBottomOffset,
    dockGap,
    dockHeight,
    guideReservedBottom:
      dockBottomOffset + dockHeight + SCANNER_GUIDE_BOTTOM_CLEARANCE,
  };
};

export default function ScannerScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const { userProfile } = useAuth();
  const { scheduleSuperScanReset } = useNotificationContext();
  const { colors, isDark } = useTheme();
  const { t } = useLanguage();
  const { showAlert, alertElement } = useCustomAlert();
  const { playValidationFeedback } = useScanValidationFeedback();
  const isScannerFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const isCompactVerticalLayout = windowHeight < 760;
  const dockMetrics = useMemo(
    () => getScannerDockMetrics(insets.bottom, isCompactVerticalLayout),
    [insets.bottom, isCompactVerticalLayout],
  );
  const cameraGuideViewportInsets = useMemo(
    () => ({
      top: insets.top + (isCompactVerticalLayout ? SPACING.lg : SPACING.xl),
      bottom: dockMetrics.guideReservedBottom,
    }),
    [dockMetrics.guideReservedBottom, insets.top, isCompactVerticalLayout],
  );
  const captureTheme = useMemo(
    () => resolveScanCaptureVisualTheme(colors, isDark),
    [colors, isDark],
  );
  const defaultAccentTheme = useMemo(
    () => resolveScanFlowAccentTheme(colors, isDark, 'health'),
    [colors, isDark],
  );
  const [facing, setFacing] = useState<CameraType>('back');
  const [permission, requestPermission] = useCameraPermissions();
  const [selectedScanType, setSelectedScanType] = useState<ScanType | null>(null);
  const [checkingEligibility, setCheckingEligibility] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [showConnectivityBanner, setShowConnectivityBanner] = useState(false);
  const [captureSequenceActive, setCaptureSequenceActive] = useState(false);
  const [openingPreview, setOpeningPreview] = useState(false);
  const [isCameraPreviewReady, setIsCameraPreviewReady] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const captureSequenceActiveRef = useRef(false);
  const gallerySelectionActiveRef = useRef(false);
  const completedRechargeRefetchKeysRef = useRef<Set<string>>(new Set());
  const connectivityBannerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const accentTheme = useMemo(
    () =>
      selectedScanType
        ? resolveScanFlowAccentTheme(colors, isDark, selectedScanType)
        : defaultAccentTheme,
    [colors, defaultAccentTheme, isDark, selectedScanType],
  );
  const styles = useMemo(
    () =>
      createStyles(
        colors,
        isDark,
        insets,
        isCompactVerticalLayout,
        captureTheme,
        accentTheme,
      ),
    [accentTheme, captureTheme, colors, insets, isCompactVerticalLayout, isDark],
  );

  const {
    data: scanEligibility,
    errors: scanEligibilityErrors,
    loadingByScanType,
    isAuthReady,
    canQuery: canQueryEligibility,
    hasConnectivityError,
    isFetched: isScanEligibilityFetched,
    isFetching: isScanEligibilityFetching,
    isStale: isScanEligibilityStale,
    refetchAll: refetchEligibility,
    refetchScanType: refetchScanEligibilityType,
  } = useAllScanEligibility();

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
  const interactionsLocked =
    checkingEligibility ||
    captureSequenceActive ||
    openingPreview ||
    !isScannerFocused ||
    !isCameraPreviewReady;
  const shouldShowConnectivityBanner = showConnectivityBanner || isRetrying;
  const shouldMountCamera = permission?.granted && MAIN_TABS_PATHNAMES.has(pathname);

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
    if (!shouldMountCamera) {
      setIsCameraPreviewReady(false);
    }
  }, [shouldMountCamera]);

  useEffect(() => {
    return () => {
      if (connectivityBannerTimeoutRef.current) {
        clearTimeout(connectivityBannerTimeoutRef.current);
      }
    };
  }, []);

  const handleCameraReady = useCallback(() => {
    setIsCameraPreviewReady(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (
        isAuthReady &&
        canQueryEligibility &&
        !isScanEligibilityFetching &&
        (!isScanEligibilityFetched || isScanEligibilityStale)
      ) {
        void refetchEligibility();
      }
    }, [
      canQueryEligibility,
      isAuthReady,
      isScanEligibilityFetched,
      isScanEligibilityFetching,
      isScanEligibilityStale,
      refetchEligibility,
    ]),
  );

  const handleManualRetry = useCallback(() => {
    if (!canQueryEligibility) {
      return;
    }

    setIsRetrying(true);
    void refetchEligibility().finally(() => {
      setIsRetrying(false);
    });
  }, [canQueryEligibility, refetchEligibility]);

  const handleTimerComplete = useCallback(
    (scanType: ScanType, nextRechargeAt: number) => {
      const refetchKey = `${scanType}:${nextRechargeAt}`;
      if (completedRechargeRefetchKeysRef.current.has(refetchKey)) {
        return;
      }

      completedRechargeRefetchKeysRef.current.add(refetchKey);
      if (canQueryEligibility) {
        void refetchScanEligibilityType(scanType);
      }
    },
    [canQueryEligibility, refetchScanEligibilityType],
  );

  const getEligibilityErrorAlertContent = useCallback(
    (error: ApiError) => {
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
    },
    [t],
  );

  const showEligibilityErrorAlert = useCallback(
    (error: ApiError) => {
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
        { variant: 'warning', emoji: '\u26A0\uFE0F' },
      );
    },
    [
      canQueryEligibility,
      getEligibilityErrorAlertContent,
      refetchEligibility,
      showAlert,
      t,
    ],
  );

  const normalizeCapturedPhotoUri = useCallback(
    async (photoUri: string, cameraFacing: CameraType) => {
      if (cameraFacing !== 'front') {
        return photoUri;
      }

      const normalizedPhoto = await ImageManipulator.manipulateAsync(
        photoUri,
        [{ flip: ImageManipulator.FlipType.Horizontal }],
        {
          compress: 1,
          format: ImageManipulator.SaveFormat.JPEG,
        },
      );

      return normalizedPhoto.uri;
    },
    [],
  );

  const openScanPreview = useCallback(
    (scanType: ScanType, imageUri: string) => {
      if (scanType === 'super') {
        void scheduleSuperScanReset().catch(() => undefined);
      }

      router.push({
        pathname: '/scan-preview',
        params: {
          imageUri,
          scanType,
        },
      });
    },
    [router, scheduleSuperScanReset],
  );

  const getTimedLimitContent = useCallback(
    (
      eligibility: Pick<
        ScanEligibilityResponse,
        | 'message'
        | 'message_key'
        | 'next_available_date'
        | 'next_recharge_at'
        | 'nextRechargeAt'
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
    [t],
  );

  const handleScanTypeSelect = async (scanType: ScanType) => {
    if (interactionsLocked || captureSequenceActiveRef.current) {
      return;
    }

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

    if (!isAdmin && (!eligibility.allowed && !hasWelcomeCredits)) {
      if (scanType === 'super' && !getEligibilityNextRechargeAt(eligibility)) {
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
            icon: <SuperScanFeatureIcon color={colors.gold} size={31} />,
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
            <SuperScanFeatureIcon color={colors.gold} size={30} />,
            { variant: 'premium', emoji: null },
          );
        }
        return;
      }

      if (getEligibilityNextRechargeAt(eligibility)) {
        const limitContent = getTimedLimitContent(eligibility);
        if (!limitContent) {
          return;
        }

        if (scanType === 'super') {
          showAlert(
            t('super_scan_features.used_alert_title'),
            `${t('super_scan_features.used_alert_msg')}\n\n${limitContent.timeMessage}`,
            [{ text: t('common.ok'), style: 'default' }],
            undefined,
            { variant: 'warning', emoji: '\uD83D\uDD52' },
          );
        } else if (paywallSession.canShowPaywall()) {
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
            { variant: 'premium', emoji: '\u2728' },
          );
        }
      }
      return;
    }

    setSelectedScanType(scanType);
  };

  const performCameraCapture = useCallback(async () => {
    if (!cameraRef.current) {
      return null;
    }

    const captureFacing = facing;
    const photo = await cameraRef.current.takePictureAsync(getCapturePictureOptions());

    if (!photo) {
      return null;
    }

    return normalizeCapturedPhotoUri(photo.uri, captureFacing);
  }, [facing, normalizeCapturedPhotoUri]);

  const ensureSelectedTypeCanProceed = useCallback(
    (scanType: ScanType) => {
      const eligibility = scanEligibility?.[scanType];
      const hasWelcomeCredits = (eligibility?.welcome_credits || 0) > 0;
      const canScan = isAdmin || eligibility?.allowed || hasWelcomeCredits;
      const isSuperPremiumOnly =
        scanType === 'super' &&
        eligibility &&
        !getEligibilityNextRechargeAt(eligibility);
      const limitContent = eligibility ? getTimedLimitContent(eligibility) : null;

      if (canScan) {
        return true;
      }

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
            <SuperScanFeatureIcon color={colors.gold} size={31} />
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
            <SuperScanFeatureIcon color={colors.gold} size={30} />
          ) : undefined,
          { variant: 'premium', emoji: isSuperPremiumOnly ? null : '\u2728' },
        );
      }

      return false;
    },
    [colors.gold, getTimedLimitContent, isAdmin, router, scanEligibility, showAlert, t],
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
        { variant: 'info', emoji: '\uD83D\uDCF8' },
      );
      return;
    }

    const activeScanType = selectedScanType;

    if (!ensureSelectedTypeCanProceed(activeScanType)) {
      return;
    }

    captureSequenceActiveRef.current = true;
    setCaptureSequenceActive(true);
    setCheckingEligibility(true);

    try {
      void playValidationFeedback();

      const normalizedPhotoUri = await performCameraCapture();

      if (!normalizedPhotoUri) {
        throw new Error('CAPTURE_FAILED');
      }

      setOpeningPreview(true);
      openScanPreview(activeScanType, normalizedPhotoUri);
    } catch {
      showAlert(
        t('common.error'),
        t('scanner.error_taking_photo'),
        undefined,
        undefined,
        { variant: 'warning', emoji: '\uD83D\uDCF7' },
      );
    } finally {
      setOpeningPreview(false);
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
        { variant: 'info', emoji: '\uD83D\uDDBC\uFE0F' },
      );
      return;
    }

    if (!ensureSelectedTypeCanProceed(selectedScanType)) {
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
        openScanPreview(selectedScanType, result.assets[0].uri);
      }
    } catch {
      showAlert(
        t('common.error'),
        t('scanner.error_loading_image'),
        undefined,
        undefined,
        { variant: 'warning', emoji: '\uD83D\uDDBC\uFE0F' },
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

  const renderScanTypeChip = (scanType: ScanType) => {
    const isSelected = selectedScanType === scanType;
    const isSelectedSuper = scanType === 'super' && isSelected;
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
    const chipTheme = resolveScanFlowAccentTheme(colors, isDark, scanType);
    const welcomeCredits = eligibility?.welcome_credits || 0;
    const hasWelcomeCredits = welcomeCredits > 0;
    const hasQuota = hasScanQuotaPayload(quotaState);
    const isQuotaEmpty = hasQuota && quotaState.remaining === 0;
    const isPremiumLocked = scanType === 'super' && !isPremium;
    const quotaStatusLabelKey = getScanQuotaStatusLabelKey(quotaState);
    const nextRechargeAt = hasQuota
      ? quotaState.nextRechargeAt
      : getEligibilityNextRechargeAt(eligibility);
    const serverClockOffsetMs = hasQuota
      ? quotaState.serverClockOffsetMs
      : eligibility?.server_clock_offset_ms;
    const shouldShowInlineTimer =
      hasQuota &&
      quotaState.limit > 0 &&
      quotaState.remaining <= 0 &&
      !!nextRechargeAt &&
      !hasWelcomeCredits &&
      !(scanType === 'super' && !isPremium) &&
      !loadingByScanType[scanType];
    const inlineMetaText = hasQuota
      ? quotaState.remaining > 0
        ? `${quotaState.remaining}/${quotaState.limit}`
        : t('scan_limit.limit_reached')
      : t(quotaStatusLabelKey ?? 'scan_limit.missing_payload');
    const iconColor =
      isSelectedSuper
        ? SCANNER_TOKENS.superSelectedForeground
        : isSelected
        ? chipTheme.chipText
        : captureTheme.chromeText;

    return (
      <View key={scanType} style={styles.scanChipContainer}>
        <TouchableOpacity
          testID={scanType === 'super' ? 'scanner-super-scan-button' : undefined}
          style={[
            styles.scanChip,
            scanType === 'super' ? styles.scanChipSuper : null,
            {
              backgroundColor: isSelected
                ? isSelectedSuper
                  ? SCANNER_TOKENS.superSelectedBackground
                  : chipTheme.chipBackground
                : withAlpha(captureTheme.screenBackground, 0.72),
              borderColor: isSelected
                ? isSelectedSuper
                  ? SCANNER_TOKENS.superSelectedBorder
                  : chipTheme.chipBorder
                : captureTheme.chromeBorder,
              shadowColor: isSelected
                ? isSelectedSuper
                  ? SCANNER_TOKENS.superSelectedBorder
                  : chipTheme.completionGlow
                : 'transparent',
            },
            isSelected ? styles.scanChipSelected : null,
            isQuotaEmpty && !isSelected ? styles.scanChipDimmed : null,
          ]}
          onPress={() => handleScanTypeSelect(scanType)}
          disabled={interactionsLocked}
          activeOpacity={0.86}
        >
          <View
            style={[
              styles.scanChipIconWrap,
              {
                backgroundColor:
                  isSelectedSuper
                    ? withAlpha(SCANNER_TOKENS.superSelectedForeground, 0.14)
                    : isSelected
                    ? chipTheme.accentSoftBackground
                    : withAlpha(colors.white, 0.04),
                borderColor:
                  isSelectedSuper
                    ? withAlpha(SCANNER_TOKENS.superSelectedForeground, 0.18)
                    : isSelected
                    ? chipTheme.vignetteFrameBorder
                    : withAlpha(colors.white, 0.08),
              },
            ]}
          >
            {scanType === 'super' ? (
              <SuperScanFeatureIcon color={iconColor} size={15} strokeWidth={2.2} />
            ) : (
              <ResultIcon color={iconColor} size={15} token={SCAN_ICON_TOKENS[scanType]} />
            )}
          </View>

          <Text
            numberOfLines={1}
            style={[
              styles.scanChipText,
              isSelectedSuper ? styles.scanChipTextSuperSelected : null,
              {
                color: isSelected
                  ? isSelectedSuper
                    ? SCANNER_TOKENS.superSelectedForeground
                    : chipTheme.chipText
                  : captureTheme.chromeMutedText,
              },
            ]}
            testID={scanType === 'super' ? 'scanner-super-scan-label' : undefined}
          >
            {scanType === 'super' ? 'Super' : t(SCAN_TYPE_LABELS[scanType])}
          </Text>

          <View style={styles.scanChipIndicatorRow}>
            {isPremiumLocked ? (
              <View style={styles.scanChipIndicatorPill}>
                <Crown color={colors.gold} size={10} fill={colors.gold} />
              </View>
            ) : hasWelcomeCredits && !isAdmin ? (
              <View style={styles.scanChipIndicatorPill} testID="welcome-gift">
                <Gift color={colors.success} size={10} strokeWidth={2} />
              </View>
            ) : shouldShowInlineTimer && nextRechargeAt ? (
              <NextScanTimer
                nextAvailableDate={nextRechargeAt}
                mode="scannerChipCompact"
                serverClockOffsetMs={serverClockOffsetMs}
                onTimerComplete={() => handleTimerComplete(scanType, nextRechargeAt)}
              />
            ) : (
              <Text
                style={[
                  styles.scanChipMetaText,
                  {
                    color: isSelected
                      ? isSelectedSuper
                        ? SCANNER_TOKENS.superSelectedForeground
                        : chipTheme.chipText
                      : captureTheme.chromeMutedText,
                  },
                ]}
              >
                {inlineMetaText}
              </Text>
            )}
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  const guideTone: CameraGuideTone = {
    accentColor: accentTheme.guideStroke,
    warningColor: accentTheme.guideWarning,
    successColor: accentTheme.guideSuccess,
  };
  if (!permission) {
    return <LoadingSpinner />;
  }

  if (!permission.granted) {
    return (
      <ScreenState
        tone="info"
        layout="full"
        title={t('scanner.camera_permission_msg')}
        message={`${t('scanner.camera_permission_detail')}\n${t('scanner.camera_permission_backend')}\n${PUBLIC_PRIVACY_POLICY_URL}`}
        icon={<Camera />}
        actionLabel={t('scanner.authorize_camera')}
        onAction={requestPermission}
        secondaryActionLabel={t('settings.privacy_policy')}
        onSecondaryAction={() => router.push('/privacy-policy')}
        testID="scanner-permission-state"
      />
    );
  }

  return (
    <View style={styles.container}>
      {alertElement}

      <View style={styles.cameraShell}>
        {shouldMountCamera ? (
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing={facing}
            autofocus={captureSequenceActive ? 'on' : 'off'}
            animateShutter={false}
            mirror={false}
            onCameraReady={handleCameraReady}
            testID="scanner-camera-view"
          />
        ) : null}

        <View
          style={styles.cameraInteractionLayer}
          pointerEvents="none"
          testID="scanner-focus-overlay"
        >
          <CameraGuide
            scanType={selectedScanType}
            visible={!!selectedScanType}
            accentColor={accentTheme.guideStroke}
            tone={guideTone}
            viewportInsets={cameraGuideViewportInsets}
          />
        </View>

        <LinearGradient
          colors={captureTheme.topScrimGradient}
          pointerEvents="none"
          style={styles.topScrim}
        />
        <LinearGradient
          colors={captureTheme.bottomScrimGradient}
          pointerEvents="none"
          style={styles.bottomScrim}
        />

        <View style={styles.topBand} testID="scanner-top-band">
          {shouldShowConnectivityBanner ? (
            <TouchableOpacity
              style={styles.networkErrorBanner}
              onPress={handleManualRetry}
              disabled={isRetrying}
              activeOpacity={0.84}
              testID="scanner-network-banner"
            >
              {isRetrying ? (
                <RefreshCw color={colors.warning} size={15} strokeWidth={2} />
              ) : (
                <WifiOff color={colors.warning} size={15} strokeWidth={2} />
              )}
              <Text style={styles.networkErrorText}>
                {isRetrying
                  ? t('super_scan_features.connection_reconnecting')
                  : t('super_scan_features.connection_unstable')}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.bottomDock} testID="scanner-controls-overlay">
          <View style={styles.scanTypeSelector} testID="scanner-scan-type-selector">
            {renderScanTypeChip('health')}
            {renderScanTypeChip('body')}
            {renderScanTypeChip('nutrition')}
            {renderScanTypeChip('super')}
          </View>

          <View style={styles.controlsRow}>
            <TouchableOpacity
              style={styles.sideButton}
              onPress={pickImage}
              activeOpacity={0.78}
              disabled={interactionsLocked}
              testID="scanner-gallery-button"
            >
              <ImageIcon color={captureTheme.chromeText} size={24} strokeWidth={2} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.captureButton}
              onPress={takePicture}
              activeOpacity={0.82}
              disabled={interactionsLocked}
              testID="scanner-capture-button"
            >
              <View style={styles.captureButtonOuter} testID="scanner-capture-button-outer">
                <View style={styles.captureButtonInner} testID="scanner-capture-button-inner" />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sideButton}
              onPress={toggleCameraFacing}
              activeOpacity={0.78}
              disabled={interactionsLocked}
              testID="scanner-flip-camera-button"
            >
              <CameraFlipIcon
                size={28}
                color={captureTheme.chromeText}
                strokeWidth={2}
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <ContextualPaywall
        visible={paywallConfig.visible}
        onClose={() => setPaywallConfig((prev) => ({ ...prev, visible: false }))}
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
  isDark: boolean,
  insets: { top: number; bottom: number },
  isCompactVerticalLayout: boolean,
  captureTheme: ReturnType<typeof resolveScanCaptureVisualTheme>,
  accentTheme: ReturnType<typeof resolveScanFlowAccentTheme>,
) => {
  const dockMetrics = getScannerDockMetrics(insets.bottom, isCompactVerticalLayout);

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: captureTheme.screenBackground,
    },
    cameraShell: {
      flex: 1,
      backgroundColor: captureTheme.screenBackground,
    },
    camera: {
      ...StyleSheet.absoluteFillObject,
    },
    cameraInteractionLayer: {
      ...StyleSheet.absoluteFillObject,
    },
    topScrim: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: isCompactVerticalLayout ? 160 : 184,
    },
    bottomScrim: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: isCompactVerticalLayout ? 292 : 340,
    },
    topBand: {
      position: 'absolute',
      top: insets.top + SPACING.sm,
      left: SPACING.page,
      right: SPACING.page,
      gap: SPACING.sm,
    },
    networkErrorBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'center',
      maxWidth: '100%',
      backgroundColor: captureTheme.instructionCardBackground,
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.md,
      borderRadius: BORDER_RADIUS.pill,
      gap: SPACING.sm,
      borderWidth: 1,
      borderColor: withAlpha(colors.warning, 0.2),
    },
    networkErrorText: {
      fontSize: SIZES.text12,
      color: captureTheme.chromeText,
      fontWeight: FONT_WEIGHTS.semiBold,
      flexShrink: 1,
    },
    bottomDock: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: dockMetrics.dockBottomOffset,
      paddingHorizontal: SPACING.page,
      alignItems: 'center',
      gap: dockMetrics.dockGap,
    },
    scanTypeSelector: {
      flexDirection: 'row',
      alignItems: 'stretch',
      justifyContent: 'center',
      width: '100%',
      maxWidth: 456,
      gap: SPACING.sm,
    },
    scanChipContainer: {
      flex: 1,
      maxWidth: 92,
      minWidth: 0,
    },
    scanChip: {
      minHeight: isCompactVerticalLayout
        ? SCANNER_COMPACT_SCAN_CHIP_HEIGHT
        : SCANNER_REGULAR_SCAN_CHIP_HEIGHT,
      borderRadius: BORDER_RADIUS.card,
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.sm,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACING.xs,
    },
    scanChipSelected: {
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.24,
      shadowRadius: 18,
      elevation: 6,
    },
    scanChipSuper: {
      borderWidth: 1.5,
    },
    scanChipDimmed: {
      opacity: 0.78,
    },
    scanChipIconWrap: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
    },
    scanChipText: {
      fontSize: 11,
      fontWeight: FONT_WEIGHTS.semiBold,
      fontFamily: FONTS.display,
      textAlign: 'center',
      lineHeight: 13,
      letterSpacing: 0.18,
      width: '100%',
    },
    scanChipTextSuperSelected: {
      color: SCANNER_TOKENS.superSelectedForeground,
    },
    scanChipIndicatorRow: {
      minHeight: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scanChipIndicatorPill: {
      minWidth: 20,
      height: 16,
      paddingHorizontal: 4,
      borderRadius: 9999,
      backgroundColor: withAlpha(colors.white, 0.06),
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
    },
    scanChipIndicatorDot: {
      width: 6,
      height: 6,
      borderRadius: 9999,
    },
    scanChipIndicatorDotMuted: {
      backgroundColor: withAlpha(colors.white, 0.18),
    },
    scanChipMetaText: {
      fontSize: SIZES.text10,
      fontWeight: FONT_WEIGHTS.bold,
      fontFamily: FONTS.accent,
      lineHeight: 12,
      letterSpacing: 0.2,
    },
    controlsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: '100%',
      maxWidth: 332,
      gap: SPACING.lg,
      paddingHorizontal: 0,
    },
    sideButton: {
      width: isCompactVerticalLayout ? 50 : 54,
      height: isCompactVerticalLayout ? 50 : 54,
      borderRadius: isCompactVerticalLayout ? 25 : 27,
      backgroundColor: captureTheme.secondaryButtonBackground,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: captureTheme.secondaryButtonBorder,
    },
    captureButton: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    captureButtonOuter: {
      width: dockMetrics.captureButtonSize,
      height: dockMetrics.captureButtonSize,
      borderRadius: dockMetrics.captureButtonSize / 2,
      borderWidth: 3,
      borderColor: captureTheme.shutterOuter,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: withAlpha(colors.white, 0.08),
      shadowColor: accentTheme.completionGlow,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.38,
      shadowRadius: 24,
      elevation: 8,
    },
    captureButtonInner: {
      width: isCompactVerticalLayout ? 60 : 64,
      height: isCompactVerticalLayout ? 60 : 64,
      borderRadius: isCompactVerticalLayout ? 30 : 32,
      backgroundColor: captureTheme.shutterInner,
      borderWidth: 1,
      borderColor: withAlpha(captureTheme.shutterInner, 0.16),
    },
  });
};
