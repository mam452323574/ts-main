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
  const { user } = useAuth();

  return useQuery<CoachSourceScan[], CoachServiceError>({
    queryKey: getCoachScansQueryKey(user?.id),
    queryFn: () => fetchRecentCoachScans(),
    enabled: !!user?.id,
    staleTime: 1000 * 60,
    placeholderData: (previousData) => previousData,
    retry: shouldRetryCoachReadQuery,
  });
}
