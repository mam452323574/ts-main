import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import {
  AlertCircle,
  ArrowLeft,
} from 'lucide-react-native';

import { Button } from '@/components/Button';
import {
  ChefResultCard,
  resolveChefModeTheme,
  resolveChefSurfaceColors,
  type ChefModeTheme,
} from '@/components/fridge/ChefResultCard';
import { ChefModeIcon } from '@/components/fridge/ChefModeIcon';
import { ModalHandle } from '@/components/ModalHandle';
import { OptimizedImage } from '@/components/OptimizedImage';
import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SHADOWS,
  SIZES,
  SPACING,
  withAlpha,
} from '@/constants/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useFridgeScanRecord } from '@/hooks/queries/useFridgeScanRecord';
import {
  FRIDGE_MEAL_MODES,
  isFridgeMealMode,
  type FridgeMealMode,
} from '@/types/fridgeScan';
import {
  getResultLayoutState,
  getResultSurfaceChrome,
  type ResultLayoutState,
} from '@/utils/resultLayout';
import { logOperationalInfo } from '@/utils/observability';
import { resolvePremiumRenderStateFromProfile } from '@/utils/subscription';

type RouteParamValue = string | string[] | undefined;

const DEFAULT_MODE: FridgeMealMode = 'diet';
const PENDING_PROGRESS_MAX = 96;
const PENDING_PROGRESS_INTERVAL_MS = 450;
const PENDING_PROGRESS_COMPLETE_DWELL_MS = 160;
const PROGRESS_ANIMATION_MIN_MS = 320;
const PROGRESS_ANIMATION_MAX_MS = 700;

const AnimatedView = Animated.createAnimatedComponent(View);

function parseRouteParam(value: RouteParamValue) {
  return typeof value === 'string'
    ? value
    : Array.isArray(value)
      ? value[0]
      : undefined;
}

function parseModeParam(value: RouteParamValue): FridgeMealMode {
  const rawMode = parseRouteParam(value);
  return isFridgeMealMode(rawMode) ? rawMode : DEFAULT_MODE;
}

function clampProgress(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getProgressAnimationDuration(from: number, to: number) {
  const delta = Math.abs(to - from);
  const distanceRatio = Math.min(1, delta / 40);
  return Math.round(
    PROGRESS_ANIMATION_MIN_MS +
      (PROGRESS_ANIMATION_MAX_MS - PROGRESS_ANIMATION_MIN_MS) * distanceRatio,
  );
}

export default function FridgeScanResultScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { colors: themeColors, isDark } = useTheme();
  const { userProfile, loading: authLoading } = useAuth();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const layout = useMemo(() => getResultLayoutState(width), [width]);
  const colors = useMemo(
    () => resolveChefSurfaceColors(themeColors, isDark),
    [isDark, themeColors],
  );
  const fridgeScanId = parseRouteParam(params.fridgeScanId);
  const selectedModeParam = parseModeParam(params.selectedMode);
  const imageUri = parseRouteParam(params.imageUri);
  const scanQuery = useFridgeScanRecord(fridgeScanId ?? null);
  const hadPendingStateRef = useRef(false);
  const lastStateLogRef = useRef<string | null>(null);
  const completionDwellTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldHoldCompletedProgressRef = useRef(false);
  const [pendingProgress, setPendingProgress] = useState(0);
  const [isCompletionDismissed, setIsCompletionDismissed] = useState(false);
  const record = scanQuery.data;
  const selectedMode =
    record?.selected_mode && FRIDGE_MEAL_MODES.includes(record.selected_mode)
      ? record.selected_mode
      : selectedModeParam;
  const modeTheme = useMemo(
    () => resolveChefModeTheme(selectedMode, colors, isDark),
    [colors, isDark, selectedMode],
  );
  const styles = useMemo(
    () => createStyles(colors, insets, isDark, modeTheme, layout),
    [colors, insets, isDark, modeTheme, layout],
  );
  const premiumRenderState = resolvePremiumRenderStateFromProfile(
    userProfile,
    authLoading,
  );

  const handleClose = () => {
    router.replace('/(tabs)' as any);
  };

  const handleNewScan = () => {
    router.replace('/scan-frigo' as any);
  };

  const handlePremiumPress = () => {
    router.push('/premium-upgrade' as any);
  };

  const status = record?.status ?? 'queued';
  const mealResult = record?.meal_result ?? null;
  const hasFailed =
    scanQuery.isError || status === 'failed' || (status === 'processed' && !mealResult);
  const isPendingResult = scanQuery.isLoading || status === 'queued' || !mealResult;
  const shouldHoldCompletedProgress =
    !hasFailed &&
    !isPendingResult &&
    !!mealResult &&
    hadPendingStateRef.current &&
    !isCompletionDismissed;
  const displayedProgress = shouldHoldCompletedProgress ? 100 : pendingProgress;

  const clearCompletionDwellTimeout = useCallback(() => {
    if (!completionDwellTimeoutRef.current) {
      return;
    }

    clearTimeout(completionDwellTimeoutRef.current);
    completionDwellTimeoutRef.current = null;
  }, []);

  const handleCompletionAnimationEnd = useCallback(() => {
    if (!shouldHoldCompletedProgressRef.current) {
      return;
    }

    clearCompletionDwellTimeout();
    completionDwellTimeoutRef.current = setTimeout(() => {
      completionDwellTimeoutRef.current = null;
      setIsCompletionDismissed(true);
    }, PENDING_PROGRESS_COMPLETE_DWELL_MS);
  }, [clearCompletionDwellTimeout]);

  useEffect(() => {
    clearCompletionDwellTimeout();
    hadPendingStateRef.current = false;
    setPendingProgress(0);
    setIsCompletionDismissed(false);
  }, [clearCompletionDwellTimeout, fridgeScanId]);

  useEffect(() => () => {
    clearCompletionDwellTimeout();
  }, [clearCompletionDwellTimeout]);

  useEffect(() => {
    shouldHoldCompletedProgressRef.current = shouldHoldCompletedProgress;

    if (!shouldHoldCompletedProgress) {
      clearCompletionDwellTimeout();
    }
  }, [clearCompletionDwellTimeout, shouldHoldCompletedProgress]);

  useEffect(() => {
    if (!fridgeScanId) {
      return;
    }

    const logKey = [
      fridgeScanId,
      status,
      selectedMode,
      mealResult ? 'meal' : 'no-meal',
      record?.error_code ?? 'no-error',
      scanQuery.isLoading ? 'loading' : 'ready',
      scanQuery.isError ? 'query-error' : 'query-ok',
    ].join(':');

    if (lastStateLogRef.current === logKey) {
      return;
    }

    lastStateLogRef.current = logKey;
    logOperationalInfo('[FridgeScanResultScreen] Fridge scan result state', {
      fridge_scan_id: fridgeScanId,
      status,
      selected_mode: selectedMode,
      has_meal_result: !!mealResult,
      is_loading: scanQuery.isLoading,
      is_error: scanQuery.isError,
      error_code: record?.error_code ?? undefined,
    });
  }, [
    fridgeScanId,
    mealResult,
    record?.error_code,
    scanQuery.isError,
    scanQuery.isLoading,
    selectedMode,
    status,
  ]);

  useEffect(() => {
    if (!fridgeScanId || hasFailed || !isPendingResult || shouldHoldCompletedProgress) {
      return undefined;
    }

    hadPendingStateRef.current = true;

    const interval = setInterval(() => {
      setPendingProgress((current) => {
        if (current >= PENDING_PROGRESS_MAX) {
          return PENDING_PROGRESS_MAX;
        }

        const step = current < 30 ? 7 : current < 72 ? 4 : 2;
        return Math.min(PENDING_PROGRESS_MAX, current + step);
      });
    }, PENDING_PROGRESS_INTERVAL_MS);

    return () => {
      clearInterval(interval);
    };
  }, [fridgeScanId, hasFailed, isPendingResult, shouldHoldCompletedProgress]);

  useEffect(() => {
    if (!shouldHoldCompletedProgress) {
      return;
    }

    setPendingProgress(100);
  }, [shouldHoldCompletedProgress]);

  if (!fridgeScanId || hasFailed) {
    return (
      <View style={styles.container}>
        <ModalHandle />
        <Header title={t('fridge_scan_result.title')} onClose={handleClose} />
        <View style={styles.stateContainer}>
          <View style={styles.stateCard}>
            <View style={[styles.stateIcon, { backgroundColor: withAlpha(colors.error, 0.12) }]}>
              <AlertCircle color={colors.error} size={28} strokeWidth={2.2} />
            </View>
            <Text style={styles.stateTitle}>
              {t('fridge_scan_result.error_title')}
            </Text>
            <Text style={styles.stateBody}>
              {t('fridge_scan_result.error_body')}
            </Text>
            <View style={styles.actionStack}>
              <Button
                title={t('fridge_scan_result.actions.new_scan')}
                onPress={handleNewScan}
              />
              <Button
                title={t('fridge_scan_result.actions.home')}
                onPress={handleClose}
                variant="outline"
              />
            </View>
          </View>
        </View>
      </View>
    );
  }

  if (isPendingResult || shouldHoldCompletedProgress) {
    return (
      <View style={styles.container}>
        <ModalHandle />
        <Header title={t('fridge_scan_result.title')} onClose={handleClose} />
        <View style={styles.stateContainer}>
          <LinearGradient
            colors={modeTheme.gradient}
            style={styles.pendingCard}
            testID="fridge-scan-result-pending-card"
          >
            {imageUri ? (
              <OptimizedImage
                source={{ uri: imageUri }}
                style={styles.pendingImage}
                recyclingKey={imageUri}
                testID="fridge-scan-result-pending-image"
              />
            ) : null}
            <View style={styles.modePill}>
              <ChefModeIcon mode={selectedMode} color={modeTheme.accent} />
              <Text style={styles.modePillText}>
                {t(`fridge_scan.mode_labels.${selectedMode}`)}
              </Text>
            </View>
            <ChefLoadingProgress
              key={fridgeScanId}
              targetProgress={displayedProgress}
              accentColor={modeTheme.accent}
              styles={styles}
              onCompleteAnimationEnd={handleCompletionAnimationEnd}
            />
            <Text style={styles.stateTitleLight}>
              {t('fridge_scan_result.queued_title')}
            </Text>
            <Text style={styles.stateBodyLight}>
              {t('fridge_scan_result.queued_body')}
            </Text>
          </LinearGradient>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ModalHandle />
      <Header title={t('fridge_scan_result.title')} onClose={handleClose} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.contentStack}>
          <ChefResultCard
            imageUri={imageUri}
            mealResult={mealResult}
            onPremiumPress={handlePremiumPress}
            premiumRenderState={premiumRenderState}
            selectedMode={selectedMode}
            t={t}
          />

          <View style={styles.actionStack}>
            <Button
              title={t('fridge_scan_result.actions.new_scan')}
              onPress={handleNewScan}
            />
            <Button
              title={t('fridge_scan_result.actions.home')}
              onPress={handleClose}
              variant="outline"
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function Header({ title, onClose }: { title: string; onClose: () => void }) {
  const { colors: themeColors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const layout = useMemo(() => getResultLayoutState(width), [width]);
  const colors = useMemo(
    () => resolveChefSurfaceColors(themeColors, isDark),
    [isDark, themeColors],
  );
  const styles = useMemo(
    () => createHeaderStyles(insets, layout, colors, isDark),
    [colors, insets, isDark, layout],
  );

  return (
    <View style={styles.header}>
      <TouchableOpacity
        accessibilityRole="button"
        onPress={onClose}
        style={styles.iconButton}
      >
        <ArrowLeft color={colors.primaryText} size={20} strokeWidth={2.2} />
      </TouchableOpacity>
      <Text numberOfLines={1} style={styles.headerTitle}>
        {title}
      </Text>
      <View style={styles.headerSpacer} />
    </View>
  );
}

type ChefLoadingProgressStyles = {
  pendingProgressBlock: StyleProp<ViewStyle>;
  pendingProgressValue: StyleProp<TextStyle>;
  pendingProgressTrack: StyleProp<ViewStyle>;
  pendingProgressFill: StyleProp<ViewStyle>;
};

function ChefLoadingProgress({
  targetProgress,
  accentColor,
  styles,
  onCompleteAnimationEnd,
}: {
  targetProgress: number;
  accentColor: string;
  styles: ChefLoadingProgressStyles;
  onCompleteAnimationEnd: () => void;
}) {
  const normalizedTargetProgress = clampProgress(targetProgress);
  const progress = useSharedValue(normalizedTargetProgress);
  const lastTargetRef = useRef(normalizedTargetProgress);
  const displayProgressRef = useRef(normalizedTargetProgress);
  const displayAnimationRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const [trackWidth, setTrackWidth] = useState(0);
  const [displayProgress, setDisplayProgress] = useState(
    normalizedTargetProgress,
  );

  const clearDisplayAnimation = useCallback(() => {
    if (!displayAnimationRef.current) {
      return;
    }

    clearInterval(displayAnimationRef.current);
    displayAnimationRef.current = null;
  }, []);

  const updateDisplayProgress = useCallback((value: number) => {
    const nextProgress = clampProgress(value);
    displayProgressRef.current = nextProgress;
    setDisplayProgress(nextProgress);
  }, []);

  useEffect(() => {
    const previousTarget = lastTargetRef.current;
    const nextTarget = Math.max(previousTarget, normalizedTargetProgress);

    if (nextTarget === previousTarget) {
      return;
    }

    const duration = getProgressAnimationDuration(previousTarget, nextTarget);
    lastTargetRef.current = nextTarget;
    progress.value = withTiming(
      nextTarget,
      {
        duration,
        easing: Easing.out(Easing.cubic),
      },
      (finished) => {
        if (finished && nextTarget >= 100) {
          runOnJS(onCompleteAnimationEnd)();
        }
      },
    );

    const displayStart = displayProgressRef.current;
    const displayDistance = nextTarget - displayStart;
    const startedAt = Date.now();

    clearDisplayAnimation();
    displayAnimationRef.current = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const animationProgress = Math.min(1, elapsed / duration);
      const easedProgress = 1 - Math.pow(1 - animationProgress, 3);

      updateDisplayProgress(displayStart + displayDistance * easedProgress);

      if (animationProgress >= 1) {
        if (nextTarget >= 100) {
          onCompleteAnimationEnd();
        }
        clearDisplayAnimation();
      }
    }, 16);
  }, [
    clearDisplayAnimation,
    normalizedTargetProgress,
    onCompleteAnimationEnd,
    progress,
    updateDisplayProgress,
  ]);

  useEffect(() => () => {
    clearDisplayAnimation();
  }, [clearDisplayAnimation]);

  useAnimatedReaction(
    () => Math.max(0, Math.min(100, Math.round(progress.value))),
    (currentProgress, previousProgress) => {
      if (currentProgress !== previousProgress) {
        runOnJS(updateDisplayProgress)(currentProgress);
      }
    },
    [progress, updateDisplayProgress],
  );

  const fillAnimatedStyle = useAnimatedStyle(() => {
    const fillRatio = Math.max(0, Math.min(1, progress.value / 100));
    const fillOffset = trackWidth > 0 ? -((1 - fillRatio) * trackWidth) / 2 : 0;

    return {
      opacity: trackWidth > 0 ? 1 : 0,
      transform: [
        { translateX: fillOffset },
        { scaleX: fillRatio },
      ],
    };
  }, [trackWidth]);

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{
        min: 0,
        max: 100,
        now: displayProgress,
      }}
      style={styles.pendingProgressBlock}
      testID="fridge-scan-result-progress"
    >
      <Text
        style={styles.pendingProgressValue}
        testID="fridge-scan-result-progress-value"
      >
        {displayProgress}%
      </Text>
      <View
        onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
        style={styles.pendingProgressTrack}
      >
        <AnimatedView
          style={[
            styles.pendingProgressFill,
            {
              backgroundColor: accentColor,
              width: trackWidth > 0 ? trackWidth : '100%',
            },
            fillAnimatedStyle,
          ]}
          testID="fridge-scan-result-progress-fill"
        />
      </View>
    </View>
  );
}

const createHeaderStyles = (
  insets: { top: number },
  layout: ResultLayoutState,
  colors: ReturnType<typeof resolveChefSurfaceColors>,
  isDark: boolean,
) =>
  StyleSheet.create({
    header: {
      minHeight: layout.headerMinHeight,
      paddingTop: insets.top + SPACING.xs,
      paddingHorizontal: SPACING.page,
      paddingBottom: SPACING.sm,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    iconButton: {
      width: layout.headerSlotSize,
      height: layout.headerSlotSize,
      borderRadius: layout.headerSlotSize / 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(colors.primaryText, isDark ? 0.06 : 0.04),
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: withAlpha(colors.primaryText, isDark ? 0.1 : 0.08),
    },
    headerTitle: {
      flex: 1,
      paddingHorizontal: SPACING.md,
      textAlign: 'center',
      color: colors.primaryText,
      fontSize: layout.headerTitleFontSize,
      lineHeight: layout.headerTitleLineHeight,
      fontWeight: FONT_WEIGHTS.semiBold,
      includeFontPadding: false,
    },
    headerSpacer: {
      width: layout.headerSlotSize,
      height: layout.headerSlotSize,
    },
  });

const createStyles = (
  colors: any,
  insets: { bottom: number },
  isDark: boolean,
  modeTheme: ChefModeTheme,
  layout: ResultLayoutState,
) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      paddingHorizontal: SPACING.page,
      paddingBottom: insets.bottom + SPACING.xxxl,
      gap: layout.contentGap,
    },
    contentStack: {
      gap: layout.contentGap,
    },
    stateContainer: {
      flex: 1,
      justifyContent: 'center',
      padding: SPACING.page,
    },
    stateCard: {
      alignItems: 'center',
      gap: layout.sectionGap,
      padding: layout.largeBlockPadding,
      borderRadius: layout.heroRadius,
      borderWidth: 1,
      ...getResultSurfaceChrome({
        colors,
        isDark,
        kind: 'hero',
        accentColor: colors.error,
      }),
    },
    stateIcon: {
      width: 58,
      height: 58,
      borderRadius: 29,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stateTitle: {
      color: colors.primaryText,
      fontSize: layout.sectionTitleFontSize,
      lineHeight: layout.sectionTitleLineHeight,
      fontWeight: FONT_WEIGHTS.bold,
      textAlign: 'center',
      includeFontPadding: false,
    },
    stateBody: {
      color: withAlpha(colors.primaryText, 0.7),
      fontSize: layout.bodyTextFontSize,
      lineHeight: layout.bodyTextLineHeight,
      textAlign: 'center',
      includeFontPadding: false,
    },
    stateTitleLight: {
      color: colors.primaryText,
      fontSize: layout.sectionTitleFontSize,
      lineHeight: layout.sectionTitleLineHeight,
      fontWeight: FONT_WEIGHTS.bold,
      textAlign: 'center',
      includeFontPadding: false,
    },
    stateBodyLight: {
      color: withAlpha(colors.primaryText, 0.76),
      fontSize: layout.bodyTextFontSize,
      lineHeight: layout.bodyTextLineHeight,
      textAlign: 'center',
      includeFontPadding: false,
    },
    pendingCard: {
      alignItems: 'center',
      gap: layout.sectionGap,
      padding: layout.largeBlockPadding,
      borderRadius: layout.heroRadius,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: withAlpha(modeTheme.accent, 0.22),
      ...SHADOWS.cardHover,
    },
    pendingImage: {
      width: layout.isCompact ? 116 : 132,
      height: layout.isCompact ? 140 : 160,
      borderRadius: layout.featureRadius,
      backgroundColor: colors.surfaceMuted,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: withAlpha(colors.primaryText, isDark ? 0.12 : 0.08),
    },
    pendingProgressBlock: {
      width: '100%',
      gap: SPACING.sm,
      paddingVertical: SPACING.xs,
    },
    pendingProgressValue: {
      color: colors.primaryText,
      fontSize: layout.heroScoreValueFontSize,
      lineHeight: layout.heroScoreValueLineHeight,
      fontWeight: FONT_WEIGHTS.bold,
      textAlign: 'center',
      includeFontPadding: false,
    },
    pendingProgressTrack: {
      width: '100%',
      height: 10,
      borderRadius: BORDER_RADIUS.full,
      overflow: 'hidden',
      backgroundColor: withAlpha(colors.primaryText, isDark ? 0.12 : 0.08),
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: withAlpha(colors.primaryText, isDark ? 0.16 : 0.12),
    },
    pendingProgressFill: {
      height: '100%',
      borderRadius: BORDER_RADIUS.full,
    },
    modePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs + 2,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: withAlpha(colors.primaryText, isDark ? 0.08 : 0.06),
      borderWidth: 1,
      borderColor: withAlpha(colors.primaryText, isDark ? 0.12 : 0.1),
    },
    modePillText: {
      color: colors.primaryText,
      fontSize: SIZES.text12,
      lineHeight: 16,
      fontWeight: FONT_WEIGHTS.semiBold,
      includeFontPadding: false,
    },
    actionStack: {
      width: '100%',
      gap: SPACING.sm,
      marginTop: SPACING.sm,
    },
  });
