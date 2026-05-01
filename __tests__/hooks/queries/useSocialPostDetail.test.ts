import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import {
  type InfiniteData,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';

import { useSocialPostDetail } from '@/hooks/queries/useSocialPostDetail';
import { SOCIAL_FEED_QUERY_KEY } from '@/hooks/queries/useSocialFeed';
import { fetchSocialPostDetail } from '@/services/social';
import type { SocialFeedPage, SocialPost } from '@/types';

jest.mock('@/services/social', () => {
  const actual = jest.requireActual('@/services/social');
  return {
    ...actual,
    fetchSocialPostDetail: jest.fn(),
  };
});

const mockFetchSocialPostDetail = fetchSocialPostDetail as jest.MockedFunction<
  typeof fetchSocialPostDetail
>;

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: Infinity,
        retry: false,
      },
    },
  });
}

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

function buildSocialPost(overrides: Partial<SocialPost> = {}): SocialPost {
  return {
    id: 'post-1',
    author_id: 'author-1',
    author_username: 'alice',
    author_avatar_url: null,
    category: 'food',
    content_text: 'Fresh meal',
    image_url: null,
    asset_url: 'https://cdn.example.com/post-1.jpg',
    created_at: '2026-04-06T12:00:00.000Z',
    like_count: 4,
    dislike_count: 1,
    comment_count: 10,
    viewer_reaction: 'neutral',
    viewer_has_liked: false,
    moderation_status: 'approved',
    ...overrides,
  };
}

describe('useSocialPostDetail', () => {
  afterEach(() => {
    mockFetchSocialPostDetail.mockReset();
  });

  it('patches cached social feed pages with the backend comment count', async () => {
    const queryClient = createQueryClient();
    const cachedPost = buildSocialPost({
      comment_count: 10,
      viewer_visible_comment_count: 12,
      content_text: 'Keep this cached text',
    });
    const otherPost = buildSocialPost({
      id: 'post-2',
      comment_count: 3,
    });
    const detailPost = buildSocialPost({
      comment_count: 50,
      viewer_visible_comment_count: 55,
      like_count: 8,
      dislike_count: 2,
      viewer_reaction: 'like',
      viewer_has_liked: true,
    });

    queryClient.setQueryData<InfiniteData<SocialFeedPage, string | null>>(
      SOCIAL_FEED_QUERY_KEY('all'),
      {
        pages: [
          {
            items: [cachedPost, otherPost],
            next_cursor: null,
          },
        ],
        pageParams: [null],
      },
    );
    mockFetchSocialPostDetail.mockResolvedValue(detailPost);

    const { result } = renderHook(() => useSocialPostDetail('post-1'), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.data?.comment_count).toBe(50);
      expect(result.current.data?.viewer_visible_comment_count).toBe(55);
    });

    const cachedFeed = queryClient.getQueryData<
      InfiniteData<SocialFeedPage, string | null>
    >(SOCIAL_FEED_QUERY_KEY('all'));
    const patchedPost = cachedFeed?.pages[0]?.items.find(
      (item) => item.id === 'post-1',
    );
    const untouchedPost = cachedFeed?.pages[0]?.items.find(
      (item) => item.id === 'post-2',
    );

    expect(mockFetchSocialPostDetail).toHaveBeenCalledWith('post-1');
    expect(patchedPost).toEqual({
      ...cachedPost,
      comment_count: 50,
      viewer_visible_comment_count: 55,
      like_count: 8,
      dislike_count: 2,
      viewer_reaction: 'like',
      viewer_has_liked: true,
    });
    expect(untouchedPost).toEqual(otherPost);
  });
});
