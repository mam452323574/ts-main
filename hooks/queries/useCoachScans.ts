import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/contexts/AuthContext';
import {
  fetchRecentCoachScans,
  type CoachServiceError,
  type CoachSourceScan,
} from '@/services/coach';
import {
  COACH_SCANS_QUERY_KEY,
  getCoachScansQueryKey,
} from '@/utils/coachScanQueries';
import { shouldRetryCoachReadQuery } from './coachQueryRetry';

export { COACH_SCANS_QUERY_KEY, getCoachScansQueryKey };

export function useCoachScans() {
  const { user, userProfile } = useAuth();
  // Defense-in-depth: pass the tier so a free account's scan history loaded
  // into client memory has its premium-locked fields stripped server-side
  // mirror style. Premium and admin keep the full payload for UI/coach
  // context — see services/coach.ts:fetchRecentCoachScans.
  const accountTier = userProfile?.account_tier ?? null;

  return useQuery<CoachSourceScan[], CoachServiceError>({
    queryKey: getCoachScansQueryKey(user?.id),
    queryFn: () => fetchRecentCoachScans(undefined, { accountTier }),
    enabled: !!user?.id,
    staleTime: 1000 * 60,
    placeholderData: (previousData) => previousData,
    retry: shouldRetryCoachReadQuery,
  });
}
