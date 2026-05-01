import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useSocialComments, SOCIAL_COMMENTS_QUERY_KEY } from '@/hooks/queries/useSocialComments';
import { DEFAULT_APP_CONFIG } from '@/services/appConfig';
import { SocialServiceError } from '@/services/social';

const mockFetchSocialCommentsPage = jest.fn();
const mockUseFeatureFlags = jest.fn();

jest.mock('@/services/social', () => {
  const actual = jest.requireActual('@/services/social');
  return {
    ...actual,
    fetchSocialCommentsPage: (...args: unknown[]) =>
      mockFetchSocialCommentsPage(...args),
  };
});

jest.mock('@/hooks/queries/useFeatureFlags', () => ({
  useFeatureFlags: () => mockUseFeatureFlags(),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: Infinity,
        retryDelay: () => 1,
      },
    },
  });

  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useSocialComments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseFeatureFlags.mockReturnValue({
      data: {
        social_comments_enabled: true,
      },
      dataUpdatedAt: 1,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('uses the expected query key', () => {
    expect(SOCIAL_COMMENTS_QUERY_KEY('post-1')).toEqual(['socialComments', 'post-1']);
  });

  it('does not fetch when the post id is missing', async () => {
    renderHook(() => useSocialComments(undefined), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockFetchSocialCommentsPage).not.toHaveBeenCalled();
  });

  it('does not fetch when the social comments feature flag is disabled', async () => {
    mockUseFeatureFlags.mockReturnValue({
      data: {
        social_enabled: true,
        social_comments_enabled: false,
      },
      dataUpdatedAt: 1,
    });

    renderHook(() => useSocialComments('post-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockFetchSocialCommentsPage).not.toHaveBeenCalled();
  });

  it('fetches when social is enabled and the comments flag is absent', async () => {
    mockUseFeatureFlags.mockReturnValue({
      data: {
        social_enabled: true,
      },
      dataUpdatedAt: 1,
    });
    mockFetchSocialCommentsPage.mockResolvedValueOnce({
      items: [],
      next_cursor: null,
    });

    renderHook(() => useSocialComments('post-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(mockFetchSocialCommentsPage).toHaveBeenCalledWith(
        'post-1',
        null,
        expect.any(Number),
      );
    });
  });

  it('preserves the fetched server order when exposing flattened comments', async () => {
    mockFetchSocialCommentsPage.mockResolvedValueOnce({
      items: [
        {
          id: 'comment-low',
          post_id: 'post-1',
          author_id: 'author-1',
          author_username: 'alice',
          author_avatar_url: null,
          content_text: 'Server sent this first',
          created_at: '2026-04-06T10:00:00.000Z',
          like_count: 1,
          viewer_has_liked: false,
          moderation_status: 'approved',
        },
        {
          id: 'comment-high',
          post_id: 'post-1',
          author_id: 'author-2',
          author_username: 'bob',
          author_avatar_url: null,
          content_text: 'Server sent this second',
          created_at: '2026-04-06T10:05:00.000Z',
          like_count: 8,
          viewer_has_liked: false,
          moderation_status: 'approved',
        },
      ],
      next_cursor: null,
    });

    const { result } = renderHook(() => useSocialComments('post-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.comments.map((comment) => comment.id)).toEqual([
        'comment-low',
        'comment-high',
      ]);
    });
  });

  it('fetches while the comments feature gate is still unknown', async () => {
    mockUseFeatureFlags.mockReturnValue({
      data: DEFAULT_APP_CONFIG,
      dataUpdatedAt: 0,
    });
    mockFetchSocialCommentsPage.mockResolvedValueOnce({
      items: [],
      next_cursor: null,
    });

    renderHook(() => useSocialComments('post-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(mockFetchSocialCommentsPage).toHaveBeenCalledWith(
        'post-1',
        null,
        expect.any(Number),
      );
    });
  });

  it.each([
    'post_not_found',
    'policy_denied',
    'database_policy_denied',
    'social_comments_schema_mismatch',
    'social_comments_query_unavailable',
    'social_comments_policy_denied',
  ])('does not retry non-transient social comments errors when code is %s', async (code) => {
    mockFetchSocialCommentsPage.mockRejectedValueOnce(
      new SocialServiceError(`Failure for ${code}`, {
        code,
        status: code === 'post_not_found' ? 404 : 503,
      }),
    );

    const { result } = renderHook(() => useSocialComments('post-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.error).toBeInstanceOf(Error);
    });

    expect(mockFetchSocialCommentsPage).toHaveBeenCalledTimes(1);
  });

  it('does not retry other non-transient 4xx social comments failures', async () => {
    mockFetchSocialCommentsPage.mockRejectedValueOnce(
      new SocialServiceError('Validation failed', {
        code: 'validation_failed',
        status: 422,
      }),
    );

    const { result } = renderHook(() => useSocialComments('post-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.error).toBeInstanceOf(Error);
    });

    expect(mockFetchSocialCommentsPage).toHaveBeenCalledTimes(1);
  });

  it('retries transient comment loading failures up to two times', async () => {
    jest.useFakeTimers();
    mockFetchSocialCommentsPage.mockRejectedValue(new Error('Temporary network failure'));

    const { result } = renderHook(() => useSocialComments('post-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(mockFetchSocialCommentsPage).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      jest.advanceTimersByTime(5);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockFetchSocialCommentsPage).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      jest.advanceTimersByTime(5);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockFetchSocialCommentsPage).toHaveBeenCalledTimes(3);
      expect(result.current.error).toEqual(
        expect.objectContaining({
          message: 'Temporary network failure',
        }),
      );
    });
  });
});
