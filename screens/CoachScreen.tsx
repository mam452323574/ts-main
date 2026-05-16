import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import {
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { History, ScanLine } from 'lucide-react-native';

import { CoachFeatureIcon } from '@/components/FeatureIcons';
import { AppScreen } from '@/components/AppScreen';
import { HeaderIconButton, ScreenHeader } from '@/components/ScreenHeader';
import { ScreenState } from '@/components/ScreenState';
import { CoachActionComposer } from '@/components/coach/CoachActionComposer';
import { CoachGuidanceCard } from '@/components/coach/CoachGuidanceCard';
import { CoachPersonaDetailsModal } from '@/components/coach/CoachPersonaDetailsModal';
import { CoachSettingsInline } from '@/components/coach/CoachSettingsInline';
import { LoadingMiniGame } from '@/components/loading/LoadingMiniGame';
import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SIZES,
  SPACING,
  getMainPageChrome,
  withAlpha,
} from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useCoachGeneration } from '@/hooks/queries/useCoachGeneration';
import {
  COACH_SCREEN_SNAPSHOT_QUERY_KEY,
  useCoachScreenSnapshot,
} from '@/hooks/queries/useCoachScreenSnapshot';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { useSmoothLoadingProgress } from '@/hooks/useSmoothLoadingProgress';
import { trackEvent } from '@/services/analytics';
import {
  COACH_NO_USABLE_SCAN_ERROR_CODE,
  getCoachEntryFailureDebugInfo,
  getCoachQuotaFromError,
  getCoachServiceErrorDebugInfo,
  isCoachProviderUnavailableEntry,
  isCoachProviderUnavailableError,
  isCoachQuotaExhaustedError,
  resolveCoachFailureKindFromEntry,
  resolveCoachFailureKindFromError,
  type CoachFailureKind,
} from '@/services/coach';
import { markCoachSeen } from '@/services/growthExperience';
import { getCoachPersonaVisual } from '@/shared/coachPersonaVisuals';
import {
  COACH_FREE_QUESTION_MAX_LENGTH,
  COACH_QUESTION_MAX_LENGTH,
  getCoachQuestionDefinition,
  getCoachQuestionTimeOfDay,
  isCoachQuestionForPromptType,
  normalizeCoachQuestionKey,
  normalizeCoachQuestionText,
  rankCoachQuestionsForPromptType,
  resolveCoachQuestionSelection,
  resolveCoachQuestionText,
} from '@/shared/coachQuestions';
import {
  COACH_PROMPT_TYPES,
  DEFAULT_COACH_PROMPT_TYPE,
  FREE_QUESTION_PROMPT_TYPE,
  normalizeCoachGenerationPromptType,
  normalizeCoachPromptType,
  resolveVisibleCoachPromptType,
  type CoachGenerationPromptType,
  type CoachPromptCategory,
} from '@/shared/coachPromptTypes';
import {
  decodeScanCoachIntentParam,
  type ScanCoachIntent,
} from '@/utils/scanCoachIntent';
import { resolveCoachSubmitIntent } from '@/utils/coachSubmitIntent';
import type {
  CoachEntry,
  CoachPersonaKey,
  CoachPrimaryMetricDelta,
  CoachPromptType,
  CoachQuestionKey,
  CoachStructuredContent,
} from '@/types';
import { isRenderableCoachEntry } from '@/utils/coachHistory';
import {
  resolveCoachEntryPersonaPresentation,
  resolveCoachPersonaPresentation,
} from '@/utils/coachEntryPersona';
import { formatCoachTimestamp } from '@/utils/coachFormatting';
import {
  getCoachPersonaOptionsForProfile,
  isCoachPersonaLockedForProfile,
  resolveCoachPersonaDefinitionForProfile,
  resolveCoachPersonaKeyFromProfile,
} from '@/utils/coachPersona';
import { isCoachPromptTypeLockedForProfile } from '@/utils/coachPromptType';
import {
  resolveCoachCtaLabel,
  resolveCoachDisclaimerText,
  resolveCoachUserFacingErrorMessage,
} from '@/utils/coachLocalization';
import { resolveCoachCtaRoute } from '@/utils/coachRoutes';
import { getMainTabBarMetrics } from '@/utils/mainTabBarMetrics';

const PROMPT_TYPES: readonly CoachPromptType[] = COACH_PROMPT_TYPES;
const DEFAULT_PROMPT_TYPE: CoachPromptType = DEFAULT_COACH_PROMPT_TYPE;
const COACH_SCREEN_ENTRIES_LIMIT = 10;
const COACH_GENERATION_LOADING_DURATION_MS = 30_000;
const COACH_GENERATION_LOADING_HOLD_PERCENT = 97;
const COACH_GENERATION_LOADING_FINISH_DURATION_MS = 450;

function shouldDebugCoachScreen() {
  return (
    typeof __DEV__ !== 'undefined' && __DEV__ && process.env.NODE_ENV !== 'test'
  );
}

type CoachGuidanceViewModel = {
  title: string;
  body: string;
  disclaimer: string;
  persona_key: CoachPersonaKey;
  prompt_type: CoachGenerationPromptType | null;
  question_text: string | null;
  content: CoachStructuredContent | null;
  primary_metric_delta: CoachPrimaryMetricDelta | null;
  cta_label: string | null;
  cta_route: string | null;
  cached: boolean;
  fallback: boolean;
  renderedAt: string | null;
};

type CoachGuidanceSource = 'mutation' | 'tracked' | 'latest_ready';
type CoachLoadErrorSource = 'entries' | 'scans' | 'latest_ready' | 'none';
type CoachQuestionSelectionMode = 'preset' | 'free_text';

type CoachRenderableCandidate = {
  status?: CoachEntry['status'] | null;
  title?: string | null;
  body?: string | null;
};

type CoachScreenProps = {
  variant?: 'stack' | 'tab';
};

type CoachScanResultContext = {
  source: 'scan_result';
  scanId: string | null;
  scanType: string | null;
  priorityMetric: string | null;
  scanIntent: ScanCoachIntent | null;
  generationPromptType: CoachGenerationPromptType | null;
  routeSignature: string;
  autoSubmit: boolean;
};

type CoachScanResultRouteRequest = CoachScanResultContext & {
  promptType: CoachPromptType;
  fallbackPromptType: CoachPromptType | null;
  questionKey: CoachQuestionKey | null;
  questionText: string | null;
  signature: string;
};

function readCoachRouteParam(value: unknown) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  return typeof rawValue === 'string' && rawValue.trim().length > 0
    ? rawValue.trim()
    : null;
}

function readCoachRouteBooleanParam(value: unknown) {
  const normalizedValue = readCoachRouteParam(value)?.toLowerCase();
  return (
    normalizedValue === '1' ||
    normalizedValue === 'true' ||
    normalizedValue === 'yes'
  );
}

function normalizeCoachRoutePromptType(
  value: unknown,
): CoachPromptType | null {
  return normalizeCoachPromptType(value);
}

function normalizeCoachRouteGenerationPromptType(
  value: unknown,
): CoachGenerationPromptType | null {
  return normalizeCoachGenerationPromptType(value);
}

function clampCoachRouteQuestionText(value: string | null) {
  const normalizedText = normalizeCoachQuestionText(value);
  if (!normalizedText) {
    return null;
  }

  return Array.from(normalizedText)
    .slice(0, COACH_QUESTION_MAX_LENGTH)
    .join('');
}

function resolveScanResultFallbackQuestion(options: {
  priorityMetric?: string | null;
  t: (scope: string) => string;
}) {
  const hasPriorityMetric = !!options.priorityMetric?.trim();
  return options.t(
    hasPriorityMetric
      ? 'coach.questions.scan_result_improve'
      : 'coach.questions.scan_result_maintain',
  );
}

function hasRenderableCoachContent(
  entry: CoachRenderableCandidate | null | undefined,
): entry is CoachRenderableCandidate & { title: string; body: string } {
  return (
    !!entry &&
    (entry.status ?? 'ready') === 'ready' &&
    typeof entry.title === 'string' &&
    entry.title.trim().length > 0 &&
    typeof entry.body === 'string' &&
    entry.body.trim().length > 0
  );
}

function resolveCoachErrorBodyTranslationKey(failureKind: CoachFailureKind) {
  switch (failureKind) {
    case 'provider_request_failed':
      return 'coach.error_body_provider_unreachable';
    case 'invalid_provider_response':
      return 'coach.error_body_invalid_response';
    case 'provider_unavailable':
    case 'generic':
    default:
      return 'coach.error_body';
  }
}

function formatCoachQuotaDuration(remainingMs: number) {
  const totalMinutes = Number.isFinite(remainingMs)
    ? Math.max(0, Math.ceil(remainingMs / 60_000))
    : 0;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function formatCoachQuotaRemainingFromIso(nextRechargeAt: string | null | undefined) {
  if (!nextRechargeAt) {
    return null;
  }

  const targetMs = Date.parse(nextRechargeAt);
  return Number.isFinite(targetMs)
    ? formatCoachQuotaDuration(targetMs - Date.now())
    : null;
}

function useCoachQuotaCountdown(
  nextRechargeAt: string | null | undefined,
  onElapsed: () => void,
) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const elapsedRechargeRef = useRef<string | null>(null);

  useEffect(() => {
    setNowMs(Date.now());

    if (!nextRechargeAt) {
      elapsedRechargeRef.current = null;
      return undefined;
    }

    const intervalId = setInterval(() => {
      setNowMs(Date.now());
    }, 30_000);

    return () => clearInterval(intervalId);
  }, [nextRechargeAt]);

  useEffect(() => {
    if (!nextRechargeAt) {
      return;
    }

    const targetMs = Date.parse(nextRechargeAt);
    if (!Number.isFinite(targetMs)) {
      return;
    }

    if (targetMs <= nowMs && elapsedRechargeRef.current !== nextRechargeAt) {
      elapsedRechargeRef.current = nextRechargeAt;
      onElapsed();
    }
  }, [nextRechargeAt, nowMs, onElapsed]);

  if (!nextRechargeAt) {
    return null;
  }

  const targetMs = Date.parse(nextRechargeAt);
  if (!Number.isFinite(targetMs)) {
    return null;
  }

  return formatCoachQuotaDuration(targetMs - nowMs);
}

export default function CoachScreen({ variant = 'stack' }: CoachScreenProps = {}) {
  const router = useRouter();
  const routeParams = useLocalSearchParams();
  const queryClient = useQueryClient();
  const { user, userProfile, updateCoachPersona } = useAuth();
  const { colors, isDark } = useTheme();
  const { locale, t } = useLanguage();
  const { alertElement, showAlert } = useCustomAlert();
  const insets = useSafeAreaInsets();
  const coachAlertIcon = (
    <CoachFeatureIcon color={colors.primary} size={30} strokeWidth={2.3} />
  );
  const showBackButton = variant === 'stack';
  const [trackedEntryId, setTrackedEntryId] = useState<string | null>(null);
  const loadingWasActiveRef = useRef(false);
  const trackedEntryTerminalInvalidationRef = useRef<string | null>(null);
  const [expandedPromptType, setExpandedPromptType] =
    useState<CoachPromptType | null>(null);
  const [selectedQuestionKey, setSelectedQuestionKey] =
    useState<CoachQuestionKey | null>(null);
  const [questionSelectionMode, setQuestionSelectionModeState] =
    useState<CoachQuestionSelectionMode | null>(null);
  const [freeQuestionDraft, setFreeQuestionDraft] = useState('');
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [submittingPromptType, setSubmittingPromptType] =
    useState<CoachPromptType | null>(null);
  const [pendingPersonaKey, setPendingPersonaKey] =
    useState<CoachPersonaKey | null>(null);
  const [previewedPersonaKey, setPreviewedPersonaKey] =
    useState<CoachPersonaKey | null>(null);
  const [displayMode, setDisplayMode] = useState<'settings' | 'result'>(
    'settings',
  );
  const [scanResultContext, setScanResultContext] =
    useState<CoachScanResultContext | null>(null);
  const [actionBarHeight, setActionBarHeight] = useState(0);
  const appliedScanResultRouteSignatureRef = useRef<string | null>(null);
  const autoSubmitAttemptedRouteSignatureRef = useRef<string | null>(null);
  const pendingAutoSubmitRef = useRef(false);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const questionInputYRef = useRef(0);
  const questionScrollFrameRef = useRef<number | null>(null);
  const coachGeneration = useCoachGeneration();
  const setQuestionSelectionMode = useCallback(
    (mode: CoachQuestionSelectionMode | null) => {
      setQuestionSelectionModeState(mode);
    },
    [],
  );

  const cancelScheduledQuestionScroll = useCallback(() => {
    if (questionScrollFrameRef.current === null) {
      return;
    }

    cancelAnimationFrame(questionScrollFrameRef.current);
    questionScrollFrameRef.current = null;
  }, []);

  const scrollQuestionInputIntoView = useCallback(() => {
    cancelScheduledQuestionScroll();
    questionScrollFrameRef.current = requestAnimationFrame(() => {
      questionScrollFrameRef.current = null;
      scrollViewRef.current?.scrollTo({
        y: Math.max(questionInputYRef.current - SPACING.md, 0),
        animated: true,
      });
    });
  }, [cancelScheduledQuestionScroll]);

  const handleQuestionInputLayout = useCallback(
    ({ nativeEvent: { layout } }: LayoutChangeEvent) => {
      questionInputYRef.current = Math.max(Math.round(layout.y), 0);
    },
    [],
  );

  useEffect(() => {
    trackEvent('coach_opened');
    void markCoachSeen();
  }, []);

  useEffect(
    () => () => {
      cancelScheduledQuestionScroll();
    },
    [cancelScheduledQuestionScroll],
  );

  useEffect(() => {
    if (Platform.OS === 'web') {
      return undefined;
    }

    const handleKeyboardShow = () => {
      setIsKeyboardVisible(true);
      if (questionSelectionMode === 'free_text') {
        scrollQuestionInputIntoView();
      }
    };

    const handleKeyboardHide = () => {
      setIsKeyboardVisible(false);
    };

    const keyboardShowSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      handleKeyboardShow,
    );
    const keyboardHideSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      handleKeyboardHide,
    );

    return () => {
      keyboardShowSubscription.remove();
      keyboardHideSubscription.remove();
    };
  }, [questionSelectionMode, scrollQuestionInputIntoView]);

  const scanResultRouteRequest = useMemo<CoachScanResultRouteRequest | null>(() => {
    const source = readCoachRouteParam(routeParams.source);
    const scanIntentParam = decodeScanCoachIntentParam(
      routeParams.scanIntent ?? routeParams.scan_intent,
    );
    const scanId =
      readCoachRouteParam(routeParams.selectedScanId) ??
      readCoachRouteParam(routeParams.scanId) ??
      scanIntentParam?.scan_id ??
      null;
    if (source !== 'scan_result') {
      return null;
    }

    const scanType = readCoachRouteParam(routeParams.scanType);
    const priorityMetric = readCoachRouteParam(routeParams.priorityMetric);
    const autoSubmit = readCoachRouteBooleanParam(
      routeParams.autoSubmit ?? routeParams.auto_submit,
    );
    const generationPromptType =
      normalizeCoachRouteGenerationPromptType(
        readCoachRouteParam(routeParams.promptType),
      ) ??
      normalizeCoachRouteGenerationPromptType(scanIntentParam?.prompt_type) ??
      DEFAULT_PROMPT_TYPE;
    const promptType = resolveVisibleCoachPromptType(generationPromptType);
    const fallbackPromptType =
      normalizeCoachRoutePromptType(
        readCoachRouteParam(routeParams.fallback_prompt_type) ??
          readCoachRouteParam(routeParams.fallbackPromptType),
      ) ??
      normalizeCoachRoutePromptType(scanIntentParam?.fallback_prompt_type) ??
      null;
    const questionKey = normalizeCoachQuestionKey(
      readCoachRouteParam(routeParams.questionKey) ??
        scanIntentParam?.question_key,
    );
    const questionText = clampCoachRouteQuestionText(
      readCoachRouteParam(routeParams.question_text) ??
        readCoachRouteParam(routeParams.question) ??
        readCoachRouteParam(routeParams.questionText) ??
        scanIntentParam?.question_text ??
        null,
    );
    const signature = JSON.stringify({
      source,
      scanId,
      scanType,
      priorityMetric,
      scanIntent: scanIntentParam,
      generationPromptType,
      autoSubmit,
      promptType,
      fallbackPromptType,
      questionKey,
      questionText,
    });

    return {
      source: 'scan_result',
      scanId,
      scanType,
      priorityMetric,
      scanIntent: scanIntentParam,
      generationPromptType,
      routeSignature: signature,
      autoSubmit,
      promptType,
      fallbackPromptType,
      questionKey,
      questionText,
      signature,
    };
  }, [
    routeParams.autoSubmit,
    routeParams.auto_submit,
    routeParams.fallbackPromptType,
    routeParams.fallback_prompt_type,
    routeParams.priorityMetric,
    routeParams.promptType,
    routeParams.question,
    routeParams.questionKey,
    routeParams.questionText,
    routeParams.question_text,
    routeParams.scanId,
    routeParams.scan_intent,
    routeParams.scanIntent,
    routeParams.scanType,
    routeParams.selectedScanId,
    routeParams.source,
  ]);

  const previewProfile = useMemo(() => {
    if (!pendingPersonaKey || !userProfile) {
      return userProfile;
    }

    return {
      ...userProfile,
      coach_persona_key: pendingPersonaKey,
    };
  }, [pendingPersonaKey, userProfile]);

  const activePersonaKey = useMemo(
    () => resolveCoachPersonaKeyFromProfile(previewProfile),
    [previewProfile],
  );
  const coachSnapshotQuery = useCoachScreenSnapshot({
    personaKey: activePersonaKey,
    locale,
    trackedEntryId,
    entriesLimit: COACH_SCREEN_ENTRIES_LIMIT,
  });
  const isTrackedEntryStale = coachSnapshotQuery.isTrackedEntryStale === true;
  const coachSnapshot = coachSnapshotQuery.data;
  const refetchCoachSnapshot = coachSnapshotQuery.refetch;
  const snapshotError = coachSnapshotQuery.error;
  const entriesData = coachSnapshot?.entries;
  const entriesError = snapshotError;
  const isEntriesLoading = coachSnapshotQuery.isLoading;
  const isEntriesFetching = coachSnapshotQuery.isFetching;
  const entries = entriesData ?? [];
  const hasEntriesData = entriesData !== undefined;
  const coachQuota = coachSnapshot?.quota;
  const coachQuotaError = snapshotError;
  const refetchCoachQuota = refetchCoachSnapshot;
  const recentScansData = coachSnapshot?.recentScans;
  const recentScansError = snapshotError;
  const isScansLoading = coachSnapshotQuery.isLoading;
  const isScansFetching = coachSnapshotQuery.isFetching;
  const recentScans = recentScansData ?? [];
  const hasRecentScansData = recentScansData !== undefined;
  const hasUsableCoachScans = recentScans.length > 0;
  const hasConfirmedNoUsableCoachScans =
    hasRecentScansData &&
    !hasUsableCoachScans;
  const hasScanResultSelectedScan =
    !!scanResultRouteRequest?.scanId || !!scanResultContext?.scanId;
  const handleCoachQuotaRechargeElapsed = useCallback(() => {
    void refetchCoachQuota();
  }, [refetchCoachQuota]);
  const coachQuotaCountdownLabel = useCoachQuotaCountdown(
    coachQuota?.next_recharge_at,
    handleCoachQuotaRechargeElapsed,
  );
  const isCoachQuotaExhausted =
    !!coachQuota &&
    !coachQuota.unlimited &&
    (coachQuota.available ?? 0) <= 0;
  const isCoachQuotaUnknown = !coachQuota;
  const isCoachQuotaUnavailable = !!coachQuotaError && !coachQuota;
  const activePersonaLocked = useMemo(
    () => isCoachPersonaLockedForProfile(activePersonaKey, userProfile),
    [activePersonaKey, userProfile],
  );
  const activePersona = useMemo(
    () => resolveCoachPersonaDefinitionForProfile(previewProfile),
    [previewProfile],
  );
  const activePersonaVisual = useMemo(
    () => getCoachPersonaVisual(activePersonaKey),
    [activePersonaKey],
  );
  const tabBarMetrics = useMemo(() => getMainTabBarMetrics(insets.bottom), [insets.bottom]);
  const coachChrome = useMemo(
    () => getMainPageChrome(colors, isDark, 'coach'),
    [colors, isDark],
  );
  const coachCanvas = isDark ? coachChrome.canvasElevated : coachChrome.canvas;
  const styles = useMemo(
    () =>
      createStyles(
        colors,
        isDark,
        insets,
        variant,
        activePersonaVisual.haloTint,
        isKeyboardVisible,
      ),
    [activePersonaVisual.haloTint, colors, insets, isDark, isKeyboardVisible, variant],
  );
  const actionBarBottomOffset =
    !isKeyboardVisible && variant === 'tab'
      ? tabBarMetrics.topOffsetFromBottom + SPACING.xs
      : 0;
  const resolvedActionBarHeight = Math.max(actionBarHeight, 116);
  const actionBarOverlayInset = actionBarBottomOffset + resolvedActionBarHeight;
  const coachScrollIndicatorBottomInset = Math.max(
    SPACING.xl,
    actionBarOverlayInset + SPACING.sm,
  );
  const coachContentBottomPadding = Math.max(
    isKeyboardVisible ? SPACING.xxl + SPACING.sm : SPACING.xl + 4,
    actionBarOverlayInset + SPACING.md,
  );
  const personaOptions = useMemo(
    () => getCoachPersonaOptionsForProfile(previewProfile),
    [previewProfile],
  );
  const personaOptionsWithVisuals = useMemo(
    () =>
      personaOptions.map((persona) => ({
        ...persona,
        visual: getCoachPersonaVisual(persona.key),
      })),
    [personaOptions],
  );
  const selectedFirstPersonaOptionsWithVisuals = useMemo(() => {
    const selectedPersona = personaOptionsWithVisuals.find(
      (persona) => persona.key === activePersonaKey,
    );

    if (!selectedPersona) {
      return personaOptionsWithVisuals;
    }

    return [
      selectedPersona,
      ...personaOptionsWithVisuals.filter(
        (persona) => persona.key !== activePersonaKey,
      ),
    ];
  }, [activePersonaKey, personaOptionsWithVisuals]);
  const alternativePersonaOptions = useMemo(
    () =>
      personaOptionsWithVisuals.filter(
        (persona) => persona.key !== activePersonaKey,
      ),
    [activePersonaKey, personaOptionsWithVisuals],
  );
  const previewedPersona = useMemo(
    () =>
      previewedPersonaKey
        ? (personaOptionsWithVisuals.find(
            (persona) => persona.key === previewedPersonaKey,
          ) ?? null)
        : null,
    [personaOptionsWithVisuals, previewedPersonaKey],
  );
  const latestReadyEntryData = coachSnapshot
    ? coachSnapshot.latestReadyEntry
    : undefined;
  const latestReadyEntryError = snapshotError;
  const isLatestReadyEntryLoading = coachSnapshotQuery.isLoading;
  const latestReadyEntry = latestReadyEntryData ?? null;
  const hasLatestReadyEntryData = latestReadyEntryData !== undefined;
  const isPersonaSaving = pendingPersonaKey !== null;
  const generationGuidance: CoachGuidanceViewModel | null =
    !coachGeneration.isPending &&
    !coachGeneration.isError &&
    hasRenderableCoachContent(coachGeneration.data)
      ? {
          title: coachGeneration.data.title,
          body: coachGeneration.data.body,
          disclaimer: coachGeneration.data.disclaimer,
          persona_key: coachGeneration.data.persona_key,
          prompt_type: coachGeneration.data.prompt_type ?? null,
          question_text: coachGeneration.data.question_text ?? null,
          content: coachGeneration.data.content ?? null,
          primary_metric_delta:
            coachGeneration.data.content?.primary_metric_delta ?? null,
          cta_label: coachGeneration.data.cta_label,
          cta_route: coachGeneration.data.cta_route,
          cached: coachGeneration.data.cached,
          fallback: coachGeneration.data.fallback,
          renderedAt: null,
        }
      : null;
  const hasGenerationGuidance = !!generationGuidance;
  const resumablePendingEntry = useMemo(
    () =>
      entries.find(
        (entry) =>
          entry.persona_key === activePersonaKey &&
          (entry.status ?? 'pending') === 'pending',
      ) ?? null,
    [activePersonaKey, entries],
  );
  const shouldResumeTrackedEntry =
    trackedEntryId === null &&
    !submittingPromptType &&
    !coachGeneration.isPending &&
    !coachGeneration.isError &&
    !generationGuidance &&
    !!resumablePendingEntry;
  const effectiveTrackedEntryId =
    trackedEntryId ??
    (shouldResumeTrackedEntry ? (resumablePendingEntry?.id ?? null) : null);

  const trackedCoachEntry = useMemo(
    () =>
      effectiveTrackedEntryId
        ? (entries.find((entry) => entry.id === effectiveTrackedEntryId) ??
          (resumablePendingEntry?.id === effectiveTrackedEntryId
            ? resumablePendingEntry
            : null))
        : null,
    [effectiveTrackedEntryId, entries, resumablePendingEntry],
  );
  const trackedReadyEntry = useMemo(
    () =>
      isRenderableCoachEntry(trackedCoachEntry) ? trackedCoachEntry : null,
    [trackedCoachEntry],
  );
  const isTrackedEntryStaleFailure =
    effectiveTrackedEntryId !== null &&
    isTrackedEntryStale &&
    (!trackedCoachEntry ||
      (trackedCoachEntry.status ?? 'pending') === 'pending');
  const isTrackedEntryPending =
    effectiveTrackedEntryId !== null &&
    !isTrackedEntryStaleFailure &&
    (!trackedCoachEntry ||
      (trackedCoachEntry.status ?? 'pending') === 'pending');
  const isTrackedEntryError =
    trackedCoachEntry?.status === 'error' || isTrackedEntryStaleFailure;
  const hasGenerationFailure = effectiveTrackedEntryId
    ? isTrackedEntryError
    : coachGeneration.isError;
  const isGenerationAwaitingResult =
    coachGeneration.isPending || isTrackedEntryPending;
  const trackedCoachProviderUnavailable =
    isCoachProviderUnavailableEntry(trackedCoachEntry);
  const latestCoachEntry = entries[0] ?? null;
  const trackedGuidance: CoachGuidanceViewModel | null = trackedReadyEntry
    ? {
        title: trackedReadyEntry.title,
        body: trackedReadyEntry.body,
        disclaimer: trackedReadyEntry.disclaimer,
        persona_key: trackedReadyEntry.persona_key,
        prompt_type: trackedReadyEntry.prompt_type ?? null,
        question_text: trackedReadyEntry.question_text ?? null,
        content: trackedReadyEntry.content ?? null,
        primary_metric_delta:
          trackedReadyEntry.content?.primary_metric_delta ?? null,
        cta_label: trackedReadyEntry.cta_label,
        cta_route: trackedReadyEntry.cta_route,
        cached: false,
        fallback: false,
        renderedAt:
          trackedReadyEntry.generated_at ??
          trackedReadyEntry.created_at ??
          null,
    }
    : null;
  const hasTrackedGuidance = !!trackedGuidance;
  const hasCurrentGenerationReadyGuidance =
    hasGenerationGuidance || hasTrackedGuidance;
  const coachLoadingProgress = useSmoothLoadingProgress({
    active: isGenerationAwaitingResult || hasCurrentGenerationReadyGuidance,
    done: !isGenerationAwaitingResult && hasCurrentGenerationReadyGuidance,
    durationMs: COACH_GENERATION_LOADING_DURATION_MS,
    holdPercent: COACH_GENERATION_LOADING_HOLD_PERCENT,
    finishDurationMs: COACH_GENERATION_LOADING_FINISH_DURATION_MS,
  });
  const showCoachGenerationProgressState =
    coachLoadingProgress.shouldShowLoading;
  const latestReadyGuidance: CoachGuidanceViewModel | null = latestReadyEntry
    ? {
        title: latestReadyEntry.title,
        body: latestReadyEntry.body,
        disclaimer: latestReadyEntry.disclaimer,
        persona_key: latestReadyEntry.persona_key,
        prompt_type: latestReadyEntry.prompt_type ?? null,
        question_text: latestReadyEntry.question_text ?? null,
        content: latestReadyEntry.content ?? null,
        primary_metric_delta:
          latestReadyEntry.content?.primary_metric_delta ?? null,
        cta_label: latestReadyEntry.cta_label,
        cta_route: latestReadyEntry.cta_route,
        cached: true,
        fallback: false,
        renderedAt:
          latestReadyEntry.generated_at ?? latestReadyEntry.created_at ?? null,
      }
    : null;
  const canDisplayReadyGuidance =
    displayMode === 'result' &&
    !isGenerationAwaitingResult &&
    !hasGenerationFailure &&
    !showCoachGenerationProgressState;
  const activeGuidanceSource: CoachGuidanceSource | null =
    canDisplayReadyGuidance && generationGuidance
      ? 'mutation'
      : canDisplayReadyGuidance && trackedGuidance
        ? 'tracked'
        : canDisplayReadyGuidance && latestReadyGuidance
          ? 'latest_ready'
          : null;
  const activeGuidance: CoachGuidanceViewModel | null =
    canDisplayReadyGuidance && generationGuidance
      ? generationGuidance
      : canDisplayReadyGuidance && trackedGuidance
        ? trackedGuidance
        : canDisplayReadyGuidance
          ? latestReadyGuidance
          : null;
  const displayedGuidance = activeGuidance;
  const displayedGuidanceSource: CoachGuidanceSource | null =
    activeGuidanceSource;
  const displayedGuidanceVariant =
    displayedGuidanceSource === 'latest_ready'
      ? 'compact'
      : displayedGuidanceSource === 'mutation' ||
          displayedGuidanceSource === 'tracked'
        ? 'fresh'
        : null;
  const displayedGuidanceEyebrow =
    displayedGuidanceVariant === 'fresh'
      ? t('coach.response_label')
      : t('coach.latest_guidance_label');
  const displayedGuidancePersona = useMemo(() => {
    if (displayedGuidanceSource === 'tracked') {
      return resolveCoachEntryPersonaPresentation(trackedReadyEntry);
    }

    if (displayedGuidanceSource === 'latest_ready') {
      return resolveCoachEntryPersonaPresentation(latestReadyEntry);
    }

    return resolveCoachPersonaPresentation(
      displayedGuidance?.persona_key ?? null,
    );
  }, [
    displayedGuidance?.persona_key,
    displayedGuidanceSource,
    latestReadyEntry,
    trackedReadyEntry,
  ]);
  const displayedGuidanceCtaRoute = useMemo(
    () => resolveCoachCtaRoute(displayedGuidance?.cta_route),
    [displayedGuidance?.cta_route],
  );
  const activeEntryId =
    displayedGuidanceSource === 'mutation'
      ? (coachGeneration.data?.entry_id ?? null)
      : displayedGuidanceSource === 'tracked'
        ? (trackedReadyEntry?.id ?? null)
        : displayedGuidanceSource === 'latest_ready'
          ? (latestReadyEntry?.id ?? null)
          : null;
  const historySummaryData = coachSnapshot?.historySummary;
  const isHistorySummaryLoading = coachSnapshotQuery.isLoading;
  const historySummary = historySummaryData;
  const hasHistorySummaryData = historySummaryData !== undefined;
  const hasHistoryEntries = (historySummary?.total_count ?? 0) > 0;
  const hasRenderableHistoryEntries = useMemo(
    () =>
      entries.some(
        (entry) => entry.id !== activeEntryId && isRenderableCoachEntry(entry),
      ),
    [activeEntryId, entries],
  );
  const hasHistorySignal = hasHistoryEntries || hasRenderableHistoryEntries;
  const coachSnapshotFocusStateRef = useRef({
    isFetched: coachSnapshotQuery.isFetched,
    isFetching: coachSnapshotQuery.isFetching,
    isStale: coachSnapshotQuery.isStale,
    refetch: refetchCoachSnapshot,
  });

  useEffect(() => {
    coachSnapshotFocusStateRef.current = {
      isFetched: coachSnapshotQuery.isFetched,
      isFetching: coachSnapshotQuery.isFetching,
      isStale: coachSnapshotQuery.isStale,
      refetch: refetchCoachSnapshot,
    };
  }, [
    coachSnapshotQuery.isFetched,
    coachSnapshotQuery.isFetching,
    coachSnapshotQuery.isStale,
    refetchCoachSnapshot,
  ]);

  useFocusEffect(
    useCallback(() => {
      if (!user?.id) {
        return;
      }

      const {
        isFetched,
        isFetching,
        isStale,
        refetch,
      } = coachSnapshotFocusStateRef.current;

      if (!isFetching && (!isFetched || isStale)) {
        void refetch();
      }
    }, [user?.id]),
  );
  const latestReadyError =
    latestReadyEntryError instanceof Error ? latestReadyEntryError : null;
  const hasEntriesError = entriesError instanceof Error;
  const hasRecentScansError = recentScansError instanceof Error;
  const hasLatestReadyError = !!latestReadyError;
  const entriesLoadError = hasEntriesError && !hasEntriesData ? entriesError : null;
  const scansLoadError =
    hasRecentScansError && !hasRecentScansData ? recentScansError : null;
  const latestReadyLoadError =
    !hasTrackedGuidance &&
    !hasGenerationGuidance &&
    !hasLatestReadyEntryData &&
    hasLatestReadyError
      ? latestReadyError
      : null;
  const loadErrorSource: CoachLoadErrorSource = entriesLoadError
    ? 'entries'
    : scansLoadError
      ? 'scans'
      : latestReadyLoadError
        ? 'latest_ready'
        : 'none';
  const loadError =
    entriesLoadError ?? scansLoadError ?? latestReadyLoadError ?? null;
  const persistedCoachProviderUnavailable =
    isCoachProviderUnavailableEntry(latestCoachEntry);
  const generationCoachProviderUnavailable = isCoachProviderUnavailableError(
    coachGeneration.error,
  );
  const coachProviderUnavailable =
    !loadError &&
    (effectiveTrackedEntryId
      ? trackedCoachProviderUnavailable
      : generationCoachProviderUnavailable ||
        persistedCoachProviderUnavailable);
  const staleTrackedEntryFailureDebugInfo = useMemo(
    () =>
      isTrackedEntryStaleFailure
        ? {
            message: 'coach_generation_timed_out',
            code: 'coach_generation_timed_out',
            status: null,
            requestId: null,
            functionName: 'coach-generate-response',
            details: {
              tracked_entry_id: effectiveTrackedEntryId,
              tracked_status:
                trackedCoachEntry?.status ??
                (!trackedCoachEntry ? 'missing' : 'pending'),
            },
            webhookStatus: null,
            provider: 'n8n',
            source: 'coach_generation',
            fallbackUsed: null,
            responseBodyPresent: null,
          }
        : null,
    [effectiveTrackedEntryId, isTrackedEntryStaleFailure, trackedCoachEntry],
  );
  const trackedEntryFailureDebugInfo = useMemo(
    () =>
      staleTrackedEntryFailureDebugInfo ??
      getCoachEntryFailureDebugInfo(trackedCoachEntry),
    [staleTrackedEntryFailureDebugInfo, trackedCoachEntry],
  );
  const trackedEntryFailureKind = useMemo(
    () =>
      isTrackedEntryStaleFailure
        ? 'provider_request_failed'
        : resolveCoachFailureKindFromEntry(trackedCoachEntry),
    [isTrackedEntryStaleFailure, trackedCoachEntry],
  );
  const mutationFailureKind = useMemo(
    () => resolveCoachFailureKindFromError(coachGeneration.error),
    [coachGeneration.error],
  );
  const isEntriesInitialLoading = isEntriesLoading && !hasEntriesData;
  const isScansInitialLoading = isScansLoading && !hasRecentScansData;
  const isLatestReadyEntryInitialLoading =
    isLatestReadyEntryLoading && !hasLatestReadyEntryData;
  const isHistorySummaryInitialLoading =
    isHistorySummaryLoading && !hasHistorySummaryData;
  const isBootDataLoading =
    isLatestReadyEntryInitialLoading ||
    isEntriesInitialLoading ||
    isScansInitialLoading;
  const showLoadingState =
    isBootDataLoading &&
    !loadError &&
    !isGenerationAwaitingResult &&
    !displayedGuidance;
  const showGenerationLoadingState =
    !showLoadingState && !loadError && showCoachGenerationProgressState;
  const isCoachLoadingMiniGameActive =
    !showLoadingState && !loadError && isGenerationAwaitingResult;
  const showQueryErrorState =
    !showLoadingState && !showGenerationLoadingState && !!loadError;
  const showProviderUnavailableState =
    !showLoadingState &&
    !showGenerationLoadingState &&
    !showQueryErrorState &&
    coachProviderUnavailable;
  const showGenerationErrorState =
    !showLoadingState &&
    !showGenerationLoadingState &&
    !showQueryErrorState &&
    !showProviderUnavailableState &&
    hasGenerationFailure;
  const generationFailureKind = effectiveTrackedEntryId
    ? trackedEntryFailureKind
    : mutationFailureKind;
  const generationErrorDebugInfo = showGenerationErrorState
    ? effectiveTrackedEntryId
      ? trackedEntryFailureDebugInfo
      : getCoachServiceErrorDebugInfo(coachGeneration.error)
    : null;
  const generationErrorBodyTranslationKey = resolveCoachErrorBodyTranslationKey(
    generationFailureKind,
  );
  const queryErrorBody = useMemo(
    () => resolveCoachUserFacingErrorMessage(loadError, t),
    [loadError, t],
  );
  const generationErrorBody = t(generationErrorBodyTranslationKey);
  const displayedGuidanceDisclaimer = useMemo(
    () => resolveCoachDisclaimerText(displayedGuidance?.disclaimer, t),
    [displayedGuidance?.disclaimer, t],
  );
  const displayedGuidanceCtaLabel = useMemo(
    () =>
      resolveCoachCtaLabel(
        displayedGuidanceCtaRoute,
        displayedGuidance?.cta_label,
        t,
      ),
    [displayedGuidance?.cta_label, displayedGuidanceCtaRoute, t],
  );
  const displayedGuidanceModeLabel = useMemo(
    () =>
      displayedGuidance?.question_text ??
      (displayedGuidance?.prompt_type
        ? t(
            `coach.prompts.${resolveVisibleCoachPromptType(
              displayedGuidance.prompt_type,
            )}.title`,
          )
        : null),
    [displayedGuidance?.prompt_type, displayedGuidance?.question_text, t],
  );
  const displayedGuidanceSectionLabels = useMemo(
    () => ({
      context_notes: t('coach.sections.context_notes'),
      priorities: t('coach.sections.priorities'),
      action_steps: t('coach.sections.action_steps'),
      warnings: t('coach.sections.warnings'),
      data_gaps: t('coach.sections.data_gaps'),
      meal_template: t('coach.sections.meal_template'),
      meal_swaps: t('coach.sections.meal_swaps'),
      shopping_list: t('coach.sections.shopping_list'),
      quick_recipe: t('coach.sections.quick_recipe'),
      daily_schedule: t('coach.sections.daily_schedule'),
      micro_routine: t('coach.sections.micro_routine'),
      habit_tracker: t('coach.sections.habit_tracker'),
      reminders: t('coach.sections.reminders'),
      knowledge_card: t('coach.sections.knowledge_card'),
      next_scan_suggestion: t('coach.sections.next_scan_suggestion'),
      signal_watch: t('coach.sections.signal_watch'),
      streak_celebration: t('coach.sections.streak_celebration'),
      today: t('coach.sections.today'),
      formatters: {
        inDays: (count: number) => t('coach.sections.in_days', { count }),
        daysPerWeek: (count: number) =>
          t('coach.sections.days_per_week', { count }),
        minutes: (count: number) => t('coach.sections.minutes', { count }),
      },
      shopping_sections: {
        frais: t('coach.sections.shopping_fresh'),
        sec: t('coach.sections.shopping_dry'),
        boissons: t('coach.sections.shopping_drinks'),
        snacks: t('coach.sections.shopping_snacks'),
        autre: t('coach.sections.shopping_other'),
      },
      scan_types: {
        face: t('coach.sections.scan_face'),
        body: t('coach.sections.scan_body'),
        nutrition: t('coach.sections.scan_nutrition'),
        super: t('coach.sections.scan_super'),
        health: t('coach.sections.scan_health'),
      },
      recurrences: {
        today: t('coach.sections.recurrence_today'),
        daily: t('coach.sections.recurrence_daily'),
        weekly: t('coach.sections.recurrence_weekly'),
      },
    }),
    [t],
  );
  const displayedGuidanceMetricBadge = useMemo(() => {
    const delta = displayedGuidance?.primary_metric_delta;
    if (!delta) {
      return null;
    }

    const directionLabel = t(
      `coach.metric_direction.${delta.direction}` as const,
    );

    return {
      label: delta.human_label,
      directionLabel,
      direction: delta.direction,
      interpretation: delta.interpretation,
    };
  }, [displayedGuidance?.primary_metric_delta, t]);
  const showEmptyState =
    !showLoadingState &&
    !showGenerationLoadingState &&
    !showQueryErrorState &&
    !showProviderUnavailableState &&
    !showGenerationErrorState &&
    hasConfirmedNoUsableCoachScans &&
    !hasScanResultSelectedScan &&
    !displayedGuidance &&
    !hasHistorySignal &&
    !isGenerationAwaitingResult &&
    !isHistorySummaryInitialLoading;
  const arePromptCardsDisabled =
    isGenerationAwaitingResult ||
    isPersonaSaving ||
    coachProviderUnavailable ||
    (isScansFetching && !hasRecentScansData);
  const displayedGuidanceTimestampLabel = useMemo(
    () => formatCoachTimestamp(displayedGuidance?.renderedAt ?? null, locale),
    [displayedGuidance?.renderedAt, locale],
  );
  const promptTitleResolver = useCallback(
    (promptType: (typeof COACH_PROMPT_TYPES)[number]) =>
      t(`coach.prompts.${promptType}.title`),
    [t],
  );
  const promptSubtitleResolver = useCallback(
    (promptType: (typeof COACH_PROMPT_TYPES)[number]) =>
      t(`coach.prompts.${promptType}.subtitle`),
    [t],
  );
  const promptCategoryTitleResolver = useCallback(
    (category: CoachPromptCategory) => t(`coach.prompt_categories.${category}`),
    [t],
  );
  const questionRankingContext = useMemo(
    () => ({
      timeOfDay: getCoachQuestionTimeOfDay(),
      primaryScanType: recentScans[0]?.scan_type ?? null,
      hasSuperScan: recentScans.some((scan) => scan.scan_type === 'super'),
      historyDepth: historySummary?.total_count ?? entries.length,
    }),
    [entries.length, historySummary?.total_count, recentScans],
  );
  const questionOptionsByPromptType = useMemo(
    () =>
      PROMPT_TYPES.reduce(
        (acc, promptType) => {
          acc[promptType] = rankCoachQuestionsForPromptType(
            promptType,
            questionRankingContext,
          ).map((question) => ({
            key: question.key,
            label: resolveCoachQuestionText(question.key, locale),
          }));
          return acc;
        },
        {} as Record<
          CoachPromptType,
          { key: CoachQuestionKey; label: string }[]
        >,
      ),
    [locale, questionRankingContext],
  );
  const normalizedFreeQuestionDraft = useMemo(
    () => normalizeCoachQuestionText(freeQuestionDraft),
    [freeQuestionDraft],
  );
  const selectedQuestionPromptType = useMemo(
    () =>
      selectedQuestionKey
        ? getCoachQuestionDefinition(selectedQuestionKey).promptType
        : null,
    [selectedQuestionKey],
  );
  const selectedQuestionParentPromptType =
    questionSelectionMode === 'preset' ? selectedQuestionPromptType : null;
  const resolvedPresetQuestionSelection = useMemo(
    () => {
      if (
        questionSelectionMode !== 'preset' ||
        !selectedQuestionPromptType ||
        !selectedQuestionKey
      ) {
        return null;
      }

      return resolveCoachQuestionSelection({
        promptType: selectedQuestionPromptType,
        questionKey: selectedQuestionKey,
        questionText: null,
        locale,
      });
    },
    [
      locale,
      questionSelectionMode,
      selectedQuestionKey,
      selectedQuestionPromptType,
    ],
  );
  const resolvedSubmitIntent = useMemo(
    () => {
      const visiblePromptType =
        selectedQuestionPromptType ??
        (scanResultContext?.generationPromptType
          ? resolveVisibleCoachPromptType(scanResultContext.generationPromptType)
          : DEFAULT_PROMPT_TYPE);
      const selectedQuestionSelection =
        questionSelectionMode === 'free_text'
          ? { questionKey: null, questionText: normalizedFreeQuestionDraft }
          : questionSelectionMode === 'preset'
            ? resolvedPresetQuestionSelection
            : null;

      if (
        !selectedQuestionSelection?.questionKey &&
        !selectedQuestionSelection?.questionText
      ) {
        return null;
      }

      return {
        ...resolveCoachSubmitIntent({
          visiblePromptType,
          explicitGenerationPromptType:
            scanResultContext?.generationPromptType ?? null,
          questionSelectionMode: questionSelectionMode ?? 'free_text',
          questionKey: selectedQuestionSelection.questionKey,
          questionText: selectedQuestionSelection.questionText,
        }),
        visiblePromptType,
      };
    },
    [
      normalizedFreeQuestionDraft,
      questionSelectionMode,
      resolvedPresetQuestionSelection,
      scanResultContext?.generationPromptType,
      selectedQuestionPromptType,
    ],
  );
  const hasValidSubmitIntent = resolvedSubmitIntent !== null;

  const inlinePersonaOptions = useMemo(
    () =>
      selectedFirstPersonaOptionsWithVisuals.map((persona) => ({
        key: persona.key,
        title: t(persona.titleTranslationKey),
        subtitle: t(persona.subtitleTranslationKey),
        visual: persona.visual,
        locked: persona.locked,
      })),
    [selectedFirstPersonaOptionsWithVisuals, t],
  );

  const handleEditSettings = useCallback(() => {
    setTrackedEntryId(null);
    coachGeneration.reset();
    setDisplayMode('settings');
  }, [coachGeneration]);

  const handleActionBarLayout = useCallback(
    ({ nativeEvent: { layout } }: LayoutChangeEvent) => {
      const nextHeight = Math.max(Math.round(layout.height), 0);
      setActionBarHeight((currentHeight) =>
        Math.abs(currentHeight - nextHeight) < 1 ? currentHeight : nextHeight,
      );
    },
    [],
  );

  const isPromptLockedForUser = useCallback(
    (promptType: CoachPromptType) =>
      isCoachPromptTypeLockedForProfile(promptType, userProfile),
    [userProfile],
  );

  useEffect(() => {
    if (!scanResultRouteRequest) {
      appliedScanResultRouteSignatureRef.current = null;
      autoSubmitAttemptedRouteSignatureRef.current = null;
      pendingAutoSubmitRef.current = false;
      setScanResultContext(null);
      return;
    }

    if (
      appliedScanResultRouteSignatureRef.current ===
      scanResultRouteRequest.signature
    ) {
      return;
    }

    const requestedPromptType = scanResultRouteRequest.promptType;
    const requestedGenerationPromptType =
      scanResultRouteRequest.generationPromptType;
    const fallbackPromptType = scanResultRouteRequest.fallbackPromptType;
    const resolvedPromptType = isPromptLockedForUser(requestedPromptType)
      ? fallbackPromptType && !isPromptLockedForUser(fallbackPromptType)
        ? fallbackPromptType
        : DEFAULT_PROMPT_TYPE
      : requestedPromptType;
    const resolvedGenerationPromptType =
      resolvedPromptType === requestedPromptType
        ? requestedGenerationPromptType
        : resolvedPromptType;
    const resolvedQuestionKey =
      scanResultRouteRequest.questionKey &&
      isCoachQuestionForPromptType(
        scanResultRouteRequest.questionKey,
        resolvedPromptType,
      )
        ? scanResultRouteRequest.questionKey
        : null;
    const resolvedFreeQuestionText =
      scanResultRouteRequest.questionText ??
      (resolvedQuestionKey
        ? null
        : resolveScanResultFallbackQuestion({
            priorityMetric: scanResultRouteRequest.priorityMetric,
            t,
          }));
    const nextQuestionSelectionMode: CoachQuestionSelectionMode =
      resolvedFreeQuestionText ? 'free_text' : 'preset';

    appliedScanResultRouteSignatureRef.current =
      scanResultRouteRequest.signature;
    setQuestionSelectionMode(nextQuestionSelectionMode);
    setExpandedPromptType(resolvedPromptType);
    setSelectedQuestionKey(
      nextQuestionSelectionMode === 'preset' ? resolvedQuestionKey : null,
    );
    if (resolvedFreeQuestionText) {
      setFreeQuestionDraft(resolvedFreeQuestionText);
    }
    setScanResultContext({
      source: 'scan_result',
      scanId: scanResultRouteRequest.scanId,
      scanType: scanResultRouteRequest.scanType,
      priorityMetric: scanResultRouteRequest.priorityMetric,
      scanIntent: scanResultRouteRequest.scanIntent,
      generationPromptType: resolvedGenerationPromptType,
      routeSignature: scanResultRouteRequest.signature,
      autoSubmit: scanResultRouteRequest.autoSubmit,
    });
    setTrackedEntryId(null);
    setDisplayMode('settings');
  }, [
    isPromptLockedForUser,
    locale,
    scanResultRouteRequest,
    setQuestionSelectionMode,
  ]);

  // Garde-fou : si le mode courant est verrouillé pour le tier actuel
  // (ex: l'utilisateur est passé free avec un mode premium en state local),
  // on le retire sans toucher à une question libre déjà écrite.
  useEffect(() => {
    if (expandedPromptType && isPromptLockedForUser(expandedPromptType)) {
      setExpandedPromptType(null);
    }

    if (
      selectedQuestionPromptType &&
      isPromptLockedForUser(selectedQuestionPromptType)
    ) {
      setSelectedQuestionKey(null);
      setQuestionSelectionMode(null);
    }
  }, [
    expandedPromptType,
    isPromptLockedForUser,
    selectedQuestionPromptType,
    setQuestionSelectionMode,
  ]);

  useEffect(() => {
    if (hasGenerationGuidance && !scanResultRouteRequest) {
      setDisplayMode('result');
    }
  }, [hasGenerationGuidance, scanResultRouteRequest]);

  useEffect(() => {
    if (isGenerationAwaitingResult) {
      setDisplayMode('result');
    }
  }, [isGenerationAwaitingResult]);

  useEffect(() => {
    if (!shouldResumeTrackedEntry || !resumablePendingEntry) {
      return;
    }

    if (shouldDebugCoachScreen()) {
      console.log('[CoachScreen] resuming pending tracked entry', {
        tracked_entry_id: resumablePendingEntry.id,
        persona_key: resumablePendingEntry.persona_key,
        locale,
      });
    }

    setTrackedEntryId(resumablePendingEntry.id);
    setDisplayMode('result');
  }, [locale, resumablePendingEntry, shouldResumeTrackedEntry]);

  useEffect(() => {
    if (!effectiveTrackedEntryId) {
      trackedEntryTerminalInvalidationRef.current = null;
      return;
    }

    const trackedStatus = trackedCoachEntry?.status ?? 'pending';
    if (trackedStatus === 'pending') {
      trackedEntryTerminalInvalidationRef.current = null;
      return;
    }

    const invalidationKey = `${effectiveTrackedEntryId}:${trackedStatus}`;
    if (trackedEntryTerminalInvalidationRef.current === invalidationKey) {
      return;
    }

    trackedEntryTerminalInvalidationRef.current = invalidationKey;
    void queryClient.invalidateQueries({
      queryKey: COACH_SCREEN_SNAPSHOT_QUERY_KEY,
    });
  }, [effectiveTrackedEntryId, queryClient, trackedCoachEntry?.status]);

  useEffect(() => {
    if (!shouldDebugCoachScreen()) {
      return;
    }

    const uiState = showGenerationLoadingState
      ? 'generation_loading'
      : showLoadingState
        ? 'query_loading'
        : showQueryErrorState
          ? 'query_error'
          : showProviderUnavailableState
            ? 'provider_unavailable'
            : showGenerationErrorState
              ? 'generation_error'
              : showEmptyState
                ? 'empty'
                : displayedGuidance
                  ? 'guidance'
                  : 'idle';

    console.log('[CoachScreen] ui state', {
      last_mutation_entry_id: coachGeneration.data?.entry_id ?? null,
      last_mutation_status: coachGeneration.data?.status ?? null,
      display_mode: displayMode,
      result_display_enabled: displayMode === 'result',
      tracked_entry_id: effectiveTrackedEntryId,
      tracked_status:
        trackedCoachEntry?.status ??
        (!effectiveTrackedEntryId ? null : 'missing'),
      tracked_error_code: trackedCoachEntry?.error_code ?? null,
      tracked_pending_stale: isTrackedEntryStaleFailure,
      is_mutation_pending: coachGeneration.isPending,
      is_entries_fetching: isEntriesFetching,
      ui_state: uiState,
      load_error_source: loadErrorSource,
      has_entries_error: hasEntriesError,
      has_entries_data: hasEntriesData,
      has_recent_scans_error: hasRecentScansError,
      has_recent_scans_data: hasRecentScansData,
      has_latest_ready_error: hasLatestReadyError,
      has_latest_ready_entry_data: hasLatestReadyEntryData,
      tracked_guidance_available: hasTrackedGuidance,
      mutation_guidance_available: hasGenerationGuidance,
      generation_error_kind: showGenerationErrorState
        ? generationFailureKind
        : null,
      generation_error: generationErrorDebugInfo,
      active_guidance_source: activeGuidanceSource,
      displayed_guidance_source: displayedGuidanceSource,
    });
  }, [
    activeGuidanceSource,
    coachGeneration.data?.entry_id,
    coachGeneration.data?.status,
    displayMode,
    displayedGuidance,
    displayedGuidanceSource,
    coachGeneration.isPending,
    effectiveTrackedEntryId,
    generationErrorDebugInfo,
    generationFailureKind,
    hasEntriesData,
    hasEntriesError,
    hasGenerationGuidance,
    isEntriesFetching,
    isTrackedEntryStaleFailure,
    hasLatestReadyEntryData,
    hasLatestReadyError,
    hasRecentScansData,
    hasRecentScansError,
    hasTrackedGuidance,
    loadErrorSource,
    showEmptyState,
    showGenerationErrorState,
    showGenerationLoadingState,
    showLoadingState,
    showProviderUnavailableState,
    showQueryErrorState,
    trackedCoachEntry?.error_code,
    trackedCoachEntry?.status,
  ]);

  useEffect(() => {
    if (!shouldDebugCoachScreen()) {
      loadingWasActiveRef.current = showGenerationLoadingState;
      return;
    }

    if (loadingWasActiveRef.current && !showGenerationLoadingState) {
      const exitReason = displayedGuidance
        ? 'guidance_ready'
        : showProviderUnavailableState
          ? 'provider_unavailable'
          : showGenerationErrorState
            ? 'generation_error'
            : showQueryErrorState
              ? 'query_error'
              : showEmptyState
                ? 'empty'
                : 'unknown';

      console.log('[CoachScreen] generation loading ended', {
        tracked_entry_id: effectiveTrackedEntryId,
        tracked_status:
          trackedCoachEntry?.status ??
          (!effectiveTrackedEntryId ? null : 'missing'),
        tracked_error_code: trackedCoachEntry?.error_code ?? null,
        tracked_pending_stale: isTrackedEntryStaleFailure,
        exit_reason: exitReason,
        generation_error_kind: showGenerationErrorState
          ? generationFailureKind
          : null,
        generation_error: generationErrorDebugInfo,
      });
    }

    loadingWasActiveRef.current = showGenerationLoadingState;
  }, [
    displayedGuidance,
    effectiveTrackedEntryId,
    generationErrorDebugInfo,
    generationFailureKind,
    isTrackedEntryStaleFailure,
    showEmptyState,
    showGenerationErrorState,
    showGenerationLoadingState,
    showProviderUnavailableState,
    showQueryErrorState,
    trackedCoachEntry?.error_code,
    trackedCoachEntry?.status,
  ]);

  const handlePersonaPress = (personaKey: CoachPersonaKey) => {
    if (isGenerationAwaitingResult || isPersonaSaving) {
      return;
    }

    setPreviewedPersonaKey(personaKey);
  };

  const handleClosePersonaDetails = () => {
    setPreviewedPersonaKey(null);
  };

  const handleOpenPremiumUpgrade = (source: string, metadata?: Record<string, unknown>) => {
    trackEvent('coach_premium_unlock_tapped', {
      source,
      ...(metadata ?? {}),
    });
    router.push('/premium-upgrade' as any);
  };

  const handleUnlockPreviewedPersona = () => {
    if (!previewedPersona) {
      return;
    }

    trackEvent('coach_persona_locked_tapped', {
      persona_key: previewedPersona.key,
    });
    setPreviewedPersonaKey(null);
    handleOpenPremiumUpgrade('persona', {
      persona_key: previewedPersona.key,
    });
  };

  const handleConfirmPersonaSelection = async () => {
    if (!previewedPersona) {
      return;
    }

    const personaKey = previewedPersona.key;
    if (previewedPersona.locked) {
      handleUnlockPreviewedPersona();
      return;
    }

    if (!userProfile || activePersonaKey === personaKey || isPersonaSaving) {
      setPreviewedPersonaKey(null);
      return;
    }

    setPreviewedPersonaKey(null);
    setPendingPersonaKey(personaKey);
    trackEvent('coach_persona_selected', {
      persona_key: personaKey,
    });

    try {
      await updateCoachPersona(personaKey);
    } catch (error) {
      trackEvent('coach_persona_update_failed', {
        persona_key: personaKey,
        message: error instanceof Error ? error.message : 'unknown',
      });
      showAlert(
        t('coach.error_title'),
        resolveCoachUserFacingErrorMessage(error, t),
        [{ text: t('common.ok') }],
      );
    } finally {
      setPendingPersonaKey(null);
    }
  };

  async function handleGenerate() {
    const submitIntent = resolvedSubmitIntent;
    if (!submitIntent) {
      pendingAutoSubmitRef.current = false;
      if (questionSelectionMode === 'free_text') {
        showAlert(
          t('coach.freeQuestionRequiredTitle'),
          t('coach.freeQuestionRequiredMessage'),
          [{ text: t('common.ok') }],
          coachAlertIcon,
          { emoji: null },
        );
        return;
      }

      showAlert(
        t('coach.selectionRequiredTitle'),
        t('coach.selectionRequiredMessage'),
        [{ text: t('common.ok') }],
        coachAlertIcon,
        { emoji: null },
      );
      return;
    }

    const visiblePromptType = submitIntent.visiblePromptType;
    const promptType = submitIntent.promptType;
    const questionKey = submitIntent.questionKey;
    const questionText = submitIntent.questionText;
    const scanId = scanResultContext?.scanId ?? null;
    const submissionTrigger = pendingAutoSubmitRef.current
      ? 'auto_from_scan_result'
      : 'manual';
    pendingAutoSubmitRef.current = false;

    if (activePersonaLocked) {
      trackEvent('coach_generation_locked_persona_blocked', {
        prompt_type: visiblePromptType,
        persona_key: activePersonaKey,
      });
      handleOpenPremiumUpgrade('generation', {
        prompt_type: visiblePromptType,
        persona_key: activePersonaKey,
      });
      return;
    }

    if (!hasScanResultSelectedScan && hasConfirmedNoUsableCoachScans) {
      setTrackedEntryId(null);
      setDisplayMode('settings');
      trackEvent('coach_prompt_blocked_no_scans', {
        prompt_type: visiblePromptType,
        persona_key: activePersonaKey,
        account_tier: userProfile?.account_tier ?? 'unknown',
      });
      showAlert(
        t('coach.no_scan_title'),
        t('coach.no_scan_body'),
        [{ text: t('common.ok') }],
        coachAlertIcon,
        { emoji: null },
      );
      return;
    }

    if (!coachQuota) {
      setTrackedEntryId(null);
      setDisplayMode('settings');
      trackEvent('coach_prompt_blocked_quota_unavailable', {
        prompt_type: visiblePromptType,
        persona_key: activePersonaKey,
        account_tier: userProfile?.account_tier ?? 'unknown',
      });
      showAlert(
        t('coach.quota.verify_error_title'),
        t('coach.quota.verify_error'),
        [{ text: t('common.ok') }],
        coachAlertIcon,
        { emoji: null },
      );
      void refetchCoachQuota();
      return;
    }

    if (isCoachQuotaExhausted) {
      setTrackedEntryId(null);
      setDisplayMode('settings');
      trackEvent('coach_prompt_blocked_quota_exhausted', {
        prompt_type: visiblePromptType,
        persona_key: activePersonaKey,
        account_tier: coachQuota.account_tier,
        next_recharge_at: coachQuota.next_recharge_at,
      });
      showAlert(
        t('coach.quota.exhausted_title'),
        coachQuotaCountdownLabel
          ? t('coach.quota.next_request_in', {
              duration: coachQuotaCountdownLabel,
            })
          : t('coach.quota.recharge_soon'),
        [{ text: t('common.ok') }],
        coachAlertIcon,
        { emoji: null },
      );
      return;
    }

    setSubmittingPromptType(visiblePromptType);
    setTrackedEntryId(null);
    setDisplayMode('result');
    trackEvent('coach_prompt_submitted', {
      prompt_type: promptType,
      visible_prompt_type: visiblePromptType,
      persona_key: activePersonaKey,
      question_key: questionKey,
      question_text: questionText,
      has_recent_scans: hasUsableCoachScans,
      source: scanResultContext?.source ?? 'coach',
      scan_id: scanId,
      scan_type: scanResultContext?.scanType ?? null,
      has_scan_intent:
        promptType !== FREE_QUESTION_PROMPT_TYPE &&
        !!scanResultContext?.scanIntent,
      submission_trigger: submissionTrigger,
    });

    try {
      const response = await coachGeneration.mutateAsync({
        promptType,
        personaKey: activePersonaKey,
        questionKey,
        questionText,
        ...(scanId ? { selectedScanId: scanId } : {}),
        ...(promptType !== FREE_QUESTION_PROMPT_TYPE &&
        scanResultContext?.scanIntent
          ? { scanIntent: scanResultContext.scanIntent }
          : {}),
      });
      const shouldTrackResponse =
        response.entry_id.length > 0 && !hasRenderableCoachContent(response);

      if (shouldDebugCoachScreen()) {
        console.log('[CoachScreen] generation response received', {
          response_entry_id: response.entry_id,
          response_status: response.status,
          should_track: shouldTrackResponse,
          locale,
        });
      }

      setTrackedEntryId(shouldTrackResponse ? response.entry_id : null);
      trackEvent('coach_response_received', {
        prompt_type: response.prompt_type ?? promptType,
        visible_prompt_type: visiblePromptType,
        persona_key: response.persona_key,
        question_key: response.question_key ?? null,
        question_text: response.question_text ?? null,
        cached: response.cached,
        fallback: response.fallback,
        status: response.status,
        submission_trigger: submissionTrigger,
      });
    } catch (error) {
      if (shouldDebugCoachScreen()) {
        console.log('[CoachScreen] generation request failed', {
          prompt_type: promptType,
          visible_prompt_type: visiblePromptType,
          persona_key: activePersonaKey,
          locale,
          ...getCoachServiceErrorDebugInfo(error),
        });
      }

      const quotaFromError = getCoachQuotaFromError(error);
      if (quotaFromError) {
        queryClient.setQueriesData(
          { queryKey: COACH_SCREEN_SNAPSHOT_QUERY_KEY },
          (previousSnapshot: any) =>
            previousSnapshot
              ? {
                  ...previousSnapshot,
                  quota: quotaFromError,
                }
              : previousSnapshot,
        );
      }

      if (isCoachQuotaExhaustedError(error)) {
        setTrackedEntryId(null);
        setDisplayMode('settings');
        coachGeneration.reset();
        trackEvent('coach_prompt_blocked_quota_exhausted', {
          prompt_type: promptType,
          visible_prompt_type: visiblePromptType,
          persona_key: activePersonaKey,
          account_tier: quotaFromError?.account_tier ?? 'unknown',
          next_recharge_at: quotaFromError?.next_recharge_at ?? null,
          submission_trigger: submissionTrigger,
        });
        const remainingLabel = formatCoachQuotaRemainingFromIso(
          quotaFromError?.next_recharge_at,
        );
        showAlert(
          t('coach.quota.exhausted_title'),
          remainingLabel
            ? t('coach.quota.next_request_in', {
                duration: remainingLabel,
              })
            : t('coach.quota.recharge_soon'),
          [{ text: t('common.ok') }],
          coachAlertIcon,
          { emoji: null },
        );
        return;
      }

      if (
        getCoachServiceErrorDebugInfo(error).code ===
        COACH_NO_USABLE_SCAN_ERROR_CODE
      ) {
        setTrackedEntryId(null);
        setDisplayMode('settings');
        coachGeneration.reset();
        showAlert(
          t('coach.no_scan_title'),
          t('coach.no_scan_body'),
          [{ text: t('common.ok') }],
          coachAlertIcon,
          { emoji: null },
        );
        return;
      }

      setTrackedEntryId(null);
      trackEvent('coach_generation_failed', {
        prompt_type: promptType,
        visible_prompt_type: visiblePromptType,
        persona_key: activePersonaKey,
        question_key: submitIntent.questionKey,
        question_text: submitIntent.questionText,
        message: error instanceof Error ? error.message : 'unknown',
        submission_trigger: submissionTrigger,
      });
    } finally {
      setSubmittingPromptType(null);
    }
  }

  useEffect(() => {
    if (!scanResultRouteRequest?.autoSubmit || !scanResultContext?.autoSubmit) {
      return;
    }

    if (scanResultContext.routeSignature !== scanResultRouteRequest.signature) {
      return;
    }

    if (
      autoSubmitAttemptedRouteSignatureRef.current ===
      scanResultRouteRequest.signature
    ) {
      return;
    }

    if (
      showLoadingState ||
      showQueryErrorState ||
      showProviderUnavailableState ||
      showGenerationErrorState ||
      displayMode !== 'settings' ||
      isGenerationAwaitingResult ||
      submittingPromptType ||
      !hasValidSubmitIntent
    ) {
      return;
    }

    autoSubmitAttemptedRouteSignatureRef.current = scanResultRouteRequest.signature;
    pendingAutoSubmitRef.current = true;
    trackEvent('coach_scan_result_auto_submit_started', {
      prompt_type: resolvedSubmitIntent?.promptType ?? null,
      scan_id: scanResultContext.scanId,
      scan_type: scanResultContext.scanType,
      has_scan_intent:
        resolvedSubmitIntent?.promptType !== FREE_QUESTION_PROMPT_TYPE &&
        !!scanResultContext.scanIntent,
    });
    void handleGenerate();
  }, [
    displayMode,
    hasValidSubmitIntent,
    isGenerationAwaitingResult,
    scanResultContext,
    scanResultRouteRequest,
    resolvedSubmitIntent,
    showGenerationErrorState,
    showLoadingState,
    showProviderUnavailableState,
    showQueryErrorState,
    submittingPromptType,
  ]);

  const handleClose = () => {
    if (router.canDismiss()) {
      router.dismiss();
      return;
    }

    router.back();
  };

  const handleRetryQueries = () => {
    void refetchCoachSnapshot();
  };

  const handleViewHistory = () => {
    if (activeEntryId) {
      router.push({
        pathname: '/coach-history',
        params: { excludeEntryId: activeEntryId },
      } as any);
      return;
    }

    router.push('/coach-history' as any);
  };

  const handleOpenScanner = () => {
    router.push('/scanner' as any);
  };

  const isResultDisplay =
    displayMode === 'result' &&
    !isGenerationAwaitingResult &&
    !showLoadingState;

  const shouldRoutePrimaryToScanner =
    !isResultDisplay &&
    !isGenerationAwaitingResult &&
    !hasScanResultSelectedScan &&
    hasConfirmedNoUsableCoachScans;
  const activePersonaTitle = t(activePersona.titleTranslationKey);
  const selectedPromptTitle = t('coach.questions.empty_summary');
  const actionPrimaryLabel = isGenerationAwaitingResult
    ? t('coach.action_bar.cta_generating')
    : shouldRoutePrimaryToScanner
      ? t('coach.action_bar.cta_scan')
      : isResultDisplay
        ? t('coach.action_bar.primary')
        : t('coach.action_bar.cta_request');

  const actionPrimaryA11yLabel = actionPrimaryLabel;

  const isActionPrimaryDisabled = isGenerationAwaitingResult
    ? true
    : shouldRoutePrimaryToScanner
      ? false
      : isResultDisplay
        ? false
        : isCoachQuotaUnknown || isCoachQuotaUnavailable
          ? true
          : arePromptCardsDisabled;
  const isActionPrimaryMuted =
    shouldRoutePrimaryToScanner ||
    (!isGenerationAwaitingResult && !isResultDisplay && isCoachQuotaExhausted) ||
    (!isGenerationAwaitingResult && !isResultDisplay && !hasValidSubmitIntent) ||
    (!isGenerationAwaitingResult && isActionPrimaryDisabled);
  const handleActionPrimaryPress = () => {
    if (shouldRoutePrimaryToScanner) {
      handleOpenScanner();
      return;
    }

    if (isResultDisplay) {
      handleEditSettings();
      return;
    }
    void handleGenerate();
  };
  const coachLoadingPercent = Math.round(coachLoadingProgress.progress);
  const coachLoadingProgressWidth = `${coachLoadingProgress.progress}%` as `${number}%`;

  return (
    <AppScreen bottomInset={false} keyboard style={styles.safeArea}>
      {alertElement}
      <View style={styles.container}>
        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          automaticallyAdjustContentInsets={false}
          automaticallyAdjustKeyboardInsets={false}
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={[
            styles.content,
            { paddingBottom: coachContentBottomPadding },
          ]}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : undefined}
          keyboardShouldPersistTaps="handled"
          scrollIndicatorInsets={{ bottom: coachScrollIndicatorBottomInset }}
          showsVerticalScrollIndicator={false}
        >
          <ScreenHeader
            title={t('coach.title')}
            variant={variant === 'tab' ? 'inline' : 'bar'}
            borderless
            onBack={showBackButton ? handleClose : undefined}
            topInset={false}
            centered={variant !== 'tab'}
            backTestID="coach-back-button"
            right={
              <HeaderIconButton
                accessibilityLabel={t('coach.history_button_a11y')}
                icon={<History color={colors.primaryText} size={20} strokeWidth={2.2} />}
                onPress={handleViewHistory}
                testID="coach-history-icon-button"
              />
            }
            style={styles.scrollHeader}
            testID="coach-screen-header"
          />

          <View style={styles.scrollBody} testID="coach-scroll-body">
            <View
              style={styles.primarySection}
              testID="coach-latest-guidance-section"
            >
            {displayMode === 'settings' &&
            !showLoadingState &&
            !showQueryErrorState &&
            !showProviderUnavailableState &&
            !isGenerationAwaitingResult ? (
              <CoachSettingsInline
                activePersonaKey={activePersonaKey}
                selectedQuestionPromptType={selectedQuestionParentPromptType}
                expandedPromptType={expandedPromptType}
                personaOptions={inlinePersonaOptions}
                questionOptionsByPromptType={questionOptionsByPromptType}
                selectedQuestionKey={selectedQuestionKey}
                questionSelectionMode={questionSelectionMode}
                questionText={freeQuestionDraft}
                questionSectionLabel={t('coach.questions.section_label')}
                customQuestionLabel={t('coach.questions.custom_label')}
                customQuestionPlaceholder={t('coach.questions.custom_placeholder')}
                selectedBadgeLabel={t('coach.questions.selected_label')}
                questionCounterLabel={(count, max) =>
                  t('coach.questions.counter', { count, max })
                }
                questionMaxLength={COACH_FREE_QUESTION_MAX_LENGTH}
                promptTitle={promptTitleResolver}
                promptSubtitle={promptSubtitleResolver}
                promptCategoryLabel={promptCategoryTitleResolver}
                title={t('coach.settings.title')}
                subtitle={t('coach.settings.subtitle')}
                accentColor={activePersonaVisual.haloTint}
                personaSectionLabel={t('coach.options_sheet.persona_label')}
                modeSectionLabel={t('coach.options_sheet.mode_label')}
                lockedBadgeLabel={t('coach.locked_badge')}
                lockedHint={t('coach.locked_tap_hint')}
                onSelectQuestion={(questionKey) => {
                  const questionPromptType =
                    getCoachQuestionDefinition(questionKey).promptType;
                  setScanResultContext(null);
                  setExpandedPromptType(questionPromptType);
                  setQuestionSelectionMode('preset');
                  setSelectedQuestionKey(questionKey);
                }}
                onSelectCustomQuestion={() => {
                  setScanResultContext(null);
                  setQuestionSelectionMode('free_text');
                  setSelectedQuestionKey(null);
                }}
                onQuestionInputFocus={scrollQuestionInputIntoView}
                onQuestionInputLayout={handleQuestionInputLayout}
                onChangeQuestionText={(value) => {
                  setScanResultContext(null);
                  setFreeQuestionDraft(value);
                  setSelectedQuestionKey(null);
                  setQuestionSelectionMode('free_text');
                }}
                onSelectPromptType={(promptType) => {
                  if (isPromptLockedForUser(promptType)) {
                    handleOpenPremiumUpgrade('mode', {
                      prompt_type: promptType,
                    });
                    return;
                  }
                  setExpandedPromptType((currentPromptType) =>
                    currentPromptType === promptType ? null : promptType,
                  );
                }}
                onPreviewPersona={(personaKey) => {
                  handlePersonaPress(personaKey as CoachPersonaKey);
                }}
                isPromptLocked={isPromptLockedForUser}
                busyPromptType={submittingPromptType}
                busy={isGenerationAwaitingResult || isPersonaSaving}
                disabled={arePromptCardsDisabled}
              />
            ) : null}

            {showLoadingState ? (
              <ScreenState
                tone="loading"
                layout="inline"
                surfaceVariant="raised"
                testID="coach-loading-state"
              />
            ) : null}

            {showGenerationLoadingState ? (
              <View
                style={styles.generationLoadingShell}
                testID="coach-generation-loading-state"
              >
                <View style={styles.generationLoadingCard}>
                  <View style={styles.generationLoadingHeader}>
                    <View style={styles.generationLoadingIconShell}>
                      <CoachFeatureIcon
                        color={activePersonaVisual.haloTint}
                        size={22}
                        strokeWidth={2.4}
                      />
                    </View>
                    <View style={styles.generationLoadingCopy}>
                      <Text style={styles.generationLoadingTitle}>
                        {t('coach.loading_title')}
                      </Text>
                      <Text style={styles.generationLoadingBody}>
                        {t('coach.loading_body')}
                      </Text>
                    </View>
                    <Text
                      style={styles.generationLoadingPercent}
                      testID="coach-generation-loading-percentage"
                    >
                      {`${coachLoadingPercent}%`}
                    </Text>
                  </View>

                  <View
                    style={styles.generationProgressTrack}
                    testID="coach-generation-loading-progress-track"
                  >
                    <View
                      style={[
                        styles.generationProgressFillHost,
                        { width: coachLoadingProgressWidth },
                      ]}
                      testID="coach-generation-loading-progress-fill"
                    >
                      <LinearGradient
                        colors={[
                          withAlpha(activePersonaVisual.haloTint, 0.72),
                          activePersonaVisual.haloTint,
                        ]}
                        end={{ x: 1, y: 0 }}
                        start={{ x: 0, y: 0 }}
                        style={styles.generationProgressFill}
                      />
                    </View>
                  </View>

                  <Text style={styles.generationLoadingHint}>
                    {t('coach.loading_hint')}
                  </Text>
                </View>

                {isCoachLoadingMiniGameActive ? (
                  <View
                    style={styles.generationMiniGameHost}
                    testID="coach-loading-mini-game"
                  >
                    <LoadingMiniGame
                      accentColor={activePersonaVisual.haloTint}
                      active
                      compact={false}
                      durationHintMs={COACH_GENERATION_LOADING_DURATION_MS}
                      variant="coach"
                    />
                  </View>
                ) : null}
              </View>
            ) : null}

            {showQueryErrorState ? (
              <ScreenState
                tone="error"
                title={t('coach.error_title')}
                message={queryErrorBody}
                actionLabel={t('common.retry')}
                onAction={handleRetryQueries}
                testID="coach-query-error-state"
              />
            ) : null}

            {showProviderUnavailableState ? (
              <ScreenState
                tone="unavailable"
                title={t('coach.unavailable_title')}
                message={t('coach.unavailable_body')}
                testID="coach-unavailable-state"
              />
            ) : null}

            {displayMode === 'result' && showGenerationErrorState ? (
              <ScreenState
                tone="error"
                title={t('coach.error_title')}
                message={generationErrorBody}
                actionLabel={t('common.retry')}
                onAction={() => {
                  void handleGenerate();
                }}
                testID="coach-error-state"
              />
            ) : null}

            {showEmptyState ? (
              <ScreenState
                tone="empty"
                title={t('coach.no_scan_title')}
                message={t('coach.no_scan_body')}
                icon={<ScanLine />}
                actionLabel={t('coach.first_scan_required_cta')}
                onAction={handleOpenScanner}
                testID="coach-empty-state"
                actionTestID="coach-empty-scan-cta"
              />
            ) : null}

            {displayMode === 'result' && displayedGuidance ? (
              <View testID="coach-ready-state">
                <CoachGuidanceCard
                  variant={displayedGuidanceVariant ?? 'compact'}
                  eyebrow={displayedGuidanceEyebrow}
                  statusLabel={
                    displayedGuidance.cached
                      ? t('coach.cached_badge')
                      : t('coach.recent_badge')
                  }
                  fallbackLabel={
                    displayedGuidance.fallback
                      ? t('coach.fallback_badge')
                      : null
                  }
                  modeLabel={displayedGuidanceModeLabel}
                  metricBadge={displayedGuidanceMetricBadge}
                  content={displayedGuidance.content}
                  sectionLabels={displayedGuidanceSectionLabels}
                  timestampLabel={displayedGuidanceTimestampLabel}
                  personaKey={displayedGuidance.persona_key}
                  personaLabel={t('coach.used_persona_label')}
                  personaValue={t(displayedGuidancePersona.titleTranslationKey)}
                  personaAvatarSource={displayedGuidancePersona.avatarSource}
                  personaAvatarFallbackLabel={
                    displayedGuidancePersona.avatarFallbackLabel
                  }
                  personaAvatarHaloTint={
                    displayedGuidancePersona.avatarHaloTint
                  }
                  title={displayedGuidance.title}
                  body={displayedGuidance.body}
                  disclaimerLabel={t('coach.disclaimer_label')}
                  disclaimerPillLabel={t('coach.disclaimer_pill_label')}
                  disclaimer={displayedGuidanceDisclaimer}
                  expandLabel={t('coach.expand_cta')}
                  collapseLabel={t('coach.collapse_cta')}
                  continuationHintLabel={t('coach.continuation_hint')}
                  ctaLabel={displayedGuidanceCtaLabel}
                  onCtaPress={
                    displayedGuidanceCtaRoute
                      ? () => router.push(displayedGuidanceCtaRoute)
                      : null
                  }
                  defaultExpanded
                />
              </View>
            ) : null}
          </View>
          </View>
        </ScrollView>

        <View
          pointerEvents="box-none"
          style={[styles.actionBarOverlay, { bottom: actionBarBottomOffset }]}
          testID="coach-action-bar-overlay"
        >
          <View
            onLayout={handleActionBarLayout}
            style={styles.actionBar}
            testID="coach-action-bar"
          >
            <CoachActionComposer
              personaTitle={activePersonaTitle}
              promptTitle={selectedPromptTitle}
              actionLabel={actionPrimaryLabel}
              actionA11yLabel={actionPrimaryA11yLabel}
              personaVisual={activePersonaVisual}
              busy={isGenerationAwaitingResult}
              disabled={isActionPrimaryDisabled}
              muted={isActionPrimaryMuted}
              onPress={handleActionPrimaryPress}
              actionTestID="coach-action-primary"
            />
          </View>
        </View>

        <CoachPersonaDetailsModal
          visible={previewedPersona !== null}
          persona={previewedPersona}
          visual={previewedPersona?.visual ?? null}
          active={previewedPersona?.key === activePersonaKey}
          locked={previewedPersona?.locked ?? false}
          onClose={handleClosePersonaDetails}
          onConfirm={() => {
            void handleConfirmPersonaSelection();
          }}
          onUnlock={handleUnlockPreviewedPersona}
        />
      </View>
    </AppScreen>
  );
}

const createStyles = (
  colors: any,
  isDark: boolean,
  insets: { bottom: number },
  variant: NonNullable<CoachScreenProps['variant']>,
  accentColor: string,
  isKeyboardVisible: boolean,
) => {
  const chrome = getMainPageChrome(colors, isDark, 'coach');
  const coachCanvas = isDark ? chrome.canvasElevated : chrome.canvas;
  const actionBarBottomPadding =
    isKeyboardVisible
      ? SPACING.sm + 2
      : variant === 'tab'
      ? Math.max(SPACING.sm, Math.round(insets.bottom / 2) + SPACING.xs)
      : insets.bottom + SPACING.sm + 2;

  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: coachCanvas,
    },
    container: {
      flex: 1,
      backgroundColor: coachCanvas,
      overflow: 'hidden',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACING.md,
      paddingHorizontal: SPACING.page,
      paddingTop: SPACING.xs,
      paddingBottom: SPACING.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.06),
      backgroundColor: chrome.headerBackground,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: BORDER_RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceMuted ?? colors.cardBackground,
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08),
    },
    headerTitle: {
      flex: 1,
      fontSize: SIZES.text18,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
      textAlign: 'center',
    },
    headerSpacer: {
      width: 40,
      height: 40,
    },
    headerIconButton: {
      width: 40,
      height: 40,
      borderRadius: BORDER_RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceMuted ?? colors.cardBackground,
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08),
    },
    scrollView: {
      flex: 1,
    },
    content: {
      paddingTop: 0,
    },
    scrollHeader: {
      backgroundColor: 'transparent',
    },
    scrollBody: {
      paddingHorizontal: SPACING.page,
      paddingTop: SPACING.md + 4,
      gap: SPACING.lg,
    },
    primarySection: {
      gap: SPACING.md,
    },
    actionBarOverlay: {
      position: 'absolute',
      left: 0,
      right: 0,
      zIndex: 12,
      elevation: 12,
    },
    actionBar: {
      paddingHorizontal: SPACING.page,
      paddingTop: SPACING.xs,
      paddingBottom: actionBarBottomPadding,
      backgroundColor: 'transparent',
    },
    stateCard: {
      padding: SPACING.md + 2,
      borderRadius: BORDER_RADIUS.xl,
      backgroundColor: chrome.surface.backgroundColor,
      borderWidth: 1,
      borderColor: chrome.surface.borderColor,
      shadowColor: chrome.accentColor,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.16,
      shadowRadius: 18,
      elevation: 2,
      gap: SPACING.sm,
      alignItems: 'flex-start',
      justifyContent: 'flex-start',
    },
    stateCardCentered: {
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 72,
    },
    stateCardEmphasis: {
      alignItems: 'center',
    },
    stateCardInline: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
    },
    stateCardSubtle: {
      backgroundColor: chrome.mutedSurface.backgroundColor,
    },
    stateTitle: {
      fontSize: SIZES.text16,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
      textAlign: 'left',
    },
    stateTextCentered: {
      textAlign: 'center',
      alignSelf: 'stretch',
    },
    stateBody: {
      fontSize: SIZES.text14,
      lineHeight: 20,
      color: colors.textMuted ?? colors.gray,
      textAlign: 'left',
    },
    generationLoadingShell: {
      gap: SPACING.sm + 2,
      alignSelf: 'stretch',
    },
    generationLoadingCard: {
      padding: SPACING.md + 2,
      borderRadius: BORDER_RADIUS.xl,
      backgroundColor: isDark
        ? withAlpha(chrome.elevatedSurface.backgroundColor, 0.92)
        : chrome.elevatedSurface.backgroundColor,
      borderWidth: 1,
      borderColor: withAlpha(accentColor, isDark ? 0.24 : 0.18),
      shadowColor: chrome.accentColor,
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: isDark ? 0.2 : 0.12,
      shadowRadius: 24,
      elevation: 4,
      gap: SPACING.sm + 2,
      overflow: 'hidden',
    },
    generationLoadingHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    generationLoadingIconShell: {
      width: 42,
      height: 42,
      borderRadius: BORDER_RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(accentColor, isDark ? 0.16 : 0.1),
      borderWidth: 1,
      borderColor: withAlpha(accentColor, isDark ? 0.32 : 0.22),
    },
    generationLoadingCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    generationLoadingTitle: {
      fontSize: SIZES.text16,
      lineHeight: 21,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
    },
    generationLoadingBody: {
      fontSize: SIZES.text14,
      lineHeight: 18,
      fontWeight: FONT_WEIGHTS.medium,
      color: colors.textMuted ?? colors.gray,
    },
    generationLoadingPercent: {
      minWidth: 48,
      fontSize: SIZES.text18,
      lineHeight: 23,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
      textAlign: 'right',
    },
    generationProgressTrack: {
      height: 8,
      borderRadius: BORDER_RADIUS.full,
      overflow: 'hidden',
      backgroundColor: withAlpha(colors.primaryText, isDark ? 0.09 : 0.07),
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: withAlpha(accentColor, isDark ? 0.22 : 0.16),
    },
    generationProgressFillHost: {
      height: '100%',
      borderRadius: BORDER_RADIUS.full,
      overflow: 'hidden',
    },
    generationProgressFill: {
      flex: 1,
      borderRadius: BORDER_RADIUS.full,
    },
    generationLoadingHint: {
      fontSize: SIZES.text12,
      lineHeight: 16,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.textMuted ?? colors.gray,
    },
    generationMiniGameHost: {
      alignSelf: 'stretch',
    },
    emptyCard: {
      alignItems: 'flex-start',
      gap: SPACING.sm + 2,
      padding: SPACING.md + 2,
      borderRadius: BORDER_RADIUS.hero,
      backgroundColor: chrome.heroSurface.backgroundColor,
      borderWidth: 1,
      borderColor: chrome.heroSurface.borderColor,
      ...chrome.heroSurface.shadowStyle,
    },
    emptyIconShell: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(colors.primary, 0.1),
      borderWidth: 1,
      borderColor: withAlpha(colors.primary, 0.2),
    },
    emptyCopy: {
      gap: 4,
      alignSelf: 'stretch',
    },
    emptyTitle: {
      fontSize: SIZES.text18,
      lineHeight: 23,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
    },
    emptyBody: {
      fontSize: SIZES.text14,
      lineHeight: 20,
      color: colors.textMuted ?? withAlpha(colors.gray, 0.96),
    },
    emptyScanCta: {
      alignSelf: 'stretch',
      minHeight: 44,
      borderRadius: BORDER_RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: SPACING.md,
      backgroundColor: withAlpha(colors.primary, 0.13),
      borderWidth: 1,
      borderColor: withAlpha(colors.primary, 0.26),
    },
    emptyScanCtaText: {
      fontSize: SIZES.text14,
      lineHeight: 18,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primary,
      textAlign: 'center',
    },
    emptyScanHint: {
      alignSelf: 'stretch',
      fontSize: SIZES.text12,
      lineHeight: 16,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.textMuted ?? withAlpha(colors.primaryText, 0.56),
      textAlign: 'center',
    },
    loadingIndicatorWrap: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceAccent ?? withAlpha(colors.primary, 0.08),
    },
    inlineLoadingIndicatorWrap: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceAccent ?? withAlpha(colors.primary, 0.08),
    },
    inlineStateCopy: {
      flex: 1,
      gap: 2,
    },
    inlineStateTitle: {
      fontSize: SIZES.text14,
      lineHeight: 18,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.primaryText,
    },
    inlineStateHint: {
      fontSize: SIZES.text12,
      lineHeight: 16,
      color: colors.textMuted ?? colors.gray,
    },
    stateAction: {
      alignSelf: 'stretch',
      paddingTop: SPACING.xs,
    },
  });
};
