import { useCallback, useMemo, useRef } from 'react';
import { useQuery, useQueries } from '@tanstack/react-query';
import { ApiError, ApiService, isConnectivityApiError } from '@/services/api';
import { ScanType, ScanEligibilityResponse } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { SCAN_ELIGIBILITY_QUERY_KEY } from '@/utils/scanEligibilityQuery';

export { SCAN_ELIGIBILITY_QUERY_KEY };

const SCAN_TYPES: ScanType[] = ['body', 'health', 'nutrition', 'super'];

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

  const queries = useQueries({
    queries: SCAN_TYPES.map((scanType) => ({
      queryKey: SCAN_ELIGIBILITY_QUERY_KEY(userId, scanType),
      queryFn: () => ApiService.checkScanEligibilityOnly(scanType),
      staleTime: 1000 * 60 * 2,
      enabled: canQuery,
      retry: false,
    })),
  });
  const queriesRef = useRef(queries);
  queriesRef.current = queries;

  const data = useMemo(
    () =>
      SCAN_TYPES.reduce((acc, scanType, index) => {
        const queryData = queries[index].data;
        if (queryData) {
          acc[scanType] = queryData as ScanEligibilityResponse;
        }
        return acc;
      }, {} as ScanEligibilityDataMap),
    [
      queries[0].data,
      queries[1].data,
      queries[2].data,
      queries[3].data,
    ],
  );

  const errors = useMemo(
    () =>
      SCAN_TYPES.reduce((acc, scanType, index) => {
        const queryError = queries[index].error;
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
      }, {} as ScanEligibilityErrorMap),
    [
      queries[0].error,
      queries[1].error,
      queries[2].error,
      queries[3].error,
    ],
  );

  const loadingByScanType = useMemo(
    () =>
      loading
        ? buildEmptyLoadingMap(true)
        : SCAN_TYPES.reduce((acc, scanType, index) => {
            acc[scanType] = canQuery && Boolean(queries[index].isLoading);
            return acc;
          }, buildEmptyLoadingMap(false)),
    [
      canQuery,
      loading,
      queries[0].isLoading,
      queries[1].isLoading,
      queries[2].isLoading,
      queries[3].isLoading,
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
    () => loading || (canQuery && queries.some((query) => query.isLoading)),
    [
      canQuery,
      loading,
      queries[0].isLoading,
      queries[1].isLoading,
      queries[2].isLoading,
      queries[3].isLoading,
    ],
  );

  const refetchAll = useCallback(async () => {
    if (!canQuery) {
      return [];
    }

    return Promise.all(queriesRef.current.map((query) => query.refetch()));
  }, [canQuery]);

  const refetchScanType = useCallback(async (scanType: ScanType) => {
    if (!canQuery) {
      return null;
    }

    const queryIndex = SCAN_TYPES.indexOf(scanType);
    if (queryIndex < 0) {
      return null;
    }

    return queriesRef.current[queryIndex].refetch();
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
    refetchAll,
    refetchScanType,
  };
};
