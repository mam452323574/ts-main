import React from 'react';
import { cleanup, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useSocialFeed } from '@/hooks/queries/useSocialFeed';
import type { SocialFeedPage } from '@/types';

const mockFetchSocialFeed = jest.fn();

jest.mock('@/services/social', () => ({
  fetchSocialFeed: (...args: unknown[]) => mockFetchSocialFeed(...args),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Infinity,
      },
    },
  });

  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

function buildFeedPage(items: Array<{ id: string }> = []): SocialFeedPage {
  return {
    items: items.map((item) => ({
      id: item.id,
      author_id: `author-${item.id}`,
      author_username: item.id,
      author_avatar_url: null,
      category: 'food',
      content_text: `Post ${item.id}`,
      image_url: null,
      asset_url: null,
      created_at: '2026-04-06T12:00:00.000Z',
      like_count: 0,
      dislike_count: 0,
      comment_count: 0,
      viewer_reaction: 'neutral',
      viewer_has_liked: false,
      moderation_status: 'approved',
    })),
    next_cursor: null,
  };
}

describe('useSocialFeed', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches the social feed automatically on mount', async () => {
    const page = buildFeedPage([{ id: 'post-1' }]);
    mockFetchSocialFeed.mockResolvedValueOnce(page);

    const { result } = renderHook(() => useSocialFeed(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetchSocialFeed).toHaveBeenCalledTimes(1);
    expect(mockFetchSocialFeed).toHaveBeenCalledWith('all', null, undefined, {
      languageCode: 'fr',
      countryCode: null,
    });
    expect(result.current.data?.pages).toEqual([page]);
  });

  it('does not expose a fake empty success state before the first network response', async () => {
    let resolveFetch: (page: SocialFeedPage) => void = () => {};
    const pendingFeedPage = new Promise<SocialFeedPage>((resolve) => {
      resolveFetch = resolve;
    });
    const resolvedPage = buildFeedPage();

    mockFetchSocialFeed.mockReturnValueOnce(pendingFeedPage);

    const { result } = renderHook(() => useSocialFeed(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(mockFetchSocialFeed).toHaveBeenCalledTimes(1);
    });

    expect(result.current.data).toBeUndefined();
    expect(result.current.isFetched).toBe(false);
    expect(result.current.isSuccess).toBe(false);

    resolveFetch(resolvedPage);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
      expect(result.current.data?.pages).toEqual([resolvedPage]);
    });
  });

  it('starts a new automatic request when the category changes', async () => {
    mockFetchSocialFeed.mockResolvedValue(buildFeedPage());

    const { rerender } = renderHook(
      ({ category }: { category: 'all' | 'food' }) => useSocialFeed(category),
      {
        wrapper: createWrapper(),
        initialProps: { category: 'all' as const },
      },
    );

    await waitFor(() => {
      expect(mockFetchSocialFeed).toHaveBeenCalledWith('all', null, undefined, {
        languageCode: 'fr',
        countryCode: null,
      });
    });

    rerender({ category: 'food' });

    await waitFor(() => {
      expect(mockFetchSocialFeed).toHaveBeenCalledWith(
        'food',
        null,
        undefined,
        { languageCode: 'fr', countryCode: null },
      );
    });
  });
});
