import React from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react-native';
import {
  type InfiniteData,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';

import { SOCIAL_COMMENTS_QUERY_KEY } from '@/hooks/queries/useSocialComments';
import { SOCIAL_POST_QUERY_KEY } from '@/hooks/queries/useSocialPostDetail';
import { useSocialMutations } from '@/hooks/queries/useSocialMutations';
import { flattenSocialCommentsPages, SocialServiceError } from '@/services/social';
import type { SocialComment, SocialCommentsPage, SocialFeedPage } from '@/types';

type SocialCommentsInfiniteData = InfiniteData<SocialCommentsPage, string | null>;

function buildCommentsInfiniteData(
  items: SocialComment[],
): SocialCommentsInfiniteData {
  return {
    pages: [{ items, next_cursor: null }],
    pageParams: [null],
  };
}

function readCommentsFromCache(queryClient: QueryClient): SocialComment[] | undefined {
  const cached = queryClient.getQueryData<SocialCommentsInfiniteData>(
    SOCIAL_COMMENTS_QUERY_KEY('post-1'),
  );
  if (!cached) {
    return undefined;
  }
  return flattenSocialCommentsPages(cached.pages);
}

const mockCreateSocialComment = jest.fn();
const mockCreateSocialPost = jest.fn();
const mockDeleteSocialComment = jest.fn();
const mockDeleteSocialPost = jest.fn();
const mockReportSocialContent = jest.fn();
const mockSetSocialCommentLike = jest.fn();
const mockSetReactionOnSocialPost = jest.fn();
const mockUpdateSocialComment = jest.fn();
const mockTrackFailureEvent = jest.fn();

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    userProfile: {
      id: 'viewer-1',
      username: 'viewer',
      avatar_url: null,
    },
  }),
}));

jest.mock('@/services/analytics', () => ({
  trackEvent: jest.fn(),
  trackFailureEvent: (...args: unknown[]) => mockTrackFailureEvent(...args),
}));

jest.mock('@/services/social', () => {
  const actual = jest.requireActual('@/services/social');
  return {
    ...actual,
    createSocialComment: (...args: unknown[]) => mockCreateSocialComment(...args),
    createSocialPost: (...args: unknown[]) => mockCreateSocialPost(...args),
    deleteSocialComment: (...args: unknown[]) => mockDeleteSocialComment(...args),
    deleteSocialPost: (...args: unknown[]) => mockDeleteSocialPost(...args),
    reportSocialContent: (...args: unknown[]) => mockReportSocialContent(...args),
    setSocialCommentLike: (...args: unknown[]) => mockSetSocialCommentLike(...args),
    setReactionOnSocialPost: (...args: unknown[]) =>
      mockSetReactionOnSocialPost(...args),
    updateSocialComment: (...args: unknown[]) => mockUpdateSocialComment(...args),
  };
});

function createWrapper(queryClient: QueryClient) {
  const QueryClientTestWrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  QueryClientTestWrapper.displayName = 'QueryClientTestWrapper';

  return QueryClientTestWrapper;
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      mutations: { retry: false, gcTime: Infinity },
      queries: { retry: false, gcTime: Infinity },
    },
  });
}

function createDeferredPromise<T>() {
  let resolvePromise: ((value: T | PromiseLike<T>) => void) | null = null;
  let rejectPromise: ((reason?: unknown) => void) | null = null;

  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return {
    promise,
    resolve: (value: T) => resolvePromise?.(value),
    reject: (reason?: unknown) => rejectPromise?.(reason),
  };
}

function getInitialFeedPage(): SocialFeedPage {
  return {
    items: [
      {
        id: 'post-1',
        author_id: 'author-1',
        author_username: 'alice',
        author_avatar_url: null,
        category: 'food',
        content_text: 'Breakfast',
        image_url: null,
        created_at: '2026-04-06T08:00:00.000Z',
        like_count: 3,
        dislike_count: 1,
        comment_count: 1,
        viewer_visible_comment_count: 1,
        viewer_reaction: 'neutral',
        viewer_has_liked: false,
        moderation_status: 'approved',
      },
    ],
    next_cursor: null,
  };
}

function getCurrentFeedPost(queryClient: QueryClient) {
  return queryClient.getQueryData<{
    pages: SocialFeedPage[];
  }>(['socialFeed', 'all'])?.pages[0].items[0];
}

function getInitialCommentsThread(): SocialComment[] {
  return [
    {
      id: 'comment-1',
      post_id: 'post-1',
      author_id: 'author-2',
      author_username: 'bob',
      author_avatar_url: null,
      content_text: 'Existing',
      created_at: '2026-04-06T09:00:00.000Z',
      like_count: 2,
      viewer_has_liked: false,
      moderation_status: 'approved',
    },
  ];
}

function getCurrentThreadComment(queryClient: QueryClient, commentId: string) {
  return readCommentsFromCache(queryClient)?.find(
    (comment) => comment.id === commentId,
  );
}

describe('useSocialMutations', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rolls back optimistic reactions when the latest mutation fails and surfaces a visible error', async () => {
    const queryClient = createQueryClient();
    const invalidateQueriesSpy = jest.spyOn(queryClient, 'invalidateQueries');
    queryClient.setQueryData(['socialFeed', 'all'], {
      pageParams: [null],
      pages: [getInitialFeedPage()],
    });

    const deferredMutation = createDeferredPromise<unknown>();
    mockSetReactionOnSocialPost.mockImplementationOnce(() => deferredMutation.promise);

    const { result, unmount } = renderHook(() => useSocialMutations(), {
      wrapper: createWrapper(queryClient),
    });

    let mutationPromise: Promise<unknown> | null = null;
    act(() => {
      mutationPromise = result.current.setReactionMutation
        .mutateAsync({
          postId: 'post-1',
          reaction: 'dislike',
        })
        .catch(() => undefined);
    });

    await waitFor(() => {
      expect(getCurrentFeedPost(queryClient)).toEqual(
        expect.objectContaining({
          viewer_reaction: 'dislike',
          like_count: 3,
          dislike_count: 2,
        }),
      );
      expect(result.current.isReactionPending('post-1')).toBe(true);
    });

    await act(async () => {
      deferredMutation.reject(new Error('Network failed'));
      await mutationPromise;
    });

    await waitFor(() => {
      expect(getCurrentFeedPost(queryClient)).toEqual(
        expect.objectContaining({
          viewer_reaction: 'neutral',
          viewer_has_liked: false,
          like_count: 3,
          dislike_count: 1,
        }),
      );
      expect(result.current.isReactionPending('post-1')).toBe(false);
      expect(result.current.reactionError).toMatchObject({
        postId: 'post-1',
        message: 'Network failed',
      });
    });

    expect(mockTrackFailureEvent).toHaveBeenCalledWith(
      'social_post_reaction_failed',
      expect.any(Error),
      {
        post_id: 'post-1',
        reaction: 'dislike',
      },
    );
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ['socialFeed'],
      refetchType: 'none',
    });

    unmount();
    queryClient.clear();
  });

  it('rolls back optimistic reactions when the reaction payload is rejected as malformed', async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(['socialFeed', 'all'], {
      pageParams: [null],
      pages: [getInitialFeedPage()],
    });

    const deferredMutation = createDeferredPromise<unknown>();
    mockSetReactionOnSocialPost.mockImplementationOnce(() => deferredMutation.promise);

    const { result } = renderHook(() => useSocialMutations(), {
      wrapper: createWrapper(queryClient),
    });

    let mutationPromise: Promise<unknown> | null = null;
    act(() => {
      mutationPromise = result.current.setReactionMutation
        .mutateAsync({
          postId: 'post-1',
          reaction: 'like',
        })
        .catch(() => undefined);
    });

    await waitFor(() => {
      expect(getCurrentFeedPost(queryClient)).toEqual(
        expect.objectContaining({
          viewer_reaction: 'like',
          viewer_has_liked: true,
          like_count: 4,
          dislike_count: 1,
        }),
      );
    });

    await act(async () => {
      deferredMutation.reject(
        new SocialServiceError('Social reaction update returned malformed data.', {
          code: 'social_reaction_schema_mismatch',
          status: 503,
          functionName: 'social-set-reaction',
        }),
      );
      await mutationPromise;
    });

    await waitFor(() => {
      expect(getCurrentFeedPost(queryClient)).toEqual(
        expect.objectContaining({
          viewer_reaction: 'neutral',
          viewer_has_liked: false,
          like_count: 3,
          dislike_count: 1,
        }),
      );
      expect(result.current.reactionError).toMatchObject({
        postId: 'post-1',
        message: 'Social reaction update returned malformed data.',
        code: 'social_reaction_schema_mismatch',
        status: 503,
        functionName: 'social-set-reaction',
      });
    });

    expect(mockTrackFailureEvent).toHaveBeenCalledWith(
      'social_post_reaction_failed',
      expect.any(SocialServiceError),
      {
        post_id: 'post-1',
        reaction: 'like',
      },
    );
  });

  it('applies the server reaction payload as the source of truth and reconciles the feed', async () => {
    const queryClient = createQueryClient();
    const invalidateQueriesSpy = jest.spyOn(queryClient, 'invalidateQueries');
    queryClient.setQueryData(['socialFeed', 'all'], {
      pageParams: [null],
      pages: [getInitialFeedPage()],
    });

    mockSetReactionOnSocialPost.mockResolvedValueOnce({
      success: true,
      post_id: 'post-1',
      viewer_reaction: 'like',
      like_count: 9,
      dislike_count: 2,
    });

    const { result } = renderHook(() => useSocialMutations(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.setReactionMutation.mutateAsync({
        postId: 'post-1',
        reaction: 'like',
      });
    });

    await waitFor(() => {
      expect(getCurrentFeedPost(queryClient)).toEqual(
        expect.objectContaining({
          viewer_reaction: 'like',
          viewer_has_liked: true,
          like_count: 9,
          dislike_count: 2,
        }),
      );
      expect(result.current.reactionError).toBeNull();
      expect(result.current.isReactionPending('post-1')).toBe(false);
    });

    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ['socialFeed'],
      refetchType: 'none',
    });
  });

  it('reconciles a neutralized post reaction from the server as the source of truth', async () => {
    const queryClient = createQueryClient();
    const invalidateQueriesSpy = jest.spyOn(queryClient, 'invalidateQueries');
    queryClient.setQueryData(['socialFeed', 'all'], {
      pageParams: [null],
      pages: [
        {
          items: [
            {
              ...getInitialFeedPage().items[0],
              viewer_reaction: 'dislike',
              viewer_has_liked: false,
              like_count: 3,
              dislike_count: 2,
            },
          ],
          next_cursor: null,
        },
      ],
    });

    mockSetReactionOnSocialPost.mockResolvedValueOnce({
      success: true,
      post_id: 'post-1',
      viewer_reaction: 'neutral',
      like_count: 3,
      dislike_count: 1,
    });

    const { result } = renderHook(() => useSocialMutations(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.setReactionMutation.mutateAsync({
        postId: 'post-1',
        reaction: 'neutral',
      });
    });

    await waitFor(() => {
      expect(getCurrentFeedPost(queryClient)).toEqual(
        expect.objectContaining({
          viewer_reaction: 'neutral',
          viewer_has_liked: false,
          like_count: 3,
          dislike_count: 1,
        }),
      );
      expect(result.current.reactionError).toBeNull();
      expect(result.current.isReactionPending('post-1')).toBe(false);
    });

    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ['socialFeed'],
      refetchType: 'none',
    });
  });

  it('ignores stale reaction responses once a newer mutation for the same post has completed', async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(['socialFeed', 'all'], {
      pageParams: [null],
      pages: [getInitialFeedPage()],
    });

    const firstMutation = createDeferredPromise<{
      success: true;
      post_id: string;
      viewer_reaction: 'dislike';
      like_count: number;
      dislike_count: number;
    }>();
    const secondMutation = createDeferredPromise<{
      success: true;
      post_id: string;
      viewer_reaction: 'like';
      like_count: number;
      dislike_count: number;
    }>();
    mockSetReactionOnSocialPost
      .mockImplementationOnce(() => firstMutation.promise)
      .mockImplementationOnce(() => secondMutation.promise);

    const { result } = renderHook(() => useSocialMutations(), {
      wrapper: createWrapper(queryClient),
    });

    let firstPromise: Promise<unknown> | null = null;
    act(() => {
      firstPromise = result.current.setReactionMutation
        .mutateAsync({
          postId: 'post-1',
          reaction: 'dislike',
        })
        .catch(() => undefined);
    });

    await waitFor(() => {
      expect(getCurrentFeedPost(queryClient)).toEqual(
        expect.objectContaining({
          viewer_reaction: 'dislike',
          like_count: 3,
          dislike_count: 2,
        }),
      );
    });

    let secondPromise: Promise<unknown> | null = null;
    act(() => {
      secondPromise = result.current.setReactionMutation
        .mutateAsync({
          postId: 'post-1',
          reaction: 'like',
        })
        .catch(() => undefined);
    });

    await waitFor(() => {
      expect(getCurrentFeedPost(queryClient)).toEqual(
        expect.objectContaining({
          viewer_reaction: 'like',
          like_count: 4,
          dislike_count: 1,
        }),
      );
    });

    await act(async () => {
      secondMutation.resolve({
        success: true,
        post_id: 'post-1',
        viewer_reaction: 'like',
        like_count: 10,
        dislike_count: 0,
      });
      await secondPromise;
    });

    await waitFor(() => {
      expect(getCurrentFeedPost(queryClient)).toEqual(
        expect.objectContaining({
          viewer_reaction: 'like',
          like_count: 10,
          dislike_count: 0,
        }),
      );
      expect(result.current.isReactionPending('post-1')).toBe(false);
    });

    await act(async () => {
      firstMutation.resolve({
        success: true,
        post_id: 'post-1',
        viewer_reaction: 'dislike',
        like_count: 2,
        dislike_count: 9,
      });
      await firstPromise;
    });

    await waitFor(() => {
      expect(getCurrentFeedPost(queryClient)).toEqual(
        expect.objectContaining({
          viewer_reaction: 'like',
          like_count: 10,
          dislike_count: 0,
        }),
      );
    });
  });

  it('rolls back optimistic comment likes when the latest mutation fails and surfaces a visible inline error', async () => {
    const queryClient = createQueryClient();
    const invalidateQueriesSpy = jest.spyOn(queryClient, 'invalidateQueries');
    queryClient.setQueryData(
      SOCIAL_COMMENTS_QUERY_KEY('post-1'),
      buildCommentsInfiniteData(getInitialCommentsThread()),
    );

    const deferredMutation = createDeferredPromise<unknown>();
    mockSetSocialCommentLike.mockImplementationOnce(() => deferredMutation.promise);

    const { result } = renderHook(() => useSocialMutations(), {
      wrapper: createWrapper(queryClient),
    });

    let mutationPromise: Promise<unknown> | null = null;
    act(() => {
      mutationPromise = result.current.setCommentLikeMutation
        .mutateAsync({
          postId: 'post-1',
          commentId: 'comment-1',
          liked: true,
        })
        .catch(() => undefined);
    });

    await waitFor(() => {
      expect(getCurrentThreadComment(queryClient, 'comment-1')).toEqual(
        expect.objectContaining({
          like_count: 3,
          viewer_has_liked: true,
        }),
      );
      expect(result.current.isCommentLikePending('comment-1')).toBe(true);
    });

    await act(async () => {
      deferredMutation.reject(new Error('Like failed'));
      await mutationPromise;
    });

    await waitFor(() => {
      expect(getCurrentThreadComment(queryClient, 'comment-1')).toEqual(
        expect.objectContaining({
          like_count: 2,
          viewer_has_liked: false,
        }),
      );
      expect(result.current.commentLikeError).toMatchObject({
        postId: 'post-1',
        commentId: 'comment-1',
        message: 'Like failed',
      });
      expect(result.current.isCommentLikePending('comment-1')).toBe(false);
    });

    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: SOCIAL_COMMENTS_QUERY_KEY('post-1'),
      exact: true,
      refetchType: 'none',
    });
  });

  it('surfaces statusful diagnostics for comment like failures without triggering a ghost rollback after success', async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(
      SOCIAL_COMMENTS_QUERY_KEY('post-1'),
      buildCommentsInfiniteData(getInitialCommentsThread()),
    );

    mockSetSocialCommentLike.mockRejectedValueOnce(
      new SocialServiceError('Constraint failed', {
        code: 'database_constraint_violation',
        status: 400,
        functionName: 'social-set-comment-like',
        requestId: 'req-comment-like',
      }),
    );

    const { result } = renderHook(() => useSocialMutations(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.setCommentLikeMutation
        .mutateAsync({
          postId: 'post-1',
          commentId: 'comment-1',
          liked: true,
        })
        .catch(() => undefined);
    });

    await waitFor(() => {
      expect(getCurrentThreadComment(queryClient, 'comment-1')).toEqual(
        expect.objectContaining({
          like_count: 2,
          viewer_has_liked: false,
        }),
      );
      expect(result.current.commentLikeError).toMatchObject({
        postId: 'post-1',
        commentId: 'comment-1',
        message: 'Constraint failed',
        code: 'database_constraint_violation',
        status: 400,
        functionName: 'social-set-comment-like',
        requestId: 'req-comment-like',
      });
      expect(result.current.isCommentLikePending('comment-1')).toBe(false);
    });
  });

  it('applies the server comment like payload as the source of truth and reconciles the thread', async () => {
    const queryClient = createQueryClient();
    const invalidateQueriesSpy = jest.spyOn(queryClient, 'invalidateQueries');
    queryClient.setQueryData(
      SOCIAL_COMMENTS_QUERY_KEY('post-1'),
      buildCommentsInfiniteData(getInitialCommentsThread()),
    );

    mockSetSocialCommentLike.mockResolvedValueOnce({
      success: true,
      comment_id: 'comment-1',
      viewer_has_liked: true,
      like_count: 9,
    });

    const { result } = renderHook(() => useSocialMutations(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.setCommentLikeMutation.mutateAsync({
        postId: 'post-1',
        commentId: 'comment-1',
        liked: true,
      });
    });

    await waitFor(() => {
      expect(getCurrentThreadComment(queryClient, 'comment-1')).toEqual(
        expect.objectContaining({
          like_count: 9,
          viewer_has_liked: true,
        }),
      );
      expect(result.current.commentLikeError).toBeNull();
      expect(result.current.isCommentLikePending('comment-1')).toBe(false);
    });

    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: SOCIAL_COMMENTS_QUERY_KEY('post-1'),
      exact: true,
      refetchType: 'none',
    });
  });

  it('keeps cached comments in place after a server comment like response changes rank', async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(
      SOCIAL_COMMENTS_QUERY_KEY('post-1'),
      buildCommentsInfiniteData([
        {
          ...getInitialCommentsThread()[0],
          id: 'comment-z',
          like_count: 5,
        },
        {
          ...getInitialCommentsThread()[0],
          id: 'comment-a',
          like_count: 1,
        },
      ]),
    );

    mockSetSocialCommentLike.mockResolvedValueOnce({
      success: true,
      comment_id: 'comment-a',
      viewer_has_liked: true,
      like_count: 6,
    });

    const { result } = renderHook(() => useSocialMutations(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.setCommentLikeMutation.mutateAsync({
        postId: 'post-1',
        commentId: 'comment-a',
        liked: true,
      });
    });

    await waitFor(() => {
      expect(readCommentsFromCache(queryClient)?.map((comment) => comment.id)).toEqual([
        'comment-z',
        'comment-a',
      ]);
    });
  });

  it('reconciles an unlike response from the server as the source of truth', async () => {
    const queryClient = createQueryClient();
    const invalidateQueriesSpy = jest.spyOn(queryClient, 'invalidateQueries');
    queryClient.setQueryData(
      SOCIAL_COMMENTS_QUERY_KEY('post-1'),
      buildCommentsInfiniteData([
        {
          ...getInitialCommentsThread()[0],
          like_count: 4,
          viewer_has_liked: true,
        },
      ]),
    );

    mockSetSocialCommentLike.mockResolvedValueOnce({
      success: true,
      comment_id: 'comment-1',
      viewer_has_liked: false,
      like_count: 3,
    });

    const { result } = renderHook(() => useSocialMutations(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.setCommentLikeMutation.mutateAsync({
        postId: 'post-1',
        commentId: 'comment-1',
        liked: false,
      });
    });

    await waitFor(() => {
      expect(getCurrentThreadComment(queryClient, 'comment-1')).toEqual(
        expect.objectContaining({
          like_count: 3,
          viewer_has_liked: false,
        }),
      );
      expect(result.current.commentLikeError).toBeNull();
      expect(result.current.isCommentLikePending('comment-1')).toBe(false);
    });

    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: SOCIAL_COMMENTS_QUERY_KEY('post-1'),
      exact: true,
      refetchType: 'none',
    });
  });

  it('ignores stale comment like responses once a newer mutation for the same comment has completed', async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(
      SOCIAL_COMMENTS_QUERY_KEY('post-1'),
      buildCommentsInfiniteData(getInitialCommentsThread()),
    );

    const firstMutation = createDeferredPromise<{
      success: true;
      comment_id: string;
      viewer_has_liked: boolean;
      like_count: number;
    }>();
    const secondMutation = createDeferredPromise<{
      success: true;
      comment_id: string;
      viewer_has_liked: boolean;
      like_count: number;
    }>();
    mockSetSocialCommentLike
      .mockImplementationOnce(() => firstMutation.promise)
      .mockImplementationOnce(() => secondMutation.promise);

    const { result } = renderHook(() => useSocialMutations(), {
      wrapper: createWrapper(queryClient),
    });

    let firstPromise: Promise<unknown> | null = null;
    act(() => {
      firstPromise = result.current.setCommentLikeMutation
        .mutateAsync({
          postId: 'post-1',
          commentId: 'comment-1',
          liked: true,
        })
        .catch(() => undefined);
    });

    await waitFor(() => {
      expect(getCurrentThreadComment(queryClient, 'comment-1')).toEqual(
        expect.objectContaining({
          like_count: 3,
          viewer_has_liked: true,
        }),
      );
    });

    let secondPromise: Promise<unknown> | null = null;
    act(() => {
      secondPromise = result.current.setCommentLikeMutation
        .mutateAsync({
          postId: 'post-1',
          commentId: 'comment-1',
          liked: false,
        })
        .catch(() => undefined);
    });

    await waitFor(() => {
      expect(getCurrentThreadComment(queryClient, 'comment-1')).toEqual(
        expect.objectContaining({
          like_count: 2,
          viewer_has_liked: false,
        }),
      );
    });

    await act(async () => {
      secondMutation.resolve({
        success: true,
        comment_id: 'comment-1',
        viewer_has_liked: false,
        like_count: 1,
      });
      await secondPromise;
    });

    await waitFor(() => {
      expect(getCurrentThreadComment(queryClient, 'comment-1')).toEqual(
        expect.objectContaining({
          like_count: 1,
          viewer_has_liked: false,
        }),
      );
      expect(result.current.isCommentLikePending('comment-1')).toBe(false);
    });

    await act(async () => {
      firstMutation.resolve({
        success: true,
        comment_id: 'comment-1',
        viewer_has_liked: true,
        like_count: 8,
      });
      await firstPromise;
    });

    await waitFor(() => {
      expect(getCurrentThreadComment(queryClient, 'comment-1')).toEqual(
        expect.objectContaining({
          like_count: 1,
          viewer_has_liked: false,
        }),
      );
    });
  });

  it('injects successful comments into the visible thread and updates the viewer-local comment count', async () => {
    const queryClient = createQueryClient();
    const invalidateQueriesSpy = jest.spyOn(queryClient, 'invalidateQueries');
    const existingComment: SocialComment = {
      id: 'comment-1',
      post_id: 'post-1',
      author_id: 'author-2',
      author_username: 'bob',
      author_avatar_url: null,
      content_text: 'Existing',
      created_at: '2026-04-06T09:00:00.000Z',
      like_count: 2,
      viewer_has_liked: false,
      moderation_status: 'approved',
    };
    queryClient.setQueryData(
      SOCIAL_COMMENTS_QUERY_KEY('post-1'),
      buildCommentsInfiniteData([existingComment]),
    );
    queryClient.setQueryData(['socialFeed', 'all'], {
      pageParams: [null],
      pages: [getInitialFeedPage()],
    });
    queryClient.setQueryData(SOCIAL_POST_QUERY_KEY('post-1'), getInitialFeedPage().items[0]);

    mockCreateSocialComment.mockResolvedValueOnce({
      id: 'comment-2',
      post_id: 'post-1',
      author_id: 'viewer-1',
      author_username: 'viewer',
      author_avatar_url: null,
      content_text: 'Nice progress',
      created_at: '2026-04-06T10:00:00.000Z',
      like_count: 0,
      viewer_has_liked: false,
      moderation_status: 'pending',
      moderation_state: 'pending',
    } satisfies SocialComment);

    const { result } = renderHook(() => useSocialMutations(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.createCommentMutation.mutateAsync({
        postId: 'post-1',
        contentText: 'Nice progress',
      });
    });

    await waitFor(() => {
      expect(readCommentsFromCache(queryClient)).toEqual([
        existingComment,
        expect.objectContaining({
          id: 'comment-2',
          content_text: 'Nice progress',
          moderation_status: 'pending',
        }),
      ]);
      expect(getCurrentFeedPost(queryClient)?.comment_count).toBe(1);
      expect(getCurrentFeedPost(queryClient)?.viewer_visible_comment_count).toBe(2);
      expect(
        queryClient.getQueryData<SocialFeedPage['items'][number]>(
          SOCIAL_POST_QUERY_KEY('post-1'),
        )?.comment_count,
      ).toBe(1);
      expect(
        queryClient.getQueryData<SocialFeedPage['items'][number]>(
          SOCIAL_POST_QUERY_KEY('post-1'),
        )?.viewer_visible_comment_count,
      ).toBe(2);
    });

    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: SOCIAL_COMMENTS_QUERY_KEY('post-1'),
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['socialFeed'] });
  });

  it('does not derive the pending creation count from duplicate cached comments', async () => {
    const queryClient = createQueryClient();
    const duplicatedComment: SocialComment = {
      id: 'comment-1',
      post_id: 'post-1',
      author_id: 'author-2',
      author_username: 'bob',
      author_avatar_url: null,
      content_text: 'Existing',
      created_at: '2026-04-06T09:00:00.000Z',
      like_count: 2,
      viewer_has_liked: false,
      moderation_status: 'approved',
    };
    queryClient.setQueryData(SOCIAL_COMMENTS_QUERY_KEY('post-1'), {
      pageParams: [null, 'cursor-1'],
      pages: [
        {
          items: [duplicatedComment],
          next_cursor: 'cursor-1',
        },
        {
          items: [
            {
              ...duplicatedComment,
              content_text: 'Duplicate should not count twice',
            },
          ],
          next_cursor: null,
        },
      ],
    } satisfies SocialCommentsInfiniteData);
    queryClient.setQueryData(['socialFeed', 'all'], {
      pageParams: [null],
      pages: [getInitialFeedPage()],
    });
    queryClient.setQueryData(SOCIAL_POST_QUERY_KEY('post-1'), getInitialFeedPage().items[0]);

    mockCreateSocialComment.mockResolvedValueOnce({
      id: 'comment-2',
      post_id: 'post-1',
      author_id: 'viewer-1',
      author_username: 'viewer',
      author_avatar_url: null,
      content_text: 'Pending mine',
      created_at: '2026-04-06T10:00:00.000Z',
      like_count: 0,
      viewer_has_liked: false,
      moderation_status: 'pending',
      moderation_state: 'pending',
    } satisfies SocialComment);

    const { result } = renderHook(() => useSocialMutations(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.createCommentMutation.mutateAsync({
        postId: 'post-1',
        contentText: 'Pending mine',
      });
    });

    await waitFor(() => {
      expect(getCurrentFeedPost(queryClient)?.comment_count).toBe(1);
      expect(getCurrentFeedPost(queryClient)?.viewer_visible_comment_count).toBe(2);
      expect(
        queryClient.getQueryData<SocialFeedPage['items'][number]>(
          SOCIAL_POST_QUERY_KEY('post-1'),
        )?.viewer_visible_comment_count,
      ).toBe(2);
    });
  });

  it('patches the cached post comment count for approved comment creation without keeping a viewer override', async () => {
    const queryClient = createQueryClient();
    const existingComment: SocialComment = {
      id: 'comment-1',
      post_id: 'post-1',
      author_id: 'author-2',
      author_username: 'bob',
      author_avatar_url: null,
      content_text: 'Existing',
      created_at: '2026-04-06T09:00:00.000Z',
      like_count: 2,
      viewer_has_liked: false,
      moderation_status: 'approved',
    };
    queryClient.setQueryData(
      SOCIAL_COMMENTS_QUERY_KEY('post-1'),
      buildCommentsInfiniteData([existingComment]),
    );
    queryClient.setQueryData(['socialFeed', 'all'], {
      pageParams: [null],
      pages: [getInitialFeedPage()],
    });
    queryClient.setQueryData(SOCIAL_POST_QUERY_KEY('post-1'), getInitialFeedPage().items[0]);

    mockCreateSocialComment.mockResolvedValueOnce({
      id: 'comment-2',
      post_id: 'post-1',
      author_id: 'viewer-1',
      author_username: 'viewer',
      author_avatar_url: null,
      content_text: 'Published now',
      created_at: '2026-04-06T10:00:00.000Z',
      like_count: 0,
      viewer_has_liked: false,
      moderation_status: 'approved',
      moderation_state: 'approved',
    } satisfies SocialComment);

    const { result } = renderHook(() => useSocialMutations(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.createCommentMutation.mutateAsync({
        postId: 'post-1',
        contentText: 'Published now',
      });
    });

    await waitFor(() => {
      expect(readCommentsFromCache(queryClient)).toEqual([
        existingComment,
        expect.objectContaining({
          id: 'comment-2',
          moderation_status: 'approved',
        }),
      ]);
      expect(getCurrentFeedPost(queryClient)?.comment_count).toBe(2);
      expect(getCurrentFeedPost(queryClient)?.viewer_visible_comment_count).toBe(2);
      expect(
        queryClient.getQueryData<SocialFeedPage['items'][number]>(
          SOCIAL_POST_QUERY_KEY('post-1'),
        )?.comment_count,
      ).toBe(2);
      expect(
        queryClient.getQueryData<SocialFeedPage['items'][number]>(
          SOCIAL_POST_QUERY_KEY('post-1'),
        )?.viewer_visible_comment_count,
      ).toBe(2);
    });
  });

  it('does not add immediately rejected comments to the visible thread or counters', async () => {
    const queryClient = createQueryClient();
    const existingComment: SocialComment = {
      id: 'comment-1',
      post_id: 'post-1',
      author_id: 'author-2',
      author_username: 'bob',
      author_avatar_url: null,
      content_text: 'Existing',
      created_at: '2026-04-06T09:00:00.000Z',
      like_count: 2,
      viewer_has_liked: false,
      moderation_status: 'approved',
    };
    queryClient.setQueryData(
      SOCIAL_COMMENTS_QUERY_KEY('post-1'),
      buildCommentsInfiniteData([existingComment]),
    );
    queryClient.setQueryData(['socialFeed', 'all'], {
      pageParams: [null],
      pages: [getInitialFeedPage()],
    });

    mockCreateSocialComment.mockResolvedValueOnce({
      id: 'comment-2',
      post_id: 'post-1',
      author_id: 'viewer-1',
      author_username: 'viewer',
      author_avatar_url: null,
      content_text: 'Rejected',
      created_at: '2026-04-06T10:00:00.000Z',
      like_count: 0,
      viewer_has_liked: false,
      moderation_status: 'rejected',
      moderation_state: 'rejected',
    } satisfies SocialComment);

    const { result } = renderHook(() => useSocialMutations(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.createCommentMutation.mutateAsync({
        postId: 'post-1',
        contentText: 'Rejected',
      });
    });

    await waitFor(() => {
      expect(readCommentsFromCache(queryClient)).toEqual([existingComment]);
      expect(getCurrentFeedPost(queryClient)?.comment_count).toBe(1);
      expect(getCurrentFeedPost(queryClient)?.viewer_visible_comment_count).toBe(1);
    });
  });

  it('patches an edited comment into the cached thread and invalidates the thread plus feed', async () => {
    const queryClient = createQueryClient();
    const invalidateQueriesSpy = jest.spyOn(queryClient, 'invalidateQueries');
    queryClient.setQueryData(
      SOCIAL_COMMENTS_QUERY_KEY('post-1'),
      buildCommentsInfiniteData(getInitialCommentsThread()),
    );

    mockUpdateSocialComment.mockResolvedValueOnce({
      id: 'comment-1',
      post_id: 'post-1',
      author_id: 'author-2',
      author_username: 'bob',
      author_avatar_url: null,
      content_text: 'Edited comment',
      created_at: '2026-04-06T09:00:00.000Z',
      like_count: 2,
      viewer_has_liked: false,
      moderation_status: 'pending',
      moderation_state: 'pending',
    } satisfies SocialComment);

    const { result } = renderHook(() => useSocialMutations(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.updateCommentMutation.mutateAsync({
        postId: 'post-1',
        commentId: 'comment-1',
        contentText: 'Edited comment',
      });
    });

    await waitFor(() => {
      expect(getCurrentThreadComment(queryClient, 'comment-1')).toEqual(
        expect.objectContaining({
          content_text: 'Edited comment',
          moderation_status: 'pending',
        }),
      );
      expect(result.current.isCommentUpdatePending('comment-1')).toBe(false);
    });

    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: SOCIAL_COMMENTS_QUERY_KEY('post-1'),
      exact: true,
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['socialFeed'] });
  });

  it('removes an approved deleted comment and decrements both cached counters', async () => {
    const queryClient = createQueryClient();
    const invalidateQueriesSpy = jest.spyOn(queryClient, 'invalidateQueries');
    queryClient.setQueryData(
      SOCIAL_COMMENTS_QUERY_KEY('post-1'),
      buildCommentsInfiniteData([
        ...getInitialCommentsThread(),
        {
          id: 'comment-2',
          post_id: 'post-1',
          author_id: 'viewer-1',
          author_username: 'viewer',
          author_avatar_url: null,
          content_text: 'Mine',
          created_at: '2026-04-06T09:05:00.000Z',
          like_count: 0,
          viewer_has_liked: false,
          moderation_status: 'approved',
        } satisfies SocialComment,
      ]),
    );
    queryClient.setQueryData(['socialFeed', 'all'], {
      pageParams: [null],
      pages: [
        {
          ...getInitialFeedPage(),
          items: [
            {
              ...getInitialFeedPage().items[0],
              comment_count: 2,
              viewer_visible_comment_count: 2,
            },
          ],
        },
      ],
    });
    queryClient.setQueryData(SOCIAL_POST_QUERY_KEY('post-1'), {
      ...getInitialFeedPage().items[0],
      comment_count: 2,
      viewer_visible_comment_count: 2,
    });

    mockDeleteSocialComment.mockResolvedValueOnce({
      success: true,
      comment_id: 'comment-2',
      post_id: 'post-1',
      deleted_at: '2026-04-15T10:00:00.000Z',
      moderation_state: 'removed',
    });

    const { result } = renderHook(() => useSocialMutations(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.deleteCommentMutation.mutateAsync({
        postId: 'post-1',
        commentId: 'comment-2',
      });
    });

    await waitFor(() => {
      expect(readCommentsFromCache(queryClient)).toEqual([
        expect.objectContaining({
          id: 'comment-1',
        }),
      ]);
      expect(getCurrentFeedPost(queryClient)?.comment_count).toBe(1);
      expect(getCurrentFeedPost(queryClient)?.viewer_visible_comment_count).toBe(1);
      expect(
        queryClient.getQueryData<SocialFeedPage['items'][number]>(
          SOCIAL_POST_QUERY_KEY('post-1'),
        )?.comment_count,
      ).toBe(1);
      expect(
        queryClient.getQueryData<SocialFeedPage['items'][number]>(
          SOCIAL_POST_QUERY_KEY('post-1'),
        )?.viewer_visible_comment_count,
      ).toBe(1);
      expect(result.current.isCommentDeletePending('comment-2')).toBe(false);
    });

    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: SOCIAL_COMMENTS_QUERY_KEY('post-1'),
      exact: true,
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['socialFeed'] });
  });

  it('decrements only the viewer-visible count after deleting an own pending comment', async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(
      SOCIAL_COMMENTS_QUERY_KEY('post-1'),
      buildCommentsInfiniteData([
        ...getInitialCommentsThread(),
        {
          id: 'comment-2',
          post_id: 'post-1',
          author_id: 'viewer-1',
          author_username: 'viewer',
          author_avatar_url: null,
          content_text: 'Pending mine',
          created_at: '2026-04-06T09:05:00.000Z',
          like_count: 0,
          viewer_has_liked: false,
          moderation_status: 'pending',
        } satisfies SocialComment,
      ]),
    );
    queryClient.setQueryData(['socialFeed', 'all'], {
      pageParams: [null],
      pages: [
        {
          ...getInitialFeedPage(),
          items: [
            {
              ...getInitialFeedPage().items[0],
              viewer_visible_comment_count: 2,
            },
          ],
        },
      ],
    });

    mockDeleteSocialComment.mockResolvedValueOnce({
      success: true,
      comment_id: 'comment-2',
      post_id: 'post-1',
      deleted_at: '2026-04-15T10:00:00.000Z',
      moderation_state: 'removed',
    });

    const { result } = renderHook(() => useSocialMutations(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.deleteCommentMutation.mutateAsync({
        postId: 'post-1',
        commentId: 'comment-2',
      });
    });

    await waitFor(() => {
      expect(readCommentsFromCache(queryClient)).toEqual([
        expect.objectContaining({
          id: 'comment-1',
        }),
      ]);
      expect(getCurrentFeedPost(queryClient)?.comment_count).toBe(1);
      expect(getCurrentFeedPost(queryClient)?.viewer_visible_comment_count).toBe(1);
      expect(result.current.isCommentDeletePending('comment-2')).toBe(false);
    });
  });

  it('exposes pending state while a comment update is in flight', async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(
      SOCIAL_COMMENTS_QUERY_KEY('post-1'),
      buildCommentsInfiniteData(getInitialCommentsThread()),
    );
    const deferredMutation = createDeferredPromise<SocialComment>();
    mockUpdateSocialComment.mockImplementationOnce(() => deferredMutation.promise);

    const { result } = renderHook(() => useSocialMutations(), {
      wrapper: createWrapper(queryClient),
    });

    let mutationPromise: Promise<unknown> | null = null;
    act(() => {
      mutationPromise = result.current.updateCommentMutation
        .mutateAsync({
          postId: 'post-1',
          commentId: 'comment-1',
          contentText: 'Edited comment',
        })
        .catch(() => undefined);
    });

    await waitFor(() => {
      expect(result.current.isCommentUpdatePending('comment-1')).toBe(true);
    });

    await act(async () => {
      deferredMutation.resolve({
        id: 'comment-1',
        post_id: 'post-1',
        author_id: 'author-2',
        author_username: 'bob',
        author_avatar_url: null,
        content_text: 'Edited comment',
        created_at: '2026-04-06T09:00:00.000Z',
        like_count: 2,
        viewer_has_liked: false,
        moderation_status: 'pending',
        moderation_state: 'pending',
      });
      await mutationPromise;
    });

    await waitFor(() => {
      expect(result.current.isCommentUpdatePending('comment-1')).toBe(false);
    });
  });

  it('tracks social upload failures with safe metadata', async () => {
    const queryClient = createQueryClient();

    mockCreateSocialPost.mockRejectedValueOnce({
      code: 'upload_failed',
      status: 502,
    });

    const { result } = renderHook(() => useSocialMutations(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await expect(
        result.current.createPostMutation.mutateAsync({
          category: 'food',
          contentText: 'Fresh meal',
          assetSourceUri: 'file:///story.jpg',
        }),
      ).rejects.toMatchObject({
        code: 'upload_failed',
      });
    });

    expect(mockTrackFailureEvent).toHaveBeenCalledWith(
      'social_upload_failed',
      expect.objectContaining({
        code: 'upload_failed',
        status: 502,
      }),
      expect.objectContaining({
        category: 'food',
        has_scan_id: false,
        has_share_payload: false,
      }),
    );
  });

  it('removes a deleted post from cached feeds and clears post comment queries', async () => {
    const queryClient = createQueryClient();
    const invalidateQueriesSpy = jest.spyOn(queryClient, 'invalidateQueries');
    queryClient.setQueryData(['socialFeed', 'all'], {
      pageParams: [null],
      pages: [getInitialFeedPage()],
    });
    queryClient.setQueryData(
      SOCIAL_COMMENTS_QUERY_KEY('post-1'),
      buildCommentsInfiniteData([
        {
          id: 'comment-1',
          post_id: 'post-1',
          author_id: 'author-2',
          author_username: 'bob',
          author_avatar_url: null,
          content_text: 'Existing',
          created_at: '2026-04-06T09:00:00.000Z',
          like_count: 2,
          viewer_has_liked: false,
          moderation_status: 'approved',
        } satisfies SocialComment,
      ]),
    );

    mockDeleteSocialPost.mockResolvedValueOnce({
      success: true,
      post_id: 'post-1',
      moderation_state: 'removed',
      deleted_at: '2026-04-15T10:00:00.000Z',
    });

    const { result } = renderHook(() => useSocialMutations(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.deletePostMutation.mutateAsync({
        postId: 'post-1',
      });
    });

    await waitFor(() => {
      expect(
        queryClient.getQueryData<{
          pages: SocialFeedPage[];
        }>(['socialFeed', 'all'])?.pages[0].items,
      ).toEqual([]);
      expect(
        queryClient.getQueryData(SOCIAL_COMMENTS_QUERY_KEY('post-1')),
      ).toBeUndefined();
      expect(result.current.isDeletePending('post-1')).toBe(false);
    });

    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['socialFeed'] });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: SOCIAL_COMMENTS_QUERY_KEY('post-1'),
    });
  });

  it('keeps the cached feed intact when deleting a post fails', async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(['socialFeed', 'all'], {
      pageParams: [null],
      pages: [getInitialFeedPage()],
    });

    mockDeleteSocialPost.mockRejectedValueOnce({
      code: 'social_post_delete_failed',
      status: 500,
    });

    const { result } = renderHook(() => useSocialMutations(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await expect(
        result.current.deletePostMutation.mutateAsync({
          postId: 'post-1',
        }),
      ).rejects.toMatchObject({
        code: 'social_post_delete_failed',
      });
    });

    expect(getCurrentFeedPost(queryClient)).toEqual(
      expect.objectContaining({
        id: 'post-1',
      }),
    );
    expect(mockTrackFailureEvent).toHaveBeenCalledWith(
      'social_post_delete_failed',
      expect.objectContaining({
        code: 'social_post_delete_failed',
        status: 500,
      }),
      {
        post_id: 'post-1',
      },
    );
  });

  it('tracks moderation report submission failures', async () => {
    const queryClient = createQueryClient();

    mockReportSocialContent.mockRejectedValueOnce({
      code: 'report_failed',
      status: 503,
    });

    const { result } = renderHook(() => useSocialMutations(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await expect(
        result.current.reportContentMutation.mutateAsync({
          target_type: 'post',
          target_post_id: 'post-1',
          reason_code: 'harassment',
        } as any),
      ).rejects.toMatchObject({
        code: 'report_failed',
      });
    });

    expect(mockTrackFailureEvent).toHaveBeenCalledWith(
      'moderation_report_submission_failed',
      expect.objectContaining({
        code: 'report_failed',
        status: 503,
      }),
      expect.objectContaining({
        target_type: 'post',
        reason_code: 'harassment',
      }),
    );
  });
});
