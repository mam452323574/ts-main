import { useEffect } from 'react';
import { InteractionManager } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { fetchAppConfig } from '@/services/appConfig';
import { ApiService } from '@/services/api';
import { fetchSocialFeed } from '@/services/social';
import { fetchCoachScreenSnapshot } from '@/services/coach';
import { ANALYTICS_QUERY_KEY } from '@/hooks/queries/useAnalytics';
import {
  SCAN_ELIGIBILITY_BATCH_QUERY_KEY,
} from '@/hooks/queries/useScanEligibility';
import {
  getCoachScreenSnapshotQueryKey,
} from '@/hooks/queries/useCoachScreenSnapshot';
import { DASHBOARD_QUERY_KEY } from '@/hooks/queries/useDashboard';
import { FEATURE_FLAGS_QUERY_KEY } from '@/hooks/queries/useFeatureFlags';
import { SOCIAL_FEED_QUERY_KEY } from '@/hooks/queries/useSocialFeed';
import type { SocialFeedPage } from '@/types';

export function useBootPrefetch() {
  const { locale } = useLanguage();
  const { user, userProfile, loading } = useAuth();
  const queryClient = useQueryClient();
  const countryCode = userProfile?.country_code ?? null;

  useEffect(() => {
    if (loading || !user) {
      return;
    }

    let eligibilityPrefetchTimeout: ReturnType<typeof setTimeout> | null = null;
    let secondaryPrefetchTimeout: ReturnType<typeof setTimeout> | null = null;
    const interactionTask = InteractionManager.runAfterInteractions(() => {
      eligibilityPrefetchTimeout = setTimeout(() => {
        void queryClient.prefetchQuery({
          queryKey: SCAN_ELIGIBILITY_BATCH_QUERY_KEY(user.id),
          queryFn: () =>
            ApiService.checkScanEligibilityBatch([
              'body',
              'health',
              'nutrition',
              'super',
            ]),
          staleTime: 1000 * 60 * 2,
        });
      }, 450);

      secondaryPrefetchTimeout = setTimeout(() => {
        if (userProfile?.id) {
          void queryClient.prefetchQuery({
            queryKey: getCoachScreenSnapshotQueryKey(user.id, {
              personaKey: userProfile.coach_persona_key,
              locale,
              entriesLimit: 10,
            }),
            queryFn: () =>
              fetchCoachScreenSnapshot({
                personaKey: userProfile.coach_persona_key,
                locale,
                entriesLimit: 10,
              }),
            staleTime: 1000 * 60,
          });
        }

        void queryClient.prefetchQuery({
          queryKey: ANALYTICS_QUERY_KEY('7days'),
          queryFn: () => ApiService.getAnalytics('7days'),
          staleTime: 1000 * 60 * 5,
        });

        if (userProfile?.id) {
          void queryClient.prefetchInfiniteQuery({
            queryKey: SOCIAL_FEED_QUERY_KEY('all', locale, countryCode),
            queryFn: ({ pageParam }) =>
              fetchSocialFeed('all', pageParam, undefined, {
                languageCode: locale,
                countryCode,
              }),
            initialPageParam: null as string | null,
            getNextPageParam: (lastPage: SocialFeedPage) => lastPage.next_cursor,
            staleTime: 1000 * 30,
          });
        }
      }, 1100);
    });

    void queryClient.prefetchQuery({
      queryKey: FEATURE_FLAGS_QUERY_KEY,
      queryFn: fetchAppConfig,
      staleTime: 1000 * 60 * 5,
    });

    void queryClient.prefetchQuery({
      queryKey: DASHBOARD_QUERY_KEY,
      queryFn: ApiService.getDashboard,
      staleTime: 1000 * 60 * 5,
    });

    return () => {
      interactionTask.cancel?.();
      if (eligibilityPrefetchTimeout) {
        clearTimeout(eligibilityPrefetchTimeout);
      }
      if (secondaryPrefetchTimeout) {
        clearTimeout(secondaryPrefetchTimeout);
      }
    };
  }, [
    countryCode,
    loading,
    locale,
    queryClient,
    user,
    userProfile?.coach_persona_key,
    userProfile?.id,
  ]);
}
