import type { QueryClient } from '@tanstack/react-query';

import type { ScanType } from '@/types';

const SCAN_ELIGIBILITY_QUERY_NAMESPACE = 'scanEligibility';
const ANONYMOUS_SCAN_ELIGIBILITY_SCOPE = 'anonymous';

export const SCAN_ELIGIBILITY_QUERY_SCOPE = (
  userId: string | null | undefined,
) =>
  [
    SCAN_ELIGIBILITY_QUERY_NAMESPACE,
    userId ?? ANONYMOUS_SCAN_ELIGIBILITY_SCOPE,
  ] as const;

export const SCAN_ELIGIBILITY_QUERY_KEY = (
  userId: string | null | undefined,
  scanType: ScanType,
) => [...SCAN_ELIGIBILITY_QUERY_SCOPE(userId), scanType] as const;

export async function invalidateScanEligibilityQueries(
  queryClient: QueryClient,
  userId: string | null | undefined,
) {
  if (!userId) {
    return;
  }

  await queryClient.invalidateQueries({
    queryKey: SCAN_ELIGIBILITY_QUERY_SCOPE(userId),
  });
}
