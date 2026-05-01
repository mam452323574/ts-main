import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/contexts/AuthContext';
import { fetchFridgeScanRecord } from '@/services/fridgeScan';
import type { FridgeScanRecordState } from '@/types/fridgeScan';

export const FRIDGE_SCAN_RECORD_QUERY_KEY = ['fridgeScanRecord'] as const;
export const FRIDGE_SCAN_RECORD_POLL_INTERVAL_MS = 2000;

export const getFridgeScanRecordQueryKey = (
  userId?: string | null,
  fridgeScanId?: string | null,
) =>
  [
    ...FRIDGE_SCAN_RECORD_QUERY_KEY,
    userId ?? 'anonymous',
    fridgeScanId ?? 'missing',
  ] as const;

export function useFridgeScanRecord(fridgeScanId?: string | null) {
  const { user } = useAuth();
  const trackedId = fridgeScanId ?? null;

  return useQuery<FridgeScanRecordState>({
    queryKey: getFridgeScanRecordQueryKey(user?.id, trackedId),
    queryFn: () => fetchFridgeScanRecord(trackedId!),
    enabled: !!user?.id && !!trackedId,
    staleTime: trackedId ? 0 : 1000 * 60,
    refetchInterval: (query) => {
      const status = query.state.data?.status ?? 'queued';
      return status === 'queued'
        ? FRIDGE_SCAN_RECORD_POLL_INTERVAL_MS
        : false;
    },
  });
}
