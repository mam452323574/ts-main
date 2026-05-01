import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import CoachHistoryScreen from '@/screens/CoachHistoryScreen';

const mockUseInfiniteCoachHistory = jest.fn();
const mockUseLocalSearchParams = jest.fn();
const mockRouterPush = jest.fn();
const mockRouterBack = jest.fn();
const mockRouterDismiss = jest.fn();
const mockRouterCanDismiss = jest.fn();

function createCoachEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry-older',
    title: 'Saved coach guidance',
    body: 'Keep your hydration steady and sleep on time.',
    disclaimer:
      'Wellness guidance only. This is not a diagnosis or medical advice.',
    persona_key: 'gentle_supportive',
    cta_label: null,
    cta_route: null,
    created_at: '2026-04-06T08:00:00.000Z',
    generated_at: '2026-04-06T08:00:00.000Z',
    source: 'n8n',
    status: 'ready',
    ...overrides,
  };
}

let mockCoachHistoryState: {
  data: Record<string, unknown>[];
  error: Error | null;
  isFetching: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  fetchNextPage: jest.Mock;
  refetch: jest.Mock;
};

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

jest.mock('@/hooks/queries', () => ({
  useInfiniteCoachHistory: (...args: unknown[]) => mockUseInfiniteCoachHistory(...args),
}));

describe('CoachHistoryScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouterCanDismiss.mockReturnValue(false);
    mockUseLocalSearchParams.mockReturnValue({
      excludeEntryId: 'entry-active',
    });
    mockCoachHistoryState = {
      data: [
        createCoachEntry({
          id: 'entry-active',
          title: 'Active guidance',
          body: 'This card should be excluded from history.',
        }),
        createCoachEntry(),
      ],
      error: null,
      isFetching: false,
      isFetchingNextPage: false,
      hasNextPage: false,
      fetchNextPage: jest.fn(),
      refetch: jest.fn(),
    };
    mockUseInfiniteCoachHistory.mockImplementation(
      ({ excludeEntryId }: { excludeEntryId?: string | null }) => ({
        items: mockCoachHistoryState.data.filter(
          (entry) => entry.id !== (excludeEntryId ?? null),
        ),
        error: mockCoachHistoryState.error,
        isFetching: mockCoachHistoryState.isFetching,
        isFetchingNextPage: mockCoachHistoryState.isFetchingNextPage,
        hasNextPage: mockCoachHistoryState.hasNextPage,
        fetchNextPage: mockCoachHistoryState.fetchNextPage,
        refetch: mockCoachHistoryState.refetch,
      }),
    );
  });

  it('renders the history list and excludes the active entry', () => {
    const screen = render(<CoachHistoryScreen />);

    expect(screen.getByTestId('coach-history-list')).toBeTruthy();
    expect(screen.queryByTestId('coach-history-card-entry-active')).toBeNull();
    expect(screen.getByTestId('coach-history-card-entry-older')).toBeTruthy();
    expect(screen.getByTestId('coach-history-card-entry-older-date')).toBeTruthy();
    expect(screen.getByTestId('coach-history-card-entry-older-preview')).toBeTruthy();
  });

  it('hides a history CTA when the provider route is not supported', () => {
    mockCoachHistoryState = {
      ...mockCoachHistoryState,
      data: [
        createCoachEntry({
          id: 'entry-invalid-cta',
          title: 'Targeted guidance',
          body: 'Open the next step to continue this plan.',
          cta_label: 'Open plan',
          cta_route: '/weekly-plan',
        }),
      ],
    };

    const screen = render(<CoachHistoryScreen />);

    fireEvent.press(screen.getByTestId('coach-history-card-entry-invalid-cta-toggle'));

    expect(screen.getByTestId('coach-history-card-entry-invalid-cta-expanded')).toBeTruthy();
    expect(screen.queryByText('Open plan')).toBeNull();
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it('expands a history card and routes its CTA only when the destination is supported', () => {
    mockCoachHistoryState = {
      ...mockCoachHistoryState,
      data: [
        createCoachEntry({
          id: 'entry-cta',
          title: 'Targeted guidance',
          body: 'Open the next step to continue this plan.',
          cta_label: 'Open plan',
          cta_route: '/coach/history',
        }),
      ],
    };

    const screen = render(<CoachHistoryScreen />);

    fireEvent.press(screen.getByTestId('coach-history-card-entry-cta-toggle'));

    expect(screen.getByTestId('coach-history-card-entry-cta-expanded')).toBeTruthy();

    expect(screen.queryByText('Open plan')).toBeNull();

    fireEvent.press(screen.getByText("Voir l'historique"));

    expect(mockRouterPush).toHaveBeenCalledWith('/coach-history');
  });

  it('keeps the persisted persona on history cards and falls back to a neutral coach when it is missing', () => {
    mockCoachHistoryState = {
      ...mockCoachHistoryState,
      data: [
        createCoachEntry({
          id: 'entry-strict',
          persona_key: 'strict_tough',
          title: 'Strict guidance',
        }),
        createCoachEntry({
          id: 'entry-neutral',
          persona_key: 'gentle_supportive',
          has_valid_persona: false,
          title: 'Legacy guidance',
        }),
      ],
    };

    const screen = render(<CoachHistoryScreen />);

    expect(screen.getByText('coach.personas.strict_tough.title')).toBeTruthy();
    expect(screen.getByText('Coach')).toBeTruthy();
    expect(screen.queryAllByText('coach.personas.gentle_supportive.title')).toHaveLength(0);
  });

  it('shows a loading state while entries are fetching for the first load', () => {
    mockCoachHistoryState = {
      data: [],
      error: null,
      isFetching: true,
      isFetchingNextPage: false,
      hasNextPage: false,
      fetchNextPage: jest.fn(),
      refetch: jest.fn(),
    };

    const screen = render(<CoachHistoryScreen />);

    expect(screen.getByTestId('coach-history-loading-state')).toBeTruthy();
  });

  it('renders an empty state when there is no saved history after filtering the active entry', () => {
    mockCoachHistoryState = {
      ...mockCoachHistoryState,
      data: [
        createCoachEntry({
          id: 'entry-active',
          title: 'Active guidance',
        }),
      ],
    };

    const screen = render(<CoachHistoryScreen />);

    expect(screen.getByTestId('coach-history-empty-state')).toBeTruthy();
  });

  it('routes the empty-state CTA back to Coach when no modal can dismiss', () => {
    mockCoachHistoryState = {
      ...mockCoachHistoryState,
      data: [
        createCoachEntry({
          id: 'entry-active',
          title: 'Active guidance',
        }),
      ],
    };

    const screen = render(<CoachHistoryScreen />);

    fireEvent.press(screen.getByText('Nouveau conseil'));

    expect(mockRouterCanDismiss).toHaveBeenCalled();
    expect(mockRouterPush).toHaveBeenCalledWith('/coach');
    expect(mockRouterDismiss).not.toHaveBeenCalled();
  });

  it('dismisses the empty-state CTA when presented as a modal', () => {
    mockRouterCanDismiss.mockReturnValue(true);
    mockCoachHistoryState = {
      ...mockCoachHistoryState,
      data: [],
    };

    const screen = render(<CoachHistoryScreen />);

    fireEvent.press(screen.getByText('Nouveau conseil'));

    expect(mockRouterDismiss).toHaveBeenCalled();
    expect(mockRouterPush).not.toHaveBeenCalledWith('/coach');
  });

  it('refreshes the history list through pull-to-refresh', () => {
    const refetch = jest.fn();
    mockCoachHistoryState = {
      ...mockCoachHistoryState,
      data: [createCoachEntry()],
      isFetching: true,
      refetch,
    };

    const screen = render(<CoachHistoryScreen />);
    const list = screen.getByTestId('coach-history-list');

    expect(list.props.refreshing).toBe(true);

    fireEvent(list, 'refresh');

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('marks only entries generated within the last 24 hours as recent', () => {
    const now = new Date('2026-04-28T10:00:00.000Z').getTime();
    const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(now);
    mockCoachHistoryState = {
      ...mockCoachHistoryState,
      data: [
        createCoachEntry({
          id: 'entry-recent',
          generated_at: '2026-04-28T09:00:00.000Z',
        }),
        createCoachEntry({
          id: 'entry-old',
          generated_at: '2026-04-26T09:00:00.000Z',
        }),
      ],
    };

    try {
      const screen = render(<CoachHistoryScreen />);

      expect(
        screen.getByTestId('coach-history-card-entry-recent-recent-badge'),
      ).toBeTruthy();
      expect(
        screen.queryByTestId('coach-history-card-entry-old-recent-badge'),
      ).toBeNull();
    } finally {
      dateNowSpy.mockRestore();
    }
  });

  it('shows a stable pagination error and retries only after an explicit user action', () => {
    const refetch = jest.fn();
    mockCoachHistoryState = {
      data: [],
      error: new Error(
        'Coach history pagination function "get_coach_history_page" is unavailable.',
      ),
      isFetching: false,
      isFetchingNextPage: false,
      hasNextPage: false,
      fetchNextPage: jest.fn(),
      refetch,
    };

    const screen = render(<CoachHistoryScreen />);

    expect(screen.getByTestId('coach-history-error-state')).toBeTruthy();
    expect(refetch).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText(/Retry|Reessayer|Réessayer/i));

    expect(refetch).toHaveBeenCalled();
  });

  it('uses the header back action to leave the screen', () => {
    const screen = render(<CoachHistoryScreen />);

    fireEvent.press(screen.getByTestId('coach-history-back-button'));

    expect(mockRouterCanDismiss).toHaveBeenCalled();
    expect(mockRouterBack).toHaveBeenCalled();
    expect(mockRouterDismiss).not.toHaveBeenCalled();
  });

  it('dismisses the modal when the router can dismiss', () => {
    mockRouterCanDismiss.mockReturnValue(true);

    const screen = render(<CoachHistoryScreen />);

    fireEvent.press(screen.getByTestId('coach-history-back-button'));

    expect(mockRouterDismiss).toHaveBeenCalled();
    expect(mockRouterBack).not.toHaveBeenCalled();
  });
});
