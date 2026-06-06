import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Easing,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  X,
  Utensils,
  PersonStanding,
  ShieldCheck,
  Smile,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { ApiService, ApiError, ApiErrorType } from '@/services/api';
import { useQueryClient } from '@tanstack/react-query';
import { SuperScanFeatureIcon } from '@/components/FeatureIcons';
import { OptimizedImage } from '@/components/OptimizedImage';
import { LoadingMiniGame } from '@/components/loading/LoadingMiniGame';
import { resolveLoadingMiniGameHeight } from '@/components/loading/loadingMiniGameChrome';
import { useBadges } from '@/contexts/BadgeContext';
import { useGamification } from '@/contexts/GamificationContext';
import { ScanType } from '@/types';
import { SCAN_PREVIEW_MIN_LOADING_MS, SCAN_TYPE_LABELS } from '@/constants/scan';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAdsGate } from '@/contexts/AdsContext';
import {
  SIZES,
  SPACING,
  BORDER_RADIUS,
  FONTS,
  FONT_WEIGHTS,
} from '@/constants/theme';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { primeCoachScansCache } from '@/utils/coachScanQueries';
import { getMinimumBottomInsetPadding } from '@/utils/mobileLayout';
import {
  logExpectedFailure,
  logOperationalError,
} from '@/utils/observability';
import { invalidateScanRelatedQueries } from '@/utils/scanRelatedQueries';
import {
  resolveScanCaptureVisualTheme,
  resolveScanFlowAccentTheme,
  resolveScanPreviewVisualTheme,
} from '@/utils/scanFlowVisualTheme';
import {
  SCAN_PREVIEW_LOADING_PHASES,
  resolveScanPreviewLoadingContent,
  type ScanPreviewLoadingPhaseKey,
} from '@/utils/scanPreviewLoadingConfig';
import { Squircle } from '@/components/Squircle';

const EXPECTED_SCAN_ERROR_TYPES: ReadonlySet<ApiErrorType> = new Set([
  'VALIDATION',
  'TYPE_MISMATCH',
  'AUTH',
]);

const VALID_SCAN_TYPES: ScanType[] = ['body', 'health', 'nutrition', 'super'];
const SCAN_MINI_GAME_DURATION_HINT_MS = 10000;

function resolveScanMiniGameSlotHeight(
  density: ScanPreviewLoadingDensity,
): number {
  const base = resolveLoadingMiniGameHeight(true, 'scan');
  const extra =
    density === 'regular'
      ? 330
      : density === 'compact'
        ? 270
        : 84;
  return base + extra;
}

function renderScanTypeIcon(scanType: ScanType, color: string, size: number) {
  if (scanType === 'super') {
    return <SuperScanFeatureIcon color={color} size={size} />;
  }

  if (scanType === 'health') {
    return <Smile color={color} size={size} />;
  }

  if (scanType === 'body') {
    return <PersonStanding color={color} size={size} />;
  }

  return <Utensils color={color} size={size} />;
}

function getLocalizedPreviewStepLabels(
  locale: string,
): Record<ScanPreviewLoadingPhaseKey, string> {
  if (locale.startsWith('fr')) {
    return {
      verification: 'Vérification',
      upload: 'Envoi sécurisé',
      analysis: 'Analyse',
      preparing: 'Résultat',
    };
  }

  return {
    verification: 'Verification',
    upload: 'Secure upload',
    analysis: 'Analysis',
    preparing: 'Results',
  };
}

type ScanPreviewLoadingDensity = 'regular' | 'compact' | 'tight' | 'ultraTight';

interface ScanPreviewLoadingDensityMetrics {
  topPadding: number;
  bottomPadding: number;
  horizontalPadding: number;
  heroMaxWidth: number;
  heroMarginBottom: number;
  heroHeight: number;
  heroRadius: number;
  metaInset: number;
  metaPaddingHorizontal: number;
  metaPaddingVertical: number;
  metaIconSize: number;
  metaIconGlyphSize: number;
  metaTextSize: number;
  progressMaxWidth: number;
  progressMinHeight: number;
  progressRadius: number;
  progressPaddingVertical: number;
  progressPaddingHorizontal: number;
  eyebrowSize: number;
  eyebrowMarginBottom: number;
  percentageSize: number;
  percentageLineHeight: number;
  percentageMarginBottom: number;
  headlineSize: number;
  headlineLineHeight: number;
  headlineMarginBottom: number;
  subtextSize: number;
  subtextLineHeight: number;
  subtextPaddingHorizontal: number;
  subtextMarginBottom: number;
  progressBarHeight: number;
  progressBarMarginBottom: number;
  stepsGap: number;
  stepsMarginBottom: number;
  stepPillGap: number;
  stepPillPaddingHorizontal: number;
  stepPillPaddingVertical: number;
  stepTextSize: number;
  trustLineGap: number;
  trustLinePaddingHorizontal: number;
  trustLinePaddingVertical: number;
  trustLineRadius: number;
  trustLineMarginBottom: number;
  trustIconSize: number;
  trustTextSize: number;
  trustTextLineHeight: number;
  insightsLabelSize: number;
  insightsLabelMarginBottom: number;
  chipsGap: number;
  chipPaddingHorizontal: number;
  chipPaddingVertical: number;
  chipTextSize: number;
}

const SCAN_PREVIEW_LOADING_DENSITY_METRICS: Record<
  ScanPreviewLoadingDensity,
  ScanPreviewLoadingDensityMetrics
> = {
  regular: {
    topPadding: 48,
    bottomPadding: SPACING.xl,
    horizontalPadding: SPACING.xl,
    heroMaxWidth: 380,
    heroMarginBottom: SPACING.xl,
    heroHeight: 176,
    heroRadius: BORDER_RADIUS.hero,
    metaInset: SPACING.lg,
    metaPaddingHorizontal: SPACING.md,
    metaPaddingVertical: SPACING.sm,
    metaIconSize: 28,
    metaIconGlyphSize: 16,
    metaTextSize: SIZES.text14,
    progressMaxWidth: 420,
    progressMinHeight: 0,
    progressRadius: 36,
    progressPaddingVertical: 20,
    progressPaddingHorizontal: 28,
    eyebrowSize: SIZES.text12,
    eyebrowMarginBottom: SPACING.sm,
    percentageSize: 70,
    percentageLineHeight: 76,
    percentageMarginBottom: SPACING.xs,
    headlineSize: SIZES.xl,
    headlineLineHeight: 30,
    headlineMarginBottom: SPACING.md,
    subtextSize: SIZES.text14,
    subtextLineHeight: 21,
    subtextPaddingHorizontal: SPACING.lg,
    subtextMarginBottom: SPACING.lg,
    progressBarHeight: 8,
    progressBarMarginBottom: SPACING.md,
    stepsGap: SPACING.sm,
    stepsMarginBottom: 0,
    stepPillGap: 8,
    stepPillPaddingHorizontal: SPACING.sm + 2,
    stepPillPaddingVertical: SPACING.sm,
    stepTextSize: SIZES.text12,
    trustLineGap: SPACING.sm,
    trustLinePaddingHorizontal: SPACING.md,
    trustLinePaddingVertical: SPACING.md,
    trustLineRadius: BORDER_RADIUS.xl,
    trustLineMarginBottom: SPACING.lg,
    trustIconSize: 16,
    trustTextSize: SIZES.text12,
    trustTextLineHeight: 18,
    insightsLabelSize: SIZES.text12,
    insightsLabelMarginBottom: SPACING.md,
    chipsGap: SPACING.sm,
    chipPaddingHorizontal: SPACING.md,
    chipPaddingVertical: SPACING.sm,
    chipTextSize: SIZES.text14,
  },
  compact: {
    topPadding: 28,
    bottomPadding: SPACING.lg,
    horizontalPadding: SPACING.lg,
    heroMaxWidth: 340,
    heroMarginBottom: SPACING.lg,
    heroHeight: 132,
    heroRadius: 30,
    metaInset: SPACING.md,
    metaPaddingHorizontal: SPACING.sm + 2,
    metaPaddingVertical: 7,
    metaIconSize: 26,
    metaIconGlyphSize: 15,
    metaTextSize: 13,
    progressMaxWidth: 390,
    progressMinHeight: 0,
    progressRadius: 32,
    progressPaddingVertical: 16,
    progressPaddingHorizontal: 22,
    eyebrowSize: SIZES.text12,
    eyebrowMarginBottom: 6,
    percentageSize: 60,
    percentageLineHeight: 66,
    percentageMarginBottom: 3,
    headlineSize: SIZES.text20,
    headlineLineHeight: 25,
    headlineMarginBottom: SPACING.sm,
    subtextSize: 13,
    subtextLineHeight: 19,
    subtextPaddingHorizontal: SPACING.sm,
    subtextMarginBottom: SPACING.md,
    progressBarHeight: 7,
    progressBarMarginBottom: SPACING.sm,
    stepsGap: 7,
    stepsMarginBottom: 0,
    stepPillGap: 7,
    stepPillPaddingHorizontal: 9,
    stepPillPaddingVertical: 6,
    stepTextSize: SIZES.text12,
    trustLineGap: SPACING.sm,
    trustLinePaddingHorizontal: SPACING.md,
    trustLinePaddingVertical: 10,
    trustLineRadius: 22,
    trustLineMarginBottom: SPACING.md,
    trustIconSize: 15,
    trustTextSize: SIZES.text12,
    trustTextLineHeight: 18,
    insightsLabelSize: SIZES.text12,
    insightsLabelMarginBottom: SPACING.sm,
    chipsGap: SPACING.sm,
    chipPaddingHorizontal: SPACING.md,
    chipPaddingVertical: 7,
    chipTextSize: 13,
  },
  tight: {
    topPadding: 18,
    bottomPadding: SPACING.sm,
    horizontalPadding: SPACING.md,
    heroMaxWidth: 304,
    heroMarginBottom: SPACING.md,
    heroHeight: 104,
    heroRadius: 26,
    metaInset: SPACING.sm,
    metaPaddingHorizontal: SPACING.sm,
    metaPaddingVertical: 6,
    metaIconSize: 24,
    metaIconGlyphSize: 14,
    metaTextSize: SIZES.text12,
    progressMaxWidth: 360,
    progressMinHeight: 0,
    progressRadius: 28,
    progressPaddingVertical: 12,
    progressPaddingHorizontal: 18,
    eyebrowSize: 11,
    eyebrowMarginBottom: 4,
    percentageSize: 46,
    percentageLineHeight: 52,
    percentageMarginBottom: 2,
    headlineSize: SIZES.text18,
    headlineLineHeight: 22,
    headlineMarginBottom: SPACING.sm,
    subtextSize: 12,
    subtextLineHeight: 18,
    subtextPaddingHorizontal: 0,
    subtextMarginBottom: SPACING.sm,
    progressBarHeight: 6,
    progressBarMarginBottom: 6,
    stepsGap: 6,
    stepsMarginBottom: 0,
    stepPillGap: 6,
    stepPillPaddingHorizontal: 8,
    stepPillPaddingVertical: 5,
    stepTextSize: 11,
    trustLineGap: 6,
    trustLinePaddingHorizontal: SPACING.sm,
    trustLinePaddingVertical: 8,
    trustLineRadius: BORDER_RADIUS.lg,
    trustLineMarginBottom: SPACING.sm,
    trustIconSize: 14,
    trustTextSize: 11,
    trustTextLineHeight: 16,
    insightsLabelSize: 11,
    insightsLabelMarginBottom: SPACING.sm,
    chipsGap: 6,
    chipPaddingHorizontal: SPACING.sm,
    chipPaddingVertical: 6,
    chipTextSize: SIZES.text12,
  },
  ultraTight: {
    topPadding: 10,
    bottomPadding: SPACING.sm,
    horizontalPadding: SPACING.md,
    heroMaxWidth: 284,
    heroMarginBottom: SPACING.sm,
    heroHeight: 88,
    heroRadius: 24,
    metaInset: SPACING.sm,
    metaPaddingHorizontal: 7,
    metaPaddingVertical: 5,
    metaIconSize: 22,
    metaIconGlyphSize: 13,
    metaTextSize: 11,
    progressMaxWidth: 344,
    progressMinHeight: 0,
    progressRadius: 24,
    progressPaddingVertical: 10,
    progressPaddingHorizontal: 16,
    eyebrowSize: 10,
    eyebrowMarginBottom: 3,
    percentageSize: 40,
    percentageLineHeight: 46,
    percentageMarginBottom: 1,
    headlineSize: SIZES.text16,
    headlineLineHeight: 20,
    headlineMarginBottom: 6,
    subtextSize: 11,
    subtextLineHeight: 16,
    subtextPaddingHorizontal: 0,
    subtextMarginBottom: 6,
    progressBarHeight: 5,
    progressBarMarginBottom: 5,
    stepsGap: 5,
    stepsMarginBottom: 0,
    stepPillGap: 5,
    stepPillPaddingHorizontal: 7,
    stepPillPaddingVertical: 4,
    stepTextSize: 10,
    trustLineGap: 6,
    trustLinePaddingHorizontal: SPACING.sm,
    trustLinePaddingVertical: 7,
    trustLineRadius: BORDER_RADIUS.md,
    trustLineMarginBottom: 6,
    trustIconSize: 13,
    trustTextSize: 10,
    trustTextLineHeight: 15,
    insightsLabelSize: 10,
    insightsLabelMarginBottom: 6,
    chipsGap: 5,
    chipPaddingHorizontal: 7,
    chipPaddingVertical: 5,
    chipTextSize: 11,
  },
};

function resolveScanPreviewLoadingDensity(
  usableHeight: number,
): ScanPreviewLoadingDensity {
  if (usableHeight < 620) {
    return 'ultraTight';
  }

  if (usableHeight < 700) {
    return 'tight';
  }

  if (usableHeight < 800) {
    return 'compact';
  }

  return 'regular';
}

export default function ScanPreviewScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { t, locale } = useLanguage();
  const { presentRewardedAdGate } = useAdsGate();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams();
  const imageUri = params.imageUri as string;
  const scanType = params.scanType as ScanType;
  const resolvedScanType = VALID_SCAN_TYPES.includes(scanType)
    ? scanType
    : 'health';
  const scanTypeLabel = t(SCAN_TYPE_LABELS[resolvedScanType]);
  const resolvedLocale = locale || 'fr';

  const [loading, setLoading] = useState(false);
  const { showAlert, alertElement } = useCustomAlert();
  const { setBadge } = useBadges();
  const { incrementScanCount } = useGamification();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isCompactVerticalLayout = windowHeight < 760;
  const isTightVerticalLayout = windowHeight < 700;
  const safeBottomInset = getMinimumBottomInsetPadding(
    insets.bottom,
    SPACING.sm,
  );
  const loadingUsableHeight = windowHeight - insets.top - safeBottomInset;
  const loadingDensity =
    resolveScanPreviewLoadingDensity(loadingUsableHeight);
  const loadingMetrics =
    SCAN_PREVIEW_LOADING_DENSITY_METRICS[loadingDensity];
  const previewTheme = useMemo(
    () => resolveScanPreviewVisualTheme(colors, isDark),
    [colors, isDark],
  );
  const captureTheme = useMemo(
    () => resolveScanCaptureVisualTheme(colors, isDark),
    [colors, isDark],
  );
  const accentTheme = useMemo(
    () => resolveScanFlowAccentTheme(colors, isDark, resolvedScanType),
    [colors, isDark, resolvedScanType],
  );
  const styles = useMemo(
    () =>
      createStyles(
        insets,
        isCompactVerticalLayout,
        isTightVerticalLayout,
        loadingDensity,
        loadingMetrics,
        previewTheme,
        captureTheme,
      ),
    [
      captureTheme,
      insets,
      isCompactVerticalLayout,
      isTightVerticalLayout,
      loadingDensity,
      loadingMetrics,
      previewTheme,
    ],
  );
  const previewStepLabels = useMemo(
    () => getLocalizedPreviewStepLabels(resolvedLocale),
    [resolvedLocale],
  );
  const [isApiComplete, setIsApiComplete] = useState(false);
  const [displayProgress, setDisplayProgress] = useState(0);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const completionGlowAnim = useRef(new Animated.Value(0)).current;
  const resolvedProgress = isApiComplete ? 100 : displayProgress;
  const loadingContent = useMemo(
    () => resolveScanPreviewLoadingContent(resolvedScanType, resolvedProgress),
    [resolvedProgress, resolvedScanType],
  );
  const shouldReserveScanMiniGameSlot =
    loading && loadingDensity !== 'ultraTight';
  const shouldShowScanMiniGame =
    shouldReserveScanMiniGameSlot && !isApiComplete;

  useEffect(() => {
    const listenerId = progressAnim.addListener(({ value }) => {
      setDisplayProgress(Math.round(value));
    });
    return () => {
      progressAnim.removeListener(listenerId);
    };
  }, [progressAnim]);

  useEffect(() => {
    if (!imageUri || !scanType || !VALID_SCAN_TYPES.includes(scanType)) {
      showAlert(t('common.error'), t('scan_preview.error_validation'), [
        {
          text: t('common.ok'),
          onPress: () => router.back(),
        },
      ]);
    }
  }, [imageUri, router, scanType, showAlert, t]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let animation: Animated.CompositeAnimation | undefined;

    progressAnim.stopAnimation();

    if (loading && !isApiComplete) {
      progressAnim.setValue(0);
      setDisplayProgress(0);

      animation = Animated.timing(progressAnim, {
        toValue: 90,
        duration: 25000,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      });
      animation.start();
    } else if (isApiComplete) {
      setDisplayProgress(100);

      animation = Animated.timing(progressAnim, {
        toValue: 100,
        duration: 300,
        easing: Easing.out(Easing.ease),
        useNativeDriver: false,
      });
      animation.start(({ finished }) => {
        if (finished) {
          setDisplayProgress(100);
        }
      });
    }

    return () => {
      animation?.stop();
    };
  }, [isApiComplete, loading, progressAnim]);

  useEffect(() => {
    completionGlowAnim.stopAnimation();
    completionGlowAnim.setValue(0);

    if (!loading || !isApiComplete) {
      return;
    }

    Animated.sequence([
      Animated.timing(completionGlowAnim, {
        toValue: 1,
        duration: 340,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(completionGlowAnim, {
        toValue: 0.45,
        duration: 420,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(completionGlowAnim, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();

    return () => {
      completionGlowAnim.stopAnimation();
    };
  }, [completionGlowAnim, isApiComplete, loading]);

  const getResolvedApiErrorMessage = useCallback(
    (error: ApiError, fallback: string) => {
      if (error.message.startsWith('api_errors.')) {
        return t(error.message);
      }

      return error.message || fallback;
    },
    [t],
  );

  const resolveScanErrorAlert = useCallback(
    (error: unknown) => {
      if (error instanceof ApiError) {
        switch (error.type) {
          case 'TYPE_MISMATCH':
            return {
              title: t('scan_preview.error_title_type'),
              message: getResolvedApiErrorMessage(
                error,
                t('scan_preview.error_msg_type'),
              ),
            };
          case 'AUTH':
            return {
              title: t('scan_preview.error_title_session'),
              message: t('scan_preview.error_msg_session'),
            };
          case 'NETWORK':
            return {
              title: t('scan_preview.error_title_network'),
              message: t('scan_preview.error_msg_network'),
            };
          case 'TIMEOUT':
            return {
              title: t('scan_preview.error_title_timeout'),
              message: t('scan_preview.error_msg_timeout'),
            };
          case 'UPLOAD':
            return {
              title: t('scan_preview.error_title_upload'),
              message: t('scan_preview.error_msg_upload'),
            };
          case 'PROVIDER':
            return {
              title: t('scan_preview.error_title_provider'),
              message: t('scan_preview.error_msg_provider'),
            };
          case 'DATABASE':
          case 'EDGE_FUNCTION':
            return {
              title: t('scan_preview.error_title_server'),
              message: t('scan_preview.error_msg_server'),
            };
          case 'VALIDATION':
            return {
              title: t('common.error'),
              message: getResolvedApiErrorMessage(
                error,
                t('scan_preview.error_validation'),
              ),
            };
          case 'ANALYSIS':
          case 'UNKNOWN':
          default:
            return {
              title: t('scan_preview.error_title_analysis'),
              message: getResolvedApiErrorMessage(
                error,
                t('scan_preview.error_msg_default'),
              ),
            };
        }
      }

      if (error instanceof Error) {
        return {
          title: t('common.error'),
          message: error.message || t('common.error'),
        };
      }

      return {
        title: t('common.error'),
        message: t('common.error'),
      };
    },
    [getResolvedApiErrorMessage, t],
  );

  const showScanErrorAlert = useCallback(
    (error: unknown) => {
      const resolvedError = error instanceof ApiError ? error : undefined;
      const logFn =
        resolvedError && EXPECTED_SCAN_ERROR_TYPES.has(resolvedError.type)
          ? logExpectedFailure
          : logOperationalError;

      logFn('[ScanPreviewScreen] Scan flow failed', error, {
        scan_type: resolvedScanType,
        error_type: resolvedError?.type,
        error_code: resolvedError?.code,
        error_status: resolvedError?.status,
        request_id: resolvedError?.requestId,
      });

      const { title, message } = resolveScanErrorAlert(error);
      showAlert(title, message, [
        {
          text: t('common.retry'),
          onPress: () => {
            void handleConfirm();
          },
        },
        {
          text: t('common.back'),
          style: 'cancel',
          onPress: () => router.back(),
        },
      ]);
    },
    [handleConfirm, resolveScanErrorAlert, resolvedScanType, router, showAlert, t],
  );

  async function handleConfirm() {
    if (loading) {
      return;
    }

    // Pub récompensée avant le scan (utilisateurs gratuits uniquement ; no-op
    // immédiat pour premium/admin). Un refus annule sans réserver de crédit.
    const adOutcome = await presentRewardedAdGate('scan');
    if (adOutcome === 'skipped') {
      return;
    }

    try {
      setLoading(true);
      setIsApiComplete(false);
      const minimumLoadingMs = SCAN_PREVIEW_MIN_LOADING_MS[resolvedScanType];

      const [result] = await Promise.all([
        ApiService.createScanWithAnalysis(imageUri, resolvedScanType, locale),
        new Promise((resolve) => setTimeout(resolve, minimumLoadingMs)),
      ]);

      if (result.analysisSucceeded && result.scan.analysis_result) {
        try {
          await incrementScanCount();
        } catch (error) {
          console.error(
            '[ScanPreviewScreen] Error incrementing local gamification count:',
            error,
          );
        }

        primeCoachScansCache(queryClient, result.scan);
        await invalidateScanRelatedQueries(queryClient);

        setIsApiComplete(true);
        await new Promise((resolve) => setTimeout(resolve, 300));

        setBadge('coach');

        timeoutRef.current = setTimeout(() => {
          const targetPath =
            resolvedScanType === 'super' ? '/super-scan-result' : '/scan-result';
          router.replace({
            pathname: targetPath,
            params: {
              analysisData: JSON.stringify(result.scan.analysis_result),
              imageUri,
              ...(result.scan?.id ? { scanId: String(result.scan.id) } : {}),
            },
          });
        }, 1500);
      } else {
        setLoading(false);
        showScanErrorAlert(result.analysisError);
      }
    } catch (err) {
      setLoading(false);
      showScanErrorAlert(err);
    }
  }

  const renderLoadingLayoutWrapper = (children: ReactNode) => {
    if (loadingDensity === 'ultraTight') {
      return (
        <ScrollView
          testID="scan-preview-loading-scroll-view"
          style={styles.loadingScrollView}
          contentContainerStyle={styles.loadingScrollContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {children}
        </ScrollView>
      );
    }

    return <View style={styles.loadingStaticWrapper}>{children}</View>;
  };

  return (
    <View
      style={[styles.container, { backgroundColor: previewTheme.screenBackground }]}
    >
      {alertElement}

      <LinearGradient
        colors={captureTheme.topScrimGradient}
        pointerEvents="none"
        style={styles.topScrim}
      />

      <View style={styles.header}>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => router.back()}
          testID="scan-preview-close-button"
        >
          <X color={previewTheme.closeButtonIcon} size={20} strokeWidth={2.5} />
        </TouchableOpacity>
      </View>

      <View style={styles.imageContainer} testID="scan-preview-image-container">
        <Squircle style={styles.imageFrame}>
          <OptimizedImage
            source={{ uri: imageUri }}
            style={styles.image}
            recyclingKey={imageUri}
            testID="scan-preview-image"
          />
          <View
            style={[
              styles.previewHeroMeta,
              {
                backgroundColor: accentTheme.heroPreviewMetaBackground,
                borderColor: accentTheme.heroPreviewMetaBorder,
              },
            ]}
          >
            <Squircle
              style={[
                styles.previewHeroMetaIcon,
                {
                  backgroundColor: accentTheme.accentSoftBackground,
                  borderColor: accentTheme.vignetteFrameBorder,
                },
              ]}
            >
              {renderScanTypeIcon(resolvedScanType, accentTheme.accentColor, 16)}
            </Squircle>
            <Text
              style={[
                styles.previewHeroMetaText,
                { color: accentTheme.heroPreviewMetaText },
              ]}
            >
              {scanTypeLabel}
            </Text>
          </View>
        </Squircle>
      </View>

      <BlurView
        intensity={80}
        tint={previewTheme.actionPanelTint}
        style={styles.blurContainer}
        testID="scan-preview-action-panel"
      >
        <View style={styles.buttonsContent}>
          <Squircle style={styles.infoCard}>
            <View style={styles.infoPillRow}>
              <View
                style={[
                  styles.infoPill,
                  {
                    backgroundColor: accentTheme.chipBackground,
                    borderColor: accentTheme.chipBorder,
                  },
                ]}
              >
                <Squircle
                  style={[
                    styles.infoPillIcon,
                    {
                      backgroundColor: accentTheme.accentSoftBackground,
                      borderColor: accentTheme.vignetteFrameBorder,
                    },
                  ]}
                >
                  {renderScanTypeIcon(
                    resolvedScanType,
                    accentTheme.accentColor,
                    14,
                  )}
                </Squircle>
                <Text
                  style={[styles.infoPillText, { color: accentTheme.chipText }]}
                >
                  {scanTypeLabel}
                </Text>
              </View>

              <View
                style={[
                  styles.infoPill,
                  {
                    backgroundColor: previewTheme.loadingTrustLineBackground,
                    borderColor: previewTheme.loadingTrustLineBorder,
                  },
                ]}
              >
                <ShieldCheck
                  color={accentTheme.trustLineAccent}
                  size={14}
                  strokeWidth={2}
                />
                <Text style={styles.infoPillMutedText}>
                  {resolvedLocale.startsWith('fr') ? 'Flux securise' : 'Secure flow'}
                </Text>
              </View>
            </View>

            <Text style={styles.infoLabel}>{t('scan_preview.type_label')}</Text>
            <Text style={styles.infoValue}>{scanTypeLabel}</Text>
            <Text style={styles.infoBody}>
              {resolvedLocale.startsWith('fr')
                ? "On n'envoie la photo qu'au moment de confirmer l'analyse."
                : 'The photo is only uploaded once you confirm the analysis.'}
            </Text>
          </Squircle>

          <TouchableOpacity
            style={[styles.actionButton, styles.primaryButton]}
            onPress={handleConfirm}
            disabled={loading}
            testID="confirm-button"
          >
            <Text style={styles.primaryButtonText}>
              {loading
                ? t('scan_preview.confirm_loading')
                : t('scan_preview.confirm_button')}
            </Text>
          </TouchableOpacity>

          {!loading ? (
            <TouchableOpacity
              style={[styles.actionButton, styles.secondaryButton]}
              onPress={() => router.back()}
            >
              <Text style={styles.secondaryButtonText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </BlurView>

      {loading ? (
        <View style={styles.loadingOverlay} testID="scan-preview-loading-overlay">
          <LinearGradient
            colors={previewTheme.loadingOverlayGradient}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
          />

          {renderLoadingLayoutWrapper(
            <View
              style={styles.loadingLayout}
              testID="scan-preview-loading-layout"
            >
            <View style={styles.loadingHeroShell}>
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.completionGlow,
                  {
                    opacity: completionGlowAnim,
                    transform: [
                      {
                        scale: completionGlowAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.96, 1.04],
                        }),
                      },
                    ],
                    backgroundColor: accentTheme.completionGlowSoft,
                    borderColor: accentTheme.completionGlow,
                  },
                ]}
              />

              <Squircle
                style={[
                  styles.loadingVignetteFrame,
                  {
                    backgroundColor: previewTheme.loadingVignetteBackground,
                    borderColor: accentTheme.vignetteFrameBorder,
                    shadowColor: previewTheme.loadingHeroShadowColor,
                  },
                ]}
                testID="scan-preview-loading-vignette"
              >
                <OptimizedImage
                  source={{ uri: imageUri }}
                  style={styles.loadingVignetteImage}
                  contentFit="cover"
                  recyclingKey={imageUri}
                  testID="scan-preview-loading-image"
                />
                <View
                  style={[
                    styles.loadingVignetteMeta,
                    {
                      backgroundColor: previewTheme.loadingVignetteMetaBackground,
                      borderColor: previewTheme.loadingVignetteMetaBorder,
                    },
                  ]}
                >
                  <Squircle
                    style={[
                      styles.loadingVignetteMetaIcon,
                      {
                        backgroundColor: accentTheme.accentSoftBackground,
                        borderColor: accentTheme.vignetteFrameBorder,
                      },
                    ]}
                  >
                    {renderScanTypeIcon(
                      resolvedScanType,
                      accentTheme.accentColor,
                      loadingMetrics.metaIconGlyphSize,
                    )}
                  </Squircle>
                  <Text style={styles.loadingVignetteMetaText}>
                    {scanTypeLabel}
                  </Text>
                </View>
              </Squircle>
            </View>

            <View style={styles.progressCardFrame}>
              <Squircle style={styles.progressContainer} testID="scan-preview-progress-card">
                <Text
                  testID="scan-preview-loading-percentage"
                  style={styles.progressDisplayValue}
                >
                  {`${resolvedProgress}%`}
                </Text>

                <View style={styles.progressBarWrapper}>
                  <View style={styles.progressBarBackground}>
                    <Animated.View
                      style={[
                        styles.progressBarFillContainer,
                        {
                          width: progressAnim.interpolate({
                            inputRange: [0, 100],
                            outputRange: ['0%', '100%'],
                          }),
                        },
                      ]}
                    >
                      <LinearGradient
                        colors={accentTheme.progressGradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.progressBarGradient}
                      />
                    </Animated.View>
                  </View>
                </View>

                <View style={styles.loadingStepsRow}>
                  {SCAN_PREVIEW_LOADING_PHASES.map((phase) => {
                    const isActive = loadingContent.phaseKey === phase.key;
                    const isCompleted = resolvedProgress > phase.maxProgress;

                    return (
                      <View
                        key={phase.key}
                        testID={`scan-preview-step-${phase.key}`}
                        style={[
                          styles.loadingStepPill,
                          {
                            backgroundColor: isActive || isCompleted
                              ? accentTheme.accentSoftBackground
                              : previewTheme.loadingStepBackground,
                            borderColor: isActive || isCompleted
                              ? accentTheme.vignetteFrameBorder
                              : previewTheme.loadingStepBorder,
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.loadingStepDot,
                            {
                              backgroundColor: isActive
                                ? accentTheme.dotActiveColor
                                : isCompleted
                                ? accentTheme.dotCompletedColor
                                : previewTheme.dotBackground,
                            },
                          ]}
                        />
                        <Text
                          style={[
                            styles.loadingStepText,
                            {
                              color: isActive || isCompleted
                                ? accentTheme.chipText
                                : previewTheme.loadingStepLabel,
                            },
                          ]}
                        >
                          {previewStepLabels[phase.key]}
                        </Text>
                      </View>
                    );
                  })}
                </View>

              </Squircle>
            </View>

            {shouldReserveScanMiniGameSlot ? (
              <View
                pointerEvents={shouldShowScanMiniGame ? 'auto' : 'none'}
                style={[
                  styles.scanMiniGameSlot,
                  !shouldShowScanMiniGame && styles.scanMiniGameSlotHidden,
                ]}
                testID="scan-preview-mini-game-slot"
              >
                {shouldShowScanMiniGame ? (
                  <LoadingMiniGame
                    accentColor={accentTheme.accentColor}
                    active
                    compact
                    durationHintMs={SCAN_MINI_GAME_DURATION_HINT_MS}
                    variant="scan"
                    cardHeight={resolveScanMiniGameSlotHeight(loadingDensity)}
                  />
                ) : null}
              </View>
            ) : null}
            </View>,
          )}
        </View>
      ) : null}
    </View>
  );
}

const createStyles = (
  insets: { top: number; bottom: number },
  isCompactVerticalLayout: boolean,
  isTightVerticalLayout: boolean,
  loadingDensity: ScanPreviewLoadingDensity,
  loadingMetrics: ScanPreviewLoadingDensityMetrics,
  previewTheme: ReturnType<typeof resolveScanPreviewVisualTheme>,
  captureTheme: ReturnType<typeof resolveScanCaptureVisualTheme>,
) => {
  const safeBottomInset = getMinimumBottomInsetPadding(insets.bottom, SPACING.sm);
  const imageBottomReserve =
    safeBottomInset + (isTightVerticalLayout ? 220 : isCompactVerticalLayout ? 236 : 304);
  const imageTopPadding =
    insets.top + (isTightVerticalLayout ? 44 : isCompactVerticalLayout ? 52 : 76);
  const isUltraTightLoading = loadingDensity === 'ultraTight';
  const loadingTopPadding = insets.top + loadingMetrics.topPadding;

  return StyleSheet.create({
    container: {
      flex: 1,
    },
    topScrim: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 220,
    },
    header: {
      position: 'absolute',
      top: insets.top + SPACING.sm,
      left: SPACING.xl,
      zIndex: 10,
    },
    closeButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: previewTheme.closeButtonBackground,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: previewTheme.closeButtonBorder, borderCurve: 'continuous',
    },
    imageContainer: {
      flex: 1,
      paddingHorizontal: isCompactVerticalLayout ? SPACING.lg : 20,
      paddingTop: imageTopPadding,
      paddingBottom: imageBottomReserve,
    },
    imageFrame: {
      flex: 1,
      borderRadius: 30,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: previewTheme.loadingTrustLineBorder,
      backgroundColor: previewTheme.loadingTrustLineBackground,
      shadowColor: previewTheme.loadingHeroShadowColor,
      shadowOffset: { width: 0, height: 20 },
      shadowOpacity: 0.24,
      shadowRadius: 40,
      elevation: 16, borderCurve: 'continuous',
    },
    image: {
      width: '100%',
      height: '100%',
      resizeMode: 'cover',
    },
    previewHeroMeta: {
      position: 'absolute',
      left: SPACING.lg,
      bottom: SPACING.lg,
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderRadius: BORDER_RADIUS.pill,
      borderWidth: 1, borderCurve: 'continuous',
    },
    previewHeroMetaIcon: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1, borderCurve: 'continuous',
    },
    previewHeroMetaText: {
      fontSize: SIZES.text14,
      fontWeight: FONT_WEIGHTS.semiBold,
      letterSpacing: 0.2,
    },
    blurContainer: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      borderTopLeftRadius: 34,
      borderTopRightRadius: 34,
      overflow: 'hidden',
      backgroundColor: previewTheme.actionPanelBackground,
      shadowColor: previewTheme.actionPanelShadowColor,
      shadowOffset: { width: 0, height: -8 },
      shadowOpacity: 0.12,
      shadowRadius: 22,
      elevation: 8,
      borderTopWidth: 1,
      borderColor: previewTheme.loadingTrustLineBorder, borderCurve: 'continuous',
    },
    buttonsContent: {
      paddingHorizontal: isCompactVerticalLayout ? SPACING.lg : SPACING.xl,
      paddingTop: isCompactVerticalLayout ? SPACING.xl : SPACING.xxl,
      paddingBottom: safeBottomInset + SPACING.lg,
    },
    infoCard: {
      alignItems: 'center',
      width: '100%',
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.lg,
      borderRadius: BORDER_RADIUS.card,
      borderWidth: 1,
      borderColor: previewTheme.loadingTrustLineBorder,
      backgroundColor: previewTheme.loadingTrustLineBackground,
      marginBottom: SPACING.xl,
      gap: SPACING.xs, borderCurve: 'continuous',
    },
    infoPillRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: SPACING.sm,
      marginBottom: SPACING.sm,
    },
    infoPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      paddingHorizontal: SPACING.sm + 2,
      paddingVertical: SPACING.sm,
      borderRadius: BORDER_RADIUS.pill,
      borderWidth: 1, borderCurve: 'continuous',
    },
    infoPillIcon: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1, borderCurve: 'continuous',
    },
    infoPillText: {
      fontSize: SIZES.text12,
      fontWeight: FONT_WEIGHTS.semiBold,
      fontFamily: FONTS.display,
      letterSpacing: 0.2,
    },
    infoPillMutedText: {
      fontSize: SIZES.text12,
      fontWeight: FONT_WEIGHTS.medium,
      color: previewTheme.loadingTrustLineText,
    },
    infoLabel: {
      fontSize: SIZES.text12,
      color: previewTheme.infoLabelColor,
      fontWeight: FONT_WEIGHTS.medium,
      fontFamily: FONTS.accent,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    infoValue: {
      fontSize: 26,
      fontWeight: FONT_WEIGHTS.bold,
      fontFamily: FONTS.display,
      color: previewTheme.infoValueColor,
      letterSpacing: 0.4,
    },
    infoBody: {
      fontSize: SIZES.text14,
      lineHeight: 20,
      textAlign: 'center',
      color: previewTheme.loadingSubtext,
      maxWidth: 320,
    },
    actionButton: {
      height: 56,
      borderRadius: 28,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: SPACING.md, borderCurve: 'continuous',
    },
    primaryButton: {
      backgroundColor: captureTheme.primaryButtonBackground,
      borderWidth: 1,
      borderColor: captureTheme.primaryButtonBorder,
      shadowColor: captureTheme.shadowColor,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.22,
      shadowRadius: 20,
      elevation: 8,
    },
    primaryButtonText: {
      color: captureTheme.primaryButtonText,
      fontSize: SIZES.text16,
      fontWeight: FONT_WEIGHTS.semiBold,
    },
    secondaryButton: {
      backgroundColor: previewTheme.secondaryButtonBackground,
      borderWidth: 1,
      borderColor: previewTheme.loadingTrustLineBorder,
    },
    secondaryButtonText: {
      color: previewTheme.secondaryButtonText,
      fontSize: SIZES.text16,
      fontWeight: FONT_WEIGHTS.medium,
    },
    loadingOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: previewTheme.loadingOverlayBackground,
      justifyContent: 'flex-start',
      paddingTop: loadingTopPadding,
      alignItems: 'center',
      zIndex: 999,
    },
    loadingStaticWrapper: {
      flex: 1,
      width: '100%',
    },
    loadingScrollView: {
      flex: 1,
      width: '100%',
    },
    loadingScrollContent: {
      flexGrow: 1,
      justifyContent: 'center',
    },
    loadingLayout: {
      flex: isUltraTightLoading ? 0 : 1,
      width: '100%',
      paddingBottom: safeBottomInset + loadingMetrics.bottomPadding,
      paddingHorizontal: loadingMetrics.horizontalPadding,
      alignItems: 'center',
      justifyContent: loadingDensity === 'regular' ? 'flex-start' : 'center',
    },
    loadingHeroShell: {
      position: 'relative',
      width: '100%',
      maxWidth: loadingMetrics.heroMaxWidth,
      marginBottom: loadingMetrics.heroMarginBottom,
    },
    loadingVignetteFrame: {
      width: '100%',
      height: loadingMetrics.heroHeight,
      borderRadius: loadingMetrics.heroRadius,
      borderWidth: 1,
      overflow: 'hidden',
      shadowOffset: { width: 0, height: 18 },
      shadowOpacity: 0.22,
      shadowRadius: 30,
      elevation: 18, borderCurve: 'continuous',
    },
    loadingVignetteImage: {
      width: '100%',
      height: '100%',
    },
    loadingVignetteMeta: {
      position: 'absolute',
      left: loadingMetrics.metaInset,
      bottom: loadingMetrics.metaInset,
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      paddingHorizontal: loadingMetrics.metaPaddingHorizontal,
      paddingVertical: loadingMetrics.metaPaddingVertical,
      borderRadius: BORDER_RADIUS.pill,
      borderWidth: 1, borderCurve: 'continuous',
    },
    loadingVignetteMetaIcon: {
      width: loadingMetrics.metaIconSize,
      height: loadingMetrics.metaIconSize,
      borderRadius: loadingMetrics.metaIconSize / 2,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1, borderCurve: 'continuous',
    },
    loadingVignetteMetaText: {
      color: previewTheme.loadingVignetteMetaText,
      fontSize: loadingMetrics.metaTextSize,
      fontWeight: FONT_WEIGHTS.semiBold,
      letterSpacing: 0.2,
    },
    progressCardFrame: {
      width: '100%',
      maxWidth: loadingMetrics.progressMaxWidth,
    },
    scanMiniGameSlot: {
      width: '100%',
      maxWidth: loadingMetrics.progressMaxWidth,
      height: resolveScanMiniGameSlotHeight(loadingDensity),
      marginTop: loadingDensity === 'tight' ? SPACING.sm : SPACING.md,
      overflow: 'hidden',
    },
    scanMiniGameSlotHidden: {
      opacity: 0,
    },
    completionGlow: {
      position: 'absolute',
      top: -12,
      right: -12,
      bottom: -12,
      left: -12,
      borderRadius: 44,
      borderWidth: 1, borderCurve: 'continuous',
    },
    progressContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      minHeight: loadingMetrics.progressMinHeight,
      backgroundColor: previewTheme.progressCardBackground,
      borderRadius: loadingMetrics.progressRadius,
      paddingVertical: loadingMetrics.progressPaddingVertical,
      paddingHorizontal: loadingMetrics.progressPaddingHorizontal,
      borderWidth: 1,
      borderColor: previewTheme.progressCardBorder,
      overflow: 'hidden',
      shadowColor: previewTheme.progressCardShadowColor,
      shadowOffset: { width: 0, height: 18 },
      shadowOpacity: 0.2,
      shadowRadius: 34,
      elevation: 30, borderCurve: 'continuous',
    },
    progressDisplayValue: {
      fontSize: loadingMetrics.percentageSize,
      lineHeight: loadingMetrics.percentageLineHeight,
      fontWeight: FONT_WEIGHTS.bold,
      fontFamily: FONTS.display,
      color: previewTheme.loadingProgressValue,
      textAlign: 'center',
      letterSpacing: 0,
      marginBottom: loadingMetrics.percentageMarginBottom,
    },
    progressBarWrapper: {
      width: '100%',
      marginBottom: loadingMetrics.progressBarMarginBottom,
    },
    progressBarBackground: {
      width: '100%',
      height: loadingMetrics.progressBarHeight,
      backgroundColor: previewTheme.progressTrackBackground,
      borderRadius: 999,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: previewTheme.progressTrackBorder, borderCurve: 'continuous',
    },
    progressBarFillContainer: {
      height: '100%',
      borderRadius: 999,
      overflow: 'hidden', borderCurve: 'continuous',
    },
    progressBarGradient: {
      flex: 1,
      borderRadius: 999, borderCurve: 'continuous',
    },
    loadingStepsRow: {
      width: '100%',
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: loadingMetrics.stepsGap,
      marginBottom: loadingMetrics.stepsMarginBottom,
    },
    loadingStepPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: loadingMetrics.stepPillGap,
      paddingHorizontal: loadingMetrics.stepPillPaddingHorizontal,
      paddingVertical: loadingMetrics.stepPillPaddingVertical,
      borderRadius: BORDER_RADIUS.pill,
      borderWidth: 1, borderCurve: 'continuous',
    },
    loadingStepDot: {
      width: 7,
      height: 7,
      borderRadius: 999, borderCurve: 'continuous',
    },
    loadingStepText: {
      fontSize: loadingMetrics.stepTextSize,
      fontWeight: FONT_WEIGHTS.semiBold,
      fontFamily: FONTS.display,
      letterSpacing: 0,
    },
  });
};
