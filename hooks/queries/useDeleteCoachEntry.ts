import { InfiniteData, useMutation, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/contexts/AuthContext';
import { CoachServiceError } from '@/services/coach';
import {
  deleteCoachEntry,
  restoreCoachEntry,
} from '@/services/coachHistorySoftDelete';
import type { CoachUnifiedHistoryPage } from '@/shared/coachHistory';
import { COACH_SCREEN_SNAPSHOT_QUERY_KEY } from './useCoachScreenSnapshot';
import { COACH_HISTORY_INFINITE_QUERY_KEY } from './useInfiniteCoachHistory';
import { COACH_UNIFIED_HISTORY_INFINITE_QUERY_KEY } from './useInfiniteCoachUnifiedHistory';

interface UseDeleteCoachEntryVariables {
  entryId: string;
}

interface DeleteEntryMutationContext {
  unifiedSnapshots: Array<[readonly unknown[], InfiniteData<CoachUnifiedHistoryPage> | undefined]>;
  historySnapshots: Array<[readonly unknown[], unknown]>;
}

function removeEntryFromUnifiedPages(
  data: InfiniteData<CoachUnifiedHistoryPage> | undefined,
  entryId: string,
): InfiniteData<CoachUnifiedHistoryPage> | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.filter(
        (item) => !(item.kind === 'entry' && item.id === entryId),
      ),
    })),
  };
}

function removeEntryFromLegacyHistoryPages(data: unknown, entryId: string): unknown {
  if (!data || typeof data !== 'object') return data;
  const cast = data as InfiniteData<{ items: Array<{ id: string }> }>;
  if (!Array.isArray(cast.pages)) return data;
  return {
    ...cast,
    pages: cast.pages.map((page) => ({
      ...page,
      items: page.items.filter((item) => item.id !== entryId),
    })),
  };
}

export function useDeleteCoachEntry() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation<
    void,
    CoachServiceError,
    UseDeleteCoachEntryVariables,
    DeleteEntryMutationContext
  >({
    mutationFn: ({ entryId }) => deleteCoachEntry(entryId),
    onMutate: async ({ entryId }) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: COACH_UNIFIED_HISTORY_INFINITE_QUERY_KEY }),
        queryClient.cancelQueries({ queryKey: COACH_HISTORY_INFINITE_QUERY_KEY }),
      ]);

      const unifiedSnapshots = queryClient.getQueriesData<
        InfiniteData<CoachUnifiedHistoryPage>
      >({ queryKey: COACH_UNIFIED_HISTORY_INFINITE_QUERY_KEY });
      const historySnapshots = queryClient.getQueriesData({
        queryKey: COACH_HISTORY_INFINITE_QUERY_KEY,
      });

      // Optimistically drop the entry from both the unified feed and the
      // legacy requests-only feed so the user gets immediate feedback.
      queryClient.setQueriesData<InfiniteData<CoachUnifiedHistoryPage>>(
        { queryKey: COACH_UNIFIED_HISTORY_INFINITE_QUERY_KEY },
        (data) => removeEntryFromUnifiedPages(data, entryId),
      );
      queryClient.setQueriesData(
        { queryKey: COACH_HISTORY_INFINITE_QUERY_KEY },
        (data) => removeEntryFromLegacyHistoryPages(data, entryId),
      );

      return { unifiedSnapshots, historySnapshots };
    },
    onError: (_error, _variables, context) => {
      if (!context) return;
      for (const [key, value] of context.unifiedSnapshots) {
        queryClient.setQueryData(key, value);
      }
      for (const [key, value] of context.historySnapshots) {
        queryClient.setQueryData(key, value);
      }
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: COACH_UNIFIED_HISTORY_INFINITE_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: COACH_HISTORY_INFINITE_QUERY_KEY }),
        // F-01 (audit 2026-05-27): the Coach idle snapshot derives its latest
        // advice / latest guidance from `coach_entries` via the
        // `coach-screen-snapshot` Edge Function. Without this invalidation a
        // deleted entry would stay cached as the "latest" until the next cold
        // start.
        queryClient.invalidateQueries({ queryKey: COACH_SCREEN_SNAPSHOT_QUERY_KEY }),
      ]);
    },
    meta: { ownerUserId: user?.id ?? null },
  });
}

export function useRestoreCoachEntry() {
  const queryClient = useQueryClient();

  return useMutation<void, CoachServiceError, UseDeleteCoachEntryVariables>({
    mutationFn: ({ entryId }) => restoreCoachEntry(entryId),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: COACH_UNIFIED_HISTORY_INFINITE_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: COACH_HISTORY_INFINITE_QUERY_KEY }),
        // F-01 (audit 2026-05-27): see useDeleteCoachEntry — the snapshot must
        // refetch so the restored entry can resume its role as latest advice.
        queryClient.invalidateQueries({ queryKey: COACH_SCREEN_SNAPSHOT_QUERY_KEY }),
      ]);
    },
  });
}
