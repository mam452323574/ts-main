import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import SocialScreen from '@/screens/SocialScreen';
import { SPACING, withAlpha } from '@/constants/theme';
import { DEFAULT_APP_CONFIG } from '@/services/appConfig';
import { SocialServiceError } from '@/services/social';

const MOCK_SAFE_AREA_INSETS = { top: 24, right: 0, bottom: 0, left: 0 };
let latestFocusEffectCallback: (() => void) | undefined;
const mockPush = jest.fn();
const mockUseFocusEffect = jest.fn((callback: () => void) => {
  latestFocusEffectCallback = callback;
});
const mockUseSafeAreaInsets = jest.fn(() => MOCK_SAFE_AREA_INSETS);
const mockUseSocialFeed = jest.fn();
const mockUseFeatureFlags = jest.fn();
const mockUseSocialMutations = jest.fn();
const mockRecordSocialPostImpressions = jest.fn();
const mockRecordSocialPostViews = jest.fn();
const mockShareSocialPostAsset = jest.fn();
const mockTrackEvent = jest.fn();
const mockTrackFailureEvent = jest.fn();
const mockShowAlert = jest.fn();
const mockClearReactionError = jest.fn();
let mockUserProfile: { id: string; account_tier?: string | null } = {
  id: 'viewer-1',
  account_tier: 'free',
};

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useFocusEffect: (callback: () => void) => mockUseFocusEffect(callback),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => mockUseSafeAreaInsets(),
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@shopify/flash-list', () => ({
  FlashList: ({
    data,
    renderItem,
    ListHeaderComponent,
    ListEmptyComponent,
    ListFooterComponent,
    ItemSeparatorComponent,
    onViewableItemsChanged,
    viewabilityConfigCallbackPairs,
    testID = 'mock-flash-list',
    ...props
  }: {
    data: unknown[];
    renderItem: (item: { item: any; index: number }) => React.ReactNode;
    ListHeaderComponent?: React.ReactNode | React.ComponentType<any>;
    ListEmptyComponent?: React.ReactNode;
    ListFooterComponent?: React.ReactNode;
    ItemSeparatorComponent?: React.ComponentType<any> | null;
    onViewableItemsChanged?: (info: { viewableItems: Array<{ item: any; isViewable: boolean }> }) => void;
    viewabilityConfigCallbackPairs?: Array<{
      onViewableItemsChanged?: (info: {
        viewableItems: Array<{ item: any; isViewable: boolean }>;
      }) => void;
    }>;
    testID?: string;
    [key: string]: unknown;
  }) => {
    const ReactLocal = require('react');
    const { View: RNView } = require('react-native');
    const renderListSlot = (slot?: React.ReactNode | React.ComponentType<any>) => {
      if (!slot) {
        return null;
      }

      return typeof slot === 'function'
        ? ReactLocal.createElement(slot)
        : slot;
    };
    const header = renderListSlot(ListHeaderComponent);
    const empty = renderListSlot(ListEmptyComponent);
    const footer = renderListSlot(ListFooterComponent);

    if (!data.length) {
      return (
        <RNView {...props} testID={testID}>
          {header}
          {empty}
          {footer}
        </RNView>
      );
    }

    const Separator = ItemSeparatorComponent;
    const viewableItems = (data as any[]).map((item) => ({
      item,
      isViewable: true,
    }));

    return (
      <RNView {...props} testID={testID}>
        {header}
        {viewabilityConfigCallbackPairs?.map((pair, index) => (
          <ReactLocal.Fragment key={`viewability-pair-${index}`}>
            {pair.onViewableItemsChanged?.({
              viewableItems,
            })}
          </ReactLocal.Fragment>
        ))}
        {onViewableItemsChanged?.({
          viewableItems,
        })}
        {(data as any[]).map((item, index) => (
          <ReactLocal.Fragment key={item.id ?? index}>
            {renderItem({ item, index })}
            {Separator && index < data.length - 1
              ? ReactLocal.createElement(
                  RNView,
                  { testID: `mock-flash-list-separator-${index}` },
                  ReactLocal.createElement(Separator, {
                    leadingItem: item,
                    trailingItem: (data as any[])[index + 1],
                  }),
                )
              : null}
          </ReactLocal.Fragment>
        ))}
        {footer}
      </RNView>
    );
  },
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    userProfile: mockUserProfile,
  }),
}));

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
  }),
}));

jest.mock('@/hooks/useCustomAlert', () => ({
  useCustomAlert: () => ({
    alertElement: null,
    showAlert: (...args: unknown[]) => mockShowAlert(...args),
  }),
}));

jest.mock('@/hooks/queries', () => ({
  useFeatureFlags: () => mockUseFeatureFlags(),
  useSocialFeed: (...args: unknown[]) => mockUseSocialFeed(...args),
  useSocialMutations: () => mockUseSocialMutations(),
  flattenSocialFeedPages: (pages: Array<{ items: unknown[] }> | undefined) =>
    pages?.flatMap((page) => page.items) ?? [],
}));
jest.mock('@/hooks/queries/useFeatureFlags', () => ({
  useFeatureFlags: () => mockUseFeatureFlags(),
}));
jest.mock('@/hooks/queries/useSocialFeed', () => ({
  useSocialFeed: (...args: unknown[]) => mockUseSocialFeed(...args),
  flattenSocialFeedPages: (pages: Array<{ items: unknown[] }> | undefined) =>
    pages?.flatMap((page) => page.items) ?? [],
}));
jest.mock('@/hooks/queries/useSocialMutations', () => ({
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

jest.mock('@/services/analytics', () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
  trackFailureEvent: (...args: unknown[]) => mockTrackFailureEvent(...args),
}));

jest.mock('@/components/social/SocialCategoryPill', () => ({
  SocialCategoryPill: ({
    category,
    onPress,
  }: {
    category: string;
    onPress?: () => void;
  }) => {
    const ReactLocal = require('react');
    const { Pressable, Text } = require('react-native');
    return ReactLocal.createElement(
      Pressable,
      { onPress, testID: `social-pill-${category}` },
      ReactLocal.createElement(Text, null, category),
    );
  },
}));

jest.mock('@/components/social/SocialPostCard', () => ({
  SocialPostCard: ({
    post,
    currentUserId,
    commentsEnabled,
    deleteDisabled,
    onAvatarPress,
    onCommentPress,
    onDeletePress,
    onDislikePress,
    onLikePress,
    onMorePress,
    onPress,
    onReportPress,
    onSharePress,
    reactionsDisabled,
  }: {
    post: { id: string; author_id: string; content_text: string; comment_count: number };
    currentUserId?: string | null;
    commentsEnabled?: boolean;
    deleteDisabled?: boolean;
    onAvatarPress?: (() => void) | null;
    onDislikePress: () => void;
    onLikePress: () => void;
    onCommentPress: () => void;
    onDeletePress?: (() => void) | null;
    onMorePress?: (() => void) | null;
    onPress?: (() => void) | null;
    onReportPress: () => void;
    onSharePress?: (() => void) | null;
    reactionsDisabled?: boolean;
  }) => {
    const ReactLocal = require('react');
    const { Pressable, Text, View } = require('react-native');
    return ReactLocal.createElement(
      View,
      { testID: `social-post-${post.id}` },
      ReactLocal.createElement(Text, null, post.content_text),
      ReactLocal.createElement(
        Pressable,
        {
          onPress: onPress ?? undefined,
          testID: `post-open-${post.id}`,
        },
        ReactLocal.createElement(Text, null, 'open'),
      ),
      onAvatarPress
        ? ReactLocal.createElement(
            Pressable,
            {
              onPress: onAvatarPress,
              testID: `avatar-open-${post.id}`,
            },
            ReactLocal.createElement(Text, null, 'avatar'),
          )
        : null,
      ReactLocal.createElement(
        Text,
        { testID: `comment-count-${post.id}` },
        String(post.comment_count),
      ),
      ReactLocal.createElement(
        Pressable,
        {
          onPress: reactionsDisabled ? undefined : onLikePress,
          testID: `like-enabled-${post.id}`,
        },
        ReactLocal.createElement(Text, null, 'like'),
      ),
      ReactLocal.createElement(
        Pressable,
        {
          onPress: reactionsDisabled ? undefined : onDislikePress,
          testID: `dislike-enabled-${post.id}`,
        },
        ReactLocal.createElement(Text, null, 'dislike'),
      ),
      onSharePress
        ? ReactLocal.createElement(
            Pressable,
            { onPress: onSharePress, testID: `share-enabled-${post.id}` },
            ReactLocal.createElement(Text, null, 'share'),
          )
        : null,
      onMorePress
        ? ReactLocal.createElement(
            Pressable,
            { onPress: onMorePress, testID: `more-enabled-${post.id}` },
            ReactLocal.createElement(Text, null, 'more'),
          )
        : null,
      currentUserId === post.author_id
        ? ReactLocal.createElement(
            Pressable,
            {
              onPress: deleteDisabled ? undefined : onDeletePress ?? undefined,
              testID: `delete-enabled-${post.id}`,
            },
            ReactLocal.createElement(Text, null, 'delete'),
          )
        : ReactLocal.createElement(
            Pressable,
            {
              onPress: onReportPress,
              testID: `report-enabled-${post.id}`,
            },
            ReactLocal.createElement(Text, null, 'report'),
          ),
      commentsEnabled
        ? ReactLocal.createElement(
            Pressable,
            { onPress: onCommentPress, testID: `comments-enabled-${post.id}` },
            ReactLocal.createElement(Text, null, 'comments'),
          )
        : null,
    );
  },
}));

jest.mock('@/components/social/SocialPostActionSheet', () => ({
  SocialPostActionSheet: ({
    visible,
    onClose,
    onDeletePress,
    onNotInterestedPress,
    onReportPress,
  }: {
    visible: boolean;
    onClose: () => void;
    onDeletePress?: (() => void) | null;
    onNotInterestedPress?: (() => void) | null;
    onReportPress?: (() => void) | null;
  }) => {
    if (!visible) {
      return null;
    }

    const ReactLocal = require('react');
    const { Pressable, Text, View } = require('react-native');
    return ReactLocal.createElement(
      View,
      { testID: 'social-post-action-sheet' },
      ReactLocal.createElement(
        Pressable,
        { onPress: onClose, testID: 'social-post-action-sheet-close' },
        ReactLocal.createElement(Text, null, 'close'),
      ),
      onNotInterestedPress
        ? ReactLocal.createElement(
            Pressable,
            { onPress: onNotInterestedPress, testID: 'social-post-action-not-interested' },
            ReactLocal.createElement(Text, null, 'not interested'),
          )
        : null,
      onReportPress
        ? ReactLocal.createElement(
            Pressable,
            { onPress: onReportPress, testID: 'social-post-action-report' },
            ReactLocal.createElement(Text, null, 'report'),
          )
        : null,
      onDeletePress
        ? ReactLocal.createElement(
            Pressable,
            { onPress: onDeletePress, testID: 'social-post-action-delete' },
            ReactLocal.createElement(Text, null, 'delete'),
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

function createSocialPost(overrides: Partial<Record<string, unknown>> = {}) {
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
    like_count: 2,
    dislike_count: 0,
    comment_count: 1,
    viewer_reaction: 'neutral',
    viewer_has_liked: false,
    moderation_status: 'approved',
    ...overrides,
  };
}

function createSocialFeedQueryResult(
  overrides: Partial<Record<string, unknown>> = {},
) {
  return {
    data: {
      pages: [
        {
          items: [createSocialPost()],
        },
      ],
    },
    error: null,
    isFetched: true,
    isFetching: false,
    isFetchingNextPage: false,
    isStale: false,
    hasNextPage: false,
    fetchNextPage: jest.fn(),
    refetch: jest.fn(),
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

describe('SocialScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    latestFocusEffectCallback = undefined;
    mockUserProfile = {
      id: 'viewer-1',
      account_tier: 'free',
    };
    mockUseFeatureFlags.mockReturnValue({
      data: {
        social_enabled: true,
        coach_enabled: false,
        entry_offer_enabled: false,
        social_comments_enabled: true,
      },
      dataUpdatedAt: 1,
    });
    mockUseSocialFeed.mockReturnValue(createSocialFeedQueryResult());
    mockUseSocialMutations.mockReturnValue({
      deletePostMutation: { mutateAsync: jest.fn() },
      setReactionMutation: { mutate: jest.fn() },
      reportContentMutation: { mutate: jest.fn(), mutateAsync: jest.fn() },
      reactionError: null,
      clearReactionError: mockClearReactionError,
      isDeletePending: jest.fn().mockReturnValue(false),
      isReactionPending: jest.fn().mockReturnValue(false),
    });
    mockRecordSocialPostImpressions.mockResolvedValue({
      success: true,
      recorded_count: 1,
    });
    mockRecordSocialPostViews.mockResolvedValue({
      success: true,
      recorded_count: 1,
    });
    mockShareSocialPostAsset.mockResolvedValue(undefined);
  });

  it('keeps the header compact and opens the composer route from the FAB', () => {
    const screen = render(<SocialScreen />);

    expect(screen.queryByTestId('social-compose-button')).toBeNull();
    expect(screen.queryByText('social.feed_subtitle')).toBeNull();

    fireEvent.press(screen.getByTestId('social-compose-fab'));

    expect(mockPush).toHaveBeenCalledWith('/social-compose');
  });

  it('renders one explicit separator between consecutive posts without extra edge separators', () => {
    mockUseSocialFeed.mockReturnValue(createSocialFeedQueryResult({
      data: {
        pages: [
          {
            items: [
              createSocialPost(),
              createSocialPost({
                id: 'post-2',
                author_id: 'author-2',
                author_username: 'bob',
                category: 'physique',
                content_text: 'Progress update',
                image_url: 'https://cdn.example.com/post-2.jpg',
                asset_url: 'https://cdn.example.com/post-2-share.jpg',
                created_at: '2026-04-06T13:00:00.000Z',
                like_count: 4,
                comment_count: 2,
              }),
            ],
          },
        ],
      },
    }));

    const screen = render(<SocialScreen />);

    expect(screen.getByTestId('social-post-post-1')).toBeTruthy();
    expect(screen.getByTestId('social-post-post-2')).toBeTruthy();
    expect(screen.getByTestId('mock-flash-list-separator-0')).toBeTruthy();
    expect(screen.queryByTestId('mock-flash-list-separator-1')).toBeNull();
  });

  it('tracks the social tab view on mount', () => {
    render(<SocialScreen />);

    expect(mockTrackEvent).toHaveBeenCalledWith('social_tab_viewed');
  });

  it('switches category filters and refetches the feed with the selected category', () => {
    const screen = render(<SocialScreen />);

    expect(mockUseSocialFeed).toHaveBeenLastCalledWith('all');
    expect(screen.getByTestId('social-filters-control')).toBeTruthy();
    expect(screen.queryByTestId('social-filters-scroll')).toBeNull();

    fireEvent.press(screen.getByTestId('social-pill-food'));

    expect(mockUseSocialFeed).toHaveBeenLastCalledWith('food');
  });

  it('shows floating filters after a small upward scroll away from the top', () => {
    const screen = render(<SocialScreen />);
    const feedList = screen.getByTestId('social-feed-list');
    const floatingFiltersStyle = screen.getByTestId('social-floating-filters', {
      includeHiddenElements: true,
    }).props.style;
    const floatingFiltersDockStyle = screen.getByTestId(
      'social-floating-filters-dock',
      {
        includeHiddenElements: true,
      },
    ).props.style;
    const floatingFiltersSegmentsStyle = screen.getByTestId(
      'social-floating-filters-segments',
      {
        includeHiddenElements: true,
      },
    ).props.style;

    expect(collectFlattenedStyleValue(floatingFiltersStyle, 'top')).toBe(
      MOCK_SAFE_AREA_INSETS.top + SPACING.sm,
    );
    expect(
      collectFlattenedStyleValue(floatingFiltersDockStyle, 'backgroundColor'),
    ).toBe(withAlpha('#000000', 0.68));
    expect(collectFlattenedStyleValue(floatingFiltersDockStyle, 'borderRadius')).toBeGreaterThanOrEqual(999);
    expect(
      collectFlattenedStyleValue(floatingFiltersSegmentsStyle, 'backgroundColor'),
    ).toBe('transparent');
    expect(
      collectFlattenedStyleValue(floatingFiltersSegmentsStyle, 'borderColor'),
    ).toBe('transparent');

    expect(
      screen.getByTestId('social-floating-filters', { includeHiddenElements: true })
        .props.pointerEvents,
    ).toBe('none');

    fireEvent.scroll(feedList, {
      nativeEvent: {
        contentOffset: { y: 180 },
      },
    });

    expect(
      screen.getByTestId('social-floating-filters', { includeHiddenElements: true })
        .props.pointerEvents,
    ).toBe('none');

    fireEvent.scroll(feedList, {
      nativeEvent: {
        contentOffset: { y: 170 },
      },
    });

    expect(screen.getByTestId('social-floating-filters').props.pointerEvents).toBe('auto');
  });

  it('waits for the measured title and inline filters to clear before showing floating filters', () => {
    const screen = render(<SocialScreen />);
    const feedChrome = screen.getByTestId('social-feed-chrome');
    const feedList = screen.getByTestId('social-feed-list');

    fireEvent(feedChrome, 'layout', {
      nativeEvent: {
        layout: {
          height: 180,
          width: 320,
          x: 0,
          y: 0,
        },
      },
    });

    fireEvent.scroll(feedList, {
      nativeEvent: {
        contentOffset: { y: 200 },
      },
    });
    fireEvent.scroll(feedList, {
      nativeEvent: {
        contentOffset: { y: 192 },
      },
    });

    expect(
      screen.getByTestId('social-floating-filters', { includeHiddenElements: true })
        .props.pointerEvents,
    ).toBe('none');

    fireEvent.scroll(feedList, {
      nativeEvent: {
        contentOffset: { y: 240 },
      },
    });
    fireEvent.scroll(feedList, {
      nativeEvent: {
        contentOffset: { y: 232 },
      },
    });

    expect(screen.getByTestId('social-floating-filters').props.pointerEvents).toBe('auto');
  });

  it('hides floating filters again after a downward scroll threshold', () => {
    const screen = render(<SocialScreen />);
    const feedList = screen.getByTestId('social-feed-list');

    fireEvent.scroll(feedList, {
      nativeEvent: {
        contentOffset: { y: 180 },
      },
    });
    fireEvent.scroll(feedList, {
      nativeEvent: {
        contentOffset: { y: 170 },
      },
    });

    expect(screen.getByTestId('social-floating-filters').props.pointerEvents).toBe('auto');

    fireEvent.scroll(feedList, {
      nativeEvent: {
        contentOffset: { y: 190 },
      },
    });

    expect(
      screen.getByTestId('social-floating-filters', { includeHiddenElements: true })
        .props.pointerEvents,
    ).toBe('none');
  });

  it('switches category from the floating filters and keeps them visible', () => {
    const screen = render(<SocialScreen />);
    const feedList = screen.getByTestId('social-feed-list');

    fireEvent.scroll(feedList, {
      nativeEvent: {
        contentOffset: { y: 180 },
      },
    });
    fireEvent.scroll(feedList, {
      nativeEvent: {
        contentOffset: { y: 170 },
      },
    });

    fireEvent.press(screen.getByTestId('social-floating-pill-food'));

    expect(mockUseSocialFeed).toHaveBeenLastCalledWith('food');
    expect(screen.getByTestId('social-floating-filters').props.pointerEvents).toBe('auto');
  });

  it('keeps pagination wired through the feed list', () => {
    const mockFetchNextPage = jest.fn();
    mockUseSocialFeed.mockReturnValue(
      createSocialFeedQueryResult({
        fetchNextPage: mockFetchNextPage,
        hasNextPage: true,
        isFetchingNextPage: false,
      }),
    );
    const screen = render(<SocialScreen />);

    screen.getByTestId('social-feed-list').props.onEndReached();

    expect(mockFetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('hides comment actions when the comments flag is disabled', () => {
    mockUseFeatureFlags.mockReturnValue({
      data: {
        social_enabled: true,
        coach_enabled: false,
        entry_offer_enabled: false,
        social_comments_enabled: false,
      },
      dataUpdatedAt: 1,
    });

    const screen = render(<SocialScreen />);

    expect(screen.queryByTestId('comments-enabled-post-1')).toBeNull();
  });

  it.each(['free', 'premium', 'admin'])(
    'shows comment actions for %s accounts when social is enabled and the comments flag is absent',
    (accountTier) => {
      mockUserProfile = {
        id: 'viewer-1',
        account_tier: accountTier,
      };
      mockUseFeatureFlags.mockReturnValue({
        data: {
          social_enabled: true,
          coach_enabled: false,
          entry_offer_enabled: false,
        },
        dataUpdatedAt: 1,
      });

      const screen = render(<SocialScreen />);

      expect(screen.getByTestId('comments-enabled-post-1')).toBeTruthy();
    },
  );

  it('shows comment actions for free users while the feature config is still unresolved', () => {
    mockUserProfile = {
      id: 'viewer-1',
      account_tier: 'free',
    };
    mockUseFeatureFlags.mockReturnValue({
      data: DEFAULT_APP_CONFIG,
      dataUpdatedAt: 0,
    });

    const screen = render(<SocialScreen />);

    expect(screen.getByTestId('comments-enabled-post-1')).toBeTruthy();
  });

  it('shows report for non-author posts and no delete action', () => {
    const screen = render(<SocialScreen />);

    expect(screen.getByTestId('report-enabled-post-1')).toBeTruthy();
    expect(screen.queryByTestId('delete-enabled-post-1')).toBeNull();

    fireEvent.press(screen.getByTestId('report-enabled-post-1'));

    expect(mockShowAlert).toHaveBeenCalledWith(
      'social.report.title',
      'social.report.message',
      expect.any(Array),
    );
  });

  it('opens the dedicated post route from the comments action and requests composer focus', () => {
    const screen = render(<SocialScreen />);

    fireEvent.press(screen.getByTestId('comments-enabled-post-1'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/social-post',
      params: {
        postId: 'post-1',
        postAuthorId: 'author-1',
        postModerationStatus: 'approved',
        focusComposer: '1',
      },
    });
  });

  it('opens the dedicated post route from the main card press', () => {
    const screen = render(<SocialScreen />);

    fireEvent.press(screen.getByTestId('post-open-post-1'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/social-post',
      params: {
        postId: 'post-1',
        postAuthorId: 'author-1',
        postModerationStatus: 'approved',
      },
    });
  });

  it('opens the mini profile from the avatar press', () => {
    const screen = render(<SocialScreen />);

    fireEvent.press(screen.getByTestId('avatar-open-post-1'));

    expect(screen.getByTestId('social-profile-preview-modal').props.children).toBe(
      'author-1',
    );
  });

  it('routes like and dislike taps through the explicit reaction mutation', () => {
    const mockMutate = jest.fn();
    mockUseSocialMutations.mockReturnValue({
      deletePostMutation: { mutateAsync: jest.fn() },
      setReactionMutation: { mutate: mockMutate },
      reportContentMutation: { mutate: jest.fn(), mutateAsync: jest.fn() },
      reactionError: null,
      clearReactionError: mockClearReactionError,
      isDeletePending: jest.fn().mockReturnValue(false),
      isReactionPending: jest.fn().mockReturnValue(false),
    });

    const screen = render(<SocialScreen />);

    fireEvent.press(screen.getByTestId('like-enabled-post-1'));
    fireEvent.press(screen.getByTestId('dislike-enabled-post-1'));

    expect(mockMutate).toHaveBeenNthCalledWith(1, {
      postId: 'post-1',
      reaction: 'like',
    });
    expect(mockMutate).toHaveBeenNthCalledWith(2, {
      postId: 'post-1',
      reaction: 'dislike',
    });
  });

  it('routes not interested through the post action sheet', () => {
    const mockMutate = jest.fn();
    mockUseSocialMutations.mockReturnValue({
      deletePostMutation: { mutateAsync: jest.fn() },
      setReactionMutation: { mutate: mockMutate },
      reportContentMutation: { mutate: jest.fn(), mutateAsync: jest.fn() },
      reactionError: null,
      clearReactionError: mockClearReactionError,
      isDeletePending: jest.fn().mockReturnValue(false),
      isReactionPending: jest.fn().mockReturnValue(false),
    });

    const screen = render(<SocialScreen />);

    fireEvent.press(screen.getByTestId('more-enabled-post-1'));
    expect(screen.getByTestId('social-post-action-sheet')).toBeTruthy();

    fireEvent.press(screen.getByTestId('social-post-action-not-interested'));

    expect(mockMutate).toHaveBeenCalledWith({
      postId: 'post-1',
      reaction: 'dislike',
    });
  });

  it('sends a neutral reaction when pressing like on an already liked post', () => {
    const mockMutate = jest.fn();
    mockUseSocialMutations.mockReturnValue({
      deletePostMutation: { mutateAsync: jest.fn() },
      setReactionMutation: { mutate: mockMutate },
      reportContentMutation: { mutate: jest.fn(), mutateAsync: jest.fn() },
      reactionError: null,
      clearReactionError: mockClearReactionError,
      isDeletePending: jest.fn().mockReturnValue(false),
      isReactionPending: jest.fn().mockReturnValue(false),
    });
    mockUseSocialFeed.mockReturnValue(
      createSocialFeedQueryResult({
        data: {
          pages: [
            {
              items: [createSocialPost({ viewer_reaction: 'like', viewer_has_liked: true })],
            },
          ],
        },
      }),
    );

    const screen = render(<SocialScreen />);

    fireEvent.press(screen.getByTestId('like-enabled-post-1'));

    expect(mockMutate).toHaveBeenCalledWith({
      postId: 'post-1',
      reaction: 'neutral',
    });
  });

  it('sends a neutral reaction when pressing dislike on an already disliked post', () => {
    const mockMutate = jest.fn();
    mockUseSocialMutations.mockReturnValue({
      deletePostMutation: { mutateAsync: jest.fn() },
      setReactionMutation: { mutate: mockMutate },
      reportContentMutation: { mutate: jest.fn(), mutateAsync: jest.fn() },
      reactionError: null,
      clearReactionError: mockClearReactionError,
      isDeletePending: jest.fn().mockReturnValue(false),
      isReactionPending: jest.fn().mockReturnValue(false),
    });
    mockUseSocialFeed.mockReturnValue(
      createSocialFeedQueryResult({
        data: {
          pages: [
            {
              items: [createSocialPost({ viewer_reaction: 'dislike', viewer_has_liked: false })],
            },
          ],
        },
      }),
    );

    const screen = render(<SocialScreen />);

    fireEvent.press(screen.getByTestId('dislike-enabled-post-1'));

    expect(mockMutate).toHaveBeenCalledWith({
      postId: 'post-1',
      reaction: 'neutral',
    });
  });

  it('disables reaction controls while a post reaction is already pending', () => {
    const mockMutate = jest.fn();
    mockUseSocialMutations.mockReturnValue({
      deletePostMutation: { mutateAsync: jest.fn() },
      setReactionMutation: { mutate: mockMutate },
      reportContentMutation: { mutate: jest.fn(), mutateAsync: jest.fn() },
      reactionError: null,
      clearReactionError: mockClearReactionError,
      isDeletePending: jest.fn().mockReturnValue(false),
      isReactionPending: (postId: string) => postId === 'post-1',
    });

    const screen = render(<SocialScreen />);

    fireEvent.press(screen.getByTestId('like-enabled-post-1'));
    fireEvent.press(screen.getByTestId('dislike-enabled-post-1'));

    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('shows an inline reaction error with diagnostics when the backend is not aligned', () => {
    mockUseSocialMutations.mockReturnValue({
      deletePostMutation: { mutateAsync: jest.fn() },
      setReactionMutation: { mutate: jest.fn() },
      reportContentMutation: { mutate: jest.fn(), mutateAsync: jest.fn() },
      reactionError: {
        postId: 'post-1',
        message: 'Social route "social-set-reaction" is not deployed.',
        code: 'edge_function_route_missing',
        status: 404,
        functionName: 'social-set-reaction',
        requestId: 'req-123',
      },
      clearReactionError: mockClearReactionError,
      isDeletePending: jest.fn().mockReturnValue(false),
      isReactionPending: jest.fn().mockReturnValue(false),
    });

    const screen = render(<SocialScreen />);

    expect(screen.getByTestId('social-reaction-error')).toBeTruthy();
    expect(screen.getByText('social.errors.reaction_title')).toBeTruthy();
    expect(screen.getAllByText(/social-set-reaction/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/edge_function_route_missing/i)).toBeTruthy();
    expect(screen.getByText(/404/i)).toBeTruthy();
    expect(screen.getByText(/req-123/i)).toBeTruthy();

    fireEvent.press(screen.getByTestId('social-reaction-error-dismiss'));

    expect(mockClearReactionError).toHaveBeenCalled();
  });

  it('shows the backend comment count on the feed card', () => {
    mockUseSocialFeed.mockReturnValue(createSocialFeedQueryResult({
      data: {
        pages: [
          {
            items: [
              createSocialPost({
                id: 'post-1',
                comment_count: 2,
              }),
            ],
          },
        ],
        pageParams: [null],
      },
    }));

    const screen = render(<SocialScreen />);

    expect(screen.getByTestId('comment-count-post-1').props.children).toBe('2');
  });

  it('shows the server viewer-visible comment count on the feed card', () => {
    mockUseSocialFeed.mockReturnValue(createSocialFeedQueryResult({
      data: {
        pages: [
          {
            items: [
              createSocialPost({
                id: 'post-1',
                comment_count: 50,
                viewer_visible_comment_count: 55,
              }),
            ],
          },
        ],
        pageParams: [null],
      },
    }));

    const screen = render(<SocialScreen />);

    expect(screen.getByTestId('comment-count-post-1').props.children).toBe('55');
  });

  it('does not inflate the feed count with an old client override shape', () => {
    mockUseSocialFeed.mockReturnValue(createSocialFeedQueryResult({
      data: {
        pages: [
          {
            items: [
              createSocialPost({
                id: 'post-1',
                comment_count: 50,
                viewer_visible_comment_count: 45,
              }),
            ],
          },
        ],
        pageParams: [null],
      },
    }));

    const screen = render(<SocialScreen />);

    expect(screen.getByTestId('comment-count-post-1').props.children).toBe('45');
  });

  it('shows a large server comment count immediately on the feed card', () => {
    mockUseSocialFeed.mockReturnValue(createSocialFeedQueryResult({
      data: {
        pages: [
          {
            items: [
              createSocialPost({
                id: 'post-1',
                comment_count: 500,
                viewer_visible_comment_count: 500,
              }),
            ],
          },
        ],
        pageParams: [null],
      },
    }));

    const screen = render(<SocialScreen />);

    expect(screen.getByTestId('comment-count-post-1').props.children).toBe('500');
  });

  it('shows delete for the viewer own post and runs the delete mutation after confirmation', async () => {
    const mockDeleteMutateAsync = jest.fn().mockResolvedValue({
      success: true,
      post_id: 'post-1',
      moderation_state: 'removed',
      deleted_at: '2026-04-15T10:00:00.000Z',
    });
    mockUseSocialFeed.mockReturnValue(createSocialFeedQueryResult({
      data: {
        pages: [
          {
            items: [
              createSocialPost({
                author_id: 'viewer-1',
              }),
            ],
          },
        ],
      },
    }));
    mockUseSocialMutations.mockReturnValue({
      deletePostMutation: { mutateAsync: mockDeleteMutateAsync },
      setReactionMutation: { mutate: jest.fn() },
      reportContentMutation: { mutate: jest.fn(), mutateAsync: jest.fn() },
      reactionError: null,
      clearReactionError: mockClearReactionError,
      isDeletePending: jest.fn().mockReturnValue(false),
      isReactionPending: jest.fn().mockReturnValue(false),
    });

    const screen = render(<SocialScreen />);

    expect(screen.getByTestId('delete-enabled-post-1')).toBeTruthy();
    expect(screen.queryByTestId('report-enabled-post-1')).toBeNull();

    fireEvent.press(screen.getByTestId('delete-enabled-post-1'));

    const latestAlertCall =
      mockShowAlert.mock.calls[mockShowAlert.mock.calls.length - 1];
    const buttons = latestAlertCall?.[2] as
      | Array<{ onPress?: () => void }>
      | undefined;

    expect(mockShowAlert).toHaveBeenCalledWith(
      'social.delete.confirm_title',
      'social.delete.confirm_message',
      expect.any(Array),
    );

    await act(async () => {
      buttons?.[1]?.onPress?.();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockDeleteMutateAsync).toHaveBeenCalledWith({
        postId: 'post-1',
      });
    });
  });

  it('does not open the delete confirmation while deletion is pending', () => {
    mockUseSocialFeed.mockReturnValue(createSocialFeedQueryResult({
      data: {
        pages: [
          {
            items: [
              createSocialPost({
                author_id: 'viewer-1',
              }),
            ],
          },
        ],
      },
    }));
    mockUseSocialMutations.mockReturnValue({
      deletePostMutation: { mutateAsync: jest.fn() },
      setReactionMutation: { mutate: jest.fn() },
      reportContentMutation: { mutate: jest.fn(), mutateAsync: jest.fn() },
      reactionError: null,
      clearReactionError: mockClearReactionError,
      isDeletePending: (postId: string) => postId === 'post-1',
      isReactionPending: jest.fn().mockReturnValue(false),
    });

    const screen = render(<SocialScreen />);

    fireEvent.press(screen.getByTestId('delete-enabled-post-1'));

    expect(mockShowAlert).not.toHaveBeenCalled();
  });

  it('shows a delete error alert when the delete mutation fails', async () => {
    const mockDeleteMutateAsync = jest.fn().mockRejectedValue(
      new SocialServiceError('Delete route failed', {
        code: 'edge_function_route_missing',
        status: 404,
        functionName: 'social-delete-post',
        requestId: 'req-delete-post',
      }),
    );
    mockUseSocialFeed.mockReturnValue(createSocialFeedQueryResult({
      data: {
        pages: [
          {
            items: [
              createSocialPost({
                author_id: 'viewer-1',
              }),
            ],
          },
        ],
      },
    }));
    mockUseSocialMutations.mockReturnValue({
      deletePostMutation: { mutateAsync: mockDeleteMutateAsync },
      setReactionMutation: { mutate: jest.fn() },
      reportContentMutation: { mutate: jest.fn(), mutateAsync: jest.fn() },
      reactionError: null,
      clearReactionError: mockClearReactionError,
      isDeletePending: jest.fn().mockReturnValue(false),
      isReactionPending: jest.fn().mockReturnValue(false),
    });

    const screen = render(<SocialScreen />);

    fireEvent.press(screen.getByTestId('delete-enabled-post-1'));

    const latestAlertCall =
      mockShowAlert.mock.calls[mockShowAlert.mock.calls.length - 1];
    const buttons = latestAlertCall?.[2] as
      | Array<{ onPress?: () => void }>
      | undefined;

    await act(async () => {
      buttons?.[1]?.onPress?.();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockShowAlert).toHaveBeenLastCalledWith(
        'social.delete.error_title',
        'social.delete.error_submit\n\nsocial.errors.reaction_route_label: social-delete-post | social.errors.reaction_code_label: edge_function_route_missing | social.errors.reaction_status_label: 404 | social.errors.reaction_request_id_label: req-delete-post',
        [{ text: 'common.ok' }],
      );
    });
  });

  it('tracks share failures without exposing raw provider payloads', async () => {
    mockShareSocialPostAsset.mockRejectedValueOnce(
      new SocialServiceError('Internal share failure', {
        code: 'sharing_failed',
        status: 500,
      }),
    );

    const screen = render(<SocialScreen />);

    fireEvent.press(screen.getByTestId('share-enabled-post-1'));

    await waitFor(() => {
      expect(mockTrackFailureEvent).toHaveBeenCalledWith(
        'social_share_failed',
        expect.objectContaining({
          code: 'sharing_failed',
          status: 500,
        }),
        {
          post_id: 'post-1',
        },
      );
      expect(mockShowAlert).toHaveBeenCalledWith(
        'social.errors.share_title',
        'Internal share failure',
        [{ text: 'common.ok' }],
      );
    });
  });

  it('keeps the feed visible and interactive when impression recording fails', async () => {
    jest.useFakeTimers();
    const mockReactionMutate = jest.fn();
    mockUseSocialMutations.mockReturnValue({
      deletePostMutation: { mutateAsync: jest.fn() },
      setReactionMutation: { mutate: mockReactionMutate },
      reportContentMutation: { mutate: jest.fn(), mutateAsync: jest.fn() },
      reactionError: null,
      clearReactionError: mockClearReactionError,
      isDeletePending: jest.fn().mockReturnValue(false),
      isReactionPending: jest.fn().mockReturnValue(false),
    });
    mockRecordSocialPostImpressions.mockRejectedValueOnce(
      new SocialServiceError(
        'Social route "social-record-impressions" is not deployed on Supabase project "test" (404).',
        {
          code: 'edge_function_route_missing',
          status: 404,
          functionName: 'social-record-impressions',
        },
      ),
    );

    const screen = render(<SocialScreen />);

    await act(async () => {
      jest.runAllTimers();
      await Promise.resolve();
    });

    expect(screen.getByTestId('social-post-post-1')).toBeTruthy();
    expect(screen.queryByTestId('social-error-state')).toBeNull();

    fireEvent.press(screen.getByTestId('like-enabled-post-1'));

    expect(mockReactionMutate).toHaveBeenCalledWith({
      postId: 'post-1',
      reaction: 'like',
    });
    jest.useRealTimers();
  });

  it('records unique post views only once per session after viewability qualifies', async () => {
    jest.useFakeTimers();

    const screen = render(<SocialScreen />);

    await act(async () => {
      jest.runAllTimers();
      await Promise.resolve();
    });

    expect(mockRecordSocialPostViews).toHaveBeenCalledTimes(1);
    expect(mockRecordSocialPostViews).toHaveBeenCalledWith(['post-1']);

    screen.rerender(<SocialScreen />);

    await act(async () => {
      jest.runAllTimers();
      await Promise.resolve();
    });

    expect(mockRecordSocialPostViews).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('does not surface background fetching as a visible pull-to-refresh state', () => {
    mockUseSocialFeed.mockReturnValue(
      createSocialFeedQueryResult({
        isFetched: true,
        isFetching: true,
        isFetchingNextPage: false,
      }),
    );

    const screen = render(<SocialScreen />);

    expect(screen.getByTestId('social-feed-list').props.refreshing).toBe(false);
  });

  it('uses a manual refresh spinner only while a pull-to-refresh refetch is in flight', async () => {
    const deferredRefetch = createDeferredPromise<unknown>();
    const mockRefetch = jest.fn(() => deferredRefetch.promise);
    let refreshPromise: Promise<unknown> | null = null;
    mockUseSocialFeed.mockReturnValue(
      createSocialFeedQueryResult({
        refetch: mockRefetch,
      }),
    );

    const screen = render(<SocialScreen />);

    expect(screen.getByTestId('social-feed-list').props.refreshing).toBe(false);

    await act(async () => {
      refreshPromise = screen.getByTestId('social-feed-list').props.onRefresh();
      await Promise.resolve();
    });

    expect(mockRefetch).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('social-feed-list').props.refreshing).toBe(true);

    await act(async () => {
      deferredRefetch.resolve({ data: undefined });
      await refreshPromise;
    });

    expect(screen.getByTestId('social-feed-list').props.refreshing).toBe(false);
  });

  it('shows the blocking backend error card when the feed query itself fails', () => {
    mockUseSocialFeed.mockReturnValue(createSocialFeedQueryResult({
      data: {
        pages: [
          {
            items: [],
          },
        ],
      },
      error: new SocialServiceError('Feed unavailable', {
        code: 'social_feed_load_failed',
        status: 503,
      }),
    }));

    const screen = render(<SocialScreen />);

    expect(screen.getByTestId('social-error-state')).toBeTruthy();
    expect(screen.getByText('Feed unavailable')).toBeTruthy();
  });

  it('does not show the empty state before the first real feed response arrives', () => {
    mockUseSocialFeed.mockReturnValue(
      createSocialFeedQueryResult({
        data: undefined,
        isFetched: false,
        isFetching: true,
      }),
    );

    const screen = render(<SocialScreen />);

    expect(screen.queryByText('social.empty.title')).toBeNull();
    expect(screen.queryByText('social.empty.body')).toBeNull();
  });

  it('shows the empty state after a real empty feed response', () => {
    mockUseSocialFeed.mockReturnValue(
      createSocialFeedQueryResult({
        data: {
          pages: [
            {
              items: [],
            },
          ],
        },
      }),
    );

    const screen = render(<SocialScreen />);

    expect(screen.getByText('social.empty.title')).toBeTruthy();
    expect(screen.getByText('social.empty.body')).toBeTruthy();
  });

  it('skips an extra refetch on the first screen focus', () => {
    const mockRefetch = jest.fn();
    mockUseSocialFeed.mockReturnValue(
      createSocialFeedQueryResult({
        data: undefined,
        isFetched: false,
        isFetching: true,
        isStale: true,
        refetch: mockRefetch,
      }),
    );

    render(<SocialScreen />);

    act(() => {
      latestFocusEffectCallback?.();
    });

    expect(mockRefetch).not.toHaveBeenCalled();
  });

  it('refetches on return only when the current feed is stale and idle', () => {
    const mockRefetch = jest.fn();
    let currentFeedQuery = createSocialFeedQueryResult({
      data: undefined,
      isFetched: false,
      isFetching: true,
      isStale: true,
      refetch: mockRefetch,
    });

    mockUseSocialFeed.mockImplementation(() => currentFeedQuery);

    const screen = render(<SocialScreen />);

    act(() => {
      latestFocusEffectCallback?.();
    });
    expect(mockRefetch).not.toHaveBeenCalled();

    currentFeedQuery = createSocialFeedQueryResult({
      isFetched: true,
      isFetching: false,
      isStale: false,
      refetch: mockRefetch,
    });
    screen.rerender(<SocialScreen />);

    act(() => {
      latestFocusEffectCallback?.();
    });
    expect(mockRefetch).not.toHaveBeenCalled();

    currentFeedQuery = createSocialFeedQueryResult({
      isFetched: true,
      isFetching: false,
      isStale: true,
      refetch: mockRefetch,
    });
    screen.rerender(<SocialScreen />);

    act(() => {
      latestFocusEffectCallback?.();
    });
    expect(mockRefetch).toHaveBeenCalledTimes(1);

    currentFeedQuery = createSocialFeedQueryResult({
      isFetched: true,
      isFetching: true,
      isStale: true,
      refetch: mockRefetch,
    });
    screen.rerender(<SocialScreen />);

    act(() => {
      latestFocusEffectCallback?.();
    });
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });
});

function collectFlattenedStyleValue(
  style: unknown,
  key: string,
) {
  const flattenedStyle = StyleSheet.flatten(style as any);
  return flattenedStyle?.[key];
}
