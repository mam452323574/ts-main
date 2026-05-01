import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { ApiService } from '@/services/api';
import { AnalyticsData, AnalyticsPeriod } from '@/types';

export const ANALYTICS_QUERY_KEY = (period: AnalyticsPeriod) =>
  ['analytics', period] as const;

export const useAnalytics = (period: AnalyticsPeriod) => {
  return useQuery<AnalyticsData, Error>({
    queryKey: ANALYTICS_QUERY_KEY(period),
    queryFn: () => ApiService.getAnalytics(period),
    staleTime: 1000 * 60 * 5,  // 5 minutes - les données analytics changent rarement
    gcTime: 1000 * 60 * 10,    // 10 minutes - garder en cache plus longtemps
    placeholderData: keepPreviousData,
  });
};

