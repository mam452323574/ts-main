import { useQuery } from '@tanstack/react-query';

import { DEFAULT_APP_CONFIG, fetchAppConfig } from '@/services/appConfig';
import type { AppConfig } from '@/services/appConfig';

export const FEATURE_FLAGS_QUERY_KEY = ['appConfig', 'featureFlags'] as const;

export const useFeatureFlags = () => {
  return useQuery<AppConfig, Error>({
    queryKey: FEATURE_FLAGS_QUERY_KEY,
    queryFn: fetchAppConfig,
    initialData: DEFAULT_APP_CONFIG,
    initialDataUpdatedAt: 0,
    staleTime: 1000 * 60 * 5,
  });
};
