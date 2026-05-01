import { useMemo } from 'react';
import { type InfiniteData, useInfiniteQuery } from '@tanstack/react-query';

import { useFeatureFlags } from './useFeatureFlags';

import { SOCIAL_COMMENTS_PAGE_SIZE } from '@/constants/social';
import {
  fetchSocialCommentsPage,
  flattenSocialCommentsPages,
  SocialServiceError,
} from '@/services/social';
import {
  resolveSocialCommentsGate,
  shouldEnableSocialComments,
} from '@/services/appConfig';
import type { SocialComment, SocialCommentsPage } from '@/types';

export const SOCIAL_COMMENTS_QUERY_KEY = (postId: string) =>
  ['socialComments', postId] as const;

const NON_RETRYABLE_SOCIAL_COMMENTS_ERROR_CODES = new Set([
  'post_not_found',
  'policy_denied',
  'database_policy_denied',
  'social_comments_schema_mismatch',
  'social_comments_query_unavailable',
  'social_comments_policy_denied',
]);

function isRetryableSocialCommentsError(error: unknown) {
  if (!(error instanceof SocialServiceError)) {
    return true;
  }

  if (
    typeof error.code === 'string' &&
    NON_RETRYABLE_SOCIAL_COMMENTS_ERROR_CODES.has(error.code)
  ) {
    return false;
  }

  if (typeof error.status === 'number') {
    if (error.status === 403 || error.status === 404) {
      return false;
    }

    if (error.status >= 400 && error.status < 500) {
      return false;
    }
  }

  return true;
}

export const useSocialComments = (postId: string | null | undefined) => {
  const featureFlagsQuery = useFeatureFlags();
  const normalizedPostId = typeof postId === 'string' ? postId.trim() : '';
  const featureFlagsResolved =
    typeof featureFlagsQuery.dataUpdatedAt === 'number'
      ? featureFlagsQuery.dataUpdatedAt > 0
      : true;
  const commentsGateState = resolveSocialCommentsGate(featureFlagsQuery.data, {
    resolved: featureFlagsResolved,
  });
  const commentsEnabled = shouldEnableSocialComments(commentsGateState);

  const query = useInfiniteQuery<
    SocialCommentsPage,
    Error,
    InfiniteData<SocialCommentsPage, string | null>,
    readonly [string, string],
    string | null
  >({
    queryKey: SOCIAL_COMMENTS_QUERY_KEY(normalizedPostId),
    queryFn: ({ pageParam }) =>
      fetchSocialCommentsPage(
        normalizedPostId,
        pageParam ?? null,
        SOCIAL_COMMENTS_PAGE_SIZE,
      ),
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    enabled: normalizedPostId.length > 0 && commentsEnabled,
    staleTime: 1000 * 30,
    refetchOnMount: true,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retry: (failureCount, error) =>
      isRetryableSocialCommentsError(error) && failureCount < 2,
  });

  const comments: SocialComment[] = useMemo(
    () => flattenSocialCommentsPages(query.data?.pages),
    [query.data?.pages],
  );

  return {
    ...query,
    comments,
  };
};
