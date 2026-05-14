import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import AdminSocialModerationScreen from '@/screens/AdminSocialModerationScreen';
import { SocialAdminServiceError } from '@/services/socialAdmin';

const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockUseAuth = jest.fn();
const mockUseSocialAdminModeration = jest.fn();
const mockShowAlert = jest.fn();
const originalNodeEnv = process.env.NODE_ENV;
const originalDevFlag = (global as typeof globalThis & { __DEV__?: boolean }).__DEV__;
let mockLatestFlashListData: any[] = [];
let mockLatestFlashListProps: Record<string, unknown> = {};

function getRenderedModerationItemIds() {
  return mockLatestFlashListData.map((entry) => entry.content_id);
}

jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: mockReplace,
    back: mockBack,
  }),
}));

jest.mock('@shopify/flash-list', () => ({
  FlashList: ({
    data = [],
    renderItem,
    ListEmptyComponent,
    ListHeaderComponent,
    ListFooterComponent,
    testID = 'mock-admin-flash-list',
    ...props
  }: {
    data?: unknown[];
    renderItem: (item: { item: any; index: number }) => React.ReactNode;
    ListEmptyComponent?: React.ReactNode | (() => React.ReactNode);
    ListHeaderComponent?: React.ReactNode;
    ListFooterComponent?: React.ReactNode | (() => React.ReactNode);
    testID?: string;
    [key: string]: unknown;
  }) => {
    mockLatestFlashListData = data as any[];
    mockLatestFlashListProps = {
      data,
      ListEmptyComponent,
      ListHeaderComponent,
      ListFooterComponent,
      testID,
      ...props,
    };
    const ReactLocal = require('react');
    const { View: RNView } = require('react-native');

    return (
      <RNView {...props} testID={testID}>
        {ListHeaderComponent ?? null}
        {mockLatestFlashListData.length
          ? mockLatestFlashListData.map((item, index) => (
              <ReactLocal.Fragment
                key={item.content_id ?? index}
              >
                {renderItem({ item, index })}
              </ReactLocal.Fragment>
            ))
          : (typeof ListEmptyComponent === 'function'
              ? ListEmptyComponent()
              : (ListEmptyComponent ?? null))}
        {typeof ListFooterComponent === 'function'
          ? ListFooterComponent()
          : (ListFooterComponent ?? null)}
      </RNView>
    );
  },
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/hooks/queries', () => ({
  useSocialAdminModeration: (...args: unknown[]) =>
    mockUseSocialAdminModeration(...args),
}));
jest.mock('@/hooks/queries/useSocialAdminModeration', () => ({
  useSocialAdminModeration: (...args: unknown[]) =>
    mockUseSocialAdminModeration(...args),
}));

jest.mock('@/hooks/useCustomAlert', () => ({
  useCustomAlert: () => ({
    alertElement: null,
    showAlert: (...args: unknown[]) => mockShowAlert(...args),
  }),
}));

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => (key === 'common.ok' ? 'OK' : key),
  }),
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#f7f7f7',
      cardBackground: '#ffffff',
      primaryText: '#1f2937',
      primary: '#2563eb',
      gray: '#6b7280',
      error: '#dc2626',
      warning: '#d97706',
      danger: '#dc2626',
      white: '#ffffff',
      success: '#16a34a',
    },
  }),
}));

function createQueueData(filter: 'needs_review' | 'reported' | 'processed') {
  if (filter === 'reported') {
    return {
      success: true,
      items: [
        {
          content_type: 'comment',
          content_id: 'comment-reported',
          author_id: 'author-2',
          author_username: 'bob',
          category: null,
          content_text: 'Reported but already approved',
          asset_url: null,
          moderation_state: 'approved',
          moderation_reason: null,
          moderation_provider: null,
          created_at: '2026-04-14T07:00:00.000Z',
          open_reports: 3,
          total_reports_24h: 3,
          unique_reporters_24h: 2,
          unique_viewer_count: 0,
          reason_codes: ['spam_repeat'],
          last_reported_at: '2026-04-14T07:10:00.000Z',
          moderation_queued_at: '2026-04-14T07:05:00.000Z',
          moderation_claimed_at: null,
          moderation_completed_at: '2026-04-14T07:30:00.000Z',
          moderation_attempt_count: 1,
          moderation_last_error: null,
          raw_like_count: 0,
          raw_dislike_count: 0,
          admin_like_adjustment: 0,
          admin_dislike_adjustment: 0,
          effective_like_count: 0,
          effective_dislike_count: 0,
          author_active_bans: [],
        },
      ],
      pending_count: 1,
      flagged_count: 1,
      reported_count: 1,
      needs_review_count: 2,
      processed_count: 2,
    };
  }

  if (filter === 'processed') {
    return {
      success: true,
      items: [
        {
          content_type: 'post',
          content_id: 'post-approved',
          author_id: 'author-1',
          author_username: 'alice',
          category: 'food',
          content_text: 'Approved content',
          asset_url: null,
          moderation_state: 'approved',
          moderation_reason: null,
          moderation_provider: 'admin',
          created_at: '2026-04-14T08:00:00.000Z',
          open_reports: 0,
          total_reports_24h: 0,
          unique_reporters_24h: 0,
          unique_viewer_count: 7,
          reason_codes: [],
          last_reported_at: null,
          moderation_queued_at: '2026-04-14T08:05:00.000Z',
          moderation_claimed_at: null,
          moderation_completed_at: '2026-04-14T08:30:00.000Z',
          moderation_attempt_count: 1,
          moderation_last_error: null,
          raw_like_count: 0,
          raw_dislike_count: 0,
          admin_like_adjustment: 0,
          admin_dislike_adjustment: 0,
          effective_like_count: 0,
          effective_dislike_count: 0,
          author_active_bans: [],
        },
        {
          content_type: 'comment',
          content_id: 'comment-removed',
          author_id: 'author-2',
          author_username: 'bob',
          category: null,
          content_text: 'Removed content',
          asset_url: null,
          moderation_state: 'removed',
          moderation_reason: 'admin_remove',
          moderation_provider: 'admin',
          created_at: '2026-04-14T07:00:00.000Z',
          open_reports: 2,
          total_reports_24h: 2,
          unique_reporters_24h: 2,
          unique_viewer_count: 0,
          reason_codes: ['spam_repeat'],
          last_reported_at: '2026-04-14T07:10:00.000Z',
          moderation_queued_at: '2026-04-14T07:05:00.000Z',
          moderation_claimed_at: null,
          moderation_completed_at: '2026-04-14T07:30:00.000Z',
          moderation_attempt_count: 1,
          moderation_last_error: null,
          raw_like_count: 0,
          raw_dislike_count: 0,
          admin_like_adjustment: 0,
          admin_dislike_adjustment: 0,
          effective_like_count: 0,
          effective_dislike_count: 0,
          author_active_bans: [],
        },
      ],
      pending_count: 1,
      flagged_count: 1,
      reported_count: 1,
      needs_review_count: 2,
      processed_count: 2,
    };
  }

  return {
    success: true,
    items: [
      {
        content_type: 'post',
        content_id: 'post-pending',
        author_id: 'author-1',
        author_username: 'alice',
        category: 'food',
        content_text: 'Pending content',
        asset_url: 'https://cdn.example.com/post-1.jpg',
        moderation_state: 'pending',
        moderation_reason: null,
        moderation_provider: null,
        created_at: '2026-04-14T08:00:00.000Z',
        open_reports: 1,
        total_reports_24h: 1,
        unique_reporters_24h: 1,
        unique_viewer_count: 5,
        reason_codes: ['harassment'],
        last_reported_at: '2026-04-14T08:10:00.000Z',
        moderation_queued_at: '2026-04-14T08:05:00.000Z',
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
      },
      {
        content_type: 'comment',
        content_id: 'comment-flagged',
        author_id: 'author-3',
        author_username: 'zoe',
        category: null,
        content_text: 'Flagged content that is more urgent',
        asset_url: null,
        moderation_state: 'flagged',
        moderation_reason: 'spam_repeat',
        moderation_provider: 'pipeline',
        created_at: '2026-04-13T09:00:00.000Z',
        open_reports: 5,
        total_reports_24h: 5,
        unique_reporters_24h: 3,
        unique_viewer_count: 0,
        reason_codes: ['spam_repeat'],
        last_reported_at: '2026-04-14T09:30:00.000Z',
        moderation_queued_at: '2026-04-13T09:10:00.000Z',
        moderation_claimed_at: null,
        moderation_completed_at: null,
        moderation_attempt_count: 1,
        moderation_last_error: 'Worker failed once',
        raw_like_count: 0,
        raw_dislike_count: 0,
        admin_like_adjustment: 0,
        admin_dislike_adjustment: 0,
        effective_like_count: 0,
        effective_dislike_count: 0,
        author_active_bans: [
          {
            scope: 'comments',
            ends_at: null,
            reason: null,
          },
        ],
      },
    ],
    pending_count: 1,
    flagged_count: 1,
    reported_count: 1,
    needs_review_count: 2,
    processed_count: 2,
  };
}

describe('AdminSocialModerationScreen', () => {
  afterAll(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
    (global as typeof globalThis & { __DEV__?: boolean }).__DEV__ = originalDevFlag;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockLatestFlashListData = [];
    mockLatestFlashListProps = {};
    (process.env as Record<string, string | undefined>).NODE_ENV = 'test';
    (global as typeof globalThis & { __DEV__?: boolean }).__DEV__ = false;

    mockUseAuth.mockReturnValue({
      userProfile: {
        id: 'admin-1',
        account_tier: 'admin',
      },
      loading: false,
    });

    const moderateMutateAsync = jest.fn().mockResolvedValue({ success: true });
    const bulkApproveMutateAsync = jest.fn().mockResolvedValue({
      requestedCount: 0,
      approvedCount: 0,
      failedIds: [],
    });
    const reclassifyMutateAsync = jest.fn().mockResolvedValue({ success: true });
    const moderateUserMutateAsync = jest.fn().mockResolvedValue({ success: true });
    const eradicateMutateAsync = jest.fn().mockResolvedValue({ success: true });
    const adjustReactionsMutateAsync = jest.fn().mockResolvedValue({ success: true });

    mockUseSocialAdminModeration.mockImplementation((filter = 'needs_review') => ({
      moderationQueueQuery: {
        data: createQueueData(filter),
        error: null,
        isLoading: false,
        isRefetching: false,
        refetch: jest.fn(),
      },
      moderateContentMutation: {
        isPending: false,
        mutateAsync: moderateMutateAsync,
      },
      bulkApproveContentMutation: {
        isPending: false,
        mutateAsync: bulkApproveMutateAsync,
      },
      reclassifyPostMutation: {
        isPending: false,
        mutateAsync: reclassifyMutateAsync,
      },
      moderateUserMutation: {
        isPending: false,
        mutateAsync: moderateUserMutateAsync,
      },
      eradicateUserMutation: {
        isPending: false,
        mutateAsync: eradicateMutateAsync,
      },
      adjustPostReactionsMutation: {
        isPending: false,
        mutateAsync: adjustReactionsMutateAsync,
      },
    }));
  });

  it('redirects non-admin users and keeps the admin query disabled', async () => {
    mockUseAuth.mockReturnValue({
      userProfile: {
        id: 'viewer-1',
        account_tier: 'free',
      },
      loading: false,
    });

    render(<AdminSocialModerationScreen />);

    expect(mockUseSocialAdminModeration).toHaveBeenCalledWith('needs_review', false);
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
    });
  });

  it('shows a professional queue error and keeps retry available when the backend route is missing', () => {
    const refetch = jest.fn();

    mockUseSocialAdminModeration.mockReturnValue({
      moderationQueueQuery: {
        data: null,
        error: new SocialAdminServiceError(
          'Social admin route "social-list-moderation-queue" is not deployed on Supabase project "qpogulljnnacrxdjbwiz" (404).',
          {
            code: 'edge_function_route_missing',
            status: 404,
            functionName: 'social-list-moderation-queue',
            requestId: 'req-route-missing',
          },
        ),
        isLoading: false,
        isRefetching: false,
        refetch,
      },
      moderateContentMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
      reclassifyPostMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
      moderateUserMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
      eradicateUserMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
      adjustPostReactionsMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
    });

    const screen = render(<AdminSocialModerationScreen />);

    expect(screen.getByTestId('admin-social-error-state')).toBeTruthy();
    expect(screen.queryByTestId('admin-social-empty-state')).toBeNull();
    expect(screen.getByText('social.admin.errors.load_route_missing')).toBeTruthy();
    expect(
      screen.queryByText(
        'Social admin route "social-list-moderation-queue" is not deployed on Supabase project "qpogulljnnacrxdjbwiz" (404).',
      ),
    ).toBeNull();
    expect(screen.queryByTestId('admin-social-error-debug')).toBeNull();

    fireEvent.press(screen.getByTestId('admin-social-retry'));

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows a real empty state when the moderation queue loads successfully with no items', () => {
    mockUseSocialAdminModeration.mockReturnValue({
      moderationQueueQuery: {
        data: {
          success: true,
          items: [],
          pending_count: 0,
          flagged_count: 0,
          reported_count: 0,
          needs_review_count: 0,
          processed_count: 0,
        },
        error: null,
        isLoading: false,
        isRefetching: false,
        refetch: jest.fn(),
      },
      moderateContentMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
      reclassifyPostMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
      moderateUserMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
      eradicateUserMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
      adjustPostReactionsMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
    });

    const screen = render(<AdminSocialModerationScreen />);

    expect(screen.getByTestId('admin-social-empty-state')).toBeTruthy();
    expect(screen.queryByTestId('admin-social-error-state')).toBeNull();
    expect(screen.getByText('social.admin.empty.review_title')).toBeTruthy();
    expect(screen.getByText('social.admin.empty.review_body')).toBeTruthy();
  });

  it('shows queue diagnostics only in development mode', () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
    (global as typeof globalThis & { __DEV__?: boolean }).__DEV__ = true;

    mockUseSocialAdminModeration.mockReturnValue({
      moderationQueueQuery: {
        data: null,
        error: new SocialAdminServiceError('Social admin route unavailable', {
          code: 'edge_function_route_missing',
          status: 404,
          functionName: 'social-list-moderation-queue',
          requestId: 'req-debug-404',
        }),
        isLoading: false,
        isRefetching: false,
        refetch: jest.fn(),
      },
      moderateContentMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
      reclassifyPostMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
      moderateUserMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
      eradicateUserMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
      adjustPostReactionsMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
    });

    const screen = render(<AdminSocialModerationScreen />);

    expect(screen.getByTestId('admin-social-error-debug')).toBeTruthy();
    expect(screen.getByText('code: edge_function_route_missing')).toBeTruthy();
    expect(screen.getByText('function: social-list-moderation-queue')).toBeTruthy();
    expect(screen.getByText('request_id: req-debug-404')).toBeTruthy();
    expect(screen.getByText('project: test')).toBeTruthy();
    expect(screen.getByText('message: Social admin route unavailable')).toBeTruthy();
  });

  it('renders the compact summary header, preserves the filters, and sorts urgent content first', async () => {
    const screen = render(<AdminSocialModerationScreen />);

    expect(mockUseSocialAdminModeration).toHaveBeenCalledWith('needs_review', true);
    expect(mockLatestFlashListProps.stickyHeaderIndices).toBeUndefined();
    expect(screen.getByTestId('admin-social-summary-strip')).toBeTruthy();
    expect(screen.getByTestId('admin-social-summary-grid')).toBeTruthy();
    expect(screen.getByTestId('admin-social-toolbar')).toBeTruthy();
    expect(screen.getByTestId('admin-social-summary-processed')).toBeTruthy();
    expect(screen.getByTestId('admin-social-filters')).toBeTruthy();
    expect(screen.getByTestId('admin-social-filter-needs_review')).toBeTruthy();
    expect(screen.getByTestId('admin-social-filter-reported')).toBeTruthy();
    expect(screen.getByTestId('admin-social-filter-processed')).toBeTruthy();
    expect(screen.getByTestId('admin-social-item-comment-flagged')).toBeTruthy();
    expect(screen.getByTestId('admin-social-item-post-pending')).toBeTruthy();
    expect(getRenderedModerationItemIds()).toEqual([
      'comment-flagged',
      'post-pending',
    ]);

    fireEvent.press(screen.getByTestId('admin-social-filter-processed'));

    await waitFor(() => {
      expect(mockUseSocialAdminModeration).toHaveBeenCalledWith('processed', true);
      expect(screen.getByTestId('admin-social-section-processed')).toBeTruthy();
      expect(getRenderedModerationItemIds()).toEqual([
        'post-approved',
        'comment-removed',
      ]);
    });
  });

  it('renders a compact loading placeholder while the moderation queue is fetching', () => {
    mockUseSocialAdminModeration.mockReturnValue({
      moderationQueueQuery: {
        data: null,
        error: null,
        isLoading: true,
        isRefetching: false,
        refetch: jest.fn(),
      },
      moderateContentMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
      reclassifyPostMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
      moderateUserMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
      eradicateUserMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
      adjustPostReactionsMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
    });

    const screen = render(<AdminSocialModerationScreen />);

    expect(screen.getByTestId('admin-social-toolbar')).toBeTruthy();
    expect(screen.getByTestId('admin-social-loading-placeholder')).toBeTruthy();
  });

  it('filters client-side by author and content text', () => {
    const screen = render(<AdminSocialModerationScreen />);

    fireEvent.changeText(screen.getByTestId('admin-social-search-input'), 'alice');
    expect(getRenderedModerationItemIds()).toEqual(['post-pending']);

    fireEvent.changeText(screen.getByTestId('admin-social-search-input'), 'flagged');
    expect(getRenderedModerationItemIds()).toEqual(['comment-flagged']);
  });

  it('shows checkboxes only for approvable items and toggles the bulk bar', async () => {
    const screen = render(<AdminSocialModerationScreen />);

    expect(screen.getByTestId('admin-social-select-post-pending')).toBeTruthy();
    expect(screen.getByTestId('admin-social-select-comment-flagged')).toBeTruthy();

    fireEvent.press(screen.getByTestId('admin-social-select-post-pending'));

    await waitFor(() => {
      expect(screen.getByTestId('admin-social-bulk-bar')).toBeTruthy();
      expect(screen.getByTestId('admin-social-bulk-clear')).toBeTruthy();
      expect(screen.getByTestId('admin-social-bulk-approve')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('admin-social-bulk-clear'));

    await waitFor(() => {
      expect(screen.queryByTestId('admin-social-bulk-bar')).toBeNull();
    });

    fireEvent.press(screen.getByTestId('admin-social-filter-processed'));

    await waitFor(() => {
      expect(screen.queryByTestId('admin-social-select-post-approved')).toBeNull();
      expect(screen.queryByTestId('admin-social-select-comment-removed')).toBeNull();
    });
  });

  it('confirms bulk approval before submitting the selected moderation items', async () => {
    const bulkApproveMutateAsync = jest.fn().mockResolvedValue({
      requestedCount: 2,
      approvedCount: 2,
      failedIds: [],
    });

    mockUseSocialAdminModeration.mockImplementation((filter = 'needs_review') => ({
      moderationQueueQuery: {
        data: createQueueData(filter),
        error: null,
        isLoading: false,
        isRefetching: false,
        refetch: jest.fn(),
      },
      moderateContentMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
      bulkApproveContentMutation: {
        isPending: false,
        mutateAsync: bulkApproveMutateAsync,
      },
      reclassifyPostMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
      moderateUserMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
      eradicateUserMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
      adjustPostReactionsMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
    }));

    const screen = render(<AdminSocialModerationScreen />);

    fireEvent.press(screen.getByTestId('admin-social-select-post-pending'));
    fireEvent.press(screen.getByTestId('admin-social-select-comment-flagged'));
    fireEvent.press(screen.getByTestId('admin-social-bulk-approve'));

    await waitFor(() => {
      expect(mockShowAlert).toHaveBeenCalled();
    });

    const [, , buttons] = mockShowAlert.mock.calls.at(-1) as [string, string, Array<{
      text: string;
      onPress?: () => void;
    }>];

    expect(mockShowAlert.mock.calls.at(-1)?.[0]).toBe('social.admin.bulk.confirm_title');

    await act(async () => {
      buttons[1]?.onPress?.();
    });

    await waitFor(() => {
      expect(bulkApproveMutateAsync).toHaveBeenCalledWith([
        expect.objectContaining({ content_id: 'comment-flagged' }),
        expect.objectContaining({ content_id: 'post-pending' }),
      ]);
      expect(screen.queryByTestId('admin-social-bulk-bar')).toBeNull();
    });
  });

  it('keeps only failed ids selected after a partial bulk approval', async () => {
    const bulkApproveMutateAsync = jest.fn().mockResolvedValue({
      requestedCount: 2,
      approvedCount: 1,
      failedIds: ['comment-flagged'],
    });

    mockUseSocialAdminModeration.mockImplementation((filter = 'needs_review') => ({
      moderationQueueQuery: {
        data: createQueueData(filter),
        error: null,
        isLoading: false,
        isRefetching: false,
        refetch: jest.fn(),
      },
      moderateContentMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
      bulkApproveContentMutation: {
        isPending: false,
        mutateAsync: bulkApproveMutateAsync,
      },
      reclassifyPostMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
      moderateUserMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
      eradicateUserMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
      adjustPostReactionsMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
    }));

    const screen = render(<AdminSocialModerationScreen />);

    fireEvent.press(screen.getByTestId('admin-social-select-post-pending'));
    fireEvent.press(screen.getByTestId('admin-social-select-comment-flagged'));
    fireEvent.press(screen.getByTestId('admin-social-bulk-approve'));

    const [, , buttons] = mockShowAlert.mock.calls.at(-1) as [string, string, Array<{
      text: string;
      onPress?: () => void;
    }>];

    await act(async () => {
      buttons[1]?.onPress?.();
    });

    await waitFor(() => {
      expect(mockShowAlert.mock.calls.at(-1)?.[0]).toBe(
        'social.admin.bulk.partial_title',
      );
      expect(
        screen.getByTestId('admin-social-select-post-pending').props.accessibilityState
          ?.checked,
      ).toBe(false);
      expect(
        screen.getByTestId('admin-social-select-comment-flagged').props.accessibilityState
          ?.checked,
      ).toBe(true);
    });
  });

  it('keeps processed history as pure moderation items without any synthetic sticky row', async () => {
    const processedItems = Array.from({ length: 36 }, (_, index) => ({
      content_type: index % 2 === 0 ? 'post' : 'comment',
      content_id: `processed-${index + 1}`,
      author_id: `author-${index + 1}`,
      author_username: `user-${index + 1}`,
      category: index % 2 === 0 ? 'food' : null,
      content_text: `Processed content ${index + 1}`,
      asset_url: null,
      moderation_state: index % 3 === 0 ? 'approved' : 'removed',
      moderation_reason: index % 3 === 0 ? null : 'admin_remove',
      moderation_provider: 'admin',
      created_at: new Date(Date.UTC(2026, 3, 36 - index, 8, 0, 0)).toISOString(),
      open_reports: index % 4,
      total_reports_24h: index % 4,
      unique_reporters_24h: index % 3,
      unique_viewer_count: index,
      reason_codes: index % 3 === 0 ? [] : ['spam_repeat'],
      last_reported_at: index % 3 === 0 ? null : '2026-04-14T07:10:00.000Z',
      moderation_queued_at: '2026-04-14T07:05:00.000Z',
      moderation_claimed_at: null,
      moderation_completed_at: '2026-04-14T07:30:00.000Z',
      moderation_attempt_count: 1,
      moderation_last_error: null,
      raw_like_count: 0,
      raw_dislike_count: 0,
      admin_like_adjustment: 0,
      admin_dislike_adjustment: 0,
      effective_like_count: 0,
      effective_dislike_count: 0,
      author_active_bans: [],
    }));

    mockUseSocialAdminModeration.mockImplementation((filter = 'needs_review') => ({
      moderationQueueQuery: {
        data: filter === 'processed'
          ? {
              success: true,
              items: processedItems,
              pending_count: 1,
              flagged_count: 1,
              reported_count: 1,
              needs_review_count: 2,
              processed_count: processedItems.length,
            }
          : createQueueData(filter),
        error: null,
        isLoading: false,
        isRefetching: false,
        refetch: jest.fn(),
      },
      moderateContentMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
      reclassifyPostMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
      moderateUserMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
      eradicateUserMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
      adjustPostReactionsMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
    }));

    const screen = render(<AdminSocialModerationScreen />);

    fireEvent.press(screen.getByTestId('admin-social-filter-processed'));

    await waitFor(() => {
      expect(mockUseSocialAdminModeration).toHaveBeenCalledWith('processed', true);
      expect(mockLatestFlashListProps.stickyHeaderIndices).toBeUndefined();
      expect(mockLatestFlashListData).toHaveLength(36);
      expect(mockLatestFlashListData.some((item) => 'kind' in item)).toBe(false);
      expect(mockLatestFlashListData.every((item) => typeof item.content_id === 'string')).toBe(
        true,
      );
      expect(getRenderedModerationItemIds().slice(0, 3)).toEqual([
        'processed-1',
        'processed-2',
        'processed-3',
      ]);
      expect(getRenderedModerationItemIds().slice(-3)).toEqual([
        'processed-34',
        'processed-35',
        'processed-36',
      ]);
    });
  });

  it('shows the balanced action layout with direct buttons plus an overflow menu', async () => {
    const screen = render(<AdminSocialModerationScreen />);

    fireEvent.press(screen.getByTestId('admin-social-filter-processed'));

    await waitFor(() => {
      expect(screen.getByTestId('admin-social-action-hide-post-approved')).toBeTruthy();
      expect(screen.queryByTestId('admin-social-action-reject-post-approved')).toBeNull();
      expect(screen.getByTestId('admin-social-action-restore-comment-removed')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('admin-social-overflow-post-approved'));

    await waitFor(() => {
      expect(screen.getByTestId('admin-social-overflow-modal')).toBeTruthy();
      expect(
        screen.getByTestId('admin-social-overflow-action-reject-post-approved'),
      ).toBeTruthy();
      expect(
        screen.getByTestId('admin-social-overflow-action-remove-post-approved'),
      ).toBeTruthy();
      expect(
        screen.getByTestId('admin-social-overflow-action-change_category-post-approved'),
      ).toBeTruthy();
      expect(
        screen.getByTestId('admin-social-overflow-action-adjust_reactions-post-approved'),
      ).toBeTruthy();
      expect(
        screen.getByTestId('admin-social-overflow-action-moderate_author-post-approved'),
      ).toBeTruthy();
    });
  });

  it('opens category choices from the overflow menu and excludes the current category', async () => {
    const reclassifyMutateAsync = jest.fn().mockResolvedValue({ success: true });

    mockUseSocialAdminModeration.mockImplementation((filter = 'needs_review') => ({
      moderationQueueQuery: {
        data: createQueueData(filter),
        error: null,
        isLoading: false,
        isRefetching: false,
        refetch: jest.fn(),
      },
      moderateContentMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
      reclassifyPostMutation: {
        isPending: false,
        mutateAsync: reclassifyMutateAsync,
      },
      moderateUserMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
      eradicateUserMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
      adjustPostReactionsMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
    }));

    const screen = render(<AdminSocialModerationScreen />);

    fireEvent.press(screen.getByTestId('admin-social-filter-processed'));

    await waitFor(() => {
      expect(screen.getByTestId('admin-social-overflow-post-approved')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('admin-social-overflow-post-approved'));
    fireEvent.press(screen.getByTestId('admin-social-overflow-action-change_category-post-approved'));

    await waitFor(() => {
      expect(mockShowAlert).toHaveBeenCalled();
    });

    const [, , buttons] = mockShowAlert.mock.calls.at(-1) as [string, string, Array<{
      text: string;
      onPress?: () => void;
    }>];

    expect(mockShowAlert.mock.calls.at(-1)?.[0]).toBe('social.admin.category_change.title');
    expect(buttons).toHaveLength(3);
    expect(buttons[0]?.text).toBe('social.categories.before_after');
    expect(buttons[1]?.text).toBe('social.categories.physique');
    expect(buttons.some((button) => button.text === 'social.categories.food')).toBe(false);

    await act(async () => {
      buttons[0]?.onPress?.();
    });

    await waitFor(() => {
      expect(reclassifyMutateAsync).toHaveBeenCalledWith({
        post_id: 'post-approved',
        category: 'before_after',
      });
    });
  });

  it('opens the author moderation menu from the overflow and can trigger account eradication', async () => {
    const eradicateMutateAsync = jest.fn().mockResolvedValue({ success: true });

    mockUseSocialAdminModeration.mockImplementation((filter = 'needs_review') => ({
      moderationQueueQuery: {
        data: createQueueData(filter),
        error: null,
        isLoading: false,
        isRefetching: false,
        refetch: jest.fn(),
      },
      moderateContentMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
      reclassifyPostMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
      moderateUserMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
      eradicateUserMutation: {
        isPending: false,
        mutateAsync: eradicateMutateAsync,
      },
      adjustPostReactionsMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
    }));

    const screen = render(<AdminSocialModerationScreen />);

    fireEvent.press(screen.getByTestId('admin-social-overflow-post-pending'));
    fireEvent.press(screen.getByTestId('admin-social-overflow-action-moderate_author-post-pending'));

    await waitFor(() => {
      expect(mockShowAlert).toHaveBeenCalled();
    });

    const [, , buttons] = mockShowAlert.mock.calls.at(-1) as [string, string, Array<{
      text: string;
      onPress?: () => void;
    }>];
    const eradicateButton = buttons.find(
      (button) => button.text === 'social.admin.user_moderation.eradicate_content',
    );

    expect(eradicateButton).toBeTruthy();

    await act(async () => {
      eradicateButton?.onPress?.();
    });

    await waitFor(() => {
      expect(eradicateMutateAsync).toHaveBeenCalledWith({
        target_user_id: 'author-1',
      });
    });
  });

  it('opens the reaction adjustment modal from the overflow and submits absolute admin offsets', async () => {
    const adjustPostReactionsMutateAsync = jest.fn().mockResolvedValue({ success: true });

    mockUseSocialAdminModeration.mockImplementation((filter = 'needs_review') => ({
      moderationQueueQuery: {
        data: createQueueData(filter),
        error: null,
        isLoading: false,
        isRefetching: false,
        refetch: jest.fn(),
      },
      moderateContentMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
      reclassifyPostMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
      moderateUserMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
      eradicateUserMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
      adjustPostReactionsMutation: {
        isPending: false,
        mutateAsync: adjustPostReactionsMutateAsync,
      },
    }));

    const screen = render(<AdminSocialModerationScreen />);

    fireEvent.press(screen.getByTestId('admin-social-filter-processed'));

    await waitFor(() => {
      expect(screen.getByTestId('admin-social-overflow-post-approved')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('admin-social-overflow-post-approved'));
    fireEvent.press(screen.getByTestId('admin-social-overflow-action-adjust_reactions-post-approved'));

    await waitFor(() => {
      expect(screen.getByTestId('admin-social-adjust-reactions-modal')).toBeTruthy();
    });

    fireEvent.changeText(screen.getByTestId('admin-social-adjust-likes-input'), '-9');
    fireEvent.changeText(screen.getByTestId('admin-social-adjust-dislikes-input'), '4');
    fireEvent.changeText(screen.getByTestId('admin-social-adjust-note-input'), 'manual correction');
    fireEvent.press(screen.getByTestId('admin-social-adjust-submit'));

    await waitFor(() => {
      expect(adjustPostReactionsMutateAsync).toHaveBeenCalledWith({
        post_id: 'post-approved',
        admin_like_adjustment: -9,
        admin_dislike_adjustment: 4,
        note: 'manual correction',
      });
    });
  });

  it('toggles the details block for moderation cards', async () => {
    const screen = render(<AdminSocialModerationScreen />);

    expect(screen.queryByTestId('admin-social-details-post-pending')).toBeNull();
    expect(screen.getByTestId('admin-social-details-comment-flagged')).toBeTruthy();

    fireEvent.press(screen.getByTestId('admin-social-details-toggle-post-pending'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-social-details-post-pending')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('admin-social-details-toggle-post-pending'));
    await waitFor(() => {
      expect(screen.queryByTestId('admin-social-details-post-pending')).toBeNull();
    });
  });

  it('shows targeted pending feedback on the card that triggered an action', async () => {
    let moderationPending = false;
    const pendingPromise = new Promise(() => undefined);
    const mutateAsync = jest.fn(() => {
      moderationPending = true;
      return pendingPromise;
    });

    mockUseSocialAdminModeration.mockImplementation((filter = 'needs_review') => ({
      moderationQueueQuery: {
        data: createQueueData(filter),
        error: null,
        isLoading: false,
        isRefetching: false,
        refetch: jest.fn(),
      },
      moderateContentMutation: {
        isPending: moderationPending,
        mutateAsync,
      },
      reclassifyPostMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
      moderateUserMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
      eradicateUserMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
      adjustPostReactionsMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
    }));

    const screen = render(<AdminSocialModerationScreen />);

    fireEvent.press(screen.getByTestId('admin-social-action-approve-post-pending'));

    await waitFor(() => {
      expect(screen.getByTestId('admin-social-pending-post-pending')).toBeTruthy();
    });
  });

  it('shows an admin alert when moderation fails', async () => {
    const mutateAsync = jest
      .fn()
      .mockRejectedValueOnce(new Error('Backend moderation failed'));

    mockUseSocialAdminModeration.mockImplementation((filter = 'needs_review') => ({
      moderationQueueQuery: {
        data: createQueueData(filter),
        error: null,
        isLoading: false,
        isRefetching: false,
        refetch: jest.fn(),
      },
      moderateContentMutation: {
        isPending: false,
        mutateAsync,
      },
      reclassifyPostMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
      moderateUserMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
      eradicateUserMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
      adjustPostReactionsMutation: {
        isPending: false,
        mutateAsync: jest.fn(),
      },
    }));

    const screen = render(<AdminSocialModerationScreen />);

    fireEvent.press(screen.getByTestId('admin-social-action-approve-post-pending'));

    await waitFor(() => {
      expect(mockShowAlert).toHaveBeenCalledWith(
        'social.admin.errors.action_title',
        'Backend moderation failed',
        [{ text: 'OK' }],
      );
    });
  });
});
