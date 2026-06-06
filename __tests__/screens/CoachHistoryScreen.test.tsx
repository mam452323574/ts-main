import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import CoachHistoryScreen from '@/screens/CoachHistoryScreen';

const mockUseInfiniteCoachUnifiedHistory = jest.fn();
const mockUseInfiniteCoachConversations = jest.fn();
const mockUseDeleteCoachEntry = jest.fn();
const mockUseDeleteCoachConversation = jest.fn();
const mockUseLocalSearchParams = jest.fn();
const mockRouterPush = jest.fn();
const mockRouterBack = jest.fn();
const mockRouterDismiss = jest.fn();
const mockRouterCanDismiss = jest.fn();

function createUnifiedEntryItem(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'entry' as const,
    id: 'unified-entry-1',
    user_id: 'user-1',
    sort_at: '2026-04-09T08:00:00.000Z',
    title: 'Unified guidance',
    body: 'Unified body content.',
    persona_key: 'gentle_supportive',
    locale: null,
    status: 'ready',
    created_at: '2026-04-09T08:00:00.000Z',
    updated_at: '2026-04-09T08:00:00.000Z',
    generated_at: '2026-04-09T08:00:00.000Z',
    source: 'n8n',
    prompt_type: null,
    question_key: null,
    question_text: null,
    response_version: null,
    content_json: null,
    cta_label: null,
    cta_route: null,
    expires_at: null,
    disclaimer: null,
    deleted_at: null,
    ...overrides,
  };
}

function createUnifiedConversationItem(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'conversation' as const,
    id: 'unified-conv-1',
    user_id: 'user-1',
    sort_at: '2026-04-10T08:00:00.000Z',
    title: 'Recent chat with the coach',
    persona_key: 'gentle_supportive',
    locale: null,
    status: 'active',
    created_at: '2026-04-10T08:00:00.000Z',
    updated_at: '2026-04-10T08:00:00.000Z',
    message_count: 4,
    user_message_count: 2,
    account_tier_at_start: 'premium',
    last_user_message_at: '2026-04-10T08:00:00.000Z',
    last_assistant_message_at: '2026-04-10T08:00:00.000Z',
    ended_at: null,
    ended_reason: null,
    archived_at: null,
    hidden_at: null,
    metadata: {},
    conversation_status: 'active' as const,
    ...overrides,
  };
}

let mockCoachUnifiedHistoryState: {
  data: Array<ReturnType<typeof createUnifiedEntryItem> | ReturnType<typeof createUnifiedConversationItem>>;
  error: Error | null;
  isFetching: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  fetchNextPage: jest.Mock;
  refetch: jest.Mock;
};

const mockDeleteEntryMutate = jest.fn();
const mockDeleteConversationMutate = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: (...args: unknown[]) => mockRouterPush(...args),
    back: (...args: unknown[]) => mockRouterBack(...args),
    dismiss: (...args: unknown[]) => mockRouterDismiss(...args),
    canDismiss: (...args: unknown[]) => mockRouterCanDismiss(...args),
  }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}));

jest.mock('@/components/ModalHandle', () => ({
  ModalHandle: () => null,
}));

jest.mock('@/hooks/queries/useInfiniteCoachUnifiedHistory', () => ({
  useInfiniteCoachUnifiedHistory: (...args: unknown[]) =>
    mockUseInfiniteCoachUnifiedHistory(...args),
  COACH_UNIFIED_HISTORY_INFINITE_QUERY_KEY: ['coachUnifiedHistoryInfinite'],
}));
jest.mock('@/hooks/queries/useInfiniteCoachConversations', () => ({
  useInfiniteCoachConversations: (...args: unknown[]) =>
    mockUseInfiniteCoachConversations(...args),
}));
jest.mock('@/hooks/queries/useDeleteCoachEntry', () => ({
  useDeleteCoachEntry: (...args: unknown[]) => mockUseDeleteCoachEntry(...args),
}));
jest.mock('@/hooks/queries/useDeleteCoachConversation', () => ({
  useDeleteCoachConversation: (...args: unknown[]) =>
    mockUseDeleteCoachConversation(...args),
}));

describe('CoachHistoryScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouterCanDismiss.mockReturnValue(false);
    mockUseLocalSearchParams.mockReturnValue({
      excludeEntryId: undefined,
    });
    mockCoachUnifiedHistoryState = {
      data: [],
      error: null,
      isFetching: false,
      isFetchingNextPage: false,
      hasNextPage: false,
      fetchNextPage: jest.fn(),
      refetch: jest.fn(),
    };
    mockUseInfiniteCoachUnifiedHistory.mockImplementation(() => ({
      items: mockCoachUnifiedHistoryState.data,
      error: mockCoachUnifiedHistoryState.error,
      isFetching: mockCoachUnifiedHistoryState.isFetching,
      isFetchingNextPage: mockCoachUnifiedHistoryState.isFetchingNextPage,
      hasNextPage: mockCoachUnifiedHistoryState.hasNextPage,
      fetchNextPage: mockCoachUnifiedHistoryState.fetchNextPage,
      refetch: mockCoachUnifiedHistoryState.refetch,
    }));
    // Default mock for the per-persona conversations hook used by the new
    // filtered mode. Tests that exercise the filtered mode override this in
    // their own scope.
    mockUseInfiniteCoachConversations.mockImplementation(() => ({
      items: [],
      error: null,
      isFetching: false,
      isFetchingNextPage: false,
      hasNextPage: false,
      fetchNextPage: jest.fn(),
      refetch: jest.fn(),
    }));
    mockUseDeleteCoachEntry.mockReturnValue({
      mutate: (...args: unknown[]) => mockDeleteEntryMutate(...args),
      isPending: false,
    });
    mockUseDeleteCoachConversation.mockReturnValue({
      mutate: (...args: unknown[]) => mockDeleteConversationMutate(...args),
      isPending: false,
    });
  });

  it('renders the unified feed directly with no tab selector', () => {
    mockCoachUnifiedHistoryState = {
      ...mockCoachUnifiedHistoryState,
      data: [createUnifiedEntryItem()],
    };

    const screen = render(<CoachHistoryScreen />);

    expect(screen.getByTestId('coach-history-unified-list')).toBeTruthy();
    expect(screen.queryByTestId('coach-history-tab-selector')).toBeNull();
    expect(screen.queryByTestId('coach-history-tab-all')).toBeNull();
    expect(screen.queryByTestId('coach-history-tab-requests')).toBeNull();
    expect(screen.queryByTestId('coach-history-tab-conversations')).toBeNull();
  });

  it('keeps the global mixed history when a legacy persona_key parameter is present', () => {
    mockUseLocalSearchParams.mockReturnValue({
      persona_key: 'patient_calm',
    });
    mockCoachUnifiedHistoryState = {
      ...mockCoachUnifiedHistoryState,
      data: [createUnifiedConversationItem({ id: 'legacy-param-conversation' })],
    };

    const screen = render(<CoachHistoryScreen />);

    expect(screen.getByTestId('coach-history-unified-list')).toBeTruthy();
    expect(
      screen.getByTestId('coach-history-unified-conversation-legacy-param-conversation'),
    ).toBeTruthy();
    expect(mockUseInfiniteCoachConversations).not.toHaveBeenCalled();
  });

  it('renders entries and conversations interleaved in the unified feed', () => {
    mockCoachUnifiedHistoryState = {
      ...mockCoachUnifiedHistoryState,
      data: [
        createUnifiedConversationItem({ id: 'conv-A', title: 'Today’s chat' }),
        createUnifiedEntryItem({ id: 'entry-B', title: 'Yesterday’s advice' }),
      ],
    };

    const screen = render(<CoachHistoryScreen />);

    expect(screen.getByTestId('coach-history-unified-entry-entry-B')).toBeTruthy();
    expect(
      screen.getByTestId('coach-history-unified-conversation-conv-A'),
    ).toBeTruthy();
  });

  it('excludes the active entry id from the unified feed', () => {
    mockUseLocalSearchParams.mockReturnValue({
      excludeEntryId: 'entry-A',
    });
    mockCoachUnifiedHistoryState = {
      ...mockCoachUnifiedHistoryState,
      data: [
        createUnifiedEntryItem({ id: 'entry-A', title: 'Active advice' }),
        createUnifiedEntryItem({ id: 'entry-B', title: 'Visible advice' }),
      ],
    };

    const screen = render(<CoachHistoryScreen />);

    expect(screen.queryByTestId('coach-history-unified-entry-entry-A')).toBeNull();
    expect(screen.getByTestId('coach-history-unified-entry-entry-B')).toBeTruthy();
  });

  it('shows a single empty state when no items exist', () => {
    const screen = render(<CoachHistoryScreen />);

    expect(screen.getByTestId('coach-history-unified-empty-state')).toBeTruthy();
  });

  it('shows a single error state with retry when the unified fetch fails', () => {
    const refetch = jest.fn();
    mockCoachUnifiedHistoryState = {
      ...mockCoachUnifiedHistoryState,
      error: new Error('Network down'),
      refetch,
    };

    const screen = render(<CoachHistoryScreen />);

    expect(screen.getByTestId('coach-history-unified-error-state')).toBeTruthy();
    fireEvent.press(screen.getByText(/retry|essayer/i));
    expect(refetch).toHaveBeenCalled();
  });

  it('shows a loading state on first load', () => {
    mockCoachUnifiedHistoryState = {
      ...mockCoachUnifiedHistoryState,
      isFetching: true,
    };

    const screen = render(<CoachHistoryScreen />);

    expect(screen.getByTestId('coach-history-unified-loading-state')).toBeTruthy();
  });

  it('refreshes via pull-to-refresh', () => {
    const refetch = jest.fn();
    mockCoachUnifiedHistoryState = {
      ...mockCoachUnifiedHistoryState,
      data: [createUnifiedEntryItem()],
      isFetching: true,
      refetch,
    };

    const screen = render(<CoachHistoryScreen />);
    const list = screen.getByTestId('coach-history-unified-list');

    expect(list.props.refreshing).toBe(true);
    fireEvent(list, 'refresh');
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('auto-expands the newest entry on first render', () => {
    mockCoachUnifiedHistoryState = {
      ...mockCoachUnifiedHistoryState,
      data: [
        createUnifiedEntryItem({ id: 'entry-newest', title: 'Newest guidance' }),
        createUnifiedEntryItem({ id: 'entry-older', title: 'Older guidance' }),
      ],
    };

    const screen = render(<CoachHistoryScreen />);

    expect(
      screen.getByTestId('coach-history-unified-entry-entry-newest-expanded'),
    ).toBeTruthy();
    expect(
      screen.queryByTestId('coach-history-unified-entry-entry-older-expanded'),
    ).toBeNull();
  });

  it('fires the delete-entry mutation after confirmation', () => {
    const AlertModule = jest.requireActual('react-native').Alert;
    const alertSpy = jest.spyOn(AlertModule, 'alert');
    mockCoachUnifiedHistoryState = {
      ...mockCoachUnifiedHistoryState,
      data: [createUnifiedEntryItem({ id: 'entry-todelete' })],
    };

    const screen = render(<CoachHistoryScreen />);

    fireEvent.press(
      screen.getByTestId('coach-history-unified-entry-entry-todelete-delete'),
    );

    const buttons = alertSpy.mock.calls[0]?.[2];
    const confirmButton = (
      buttons as Array<{ text: string; onPress?: () => void }> | undefined
    )?.find((button) => button.text === 'Supprimer');
    confirmButton?.onPress?.();

    expect(mockDeleteEntryMutate).toHaveBeenCalledWith(
      { entryId: 'entry-todelete' },
      expect.any(Object),
    );

    alertSpy.mockRestore();
  });

  it('fires the delete-conversation mutation after confirmation', () => {
    const AlertModule = jest.requireActual('react-native').Alert;
    const alertSpy = jest.spyOn(AlertModule, 'alert');
    mockCoachUnifiedHistoryState = {
      ...mockCoachUnifiedHistoryState,
      data: [createUnifiedConversationItem({ id: 'conv-todelete' })],
    };

    const screen = render(<CoachHistoryScreen />);

    fireEvent.press(
      screen.getByTestId('coach-history-unified-conversation-conv-todelete-delete'),
    );

    const buttons = alertSpy.mock.calls[0]?.[2];
    const confirmButton = (
      buttons as Array<{ text: string; onPress?: () => void }> | undefined
    )?.find((button) => button.text === 'Supprimer');
    confirmButton?.onPress?.();

    expect(mockDeleteConversationMutate).toHaveBeenCalledWith(
      { conversationId: 'conv-todelete' },
      expect.any(Object),
    );

    alertSpy.mockRestore();
  });

  it('does not crash when the auto-expanded entry is removed from the feed', () => {
    mockCoachUnifiedHistoryState = {
      ...mockCoachUnifiedHistoryState,
      data: [createUnifiedEntryItem({ id: 'entry-todelete' })],
    };

    const screen = render(<CoachHistoryScreen />);
    expect(
      screen.getByTestId('coach-history-unified-entry-entry-todelete-expanded'),
    ).toBeTruthy();

    mockCoachUnifiedHistoryState = {
      ...mockCoachUnifiedHistoryState,
      data: [],
    };
    screen.rerender(<CoachHistoryScreen />);

    expect(screen.getByTestId('coach-history-unified-empty-state')).toBeTruthy();
  });

  it('displays the saved question_text on an entry when present', () => {
    mockCoachUnifiedHistoryState = {
      ...mockCoachUnifiedHistoryState,
      data: [
        createUnifiedEntryItem({
          id: 'entry-question',
          prompt_type: 'latest_scan',
          question_text:
            'Sur quoi je dois me concentrer avant ma seance ce soir ?',
        }),
      ],
    };

    const screen = render(<CoachHistoryScreen />);

    expect(
      screen.getByText('Sur quoi je dois me concentrer avant ma seance ce soir ?'),
    ).toBeTruthy();
  });

  it('marks only entries generated within the last 24 hours as recent', () => {
    const now = new Date('2026-04-28T10:00:00.000Z').getTime();
    const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(now);
    mockCoachUnifiedHistoryState = {
      ...mockCoachUnifiedHistoryState,
      data: [
        createUnifiedEntryItem({
          id: 'entry-recent',
          generated_at: '2026-04-28T09:00:00.000Z',
        }),
        createUnifiedEntryItem({
          id: 'entry-old',
          generated_at: '2026-04-26T09:00:00.000Z',
        }),
      ],
    };

    try {
      const screen = render(<CoachHistoryScreen />);

      expect(
        screen.getByTestId(
          'coach-history-unified-entry-entry-recent-recent-badge',
        ),
      ).toBeTruthy();
      expect(
        screen.queryByTestId(
          'coach-history-unified-entry-entry-old-recent-badge',
        ),
      ).toBeNull();
    } finally {
      dateNowSpy.mockRestore();
    }
  });

  it('routes the empty-state CTA back to /coach when no modal can dismiss', () => {
    const screen = render(<CoachHistoryScreen />);

    fireEvent.press(screen.getByText('Nouveau conseil'));

    expect(mockRouterCanDismiss).toHaveBeenCalled();
    expect(mockRouterPush).toHaveBeenCalledWith('/coach');
    expect(mockRouterDismiss).not.toHaveBeenCalled();
  });

  it('dismisses the modal when the empty-state CTA is pressed inside a modal', () => {
    mockRouterCanDismiss.mockReturnValue(true);

    const screen = render(<CoachHistoryScreen />);

    fireEvent.press(screen.getByText('Nouveau conseil'));

    expect(mockRouterDismiss).toHaveBeenCalled();
    expect(mockRouterPush).not.toHaveBeenCalledWith('/coach');
  });

  it('uses the header back action to leave the screen', () => {
    const screen = render(<CoachHistoryScreen />);

    fireEvent.press(screen.getByTestId('coach-history-back-button'));

    expect(mockRouterCanDismiss).toHaveBeenCalled();
    expect(mockRouterBack).toHaveBeenCalled();
    expect(mockRouterDismiss).not.toHaveBeenCalled();
  });

  it('navigates to /coach/chat when a conversation card is tapped', () => {
    mockCoachUnifiedHistoryState = {
      ...mockCoachUnifiedHistoryState,
      data: [createUnifiedConversationItem({ id: 'conv-open' })],
    };

    const screen = render(<CoachHistoryScreen />);

    fireEvent.press(screen.getByTestId('coach-history-unified-conversation-conv-open'));

    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/coach/chat',
      params: { id: 'conv-open' },
    });
  });

  it('does not surface system status labels (ended / quota_reached / archived)', () => {
    mockCoachUnifiedHistoryState = {
      ...mockCoachUnifiedHistoryState,
      data: [
        createUnifiedConversationItem({
          id: 'conv-ended',
          status: 'ended',
          conversation_status: 'ended' as any,
        }),
        createUnifiedConversationItem({
          id: 'conv-archived',
          status: 'archived',
          conversation_status: 'archived' as any,
        }),
        createUnifiedConversationItem({
          id: 'conv-quota',
          status: 'quota_reached',
          conversation_status: 'quota_reached' as any,
          account_tier_at_start: 'free',
        }),
      ],
    };

    const screen = render(<CoachHistoryScreen />);

    expect(screen.queryByText('Terminée')).toBeNull();
    expect(screen.queryByText('Archivée')).toBeNull();
    expect(screen.queryByText('Complète')).toBeNull();
    expect(screen.queryByText('Conversation gratuite consommée')).toBeNull();
  });
});
