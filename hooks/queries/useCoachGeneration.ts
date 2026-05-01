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
  CoachGuidanceResult,
  CoachPersonaKey,
  CoachPromptType,
} from '@/types';

interface GenerateCoachGuidanceInput {
  promptType: CoachPromptType;
  personaKey: CoachPersonaKey;
  forceRefresh?: boolean;
}

export function useCoachGeneration() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { locale } = useLanguage();

  return useMutation<
    CoachGuidanceResult,
    CoachServiceError,
    GenerateCoachGuidanceInput
  >({
    mutationFn: ({ promptType, personaKey, forceRefresh }) =>
      generateCoachGuidance({
        promptType,
        personaKey,
        forceRefresh,
        locale,
      }),
    onSuccess: async (data) => {
      if (data.quota) {
        queryClient.setQueryData(getCoachQuotaQueryKey(user?.id), data.quota);
      }

      await queryClient.invalidateQueries({
        queryKey: GROWTH_EXPERIENCE_QUERY_KEY(user?.id),
      });
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
