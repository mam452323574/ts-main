import { useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';

import { flattenSocialFeedPages } from './useSocialFeed';

import {
  fetchSocialPostDetail,
  SocialServiceError,
} from '@/services/social';
import type { SocialFeedPage, SocialPost } from '@/types';

export const SOCIAL_POST_QUERY_KEY = (postId: string) =>
  ['socialPost', postId] as const;

const NON_RETRYABLE_SOCIAL_POST_ERROR_CODES = new Set([
  'post_not_found',
  'social_post_query_unavailable',
  'social_post_schema_mismatch',
  'social_post_policy_denied',
]);

function isRetryableSocialPostError(error: unknown) {
  if (!(error instanceof SocialServiceError)) {
    return true;
  }

  if (
    typeof error.code === 'string' &&
    NON_RETRYABLE_SOCIAL_POST_ERROR_CODES.has(error.code)
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

function findCachedSocialPost(
  queryClient: ReturnType<typeof useQueryClient>,
  postId: string,
) {
  const snapshots = queryClient.getQueriesData<
    InfiniteData<SocialFeedPage, string | null>
  >({
    queryKey: ['socialFeed'],
  });

  for (const [, snapshot] of snapshots) {
    const cachedPost = flattenSocialFeedPages(snapshot?.pages).find(
      (item) => item.id === postId,
    );

    if (cachedPost) {
      return cachedPost;
    }
  }

  return undefined;
}

function patchCachedSocialFeedPostFromDetail(
  queryClient: ReturnType<typeof useQueryClient>,
  postDetail: SocialPost,
) {
  queryClient.setQueriesData<InfiniteData<SocialFeedPage, string | null>>(
    { queryKey: ['socialFeed'] },
    (currentData) => {
      if (!currentData) {
        return currentData;
      }

      let didPatchPost = false;
      const nextPages = currentData.pages.map((page) => {
        let didPatchPage = false;
        const nextItems = page.items.map((item) => {
          if (item.id !== postDetail.id) {
            return item;
          }

          didPatchPost = true;
          didPatchPage = true;
          return {
            ...item,
            comment_count: postDetail.comment_count,
            viewer_visible_comment_count: postDetail.viewer_visible_comment_count,
            like_count: postDetail.like_count,
            dislike_count: postDetail.dislike_count,
            viewer_reaction: postDetail.viewer_reaction,
            viewer_has_liked: postDetail.viewer_has_liked,
          };
        });

        return didPatchPage ? { ...page, items: nextItems } : page;
      });

      return didPatchPost ? { ...currentData, pages: nextPages } : currentData;
    },
  );
}

export const useSocialPostDetail = (postId: string | null | undefined) => {
  const queryClient = useQueryClient();
  const normalizedPostId = typeof postId === 'string' ? postId.trim() : '';

  return useQuery<SocialPost, Error>({
    queryKey: SOCIAL_POST_QUERY_KEY(normalizedPostId),
    queryFn: async () => {
      const postDetail = await fetchSocialPostDetail(normalizedPostId);
      patchCachedSocialFeedPostFromDetail(queryClient, postDetail);
      return postDetail;
    },
    enabled: normalizedPostId.length > 0,
    initialData: () =>
      normalizedPostId.length > 0
        ? findCachedSocialPost(queryClient, normalizedPostId)
        : undefined,
    initialDataUpdatedAt: 0,
    staleTime: 1000 * 30,
    retry: (failureCount, error) =>
      isRetryableSocialPostError(error) && failureCount < 2,
  });
};
