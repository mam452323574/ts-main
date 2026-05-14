import { useCallback, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ApiError, ApiService, isConnectivityApiError } from '@/services/api';
import type { ScanEligibilityBatchResult } from '@/services/api';
import { ScanType, ScanEligibilityResponse } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import {
  SCAN_ELIGIBILITY_QUERY_KEY,
  SCAN_ELIGIBILITY_QUERY_SCOPE,
} from '@/utils/scanEligibilityQuery';

export { SCAN_ELIGIBILITY_QUERY_KEY };

const SCAN_TYPES: ScanType[] = ['body', 'health', 'nutrition', 'super'];

export const SCAN_ELIGIBILITY_BATCH_QUERY_KEY = (
  userId: string | null | undefined,
) => [...SCAN_ELIGIBILITY_QUERY_SCOPE(userId), 'batch'] as const;

export type ScanEligibilityDataMap = Partial<
  Record<ScanType, ScanEligibilityResponse>
>;
export type ScanEligibilityErrorMap = Partial<Record<ScanType, ApiError>>;
export type ScanEligibilityLoadingMap = Record<ScanType, boolean>;

function buildEmptyLoadingMap(value: boolean): ScanEligibilityLoadingMap {
  return {
    body: value,
    health: value,
    nutrition: value,
    super: value,
  };
}

export const useScanEligibility = (scanType: ScanType) => {
  const { session, loading } = useAuth();
  const userId = session?.user?.id ?? null;
  const canQuery = !loading && !!session;

  return useQuery<ScanEligibilityResponse, ApiError>({
    queryKey: SCAN_ELIGIBILITY_QUERY_KEY(userId, scanType),
    queryFn: () => ApiService.checkScanEligibilityOnly(scanType),
    staleTime: 1000 * 60 * 2, // 2 minutes - les limites de scan changent plus souvent
    enabled: canQuery,
  });
};

// Hook pour récupérer l'éligibilité de tous les types de scan en parallèle
export const useAllScanEligibility = () => {
  const { session, loading } = useAuth();
  const userId = session?.user?.id ?? null;
  const canQuery = !loading && !!session;

  const query = useQuery<ScanEligibilityBatchResult, ApiError>({
    queryKey: SCAN_ELIGIBILITY_BATCH_QUERY_KEY(userId),
    queryFn: () => ApiService.checkScanEligibilityBatch(SCAN_TYPES),
    staleTime: 1000 * 60 * 2,
    enabled: canQuery,
    retry: false,
  });
  const queryRef = useRef(query);
  queryRef.current = query;

  const data = useMemo(
    () => query.data?.data ?? {},
    [query.data],
  );

  const errors = useMemo(
    () => {
      if (query.data?.errors && Object.keys(query.data.errors).length > 0) {
        return query.data.errors;
      }

      if (!query.error) {
        return {};
      }

      const queryError: unknown = query.error;

      return SCAN_TYPES.reduce((acc, scanType) => {
        if (queryError instanceof ApiError) {
          acc[scanType] = queryError;
        } else if (queryError instanceof Error) {
          acc[scanType] = new ApiError(
            queryError.message,
            'UNKNOWN',
            queryError,
            {
              scanType,
              stage: 'eligibility',
            },
          );
        }
        return acc;
      }, {} as ScanEligibilityErrorMap);
    },
    [query.data?.errors, query.error],
  );

  const loadingByScanType = useMemo(
    () =>
      loading
        ? buildEmptyLoadingMap(true)
        : SCAN_TYPES.reduce((acc, scanType) => {
            acc[scanType] = canQuery && Boolean(query.isLoading);
            return acc;
          }, buildEmptyLoadingMap(false)),
    [
      canQuery,
      loading,
      query.isLoading,
    ],
  );

  const errorList = useMemo(() => Object.values(errors), [errors]);
  const hasConnectivityError = useMemo(
    () => errorList.some((error) => isConnectivityApiError(error)),
    [errorList],
  );
  const hasBlockingEligibilityError = useMemo(
    () => errorList.some((error) => !isConnectivityApiError(error)),
    [errorList],
  );

  const isLoading = useMemo(
    () => loading || (canQuery && query.isLoading),
    [
      canQuery,
      loading,
      query.isLoading,
    ],
  );

  const refetchAll = useCallback(async () => {
    if (!canQuery) {
      return [];
    }

    return [await queryRef.current.refetch()];
  }, [canQuery]);

  const refetchScanType = useCallback(async (scanType: ScanType) => {
    if (!canQuery) {
      return null;
    }

    if (!SCAN_TYPES.includes(scanType)) {
      return null;
    }

    return queryRef.current.refetch();
  }, [canQuery]);

  return {
    data,
    errors,
    loadingByScanType,
    isAuthReady: !loading,
    canQuery,
    isLoading,
    isError: errorList.length > 0,
    hasConnectivityError,
    hasBlockingEligibilityError,
    isFetched: query.isFetched,
    isFetching: query.isFetching,
    isStale: query.isStale,
    refetchAll,
    refetchScanType,
  };
};

export const useScanEligibilityBatch = useAllScanEligibility;
