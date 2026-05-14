import { useMutation, useQueryClient } from '@tanstack/react-query';

import { COACH_ENTRIES_QUERY_KEY } from './useCoachEntries';
import { COACH_HISTORY_INFINITE_QUERY_KEY } from './useInfiniteCoachHistory';
import { COACH_HISTORY_SUMMARY_QUERY_KEY } from './useCoachHistorySummary';
import { COACH_LATEST_READY_ENTRY_QUERY_KEY } from './useLatestReadyCoachEntry';
import { getCoachQuotaQueryKey } from './useCoachQuota';
import { GROWTH_EXPERIENCE_QUERY_KEY } from './useGrowthExperience';

import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { CoachServiceError, generateCoachGuidance } from '@/services/coach';
import type {
  CoachGenerationPromptType,
  CoachGuidanceResult,
  CoachPersonaKey,
  CoachQuestionKey,
  ScanCoachIntent,
} from '@/types';

interface GenerateCoachGuidanceInput {
  promptType: CoachGenerationPromptType;
  personaKey: CoachPersonaKey;
  questionKey?: CoachQuestionKey | null;
  questionText?: string | null;
  scanId?: string | null;
  selectedScanId?: string | null;
  scanIntent?: ScanCoachIntent | null;
  forceRefresh?: boolean;
}

export function useCoachGeneration() {
  const queryClient = useQueryClient();
  const { user, userProfile, refreshUserProfile } = useAuth();
  const { locale } = useLanguage();

  return useMutation<
    CoachGuidanceResult,
    CoachServiceError,
    GenerateCoachGuidanceInput
  >({
    mutationFn: ({
      promptType,
      personaKey,
      questionKey,
      questionText,
      scanId,
      selectedScanId,
      scanIntent,
      forceRefresh,
    }) =>
      generateCoachGuidance({
        promptType,
        personaKey,
        questionKey,
        questionText,
        scanId,
        selectedScanId,
        scanIntent,
        forceRefresh,
        locale,
        coachProfileMemory: userProfile?.inferred_persona ?? null,
      }),
    onSuccess: async (data) => {
      if (data.quota) {
        queryClient.setQueryData(getCoachQuotaQueryKey(user?.id), data.quota);
      }

      await Promise.all([
        user ? refreshUserProfile() : Promise.resolve(),
        queryClient.invalidateQueries({
          queryKey: GROWTH_EXPERIENCE_QUERY_KEY(user?.id),
        }),
      ]);
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: COACH_ENTRIES_QUERY_KEY,
        }),
        queryClient.invalidateQueries({
          queryKey: COACH_LATEST_READY_ENTRY_QUERY_KEY,
        }),
        queryClient.invalidateQueries({
          queryKey: COACH_HISTORY_SUMMARY_QUERY_KEY,
        }),
        queryClient.invalidateQueries({
          queryKey: COACH_HISTORY_INFINITE_QUERY_KEY,
        }),
        queryClient.invalidateQueries({
          queryKey: getCoachQuotaQueryKey(user?.id),
        }),
      ]);
    },
  });
}
