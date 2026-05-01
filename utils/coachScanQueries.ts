import type { QueryClient } from '@tanstack/react-query';

import {
  parseCoachSourceScan,
  type CoachSourceScan,
} from '@/services/coach';

export const COACH_SCANS_QUERY_KEY = ['coachScans'] as const;

export const getCoachScansQueryKey = (userId?: string | null) =>
  [...COACH_SCANS_QUERY_KEY, userId ?? 'anonymous'] as const;

function readScanUserId(scan: unknown) {
  if (!scan || typeof scan !== 'object') {
    return null;
  }

  const userId = (scan as { user_id?: unknown }).user_id;
  return typeof userId === 'string' && userId.trim().length > 0
    ? userId
    : null;
}

function mergeCoachScan(
  existing: CoachSourceScan[] | undefined,
  nextScan: CoachSourceScan,
) {
  const current = Array.isArray(existing) ? existing : [];
  return [
    nextScan,
    ...current.filter((scan) => scan.id !== nextScan.id),
  ];
}

export function primeCoachScansCache(
  queryClient: QueryClient,
  scan: unknown,
) {
  const parsedScan = parseCoachSourceScan(scan);
  if (!parsedScan) {
    return null;
  }

  const mergeWithParsedScan = (existing: CoachSourceScan[] | undefined) =>
    mergeCoachScan(existing, parsedScan);
  const userId = readScanUserId(scan);

  if (userId) {
    queryClient.setQueryData(
      getCoachScansQueryKey(userId),
      mergeWithParsedScan,
    );
  }

  queryClient.setQueriesData<CoachSourceScan[]>(
    { queryKey: COACH_SCANS_QUERY_KEY },
    mergeWithParsedScan,
  );

  return parsedScan;
}
