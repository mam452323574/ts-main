import { useInfiniteQuery } from '@tanstack/react-query';

import type { SocialCategoryFilter, SocialPost } from '@/types';
import { fetchSocialFeed } from '@/services/social';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';

export const SOCIAL_FEED_QUERY_KEY = (
  category: SocialCategoryFilter = 'all',
  languageCode: string | null = null,
  countryCode: string | null = null,
) => ['socialFeed', category, languageCode, countryCode] as const;

export function flattenSocialFeedPages(
  pages: Array<{ items: SocialPost[] }> | undefined,
) {
  if (!pages) {
    return [];
  }

  const seenIds = new Set<string>();
  const items: SocialPost[] = [];

  for (const page of pages) {
    for (const item of page.items) {
      if (seenIds.has(item.id)) {
        continue;
      }

      seenIds.add(item.id);
      items.push(item);
    }
  }

  return items;
}

export const useSocialFeed = (category: SocialCategoryFilter = 'all') => {
  const { userProfile, loading: authLoading } = useAuth();
  const { locale } = useLanguage();
  const countryCode = userProfile?.country_code ?? null;
  return useInfiniteQuery({
    queryKey: SOCIAL_FEED_QUERY_KEY(category, locale, countryCode),
    queryFn: async ({ pageParam }) => {
      return fetchSocialFeed(category, pageParam, undefined, {
        languageCode: locale,
        countryCode,
      });
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
    staleTime: 1000 * 30,
    enabled: !authLoading && !!userProfile?.id,
  });
};
