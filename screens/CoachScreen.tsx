import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, History, ScanLine } from 'lucide-react-native';

import { Button } from '@/components/Button';
import { CoachFeatureIcon } from '@/components/FeatureIcons';
import { CoachGuidanceCard } from '@/components/coach/CoachGuidanceCard';
import { CoachPersonaDetailsModal } from '@/components/coach/CoachPersonaDetailsModal';
import { CoachSettingsInline } from '@/components/coach/CoachSettingsInline';
import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SIZES,
  SPACING,
  withAlpha,
} from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import {
  COACH_HISTORY_SUMMARY_QUERY_KEY,
  COACH_LATEST_READY_ENTRY_QUERY_KEY,
  getCoachQuotaQueryKey,
  useCoachEntries,
  useCoachGeneration,
  useCoachHistorySummary,
  useCoachQuota,
  useCoachScans,
  useLatestReadyCoachEntry,
} from '@/hooks/queries';
import { useApplyCoachProfileUpdates } from '@/hooks/useApplyCoachProfileUpdates';
import { useCustomAlert } from '@/hooks/useCustomAlert';
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
  COACH_PROMPT_TYPES,
  DEFAULT_COACH_PROMPT_TYPE,
} from '@/shared/coachPromptTypes';
import type {
  CoachEntry,
  CoachPersonaKey,
  CoachPrimaryMetricDelta,
  CoachPromptType,
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

const PROMPT_TYPES: readonly CoachPromptType[] = COACH_PROMPT_TYPES;
const DEFAULT_PROMPT_TYPE: CoachPromptType = DEFAULT_COACH_PROMPT_TYPE;
const COACH_SCREEN_ENTRIES_LIMIT = 10;

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
  prompt_type: CoachPromptType | null;
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

type CoachRenderableCandidate = {
  status?: CoachEntry['status'] | null;
  title?: string | null;
  body?: string | null;
};

type CoachScreenProps = {
  variant?: 'stack' | 'tab';
};

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
  const queryClient = useQueryClient();
  const { user, userProfile, updateCoachPersona } = useAuth();
  const { colors } = useTheme();
  const { locale, t } = useLanguage();
  const { alertElement, showAlert } = useCustomAlert();
  const insets = useSafeAreaInsets();
  const styles = useMemo(
    () => createStyles(colors, insets, variant),
    [colors, insets, variant],
  );
  const coachAlertIcon = (
    <CoachFeatureIcon color={colors.primary} size={30} strokeWidth={2.3} />
  );
  const showBackButton = variant === 'stack';
  const [trackedEntryId, setTrackedEntryId] = useState<string | null>(null);
  const loadingWasActiveRef = useRef(false);
  const trackedEntryTerminalInvalidationRef = useRef<string | null>(null);
  const [selectedPromptType, setSelectedPromptType] =
    useState<CoachPromptType>(DEFAULT_PROMPT_TYPE);
  const [submittingPromptType, setSubmittingPromptType] =
    useState<CoachPromptType | null>(null);
  const [pendingPersonaKey, setPendingPersonaKey] =
    useState<CoachPersonaKey | null>(null);
  const [previewedPersonaKey, setPreviewedPersonaKey] =
    useState<CoachPersonaKey | null>(null);
  const [displayMode, setDisplayMode] = useState<'settings' | 'result'>(
    'settings',
  );
  const {
    data: entriesData,
    error: entriesError,
    isLoading: isEntriesLoading,
    isFetching: isEntriesFetching,
    refetch: refetchEntries,
  } = useCoachEntries({
    trackedEntryId,
    limit: COACH_SCREEN_ENTRIES_LIMIT,
  });
  const entries = entriesData ?? [];
  const hasEntriesData = entriesData !== undefined;
  const coachGeneration = useCoachGeneration();
  const {
    data: coachQuota,
    error: coachQuotaError,
    isFetching: isCoachQuotaFetching,
    refetch: refetchCoachQuota,
  } = useCoachQuota();

  const {
    data: recentScansData,
    error: recentScansError,
    isLoading: isScansLoading,
    isFetching: isScansFetching,
    refetch: refetchScans,
  } = useCoachScans();
  const recentScans = recentScansData ?? [];
  const hasRecentScansData = recentScansData !== undefined;
  const hasUsableCoachScans = recentScans.length > 0;
  const hasConfirmedNoUsableCoachScans =
    hasRecentScansData &&
    !hasUsableCoachScans;
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

  useEffect(() => {
    trackEvent('coach_opened');
    void markCoachSeen();
  }, []);

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
  const {
    data: latestReadyEntryData,
    error: latestReadyEntryError,
    isLoading: isLatestReadyEntryLoading,
    refetch: refetchLatestReadyEntry,
  } = useLatestReadyCoachEntry({
    personaKey: activePersonaKey,
    locale,
  });
  const latestReadyEntry = latestReadyEntryData ?? null;
  const hasLatestReadyEntryData = latestReadyEntryData !== undefined;
  useApplyCoachProfileUpdates(latestReadyEntry);
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
  const isTrackedEntryPending =
    effectiveTrackedEntryId !== null &&
    (!trackedCoachEntry ||
      (trackedCoachEntry.status ?? 'pending') === 'pending');
  const isTrackedEntryError = trackedCoachEntry?.status === 'error';
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
  const latestReadyGuidance: CoachGuidanceViewModel | null = latestReadyEntry
    ? {
        title: latestReadyEntry.title,
        body: latestReadyEntry.body,
        disclaimer: latestReadyEntry.disclaimer,
        persona_key: latestReadyEntry.persona_key,
        prompt_type: latestReadyEntry.prompt_type ?? null,
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
    !hasGenerationFailure;
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
  const {
    data: historySummaryData,
    isLoading: isHistorySummaryLoading,
    refetch: refetchHistorySummary,
  } = useCoachHistorySummary({
    excludeEntryId: activeEntryId,
  });
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
  useFocusEffect(
    useCallback(() => {
      if (!user?.id) {
        return;
      }

      void refetchScans();
      void refetchEntries();
      void refetchLatestReadyEntry();
      void refetchHistorySummary();
    }, [
      refetchEntries,
      refetchHistorySummary,
      refetchLatestReadyEntry,
      refetchScans,
      user?.id,
    ]),
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
  const trackedEntryFailureDebugInfo = useMemo(
    () => getCoachEntryFailureDebugInfo(trackedCoachEntry),
    [trackedCoachEntry],
  );
  const trackedEntryFailureKind = useMemo(
    () => resolveCoachFailureKindFromEntry(trackedCoachEntry),
    [trackedCoachEntry],
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
      displayedGuidance?.prompt_type
        ? t(`coach.prompts.${displayedGuidance.prompt_type}.title`)
        : null,
    [displayedGuidance?.prompt_type, t],
  );
  const displayedGuidanceSectionLabels = useMemo(
    () => ({
      context_notes: t('coach.sections.context_notes'),
      priorities: t('coach.sections.priorities'),
      action_steps: t('coach.sections.action_steps'),
      warnings: t('coach.sections.warnings'),
      data_gaps: t('coach.sections.data_gaps'),
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
    !showQueryErrorState &&
    !showProviderUnavailableState &&
    !showGenerationErrorState &&
    hasConfirmedNoUsableCoachScans &&
    !displayedGuidance &&
    !hasHistorySignal &&
    !isGenerationAwaitingResult &&
    !isHistorySummaryInitialLoading;
  const arePromptCardsDisabled =
    isGenerationAwaitingResult ||
    isPersonaSaving ||
    coachProviderUnavailable ||
    (isScansFetching && !hasRecentScansData);
  const coachQuotaPrimaryLabel = useMemo(() => {
    if (!coachQuota) {
      return isCoachQuotaFetching
        ? t('coach.action_bar.primary_checking')
        : t('coach.action_bar.primary_unavailable');
    }

    if (coachQuota.unlimited) {
      return t('coach.action_bar.primary_unlimited');
    }

    const available = coachQuota.available ?? 0;
    const limit = coachQuota.limit ?? 0;

    if (available <= 0) {
      const cooldown = coachQuotaCountdownLabel
        ? t('coach.quota.next_request_in', {
            duration: coachQuotaCountdownLabel,
          })
        : t('coach.quota.recharge_soon');

      return t('coach.action_bar.primary_exhausted', {
        available,
        limit,
        cooldown,
      });
    }

    return t('coach.action_bar.primary_with_quota', { available, limit });
  }, [
    coachQuota,
    coachQuotaCountdownLabel,
    isCoachQuotaFetching,
    t,
  ]);
  const shouldUseCompactGenerationState = !!displayedGuidance;
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
    setDisplayMode('settings');
  }, []);

  const isPromptLockedForUser = useCallback(
    (promptType: CoachPromptType) =>
      isCoachPromptTypeLockedForProfile(promptType, userProfile),
    [userProfile],
  );

  // Garde-fou : si le mode courant est verrouillé pour le tier actuel
  // (ex: l'utilisateur est passé free avec un mode premium en state local),
  // on rebascule sur le mode par défaut.
  useEffect(() => {
    if (isPromptLockedForUser(selectedPromptType)) {
      setSelectedPromptType(DEFAULT_PROMPT_TYPE);
    }
  }, [isPromptLockedForUser, selectedPromptType]);

  useEffect(() => {
    if (hasGenerationGuidance) {
      setDisplayMode('result');
    }
  }, [hasGenerationGuidance]);

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
    void Promise.all([
      queryClient.invalidateQueries({
        queryKey: COACH_LATEST_READY_ENTRY_QUERY_KEY,
      }),
      queryClient.invalidateQueries({
        queryKey: COACH_HISTORY_SUMMARY_QUERY_KEY,
      }),
    ]);
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
      mutation_entry_id: coachGeneration.data?.entry_id ?? null,
      mutation_status: coachGeneration.data?.status ?? null,
      display_mode: displayMode,
      tracked_entry_id: effectiveTrackedEntryId,
      tracked_status:
        trackedCoachEntry?.status ??
        (!effectiveTrackedEntryId ? null : 'missing'),
      tracked_error_code: trackedCoachEntry?.error_code ?? null,
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
      has_tracked_guidance: hasTrackedGuidance,
      has_generation_guidance: hasGenerationGuidance,
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

  const handleGenerate = async () => {
    const promptType = selectedPromptType;

    if (activePersonaLocked) {
      trackEvent('coach_generation_locked_persona_blocked', {
        prompt_type: promptType,
        persona_key: activePersonaKey,
      });
      handleOpenPremiumUpgrade('generation', {
        prompt_type: promptType,
        persona_key: activePersonaKey,
      });
      return;
    }

    if (hasConfirmedNoUsableCoachScans) {
      setTrackedEntryId(null);
      setDisplayMode('settings');
      trackEvent('coach_prompt_blocked_no_scans', {
        prompt_type: promptType,
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
        prompt_type: promptType,
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
        prompt_type: promptType,
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

    setSubmittingPromptType(promptType);
    setTrackedEntryId(null);
    setDisplayMode('result');
    trackEvent('coach_prompt_submitted', {
      prompt_type: promptType,
      persona_key: activePersonaKey,
      has_recent_scans: hasUsableCoachScans,
    });

    try {
      const response = await coachGeneration.mutateAsync({
        promptType,
        personaKey: activePersonaKey,
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
        prompt_type: promptType,
        persona_key: response.persona_key,
        cached: response.cached,
        fallback: response.fallback,
        status: response.status,
      });
    } catch (error) {
      if (shouldDebugCoachScreen()) {
        console.log('[CoachScreen] generation request failed', {
          prompt_type: promptType,
          persona_key: activePersonaKey,
          locale,
          ...getCoachServiceErrorDebugInfo(error),
        });
      }

      const quotaFromError = getCoachQuotaFromError(error);
      if (quotaFromError) {
        queryClient.setQueryData(
          getCoachQuotaQueryKey(user?.id),
          quotaFromError,
        );
      }

      if (isCoachQuotaExhaustedError(error)) {
        setTrackedEntryId(null);
        setDisplayMode('settings');
        coachGeneration.reset();
        trackEvent('coach_prompt_blocked_quota_exhausted', {
          prompt_type: promptType,
          persona_key: activePersonaKey,
          account_tier: quotaFromError?.account_tier ?? 'unknown',
          next_recharge_at: quotaFromError?.next_recharge_at ?? null,
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
        persona_key: activePersonaKey,
        message: error instanceof Error ? error.message : 'unknown',
      });
    } finally {
      setSubmittingPromptType(null);
    }
  };

  const handleClose = () => {
    if (router.canDismiss()) {
      router.dismiss();
      return;
    }

    router.back();
  };

  const handleRetryQueries = () => {
    void refetchEntries();
    void refetchScans();
    void refetchCoachQuota();
    void refetchLatestReadyEntry();
    void refetchHistorySummary();
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
    hasConfirmedNoUsableCoachScans;
  const actionPrimaryLabel = isGenerationAwaitingResult
    ? t('coach.action_bar.primary')
    : shouldRoutePrimaryToScanner
      ? t('coach.action_bar.scan_required')
      : isResultDisplay
        ? t('coach.action_bar.primary')
        : coachQuotaPrimaryLabel;

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
    (!isGenerationAwaitingResult && isActionPrimaryDisabled);
  const actionPrimaryForegroundColor = isActionPrimaryMuted
    ? colors.primaryText
    : colors.white;
  const actionPrimaryTextLines =
    shouldRoutePrimaryToScanner ||
    (!isGenerationAwaitingResult && !isResultDisplay && isCoachQuotaExhausted)
      ? 2
      : 1;

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

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {alertElement}
      <View style={styles.container}>
        <View style={styles.header}>
          {showBackButton ? (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}
              onPress={handleClose}
              style={styles.backButton}
              testID="coach-back-button"
            >
              <ChevronLeft color={colors.primaryText} size={20} />
            </TouchableOpacity>
          ) : (
            <View style={styles.headerSpacer} />
          )}
          <Text style={styles.headerTitle}>{t('coach.title')}</Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t('coach.history_button_a11y')}
            onPress={handleViewHistory}
            style={styles.headerIconButton}
            testID="coach-history-icon-button"
          >
            <History color={colors.primaryText} size={20} strokeWidth={2.2} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

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
                selectedPromptType={selectedPromptType}
                personaOptions={inlinePersonaOptions}
                promptTitle={promptTitleResolver}
                promptSubtitle={promptSubtitleResolver}
                title={t('coach.settings.title')}
                subtitle={t('coach.settings.subtitle')}
                personaSectionLabel={t('coach.options_sheet.persona_label')}
                modeSectionLabel={t('coach.options_sheet.mode_label')}
                lockedBadgeLabel={t('coach.locked_badge')}
                lockedHint={t('coach.locked_tap_hint')}
                onSelectPromptType={(promptType) => {
                  if (isPromptLockedForUser(promptType)) {
                    handleOpenPremiumUpgrade('mode', {
                      prompt_type: promptType,
                    });
                    return;
                  }
                  setSelectedPromptType(promptType);
                }}
                onPreviewPersona={(personaKey) => {
                  handlePersonaPress(personaKey as CoachPersonaKey);
                }}
                isPromptLocked={isPromptLockedForUser}
                busy={isGenerationAwaitingResult || isPersonaSaving}
                disabled={arePromptCardsDisabled}
              />
            ) : null}

            {showLoadingState ? (
              <View
                style={[styles.stateCard, styles.stateCardCentered]}
                testID="coach-loading-state"
              >
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : null}

            {showGenerationLoadingState ? (
              <View
                style={[
                  styles.stateCard,
                  shouldUseCompactGenerationState
                    ? styles.stateCardInline
                    : styles.stateCardEmphasis,
                ]}
                testID="coach-generation-loading-state"
              >
                {shouldUseCompactGenerationState ? (
                  <>
                    <View style={styles.inlineLoadingIndicatorWrap}>
                      <ActivityIndicator color={colors.primary} size="small" />
                    </View>
                    <View style={styles.inlineStateCopy}>
                      <Text style={styles.inlineStateTitle}>
                        {t('coach.loading_title')}
                      </Text>
                      <Text style={styles.inlineStateHint}>
                        {t('coach.loading_body')}
                      </Text>
                    </View>
                  </>
                ) : (
                  <>
                    <View style={styles.loadingIndicatorWrap}>
                      <ActivityIndicator color={colors.primary} size="large" />
                    </View>
                    <Text style={[styles.stateTitle, styles.stateTextCentered]}>
                      {t('coach.loading_title')}
                    </Text>
                    <Text style={[styles.stateBody, styles.stateTextCentered]}>
                      {t('coach.loading_body')}
                    </Text>
                  </>
                )}
              </View>
            ) : null}

            {showQueryErrorState ? (
              <View style={styles.stateCard} testID="coach-query-error-state">
                <Text style={styles.stateTitle}>{t('coach.error_title')}</Text>
                <Text style={styles.stateBody}>{queryErrorBody}</Text>
                <View style={styles.stateAction}>
                  <Button
                    title={t('common.retry')}
                    onPress={handleRetryQueries}
                  />
                </View>
              </View>
            ) : null}

            {showProviderUnavailableState ? (
              <View style={styles.stateCard} testID="coach-unavailable-state">
                <Text style={styles.stateTitle}>
                  {t('coach.unavailable_title')}
                </Text>
                <Text style={styles.stateBody}>
                  {t('coach.unavailable_body')}
                </Text>
              </View>
            ) : null}

            {displayMode === 'result' && showGenerationErrorState ? (
              <View style={styles.stateCard} testID="coach-error-state">
                <Text style={styles.stateTitle}>{t('coach.error_title')}</Text>
                <Text style={styles.stateBody}>{generationErrorBody}</Text>
                <View style={styles.stateAction}>
                  <Button
                    title={t('common.retry')}
                    onPress={() => {
                      void handleGenerate();
                    }}
                  />
                </View>
              </View>
            ) : null}

            {showEmptyState ? (
              <View style={styles.emptyCard} testID="coach-empty-state">
                <View style={styles.emptyIconShell}>
                  <ScanLine
                    color={colors.primary}
                    size={22}
                    strokeWidth={2.3}
                  />
                </View>
                <View style={styles.emptyCopy}>
                  <Text style={styles.emptyTitle}>
                    {t('coach.no_scan_title')}
                  </Text>
                  <Text style={styles.emptyBody}>
                    {t('coach.no_scan_body')}
                  </Text>
                </View>
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={handleOpenScanner}
                  style={styles.emptyScanCta}
                  testID="coach-empty-scan-cta"
                >
                  <Text style={styles.emptyScanCtaText}>
                    {t('coach.first_scan_required_cta')}
                  </Text>
                </TouchableOpacity>
              </View>
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
                />
              </View>
            ) : null}

          </View>

        </ScrollView>

        <View style={styles.actionBar} testID="coach-action-bar">
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={actionPrimaryA11yLabel}
            accessibilityState={{ disabled: isActionPrimaryDisabled }}
            disabled={isActionPrimaryDisabled}
            onPress={handleActionPrimaryPress}
            style={[
              styles.actionPrimary,
              isActionPrimaryMuted ? styles.actionMuted : null,
            ]}
            testID="coach-action-primary"
          >
            {isGenerationAwaitingResult ? (
              <ActivityIndicator
                color={actionPrimaryForegroundColor}
                size="small"
              />
            ) : (
              <CoachFeatureIcon
                color={actionPrimaryForegroundColor}
                size={18}
                strokeWidth={2.4}
              />
            )}
            <Text
              adjustsFontSizeToFit
              minimumFontScale={0.84}
              style={[
                styles.actionPrimaryLabel,
                isActionPrimaryMuted ? styles.actionBlockedLabel : null,
              ]}
              numberOfLines={actionPrimaryTextLines}
            >
              {actionPrimaryLabel}
            </Text>
          </TouchableOpacity>
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
    </SafeAreaView>
  );
}

const createStyles = (
  colors: any,
  insets: { bottom: number },
  variant: NonNullable<CoachScreenProps['variant']>,
) => {
  const actionBarBottomPadding =
    variant === 'tab'
      ? Math.max(SPACING.sm, Math.round(insets.bottom / 2) + SPACING.xs)
      : insets.bottom + SPACING.sm + 2;

  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    container: {
      flex: 1,
      backgroundColor: colors.background,
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
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
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
      borderRadius: 20,
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
      paddingHorizontal: SPACING.page,
      paddingTop: SPACING.md,
      paddingBottom: SPACING.lg,
      gap: SPACING.md,
    },
    primarySection: {
      gap: SPACING.sm + 2,
    },
    actionBar: {
      flexDirection: 'column',
      gap: SPACING.sm + 2,
      paddingHorizontal: SPACING.page,
      paddingTop: SPACING.sm + 2,
      paddingBottom: actionBarBottomPadding,
      borderTopWidth: 1,
      borderTopColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.06),
      backgroundColor: colors.cardBackground,
    },
    actionPrimary: {
      alignSelf: 'stretch',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.xs + 2,
      minHeight: 52,
      paddingHorizontal: SPACING.md,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: colors.primary,
    },
    actionMuted: {
      borderWidth: 1,
      borderColor: colors.borderStrong ?? withAlpha(colors.primaryText, 0.08),
      backgroundColor: colors.surfaceMuted ?? withAlpha(colors.primaryText, 0.1),
    },
    actionPrimaryLabel: {
      flexShrink: 1,
      fontSize: SIZES.text14,
      lineHeight: 18,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.white,
      textAlign: 'center',
    },
    actionBlockedLabel: {
      color: colors.primaryText,
    },
    actionDisabled: {
      opacity: 0.55,
    },
    stateCard: {
      padding: SPACING.md + 2,
      borderRadius: BORDER_RADIUS.xl,
      backgroundColor: colors.cardBackground,
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.07),
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
      backgroundColor: colors.surfaceMuted ?? withAlpha(colors.primaryText, 0.02),
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
    emptyCard: {
      alignItems: 'flex-start',
      gap: SPACING.sm + 2,
      padding: SPACING.md + 2,
      borderRadius: BORDER_RADIUS.xl + 6,
      backgroundColor: withAlpha(colors.cardBackground, 0.96),
      borderWidth: 1,
      borderColor: withAlpha(colors.primary, 0.14),
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.08,
      shadowRadius: 18,
      elevation: 2,
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
