import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Keyboard, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';

import SocialCommentsScreen from '@/screens/SocialCommentsScreen';
import { SPACING } from '@/constants/theme';
import { SocialServiceError } from '@/services/social';

const mockBack = jest.fn();
const mockParams = jest.fn();
const mockUseSocialComments = jest.fn();
const mockUseSocialPostDetail = jest.fn();
const mockUseSocialMutations = jest.fn();
const mockShowAlert = jest.fn();
const mockSetCommentLikeMutate = jest.fn();
const mockUpdateCommentMutateAsync = jest.fn();
const mockDeleteCommentMutateAsync = jest.fn();
const mockClearCommentLikeError = jest.fn();
const mockIsCommentLikePending = jest.fn(() => false);
const mockIsCommentUpdatePending = jest.fn(() => false);
const mockIsCommentDeletePending = jest.fn(() => false);
const mockUseSafeAreaInsets = jest.fn(() => ({ top: 0, bottom: 0, left: 0, right: 0 }));
const mockFlashListScrollToEnd = jest.fn();
const mockFlashListScrollToIndex = jest.fn(() => Promise.resolve());
const mockFlashListScrollToOffset = jest.fn();
const mockFlashListComputeVisibleIndices = jest.fn(() => ({
  startIndex: 0,
  endIndex: 0,
}));
const originalRequestAnimationFrame = global.requestAnimationFrame;
const originalCancelAnimationFrame = global.cancelAnimationFrame;
const mockRecordSocialPostImpressions = jest.fn();
const mockRecordSocialPostViews = jest.fn();
const mockShareSocialPostAsset = jest.fn();
const originalPlatform = Platform.OS;

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
  }),
  useLocalSearchParams: () => mockParams(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => mockUseSafeAreaInsets(),
  SafeAreaProvider: ({ children }: any) => children,
  SafeAreaView: ({ children }: any) => children,
}));

jest.mock('@shopify/flash-list', () => {
  const ReactLocal = require('react');
  const { View: RNView } = require('react-native');

  const FlashList = ReactLocal.forwardRef(
    (
      {
        data = [],
        renderItem,
        ListEmptyComponent,
        ListHeaderComponent,
        ListFooterComponent,
        ItemSeparatorComponent,
        testID = 'mock-comments-list',
        ...props
      }: {
        data?: unknown[];
        renderItem: (item: { item: any; index: number }) => React.ReactNode;
        ListEmptyComponent?: React.ReactNode;
        ListHeaderComponent?: React.ReactNode | (() => React.ReactNode);
        ListFooterComponent?: React.ReactNode | (() => React.ReactNode);
        ItemSeparatorComponent?: React.ComponentType<any> | null;
        testID?: string;
        [key: string]: unknown;
      },
      ref: React.ForwardedRef<any>,
    ) => {
      ReactLocal.useImperativeHandle(ref, () => ({
        scrollToEnd: mockFlashListScrollToEnd,
        scrollToIndex: mockFlashListScrollToIndex,
        scrollToOffset: mockFlashListScrollToOffset,
        computeVisibleIndices: mockFlashListComputeVisibleIndices,
      }));

      const Separator = ItemSeparatorComponent;
      const header =
        typeof ListHeaderComponent === 'function'
          ? ListHeaderComponent()
          : (ListHeaderComponent ?? null);
      const footer =
        typeof ListFooterComponent === 'function'
          ? ListFooterComponent()
          : (ListFooterComponent ?? null);
      const content = data.length
        ? (data as any[]).map((item, index) => (
            <ReactLocal.Fragment key={item.id ?? index}>
              {renderItem({ item, index })}
              {Separator && index < data.length - 1
                ? ReactLocal.createElement(
                    RNView,
                    { testID: `mock-comments-list-separator-${index}` },
                    ReactLocal.createElement(Separator, {
                      leadingItem: item,
                      trailingItem: (data as any[])[index + 1],
                    }),
                  )
                : null}
            </ReactLocal.Fragment>
          ))
        : (ListEmptyComponent ?? null);

      return (
        <RNView {...props} data={data} testID={testID}>
          {header}
          {content}
          {footer}
        </RNView>
      );
    },
  );

  return {
    FlashList,
    FlashListRef: {},
  };
});

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    userProfile: {
      id: 'viewer-1',
    },
  }),
}));

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
  }),
}));

jest.mock('@/hooks/queries', () => ({
  useSocialComments: (...args: unknown[]) => {
    const result = mockUseSocialComments(...args);
    if (
      result &&
      typeof result === 'object' &&
      !('comments' in result) &&
      Array.isArray(result.data)
    ) {
      return { ...result, comments: result.data };
    }
    return result;
  },
  useSocialPostDetail: (...args: unknown[]) => mockUseSocialPostDetail(...args),
  useSocialMutations: () => mockUseSocialMutations(),
}));

jest.mock('@/services/social', () => {
  const actual = jest.requireActual('@/services/social');
  return {
    ...actual,
    recordSocialPostImpressions: (...args: unknown[]) =>
      mockRecordSocialPostImpressions(...args),
    recordSocialPostViews: (...args: unknown[]) =>
      mockRecordSocialPostViews(...args),
    shareSocialPostAsset: (...args: unknown[]) => mockShareSocialPostAsset(...args),
  };
});

jest.mock('@/components/social/SocialPostCard', () => ({
  SocialPostCard: ({
    post,
    onCommentPress,
    onAvatarPress,
    onDeletePress,
    onDislikePress,
    onLikePress,
    onPress,
    onReportPress,
    onSharePress,
  }: {
    post: { id: string; content_text?: string | null; comment_count?: number };
    onCommentPress: () => void;
    onAvatarPress?: (() => void) | null;
    onDeletePress?: (() => void) | null;
    onDislikePress: () => void;
    onLikePress: () => void;
    onPress?: (() => void) | null;
    onReportPress: () => void;
    onSharePress?: (() => void) | null;
  }) => {
    const ReactLocal = require('react');
    const { Pressable, Text, View } = require('react-native');
    return ReactLocal.createElement(
      View,
      { testID: `social-post-detail-card-${post.id}` },
      ReactLocal.createElement(Text, null, post.content_text ?? ''),
      ReactLocal.createElement(
        Text,
        { testID: `social-post-detail-comment-count-${post.id}` },
        String(post.comment_count ?? 0),
      ),
      ReactLocal.createElement(
        Pressable,
        { onPress: onPress ?? undefined, testID: `social-post-detail-open-${post.id}` },
        ReactLocal.createElement(Text, null, 'open'),
      ),
      ReactLocal.createElement(
        Pressable,
        { onPress: onCommentPress, testID: `social-post-detail-comment-${post.id}` },
        ReactLocal.createElement(Text, null, 'comment'),
      ),
      ReactLocal.createElement(
        Pressable,
        { onPress: onLikePress, testID: `social-post-detail-like-${post.id}` },
        ReactLocal.createElement(Text, null, 'like'),
      ),
      ReactLocal.createElement(
        Pressable,
        { onPress: onDislikePress, testID: `social-post-detail-dislike-${post.id}` },
        ReactLocal.createElement(Text, null, 'dislike'),
      ),
      ReactLocal.createElement(
        Pressable,
        { onPress: onReportPress, testID: `social-post-detail-report-${post.id}` },
        ReactLocal.createElement(Text, null, 'report'),
      ),
      onSharePress
        ? ReactLocal.createElement(
            Pressable,
            { onPress: onSharePress, testID: `social-post-detail-share-${post.id}` },
            ReactLocal.createElement(Text, null, 'share'),
          )
        : null,
      onDeletePress
        ? ReactLocal.createElement(
            Pressable,
            { onPress: onDeletePress, testID: `social-post-detail-delete-${post.id}` },
            ReactLocal.createElement(Text, null, 'delete'),
          )
        : null,
      onAvatarPress
        ? ReactLocal.createElement(
            Pressable,
            { onPress: onAvatarPress, testID: `social-post-detail-avatar-${post.id}` },
            ReactLocal.createElement(Text, null, 'avatar'),
          )
        : null,
    );
  },
}));

jest.mock('@/components/social/SocialProfilePreviewModal', () => ({
  SocialProfilePreviewModal: ({
    visible,
    userId,
  }: {
    visible: boolean;
    userId?: string | null;
  }) => {
    const ReactLocal = require('react');
    const { Text } = require('react-native');
    return visible
      ? ReactLocal.createElement(
          Text,
          { testID: 'social-profile-preview-modal' },
          userId ?? 'missing-user-id',
        )
      : null;
  },
}));

jest.mock('@/hooks/useCustomAlert', () => ({
  useCustomAlert: () => ({
    alertElement: null,
    showAlert: (...args: unknown[]) => mockShowAlert(...args),
  }),
}));

function createMockSocialMutations(overrides: Record<string, unknown> = {}) {
  return {
    createCommentMutation: {
      isPending: false,
      mutateAsync: jest.fn(),
    },
    updateCommentMutation: {
      isPending: false,
      mutateAsync: mockUpdateCommentMutateAsync,
    },
    deleteCommentMutation: {
      isPending: false,
      mutateAsync: mockDeleteCommentMutateAsync,
    },
    reportContentMutation: {
      mutateAsync: jest.fn().mockResolvedValue({ success: true }),
    },
    deletePostMutation: {
      isPending: false,
      mutateAsync: jest.fn().mockResolvedValue({ success: true }),
    },
    setReactionMutation: {
      mutate: jest.fn(),
    },
    setCommentLikeMutation: {
      mutate: mockSetCommentLikeMutate,
    },
    commentLikeError: null,
    clearCommentLikeError: mockClearCommentLikeError,
    isCommentLikePending: mockIsCommentLikePending,
    isCommentUpdatePending: mockIsCommentUpdatePending,
    isCommentDeletePending: mockIsCommentDeletePending,
    isDeletePending: jest.fn(() => false),
    isReactionPending: jest.fn(() => false),
    ...overrides,
  };
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

describe('SocialCommentsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(Platform, 'OS', {
      value: originalPlatform,
      configurable: true,
    });
    mockUseSafeAreaInsets.mockReturnValue({ top: 0, bottom: 0, left: 0, right: 0 });
    mockFlashListComputeVisibleIndices.mockReturnValue({
      startIndex: 0,
      endIndex: 0,
    });
    global.requestAnimationFrame = (((callback: (time: number) => void) => {
      callback(0);
      return 1;
    }) as any);
    global.cancelAnimationFrame = jest.fn() as any;
    mockParams.mockReturnValue({
      postId: 'post-1',
    });
    mockUseSocialPostDetail.mockReturnValue({
      data: {
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
        comment_count: 1,
        viewer_reaction: 'neutral',
        viewer_has_liked: false,
        moderation_status: 'approved',
      },
      error: null,
      isLoading: false,
      isPending: false,
      isFetching: false,
      isRefetching: false,
      refetch: jest.fn(),
    });
    mockUseSocialComments.mockReturnValue({
      data: [
        {
          id: 'comment-1',
          post_id: 'post-1',
          author_id: 'author-2',
          author_username: 'bob',
          author_avatar_url: null,
          content_text: 'Nice progress',
          created_at: '2026-04-06T12:00:00.000Z',
          like_count: 3,
          viewer_has_liked: false,
          moderation_status: 'approved',
        },
      ],
      error: null,
      isLoading: false,
      isPending: false,
      isFetching: false,
      isRefetching: false,
      refetch: jest.fn(),
    });
    mockSetCommentLikeMutate.mockReset();
    mockUpdateCommentMutateAsync.mockReset();
    mockDeleteCommentMutateAsync.mockReset();
    mockClearCommentLikeError.mockReset();
    mockIsCommentLikePending.mockReset();
    mockIsCommentUpdatePending.mockReset();
    mockIsCommentDeletePending.mockReset();
    mockIsCommentLikePending.mockReturnValue(false);
    mockIsCommentUpdatePending.mockReturnValue(false);
    mockIsCommentDeletePending.mockReturnValue(false);
    mockUseSocialMutations.mockReturnValue(createMockSocialMutations());
    mockRecordSocialPostImpressions.mockResolvedValue(undefined);
    mockRecordSocialPostViews.mockResolvedValue(undefined);
    mockShareSocialPostAsset.mockResolvedValue(undefined);
  });

  afterEach(() => {
    global.requestAnimationFrame = originalRequestAnimationFrame;
    global.cancelAnimationFrame = originalCancelAnimationFrame;
    jest.restoreAllMocks();
  });

  it('shows the unavailable state when the parent post is no longer visible', () => {
    mockUseSocialComments.mockReturnValue({
      data: undefined,
      error: new SocialServiceError('Social post not found', {
        code: 'post_not_found',
      }),
      isLoading: false,
      isPending: false,
      isFetching: false,
      isRefetching: false,
      refetch: jest.fn(),
    });

    const screen = render(<SocialCommentsScreen />);

    expect(screen.getByText('social.comments.missing_title')).toBeTruthy();
    expect(screen.getByText('social.comments.missing_body')).toBeTruthy();
  });

  it('shows a stable backend error state and retries manually when comment loading fails', async () => {
    const refetch = jest.fn();
    mockUseSocialComments.mockReturnValue({
      data: undefined,
      error: new SocialServiceError(
        'Social comments query "get_social_comments_for_post" is unavailable on Supabase project "test".',
        {
          code: 'social_comments_query_unavailable',
          status: 503,
        },
      ),
      isLoading: false,
      isPending: false,
      isFetching: false,
      isRefetching: false,
      refetch,
    });

    const screen = render(<SocialCommentsScreen />);

    expect(screen.getByTestId('social-comments-error-state')).toBeTruthy();
    expect(
      screen.getByText(/get_social_comments_for_post/i),
    ).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('social-comments-retry'));
      await Promise.resolve();
    });

    expect(refetch).toHaveBeenCalled();
    expect(mockClearCommentLikeError).toHaveBeenCalled();
  });

  it('does not expose background thread refetching as a visible pull-to-refresh state', () => {
    mockUseSocialComments.mockReturnValue({
      data: [
        {
          id: 'comment-1',
          post_id: 'post-1',
          author_id: 'author-2',
          author_username: 'bob',
          author_avatar_url: null,
          content_text: 'Nice progress',
          created_at: '2026-04-06T12:00:00.000Z',
          like_count: 3,
          viewer_has_liked: false,
          moderation_status: 'approved',
        },
      ],
      error: null,
      isLoading: false,
      isPending: false,
      isFetching: true,
      isRefetching: true,
      refetch: jest.fn(),
    });

    const screen = render(<SocialCommentsScreen />);

    expect(screen.getByTestId('social-comments-list').props.refreshing).toBe(false);
  });

  it('uses a manual refresh spinner only while the thread pull-to-refresh refetch is in flight', async () => {
    const deferredRefetch = createDeferredPromise<unknown>();
    const refetch = jest.fn(() => deferredRefetch.promise);
    let refreshPromise: Promise<unknown> | null = null;
    mockUseSocialComments.mockReturnValue({
      data: [
        {
          id: 'comment-1',
          post_id: 'post-1',
          author_id: 'author-2',
          author_username: 'bob',
          author_avatar_url: null,
          content_text: 'Nice progress',
          created_at: '2026-04-06T12:00:00.000Z',
          like_count: 3,
          viewer_has_liked: false,
          moderation_status: 'approved',
        },
      ],
      error: null,
      isLoading: false,
      isPending: false,
      isFetching: false,
      isRefetching: false,
      refetch,
    });

    const screen = render(<SocialCommentsScreen />);

    expect(screen.getByTestId('social-comments-list').props.refreshing).toBe(false);

    await act(async () => {
      refreshPromise = screen.getByTestId('social-comments-list').props.onRefresh();
      await Promise.resolve();
    });

    expect(mockClearCommentLikeError).toHaveBeenCalled();
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('social-comments-list').props.refreshing).toBe(true);

    await act(async () => {
      deferredRefetch.resolve({ data: undefined });
      await refreshPromise;
    });

    expect(screen.getByTestId('social-comments-list').props.refreshing).toBe(false);
  });

  it('shows a dedicated initial loading state before comments resolve', () => {
    mockUseSocialComments.mockReturnValue({
      data: undefined,
      error: null,
      isLoading: true,
      isPending: true,
      isFetching: true,
      isRefetching: false,
      refetch: jest.fn(),
    });

    const screen = render(<SocialCommentsScreen />);

    expect(screen.getByTestId('social-comments-loading-state')).toBeTruthy();
    expect(screen.queryByTestId('social-comments-error-state')).toBeNull();
    expect(screen.queryByText('social.comments.empty_title')).toBeNull();
  });

  it('shows a stable empty state once loading has completed without comments', () => {
    mockUseSocialComments.mockReturnValue({
      data: [],
      error: null,
      isLoading: false,
      isPending: false,
      isFetching: false,
      isRefetching: false,
      refetch: jest.fn(),
    });

    const screen = render(<SocialCommentsScreen />);

    expect(screen.getByText('social.comments.empty_title')).toBeTruthy();
    expect(screen.getByText('social.comments.empty_body')).toBeTruthy();
    expect(screen.queryByTestId('social-comments-loading-state')).toBeNull();
  });

  it('does not fall back to an infinite spinner on social comments schema mismatches', () => {
    mockUseSocialComments.mockReturnValue({
      data: undefined,
      error: new SocialServiceError(
        'Social comments on Supabase project "test" are missing required database schema for "get_social_comments_for_post".',
        {
          code: 'social_comments_schema_mismatch',
          status: 503,
        },
      ),
      isLoading: false,
      isPending: false,
      isFetching: false,
      isRefetching: false,
      refetch: jest.fn(),
    });

    const screen = render(<SocialCommentsScreen />);

    expect(screen.getByTestId('social-comments-error-state')).toBeTruthy();
    expect(screen.queryByTestId('social-comments-loading-state')).toBeNull();
    expect(
      screen.getByText(/get_social_comments_for_post/i),
    ).toBeTruthy();
  });

  it('uses the backend comment count instead of the loaded page length', () => {
    mockUseSocialPostDetail.mockReturnValue({
      data: {
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
        comment_count: 50,
        viewer_reaction: 'neutral',
        viewer_has_liked: false,
        moderation_status: 'approved',
      },
      error: null,
      isLoading: false,
      isPending: false,
      isFetching: false,
      isRefetching: false,
      refetch: jest.fn(),
    });

    const screen = render(<SocialCommentsScreen />);

    expect(
      screen.getByTestId('social-post-detail-comment-count-post-1').props.children,
    ).toBe('50');
  });

  it('uses the server viewer-visible comment count in the detail card', () => {
    mockUseSocialPostDetail.mockReturnValue({
      data: {
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
        comment_count: 50,
        viewer_visible_comment_count: 55,
        viewer_reaction: 'neutral',
        viewer_has_liked: false,
        moderation_status: 'approved',
      },
      error: null,
      isLoading: false,
      isPending: false,
      isFetching: false,
      isRefetching: false,
      refetch: jest.fn(),
    });

    const screen = render(<SocialCommentsScreen />);

    expect(
      screen.getByTestId('social-post-detail-comment-count-post-1').props.children,
    ).toBe('55');
  });

  it('keeps the detail count stable when more comment pages are loaded', () => {
    mockUseSocialPostDetail.mockReturnValue({
      data: {
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
        comment_count: 50,
        viewer_visible_comment_count: 55,
        viewer_reaction: 'neutral',
        viewer_has_liked: false,
        moderation_status: 'approved',
      },
      error: null,
      isLoading: false,
      isPending: false,
      isFetching: false,
      isRefetching: false,
      refetch: jest.fn(),
    });
    mockUseSocialComments.mockReturnValue({
      data: [
        {
          id: 'comment-1',
          post_id: 'post-1',
          author_id: 'author-2',
          author_username: 'bob',
          author_avatar_url: null,
          content_text: 'First page comment',
          created_at: '2026-04-06T12:00:00.000Z',
          like_count: 1,
          viewer_has_liked: false,
          moderation_status: 'approved',
        },
      ],
      error: null,
      isLoading: false,
      isPending: false,
      isFetching: false,
      isRefetching: false,
      refetch: jest.fn(),
    });

    const screen = render(<SocialCommentsScreen />);

    expect(
      screen.getByTestId('social-post-detail-comment-count-post-1').props.children,
    ).toBe('55');

    mockUseSocialComments.mockReturnValue({
      data: [
        {
          id: 'comment-1',
          post_id: 'post-1',
          author_id: 'author-2',
          author_username: 'bob',
          author_avatar_url: null,
          content_text: 'First page comment',
          created_at: '2026-04-06T12:00:00.000Z',
          like_count: 1,
          viewer_has_liked: false,
          moderation_status: 'approved',
        },
        {
          id: 'comment-2',
          post_id: 'post-1',
          author_id: 'viewer-1',
          author_username: 'viewer',
          author_avatar_url: null,
          content_text: 'Pending comment on a later page',
          created_at: '2026-04-06T12:05:00.000Z',
          like_count: 0,
          viewer_has_liked: false,
          moderation_status: 'pending',
        },
      ],
      error: null,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: jest.fn(),
      isLoading: false,
      isPending: false,
      isFetching: false,
      isRefetching: false,
      refetch: jest.fn(),
    });

    screen.rerender(<SocialCommentsScreen />);

    expect(
      screen.getByTestId('social-post-detail-comment-count-post-1').props.children,
    ).toBe('55');
  });

  it('renders the pagination action after comments and loads the next popularity page', () => {
    const fetchNextPage = jest.fn();
    mockUseSocialComments.mockReturnValue({
      data: [
        {
          id: 'comment-1',
          post_id: 'post-1',
          author_id: 'author-2',
          author_username: 'bob',
          author_avatar_url: null,
          content_text: 'Popular comment',
          created_at: '2026-04-06T12:00:00.000Z',
          like_count: 7,
          viewer_has_liked: false,
          moderation_status: 'approved',
        },
      ],
      error: null,
      hasNextPage: true,
      isFetchingNextPage: false,
      fetchNextPage,
      isLoading: false,
      isPending: false,
      isFetching: false,
      isRefetching: false,
      refetch: jest.fn(),
    });

    const screen = render(<SocialCommentsScreen />);

    expect(screen.getByText('Popular comment')).toBeTruthy();
    expect(screen.queryByTestId('social-comments-load-previous')).toBeNull();

    fireEvent.press(screen.getByTestId('social-comments-load-more'));

    expect(screen.getByText('social.comments.load_more')).toBeTruthy();
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('shows the viewer comments first while preserving the loaded order inside each group', () => {
    mockUseSocialComments.mockReturnValue({
      data: [
        {
          id: 'comment-other-popular',
          post_id: 'post-1',
          author_id: 'author-2',
          author_username: 'bob',
          author_avatar_url: null,
          content_text: 'Popular comment from someone else',
          created_at: '2026-04-06T12:00:00.000Z',
          like_count: 10,
          viewer_has_liked: false,
          moderation_status: 'approved',
        },
        {
          id: 'comment-own-first',
          post_id: 'post-1',
          author_id: 'viewer-1',
          author_username: 'viewer',
          author_avatar_url: null,
          content_text: 'My first loaded comment',
          created_at: '2026-04-06T12:05:00.000Z',
          like_count: 2,
          viewer_has_liked: false,
          moderation_status: 'approved',
        },
        {
          id: 'comment-other-later',
          post_id: 'post-1',
          author_id: 'author-3',
          author_username: 'carol',
          author_avatar_url: null,
          content_text: 'Another comment from someone else',
          created_at: '2026-04-06T12:10:00.000Z',
          like_count: 1,
          viewer_has_liked: false,
          moderation_status: 'approved',
        },
        {
          id: 'comment-own-second',
          post_id: 'post-1',
          author_id: 'viewer-1',
          author_username: 'viewer',
          author_avatar_url: null,
          content_text: 'My second loaded comment',
          created_at: '2026-04-06T12:15:00.000Z',
          like_count: 0,
          viewer_has_liked: false,
          moderation_status: 'pending',
        },
      ],
      error: null,
      isLoading: false,
      isPending: false,
      isFetching: false,
      isRefetching: false,
      refetch: jest.fn(),
    });

    const screen = render(<SocialCommentsScreen />);
    const listData = screen.getByTestId('social-comments-list').props.data;

    expect(listData.map((comment: { id: string }) => comment.id)).toEqual([
      'comment-own-first',
      'comment-own-second',
      'comment-other-popular',
      'comment-other-later',
    ]);
  });

  it('renders one explicit separator between consecutive comments without edge separators', () => {
    mockUseSocialComments.mockReturnValue({
      data: [
        {
          id: 'comment-1',
          post_id: 'post-1',
          author_id: 'author-2',
          author_username: 'bob',
          author_avatar_url: null,
          content_text: 'First comment',
          created_at: '2026-04-06T12:00:00.000Z',
          like_count: 1,
          viewer_has_liked: false,
          moderation_status: 'approved',
        },
        {
          id: 'comment-2',
          post_id: 'post-1',
          author_id: 'author-3',
          author_username: 'carol',
          author_avatar_url: null,
          content_text: 'Second comment',
          created_at: '2026-04-06T12:05:00.000Z',
          like_count: 2,
          viewer_has_liked: true,
          moderation_status: 'approved',
        },
      ],
      error: null,
      isLoading: false,
      isPending: false,
      isFetching: false,
      isRefetching: false,
      refetch: jest.fn(),
    });

    const screen = render(<SocialCommentsScreen />);

    expect(screen.getByText('First comment')).toBeTruthy();
    expect(screen.getByText('Second comment')).toBeTruthy();
    expect(screen.getByTestId('mock-comments-list-separator-0')).toBeTruthy();
    expect(screen.queryByTestId('mock-comments-list-separator-1')).toBeNull();
  });

  it('renders a like button with the current comment like count', () => {
    const screen = render(<SocialCommentsScreen />);

    expect(screen.getByTestId('social-comment-like-comment-1')).toBeTruthy();
    expect(screen.getByTestId('social-comment-like-count-comment-1').props.children).toBe(3);
  });

  it('submits the next explicit like state when pressing the comment like button', () => {
    const screen = render(<SocialCommentsScreen />);

    fireEvent.press(screen.getByTestId('social-comment-like-comment-1'));

    expect(mockSetCommentLikeMutate).toHaveBeenCalledWith({
      postId: 'post-1',
      commentId: 'comment-1',
      liked: true,
    });
  });

  it('disables the comment like button while the mutation is pending', () => {
    mockIsCommentLikePending.mockReturnValue(true);

    const screen = render(<SocialCommentsScreen />);

    fireEvent.press(screen.getByTestId('social-comment-like-comment-1'));

    expect(mockSetCommentLikeMutate).not.toHaveBeenCalled();
  });

  it('disables the comment like button when the thread is read-only for the viewer', () => {
    mockParams.mockReturnValue({
      postId: 'post-1',
      postAuthorId: 'author-2',
      postModerationStatus: 'hidden',
    });
    mockUseSocialPostDetail.mockReturnValue({
      data: {
        id: 'post-1',
        author_id: 'author-2',
        author_username: 'alice',
        author_avatar_url: null,
        category: 'food',
        content_text: 'Fresh meal',
        image_url: null,
        asset_url: 'https://cdn.example.com/post-1.jpg',
        created_at: '2026-04-06T12:00:00.000Z',
        like_count: 4,
        dislike_count: 1,
        comment_count: 1,
        viewer_reaction: 'neutral',
        viewer_has_liked: false,
        moderation_status: 'hidden',
      },
      error: null,
      isLoading: false,
      isPending: false,
      isFetching: false,
      isRefetching: false,
      refetch: jest.fn(),
    });

    const screen = render(<SocialCommentsScreen />);

    fireEvent.press(screen.getByTestId('social-comment-like-comment-1'));

    expect(mockSetCommentLikeMutate).not.toHaveBeenCalled();
  });

  it('shows and dismisses the inline comment like error banner with diagnostics', () => {
    mockUseSocialMutations.mockReturnValue(createMockSocialMutations({
      commentLikeError: {
        postId: 'post-1',
        commentId: 'comment-1',
        message: 'Like failed',
        code: 'database_constraint_violation',
        status: 400,
        functionName: 'social-set-comment-like',
        requestId: 'req-123',
      },
    }));

    const screen = render(<SocialCommentsScreen />);

    expect(screen.getByTestId('social-comment-like-error')).toBeTruthy();
    expect(screen.getByText('Like failed')).toBeTruthy();
    expect(
      screen.getByText(
        'social.errors.reaction_route_label: social-set-comment-like | social.errors.reaction_code_label: database_constraint_violation | social.errors.reaction_status_label: 400 | social.errors.reaction_request_id_label: req-123',
      ),
    ).toBeTruthy();

    fireEvent.press(screen.getByTestId('social-comment-like-error-dismiss'));

    expect(mockClearCommentLikeError).toHaveBeenCalled();
  });

  it('keeps the composer available for the author on a pending post', async () => {
    const mockMutateAsync = jest.fn().mockResolvedValue({
      comment_id: 'comment-2',
      post_id: 'post-1',
      moderation_state: 'pending',
    });
    mockParams.mockReturnValue({
      postId: 'post-1',
      postAuthorId: 'viewer-1',
      postModerationStatus: 'pending',
    });
    mockUseSocialMutations.mockReturnValue(createMockSocialMutations({
      createCommentMutation: {
        isPending: false,
        mutateAsync: mockMutateAsync,
      },
    }));

    const screen = render(<SocialCommentsScreen />);

    expect(screen.queryByTestId('social-comments-read-only')).toBeNull();
    fireEvent.changeText(
      screen.getByTestId('social-comments-input'),
      'Pending but editable',
    );

    expect(screen.getByTestId('social-comments-input').props.value).toBe(
      'Pending but editable',
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('social-comments-submit'));
    });

    expect(mockMutateAsync).toHaveBeenCalledWith({
      postId: 'post-1',
      contentText: 'Pending but editable',
    });
    expect(mockFlashListScrollToEnd).not.toHaveBeenCalled();
    expect(mockFlashListScrollToIndex).toHaveBeenCalledWith({
      index: 0,
      animated: true,
    });
    expect(mockFlashListScrollToOffset).not.toHaveBeenCalled();
  });

  it('keeps the comment draft visible when submission fails', async () => {
    const mockMutateAsync = jest.fn().mockRejectedValueOnce(new Error('Mutation failed'));
    mockUseSocialMutations.mockReturnValue(createMockSocialMutations({
      createCommentMutation: {
        isPending: false,
        mutateAsync: mockMutateAsync,
      },
    }));

    const screen = render(<SocialCommentsScreen />);

    fireEvent.changeText(screen.getByTestId('social-comments-input'), 'Still here');

    await act(async () => {
      fireEvent.press(screen.getByTestId('social-comments-submit'));
    });

    expect(mockShowAlert).toHaveBeenCalledWith(
      'social.comments.error_title',
      'Mutation failed',
      [{ text: 'common.ok' }],
    );
    expect(screen.getByTestId('social-comments-input').props.value).toBe('Still here');
  });

  it('shows comment management actions only for the viewer comment', () => {
    mockUseSocialComments.mockReturnValue({
      data: [
        {
          id: 'comment-own',
          post_id: 'post-1',
          author_id: 'viewer-1',
          author_username: 'viewer',
          author_avatar_url: null,
          content_text: 'My comment',
          created_at: '2026-04-06T12:00:00.000Z',
          like_count: 0,
          viewer_has_liked: false,
          moderation_status: 'approved',
        },
        {
          id: 'comment-other',
          post_id: 'post-1',
          author_id: 'author-2',
          author_username: 'bob',
          author_avatar_url: null,
          content_text: 'Other comment',
          created_at: '2026-04-06T12:05:00.000Z',
          like_count: 0,
          viewer_has_liked: false,
          moderation_status: 'approved',
        },
      ],
      error: null,
      isLoading: false,
      isPending: false,
      isFetching: false,
      isRefetching: false,
      refetch: jest.fn(),
    });

    const screen = render(<SocialCommentsScreen />);

    expect(screen.getByTestId('social-comment-menu-comment-own')).toBeTruthy();
    expect(screen.queryByTestId('social-comment-menu-comment-other')).toBeNull();
  });

  it('enters edit mode with the existing text prefilled and lets the viewer cancel', () => {
    mockUseSocialComments.mockReturnValue({
      data: [
        {
          id: 'comment-1',
          post_id: 'post-1',
          author_id: 'viewer-1',
          author_username: 'viewer',
          author_avatar_url: null,
          content_text: 'Original text',
          created_at: '2026-04-06T12:00:00.000Z',
          like_count: 0,
          viewer_has_liked: false,
          moderation_status: 'approved',
        },
      ],
      error: null,
      isLoading: false,
      isPending: false,
      isFetching: false,
      isRefetching: false,
      refetch: jest.fn(),
    });

    const screen = render(<SocialCommentsScreen />);

    fireEvent.press(screen.getByTestId('social-comment-menu-comment-1'));

    const menuButtons = mockShowAlert.mock.calls[0]?.[2] as Array<{
      text: string;
      onPress?: () => void;
    }>;
    const editButton = menuButtons.find(
      (button) => button.text === 'social.actions.edit',
    );

    act(() => {
      editButton?.onPress?.();
    });

    expect(screen.getByTestId('social-comments-editing-banner')).toBeTruthy();
    const input = screen.getByTestId('social-comments-input');
    const composerRow = screen.getByTestId('social-comments-composer-row');
    expect(input.props.value).toBe('Original text');
    expect(composerRow.findByProps({ testID: 'social-comments-cancel-edit' })).toBeTruthy();
    expect(composerRow.findByProps({ testID: 'social-comments-submit' })).toBeTruthy();

    fireEvent.press(screen.getByTestId('social-comments-cancel-edit'));

    expect(screen.queryByTestId('social-comments-editing-banner')).toBeNull();
    expect(screen.getByTestId('social-comments-input').props.value).toBe('');
  });

  it('submits an edited owner comment through the update mutation', async () => {
    mockUpdateCommentMutateAsync.mockResolvedValueOnce({
      id: 'comment-1',
      post_id: 'post-1',
      author_id: 'viewer-1',
      author_username: 'viewer',
      author_avatar_url: null,
      content_text: 'Edited text',
      created_at: '2026-04-06T12:00:00.000Z',
      like_count: 0,
      viewer_has_liked: false,
      moderation_status: 'pending',
      moderation_state: 'pending',
    });
    mockUseSocialComments.mockReturnValue({
      data: [
        {
          id: 'comment-1',
          post_id: 'post-1',
          author_id: 'viewer-1',
          author_username: 'viewer',
          author_avatar_url: null,
          content_text: 'Original text',
          created_at: '2026-04-06T12:00:00.000Z',
          like_count: 0,
          viewer_has_liked: false,
          moderation_status: 'approved',
        },
      ],
      error: null,
      isLoading: false,
      isPending: false,
      isFetching: false,
      isRefetching: false,
      refetch: jest.fn(),
    });

    const screen = render(<SocialCommentsScreen />);

    fireEvent.press(screen.getByTestId('social-comment-menu-comment-1'));
    const menuButtons = mockShowAlert.mock.calls[0]?.[2] as Array<{
      text: string;
      onPress?: () => void;
    }>;
    act(() => {
      menuButtons.find((button) => button.text === 'social.actions.edit')?.onPress?.();
    });

    fireEvent.changeText(screen.getByTestId('social-comments-input'), 'Edited text');

    await act(async () => {
      fireEvent.press(screen.getByTestId('social-comments-submit'));
    });

    expect(mockUpdateCommentMutateAsync).toHaveBeenCalledWith({
      postId: 'post-1',
      commentId: 'comment-1',
      contentText: 'Edited text',
    });
  });

  it('shows edit diagnostics in the alert when comment update fails with a SocialServiceError', async () => {
    mockUpdateCommentMutateAsync.mockRejectedValueOnce(
      new SocialServiceError('Route missing', {
        code: 'edge_function_route_missing',
        status: 404,
        functionName: 'social-update-comment',
        requestId: 'req-edit-comment',
      }),
    );
    mockUseSocialComments.mockReturnValue({
      data: [
        {
          id: 'comment-1',
          post_id: 'post-1',
          author_id: 'viewer-1',
          author_username: 'viewer',
          author_avatar_url: null,
          content_text: 'Original text',
          created_at: '2026-04-06T12:00:00.000Z',
          like_count: 0,
          viewer_has_liked: false,
          moderation_status: 'approved',
        },
      ],
      error: null,
      isLoading: false,
      isPending: false,
      isFetching: false,
      isRefetching: false,
      refetch: jest.fn(),
    });

    const screen = render(<SocialCommentsScreen />);

    fireEvent.press(screen.getByTestId('social-comment-menu-comment-1'));
    const menuButtons = mockShowAlert.mock.calls[0]?.[2] as Array<{
      text: string;
      onPress?: () => void;
    }>;
    act(() => {
      menuButtons.find((button) => button.text === 'social.actions.edit')?.onPress?.();
    });

    fireEvent.changeText(screen.getByTestId('social-comments-input'), 'Edited text');

    await act(async () => {
      fireEvent.press(screen.getByTestId('social-comments-submit'));
    });

    expect(mockShowAlert).toHaveBeenLastCalledWith(
      'social.comments.edit_title',
      'social.comments.edit_error\n\nsocial.errors.reaction_route_label: social-update-comment | social.errors.reaction_code_label: edge_function_route_missing | social.errors.reaction_status_label: 404 | social.errors.reaction_request_id_label: req-edit-comment',
      [{ text: 'common.ok' }],
    );
  });

  it('confirms and deletes an owner comment through the delete mutation', async () => {
    mockDeleteCommentMutateAsync.mockResolvedValueOnce({
      success: true,
      comment_id: 'comment-1',
      post_id: 'post-1',
      deleted_at: '2026-04-15T10:00:00.000Z',
      moderation_state: 'removed',
    });
    mockUseSocialComments.mockReturnValue({
      data: [
        {
          id: 'comment-1',
          post_id: 'post-1',
          author_id: 'viewer-1',
          author_username: 'viewer',
          author_avatar_url: null,
          content_text: 'Original text',
          created_at: '2026-04-06T12:00:00.000Z',
          like_count: 0,
          viewer_has_liked: false,
          moderation_status: 'approved',
        },
      ],
      error: null,
      isLoading: false,
      isPending: false,
      isFetching: false,
      isRefetching: false,
      refetch: jest.fn(),
    });

    const screen = render(<SocialCommentsScreen />);

    fireEvent.press(screen.getByTestId('social-comment-menu-comment-1'));
    const actionButtons = mockShowAlert.mock.calls[0]?.[2] as Array<{
      text: string;
      onPress?: () => void;
    }>;
    actionButtons.find((button) => button.text === 'social.actions.delete')?.onPress?.();

    const confirmButtons = mockShowAlert.mock.calls[1]?.[2] as Array<{
      text: string;
      onPress?: () => void;
    }>;

    await act(async () => {
      confirmButtons.find((button) => button.text === 'social.actions.delete')?.onPress?.();
    });

    expect(mockDeleteCommentMutateAsync).toHaveBeenCalledWith({
      postId: 'post-1',
      commentId: 'comment-1',
    });
  });

  it('shows delete diagnostics in the alert when comment deletion fails with a SocialServiceError', async () => {
    mockDeleteCommentMutateAsync.mockRejectedValueOnce(
      new SocialServiceError('Route missing', {
        code: 'edge_function_route_missing',
        status: 404,
        functionName: 'social-delete-comment',
        requestId: 'req-delete-comment',
      }),
    );
    mockUseSocialComments.mockReturnValue({
      data: [
        {
          id: 'comment-1',
          post_id: 'post-1',
          author_id: 'viewer-1',
          author_username: 'viewer',
          author_avatar_url: null,
          content_text: 'Original text',
          created_at: '2026-04-06T12:00:00.000Z',
          like_count: 0,
          viewer_has_liked: false,
          moderation_status: 'approved',
        },
      ],
      error: null,
      isLoading: false,
      isPending: false,
      isFetching: false,
      isRefetching: false,
      refetch: jest.fn(),
    });

    const screen = render(<SocialCommentsScreen />);

    fireEvent.press(screen.getByTestId('social-comment-menu-comment-1'));
    const actionButtons = mockShowAlert.mock.calls[0]?.[2] as Array<{
      text: string;
      onPress?: () => void;
    }>;
    actionButtons.find((button) => button.text === 'social.actions.delete')?.onPress?.();

    const confirmButtons = mockShowAlert.mock.calls[1]?.[2] as Array<{
      text: string;
      onPress?: () => void;
    }>;

    await act(async () => {
      confirmButtons.find((button) => button.text === 'social.actions.delete')?.onPress?.();
    });

    expect(mockShowAlert).toHaveBeenLastCalledWith(
      'social.comments.error_title',
      'social.comments.delete_error\n\nsocial.errors.reaction_route_label: social-delete-comment | social.errors.reaction_code_label: edge_function_route_missing | social.errors.reaction_status_label: 404 | social.errors.reaction_request_id_label: req-delete-comment',
      [{ text: 'common.ok' }],
    );
  });

  it('shows a read-only footer for terminally moderated author posts', () => {
    mockParams.mockReturnValue({
      postId: 'post-1',
      postAuthorId: 'viewer-1',
      postModerationStatus: 'hidden',
    });
    mockUseSocialPostDetail.mockReturnValue({
      data: {
        id: 'post-1',
        author_id: 'viewer-1',
        author_username: 'alice',
        author_avatar_url: null,
        category: 'food',
        content_text: 'Fresh meal',
        image_url: null,
        asset_url: 'https://cdn.example.com/post-1.jpg',
        created_at: '2026-04-06T12:00:00.000Z',
        like_count: 4,
        dislike_count: 1,
        comment_count: 1,
        viewer_reaction: 'neutral',
        viewer_has_liked: false,
        moderation_status: 'hidden',
      },
      error: null,
      isLoading: false,
      isPending: false,
      isFetching: false,
      isRefetching: false,
      refetch: jest.fn(),
    });

    const screen = render(<SocialCommentsScreen />);

    expect(screen.getByTestId('social-comments-read-only')).toBeTruthy();
    expect(screen.getByText('social.comments.read_only_title')).toBeTruthy();
    expect(screen.queryByTestId('social-comments-input')).toBeNull();
    expect(screen.queryByTestId('social-comments-submit')).toBeNull();
  });

  it('does not show pending moderation meta for the comment author', () => {
    mockUseSocialComments.mockReturnValue({
      data: [
        {
          id: 'comment-pending',
          post_id: 'post-1',
          author_id: 'viewer-1',
          author_username: 'alice',
          author_avatar_url: null,
          content_text: 'Pending comment',
          created_at: '2026-04-06T12:00:00.000Z',
          like_count: 0,
          viewer_has_liked: false,
          moderation_status: 'pending',
        },
      ],
      error: null,
      isLoading: false,
      isPending: false,
      isFetching: false,
      isRefetching: false,
      refetch: jest.fn(),
    });

    const screen = render(<SocialCommentsScreen />);

    expect(screen.queryByText('social.moderation.pending')).toBeNull();
  });

  it('keeps terminal moderation meta visible for the comment author', () => {
    mockUseSocialComments.mockReturnValue({
      data: [
        {
          id: 'comment-rejected',
          post_id: 'post-1',
          author_id: 'viewer-1',
          author_username: 'alice',
          author_avatar_url: null,
          content_text: 'Rejected comment',
          created_at: '2026-04-06T12:00:00.000Z',
          like_count: 0,
          viewer_has_liked: false,
          moderation_status: 'rejected',
        },
      ],
      error: null,
      isLoading: false,
      isPending: false,
      isFetching: false,
      isRefetching: false,
      refetch: jest.fn(),
    });

    const screen = render(<SocialCommentsScreen />);

    expect(screen.getByText('social.moderation.rejected')).toBeTruthy();
  });

  it('does not show moderation meta for non-authors even when a comment is moderated', () => {
    mockUseSocialComments.mockReturnValue({
      data: [
        {
          id: 'comment-hidden',
          post_id: 'post-1',
          author_id: 'author-2',
          author_username: 'bob',
          author_avatar_url: null,
          content_text: 'Hidden comment',
          created_at: '2026-04-06T12:00:00.000Z',
          like_count: 0,
          viewer_has_liked: false,
          moderation_status: 'hidden',
        },
      ],
      error: null,
      isLoading: false,
      isPending: false,
      isFetching: false,
      isRefetching: false,
      refetch: jest.fn(),
    });

    const screen = render(<SocialCommentsScreen />);

    expect(screen.queryByText('social.moderation.hidden')).toBeNull();
  });

  it('opens a comment report flow and submits the selected reason', async () => {
    const mockMutateAsync = jest.fn().mockResolvedValue({ success: true });
    mockUseSocialMutations.mockReturnValue(createMockSocialMutations({
      reportContentMutation: {
        mutateAsync: mockMutateAsync,
      },
    }));

    const screen = render(<SocialCommentsScreen />);

    fireEvent.press(screen.getByTestId('social-comment-report-comment-1'));

    const buttons = mockShowAlert.mock.calls[0]?.[2] as Array<{
      text: string;
      onPress?: () => void;
    }>;
    const harassmentButton = buttons.find(
      (button) => button.text === 'social.report.reasons.harassment',
    );

    harassmentButton?.onPress?.();

    expect(mockMutateAsync).toHaveBeenCalledWith({
      target_type: 'comment',
      target_comment_id: 'comment-1',
      reason_code: 'harassment',
    });
  });

  it('renders the shared avatar fallback when a comment has no avatar', () => {
    const screen = render(<SocialCommentsScreen />);

    expect(
      screen.getByTestId('social-comment-identity-comment-1-avatar-fallback'),
    ).toBeTruthy();
  });

  it('keeps manual keyboard insets disabled and matches list bottom padding to the measured footer height', () => {
    const screen = render(<SocialCommentsScreen />);
    const list = screen.getByTestId('social-comments-list');

    expect(list.props.automaticallyAdjustContentInsets).toBe(false);
    expect(list.props.automaticallyAdjustKeyboardInsets).toBe(false);
    expect(list.props.contentInsetAdjustmentBehavior).toBe('never');
    expect(list.props.keyboardDismissMode).toBe(
      Platform.OS === 'ios' ? 'interactive' : undefined,
    );
    expect(list.props.keyboardShouldPersistTaps).toBe('handled');
    expect(list.props.style).toEqual(expect.objectContaining({ flex: 1 }));

    fireEvent(screen.getByTestId('social-comments-footer'), 'layout', {
      nativeEvent: {
        layout: {
          height: 112,
          width: 320,
          x: 0,
          y: 0,
        },
      },
    });

    const updatedList = screen.getByTestId('social-comments-list');
    const contentContainerStyle = StyleSheet.flatten(
      updatedList.props.contentContainerStyle,
    );

    expect(contentContainerStyle.paddingBottom).toBe(112 + SPACING.sm);
  });

  it('renders the comment input and send action in one compact composer row', () => {
    const screen = render(<SocialCommentsScreen />);
    const input = screen.getByTestId('social-comments-input');
    const composerRow = screen.getByTestId('social-comments-composer-row');

    expect(composerRow.findByProps({ testID: 'social-comments-input' })).toBeTruthy();
    expect(composerRow.findByProps({ testID: 'social-comments-submit' })).toBeTruthy();
    expect(StyleSheet.flatten(composerRow.props.style)).toEqual(
      expect.objectContaining({
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: SPACING.sm,
        width: '100%',
      }),
    );
    expect(StyleSheet.flatten(input.props.style)).toEqual(
      expect.objectContaining({
        flex: 1,
        minWidth: 0,
        minHeight: 48,
        maxHeight: 120,
      }),
    );
  });

  it('keeps the keyboard vertical offset at zero so the SafeAreaView top inset is not double-counted', () => {
    mockUseSafeAreaInsets.mockReturnValue({
      top: 47,
      bottom: 34,
      left: 0,
      right: 0,
    });

    const screen = render(<SocialCommentsScreen />);
    const keyboardShell = screen.UNSAFE_getByType(KeyboardAvoidingView);
    const footerStyle = StyleSheet.flatten(
      screen.getByTestId('social-comments-footer').props.style,
    );

    expect(keyboardShell.props.keyboardVerticalOffset).toBe(0);
    expect(footerStyle).toEqual(
      expect.objectContaining({
        paddingTop: SPACING.md,
        paddingBottom: 34 + SPACING.sm,
      }),
    );
  });

  it('uses Android keyboard height avoidance and keeps a minimum footer inset padding', () => {
    Object.defineProperty(Platform, 'OS', {
      value: 'android',
      configurable: true,
    });
    mockUseSafeAreaInsets.mockReturnValue({
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
    });

    const screen = render(<SocialCommentsScreen />);
    const keyboardShell = screen.UNSAFE_getByType(KeyboardAvoidingView);
    const footerStyle = StyleSheet.flatten(
      screen.getByTestId('social-comments-footer').props.style,
    );

    expect(keyboardShell.props.behavior).toBe('height');
    expect(keyboardShell.props.keyboardVerticalOffset).toBe(0);
    expect(footerStyle).toEqual(
      expect.objectContaining({
        paddingBottom: SPACING.sm + SPACING.sm,
      }),
    );
  });

  it('does not force-scroll the thread when the composer gains focus', async () => {
    const screen = render(<SocialCommentsScreen />);

    await act(async () => {
      fireEvent(screen.getByTestId('social-comments-input'), 'focus');
      await Promise.resolve();
    });

    expect(mockFlashListScrollToEnd).not.toHaveBeenCalled();
  });

  it('does not force-scroll when the viewer is reading farther up the thread', async () => {
    mockUseSocialComments.mockReturnValue({
      data: Array.from({ length: 5 }, (_, index) => ({
        id: `comment-${index + 1}`,
        post_id: 'post-1',
        author_id: `author-${index + 1}`,
        author_username: `user-${index + 1}`,
        author_avatar_url: null,
        content_text: `Comment ${index + 1}`,
        created_at: `2026-04-0${index + 1}T12:00:00.000Z`,
        like_count: index,
        viewer_has_liked: false,
        moderation_status: 'approved',
      })),
      error: null,
      isLoading: false,
      isPending: false,
      isFetching: false,
      isRefetching: false,
      refetch: jest.fn(),
    });
    mockFlashListComputeVisibleIndices.mockReturnValue({
      startIndex: 0,
      endIndex: 1,
    });

    const screen = render(<SocialCommentsScreen />);

    await act(async () => {
      fireEvent(screen.getByTestId('social-comments-input'), 'focus');
      await Promise.resolve();
    });

    expect(mockFlashListScrollToEnd).not.toHaveBeenCalled();
  });

  it('compacts the footer above the keyboard and restores safe-area spacing when the keyboard closes', async () => {
    mockUseSafeAreaInsets.mockReturnValue({
      top: 0,
      bottom: 24,
      left: 0,
      right: 0,
    });

    const keyboardListeners: Record<string, ((event?: any) => void) | undefined> = {};
    jest.spyOn(Keyboard, 'addListener').mockImplementation((eventName, listener) => {
      keyboardListeners[eventName] = listener as (event?: any) => void;

      return {
        remove: jest.fn(),
      } as any;
    });

    const screen = render(<SocialCommentsScreen />);
    const keyboardShowEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const keyboardHideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    expect(StyleSheet.flatten(screen.getByTestId('social-comments-footer').props.style)).toEqual(
      expect.objectContaining({
        paddingTop: SPACING.md,
        paddingBottom: 24 + SPACING.sm,
      }),
    );

    await act(async () => {
      fireEvent(screen.getByTestId('social-comments-input'), 'focus');
      keyboardListeners[keyboardShowEvent]?.({
        endCoordinates: {
          height: 320,
        },
      });
      await Promise.resolve();
    });

    expect(StyleSheet.flatten(screen.getByTestId('social-comments-footer').props.style)).toEqual(
      expect.objectContaining({
        paddingTop: SPACING.sm,
        paddingBottom: SPACING.sm,
      }),
    );

    act(() => {
      fireEvent(screen.getByTestId('social-comments-input'), 'blur');
      keyboardListeners[keyboardHideEvent]?.();
    });

    expect(StyleSheet.flatten(screen.getByTestId('social-comments-footer').props.style)).toEqual(
      expect.objectContaining({
        paddingTop: SPACING.md,
        paddingBottom: 24 + SPACING.sm,
      }),
    );
  });
});
