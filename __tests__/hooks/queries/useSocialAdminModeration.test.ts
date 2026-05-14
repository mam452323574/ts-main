import React from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import {
  SOCIAL_ADMIN_MODERATION_QUERY_KEY,
  useSocialAdminModeration,
} from '@/hooks/queries/useSocialAdminModeration';

const mockFetchSocialAdminModerationQueue = jest.fn();
const mockModerateSocialContent = jest.fn();
const mockReclassifySocialPost = jest.fn();
const mockModerateSocialUser = jest.fn();
const mockEradicateSocialUser = jest.fn();
const mockAdjustSocialPostReactions = jest.fn();

jest.mock('@/services/socialAdmin', () => ({
  fetchSocialAdminModerationQueue: (...args: unknown[]) =>
    mockFetchSocialAdminModerationQueue(...args),
  moderateSocialContent: (...args: unknown[]) =>
    mockModerateSocialContent(...args),
  reclassifySocialPost: (...args: unknown[]) =>
    mockReclassifySocialPost(...args),
  moderateSocialUser: (...args: unknown[]) =>
    mockModerateSocialUser(...args),
  eradicateSocialUser: (...args: unknown[]) =>
    mockEradicateSocialUser(...args),
  adjustSocialPostReactions: (...args: unknown[]) =>
    mockAdjustSocialPostReactions(...args),
}));

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

function createQueueResponse() {
  return {
    success: true,
    items: [],
    pending_count: 0,
    flagged_count: 0,
    reported_count: 0,
    needs_review_count: 0,
    processed_count: 0,
    limit: 50,
    has_more: false,
    next_cursor: null,
  };
}

function createModerationItem(
  contentId: string,
  contentType: 'post' | 'comment' = 'post',
) {
  return {
    content_type: contentType,
    content_id: contentId,
    author_id: null,
    author_username: null,
    category: null,
    content_text: null,
    asset_url: null,
    moderation_state: 'pending' as const,
    moderation_reason: null,
    moderation_provider: null,
    created_at: '2026-04-18T10:00:00.000Z',
    open_reports: 0,
    total_reports_24h: 0,
    unique_reporters_24h: 0,
    unique_viewer_count: 0,
    reason_codes: [],
    last_reported_at: null,
    moderation_queued_at: null,
    moderation_claimed_at: null,
    moderation_completed_at: null,
    moderation_attempt_count: 0,
    moderation_last_error: null,
    raw_like_count: 0,
    raw_dislike_count: 0,
    admin_like_adjustment: 0,
    admin_dislike_adjustment: 0,
    effective_like_count: 0,
    effective_dislike_count: 0,
    author_active_bans: [],
  };
}

describe('useSocialAdminModeration', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchSocialAdminModerationQueue.mockResolvedValue(createQueueResponse());
  });

  it('does not fetch the admin queue when disabled', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Infinity },
        mutations: { retry: false, gcTime: Infinity },
      },
    });

    renderHook(() => useSocialAdminModeration('needs_review', false), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockFetchSocialAdminModerationQueue).not.toHaveBeenCalled();
  });

  it('loads the moderation queue for the selected filter and invalidates admin and social caches after moderation', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Infinity },
        mutations: { retry: false, gcTime: Infinity },
      },
    });
    const invalidateQueriesSpy = jest.spyOn(queryClient, 'invalidateQueries');

    mockModerateSocialContent.mockResolvedValueOnce({
      success: true,
      target_type: 'post',
      target_id: 'post-1',
      action: 'approve',
      moderation_state: 'approved',
      affected_reports: 2,
      event_id: 'event-1',
    });

    const { result } = renderHook(
      () => useSocialAdminModeration('reported', true),
      {
        wrapper: createWrapper(queryClient),
      },
    );

    await waitFor(() => {
      expect(mockFetchSocialAdminModerationQueue).toHaveBeenCalledWith('reported');
      expect(result.current.moderationQueueQuery.data).toMatchObject({
        success: true,
        needs_review_count: 0,
      });
    });

    await act(async () => {
      await result.current.moderateContentMutation.mutateAsync({
        target_type: 'post',
        target_post_id: 'post-1',
        action: 'approve',
      });
    });

    expect(mockModerateSocialContent).toHaveBeenCalledWith({
      target_type: 'post',
      target_post_id: 'post-1',
      action: 'approve',
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ['socialAdminModeration'],
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ['socialFeed'],
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ['socialComments'],
    });
    expect(SOCIAL_ADMIN_MODERATION_QUERY_KEY('reported')).toEqual([
      'socialAdminModeration',
      'reported',
    ]);
  });

  it('invalidates admin and feed caches after post reclassification', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Infinity },
        mutations: { retry: false, gcTime: Infinity },
      },
    });
    const invalidateQueriesSpy = jest.spyOn(queryClient, 'invalidateQueries');

    mockReclassifySocialPost.mockResolvedValueOnce({
      success: true,
      post_id: 'post-1',
      previous_category: 'food',
      category: 'physique',
      event_id: 'event-2',
    });

    const { result } = renderHook(
      () => useSocialAdminModeration('processed', true),
      {
        wrapper: createWrapper(queryClient),
      },
    );

    await waitFor(() => {
      expect(mockFetchSocialAdminModerationQueue).toHaveBeenCalledWith('processed');
    });

    await act(async () => {
      await result.current.reclassifyPostMutation.mutateAsync({
        post_id: 'post-1',
        category: 'physique',
      });
    });

    expect(mockReclassifySocialPost).toHaveBeenCalledWith({
      post_id: 'post-1',
      category: 'physique',
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ['socialAdminModeration'],
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ['socialFeed'],
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ['socialComments'],
    });
  });

  it('exposes eradicate and adjust reaction mutations with the same invalidation fan-out', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Infinity },
        mutations: { retry: false, gcTime: Infinity },
      },
    });
    const invalidateQueriesSpy = jest.spyOn(queryClient, 'invalidateQueries');

    mockEradicateSocialUser.mockResolvedValueOnce({
      success: true,
      target_user_id: 'user-1',
      operation_id: 'op-1',
      event_id: 'event-1',
      post_count: 1,
      own_comment_count: 2,
      cascaded_comment_count: 3,
      resolved_report_count: 4,
      ban_created: true,
      storage_cleanup_status: 'completed',
      deleted_asset_paths: [],
      failed_asset_paths: [],
      deleted_avatar_paths: [],
      failed_avatar_paths: [],
    });
    mockAdjustSocialPostReactions.mockResolvedValueOnce({
      success: true,
      post_id: 'post-1',
      raw_like_count: 1,
      raw_dislike_count: 2,
      admin_like_adjustment: 3,
      admin_dislike_adjustment: -4,
      effective_like_count: 4,
      effective_dislike_count: 0,
      event_id: 'event-2',
    });

    const { result } = renderHook(
      () => useSocialAdminModeration('needs_review', true),
      {
        wrapper: createWrapper(queryClient),
      },
    );

    await waitFor(() => {
      expect(mockFetchSocialAdminModerationQueue).toHaveBeenCalledWith('needs_review');
    });

    await act(async () => {
      await result.current.eradicateUserMutation.mutateAsync({
        target_user_id: 'user-1',
      });
    });

    await act(async () => {
      await result.current.adjustPostReactionsMutation.mutateAsync({
        post_id: 'post-1',
        admin_like_adjustment: 3,
        admin_dislike_adjustment: -4,
      });
    });

    expect(mockEradicateSocialUser).toHaveBeenCalledWith({
      target_user_id: 'user-1',
    });
    expect(mockAdjustSocialPostReactions).toHaveBeenCalledWith({
      post_id: 'post-1',
      admin_like_adjustment: 3,
      admin_dislike_adjustment: -4,
    });
  });

  it('bulk approves visible items with a single invalidation fan-out and returns failed ids', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Infinity },
        mutations: { retry: false, gcTime: Infinity },
      },
    });
    const invalidateQueriesSpy = jest.spyOn(queryClient, 'invalidateQueries');

    mockModerateSocialContent
      .mockResolvedValueOnce({
        success: true,
        target_type: 'post',
        target_id: 'post-1',
        action: 'approve',
        moderation_state: 'approved',
        affected_reports: 0,
        event_id: 'event-1',
      })
      .mockRejectedValueOnce(new Error('comment approval failed'));

    const { result } = renderHook(
      () => useSocialAdminModeration('needs_review', true),
      {
        wrapper: createWrapper(queryClient),
      },
    );

    await waitFor(() => {
      expect(mockFetchSocialAdminModerationQueue).toHaveBeenCalledWith('needs_review');
    });

    let summary:
      | {
          requestedCount: number;
          approvedCount: number;
          failedIds: string[];
        }
      | undefined;
    await act(async () => {
      summary = await result.current.bulkApproveContentMutation.mutateAsync([
        createModerationItem('post-1', 'post'),
        createModerationItem('comment-1', 'comment'),
      ]);
    });

    expect(summary).toEqual({
      requestedCount: 2,
      approvedCount: 1,
      failedIds: ['comment-1'],
    });
    expect(mockModerateSocialContent).toHaveBeenNthCalledWith(1, {
      target_type: 'post',
      target_post_id: 'post-1',
      action: 'approve',
    });
    expect(mockModerateSocialContent).toHaveBeenNthCalledWith(2, {
      target_type: 'comment',
      target_comment_id: 'comment-1',
      action: 'approve',
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledTimes(3);
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ['socialAdminModeration'],
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ['socialFeed'],
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ['socialComments'],
    });
  });
});
