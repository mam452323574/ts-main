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
  SocialAdminModerationItem,
  SocialAdminModerationQueueResponse,
  SocialAdminEradicateUserRequest,
  SocialModerateContentRequest,
  SocialAdminModerateUserRequest,
  SocialReclassifyPostRequest,
} from '@/types';

const BULK_APPROVAL_CONCURRENCY = 10;

export interface BulkApproveSocialContentSummary {
  requestedCount: number;
  approvedCount: number;
  failedIds: string[];
}

export const SOCIAL_ADMIN_MODERATION_QUERY_KEY = (
  filter: SocialAdminModerationFilter = 'needs_review',
) => ['socialAdminModeration', filter] as const;

function buildApproveRequest(
  item: SocialAdminModerationItem,
): SocialModerateContentRequest {
  return item.content_type === 'post'
    ? {
        target_type: 'post',
        target_post_id: item.content_id,
        action: 'approve',
      }
    : {
        target_type: 'comment',
        target_comment_id: item.content_id,
        action: 'approve',
      };
}

async function bulkApproveModerationItems(
  items: SocialAdminModerationItem[],
): Promise<BulkApproveSocialContentSummary> {
  if (items.length === 0) {
    return {
      requestedCount: 0,
      approvedCount: 0,
      failedIds: [],
    };
  }

  const failedIds: string[] = [];
  let approvedCount = 0;

  for (let index = 0; index < items.length; index += BULK_APPROVAL_CONCURRENCY) {
    const chunk = items.slice(index, index + BULK_APPROVAL_CONCURRENCY);
    const results = await Promise.allSettled(
      chunk.map((item) => moderateSocialContent(buildApproveRequest(item))),
    );

    results.forEach((result, chunkIndex) => {
      if (result.status === 'fulfilled') {
        approvedCount += 1;
        return;
      }

      failedIds.push(chunk[chunkIndex].content_id);
    });
  }

  return {
    requestedCount: items.length,
    approvedCount,
    failedIds,
  };
}

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

  const bulkApproveContentMutation = useMutation({
    mutationFn: (items: SocialAdminModerationItem[]) =>
      bulkApproveModerationItems(items),
    onSuccess: async (summary) => {
      if (summary.approvedCount > 0) {
        await invalidateAdminSocialQueries();
      }
    },
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
    bulkApproveContentMutation,
    reclassifyPostMutation,
    moderateUserMutation,
    eradicateUserMutation,
    adjustPostReactionsMutation,
  };
};

export type UseSocialAdminModerationResult = ReturnType<
  typeof useSocialAdminModeration
>;
