import type { QueryClient } from '@tanstack/react-query';

import { ANALYTICS_QUERY_KEY } from '@/hooks/queries/useAnalytics';
import { COACH_ENTRIES_QUERY_KEY } from '@/hooks/queries/useCoachEntries';
import { COACH_HISTORY_SUMMARY_QUERY_KEY } from '@/hooks/queries/useCoachHistorySummary';
import { COACH_HISTORY_INFINITE_QUERY_KEY } from '@/hooks/queries/useInfiniteCoachHistory';
import { COACH_LATEST_READY_ENTRY_QUERY_KEY } from '@/hooks/queries/useLatestReadyCoachEntry';
import { DASHBOARD_QUERY_KEY } from '@/hooks/queries/useDashboard';
import { COACH_SCANS_QUERY_KEY } from '@/utils/coachScanQueries';

const ANALYTICS_QUERY_SCOPE = ANALYTICS_QUERY_KEY('7days').slice(0, 1);
const SCAN_ELIGIBILITY_QUERY_SCOPE = ['scanEligibility'] as const;

export async function invalidateScanRelatedQueries(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: SCAN_ELIGIBILITY_QUERY_SCOPE }),
    queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: ANALYTICS_QUERY_SCOPE }),
    queryClient.invalidateQueries({ queryKey: COACH_SCANS_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: COACH_ENTRIES_QUERY_KEY }),
    queryClient.invalidateQueries({
      queryKey: COACH_LATEST_READY_ENTRY_QUERY_KEY,
    }),
    queryClient.invalidateQueries({
      queryKey: COACH_HISTORY_SUMMARY_QUERY_KEY,
    }),
    queryClient.invalidateQueries({
      queryKey: COACH_HISTORY_INFINITE_QUERY_KEY,
    }),
  ]);

  await Promise.all([
    queryClient.refetchQueries({ queryKey: SCAN_ELIGIBILITY_QUERY_SCOPE }),
    queryClient.refetchQueries({ queryKey: DASHBOARD_QUERY_KEY }),
    queryClient.refetchQueries({ queryKey: ANALYTICS_QUERY_SCOPE }),
  ]);
}
