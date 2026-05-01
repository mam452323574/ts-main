import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  adjustSocialPostReactions,
  eradicateSocialUser,
  fetchSocialAdminModerationQueue,
  moderateSocialContent,
  reclassifySocialPost,
  moderateSocialUser,
} from '@/services/socialAdmin';
import type {
  SocialAdminAdjustPostReactionsRequest,
  SocialAdminModerationFilter,
  SocialAdminModerationQueueResponse,
  SocialAdminEradicateUserRequest,
  SocialModerateContentRequest,
  SocialAdminModerateUserRequest,
  SocialReclassifyPostRequest,
} from '@/types';

export const SOCIAL_ADMIN_MODERATION_QUERY_KEY = (
  filter: SocialAdminModerationFilter = 'needs_review',
) => ['socialAdminModeration', filter] as const;

export const useSocialAdminModeration = (
  filter: SocialAdminModerationFilter = 'needs_review',
  enabled = true,
) => {
  const queryClient = useQueryClient();

  const invalidateAdminSocialQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['socialAdminModeration'],
      }),
      queryClient.invalidateQueries({ queryKey: ['socialFeed'] }),
      queryClient.invalidateQueries({ queryKey: ['socialComments'] }),
    ]);
  };

  const moderationQueueQuery = useQuery<SocialAdminModerationQueueResponse, Error>({
    queryKey: SOCIAL_ADMIN_MODERATION_QUERY_KEY(filter),
    queryFn: () => fetchSocialAdminModerationQueue(filter),
    enabled,
    staleTime: 1000 * 15,
  });

  const moderateContentMutation = useMutation({
    mutationFn: (request: SocialModerateContentRequest) =>
      moderateSocialContent(request),
    onSuccess: invalidateAdminSocialQueries,
  });

  const reclassifyPostMutation = useMutation({
    mutationFn: (request: SocialReclassifyPostRequest) =>
      reclassifySocialPost(request),
    onSuccess: invalidateAdminSocialQueries,
  });

  const moderateUserMutation = useMutation({
    mutationFn: (request: SocialAdminModerateUserRequest) =>
      moderateSocialUser(request),
    onSuccess: invalidateAdminSocialQueries,
  });

  const eradicateUserMutation = useMutation({
    mutationFn: (request: SocialAdminEradicateUserRequest) =>
      eradicateSocialUser(request),
    onSuccess: invalidateAdminSocialQueries,
  });

  const adjustPostReactionsMutation = useMutation({
    mutationFn: (request: SocialAdminAdjustPostReactionsRequest) =>
      adjustSocialPostReactions(request),
    onSuccess: invalidateAdminSocialQueries,
  });

  return {
    moderationQueueQuery,
    moderateContentMutation,
    reclassifyPostMutation,
    moderateUserMutation,
    eradicateUserMutation,
    adjustPostReactionsMutation,
  };
};

export type UseSocialAdminModerationResult = ReturnType<
  typeof useSocialAdminModeration
>;
