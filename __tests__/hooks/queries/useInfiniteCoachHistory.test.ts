import React from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useInfiniteCoachHistory } from '@/hooks/queries/useInfiniteCoachHistory';
import { CoachServiceError } from '@/services/coach';

const mockFetchCoachHistoryPage = jest.fn();

jest.mock('@/services/coach', () => {
  const actual = jest.requireActual('@/services/coach');
  return {
    ...actual,
    fetchCoachHistoryPage: (...args: unknown[]) => mockFetchCoachHistoryPage(...args),
  };
});

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1' },
  }),
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

  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  Wrapper.displayName = 'CoachInfiniteHistoryQueryClientWrapper';

  return Wrapper;
}

function buildPage(ids: string[], nextCursor: string | null = null) {
  return {
    items: ids.map((id) => ({
      id,
      title: `Title ${id}`,
      body: `Body ${id}`,
      disclaimer: 'Wellness guidance only. This is not a diagnosis or medical advice.',
      persona_key: 'gentle_supportive',
      cta_label: null,
      cta_route: null,
      created_at: '2026-04-06T08:00:00.000Z',
      generated_at: '2026-04-06T08:00:00.000Z',
      source: 'n8n',
      status: 'ready',
    })),
    next_cursor: nextCursor,
    has_more: nextCursor !== null,
  };
}

describe('useInfiniteCoachHistory', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('fetches the first coach history page on mount', async () => {
    mockFetchCoachHistoryPage.mockResolvedValueOnce(buildPage(['entry-1'], null));

    const { result } = renderHook(
      () => useInfiniteCoachHistory({ excludeEntryId: 'entry-active', pageSize: 10 }),
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetchCoachHistoryPage).toHaveBeenCalledWith({
      limit: 10,
      cursor: null,
      excludeEntryId: 'entry-active',
    });
    expect(result.current.items.map((entry) => entry.id)).toEqual(['entry-1']);
    expect(result.current.hasNextPage).toBe(false);
  });

  it('appends the next history page without duplicating existing entries', async () => {
    mockFetchCoachHistoryPage
      .mockResolvedValueOnce(buildPage(['entry-1', 'entry-2'], 'cursor-2'))
      .mockResolvedValueOnce(buildPage(['entry-2', 'entry-3'], null));

    const { result } = renderHook(() => useInfiniteCoachHistory({ pageSize: 2 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
      expect(result.current.hasNextPage).toBe(true);
    });

    await result.current.fetchNextPage();

    await waitFor(() => {
      expect(result.current.hasNextPage).toBe(false);
      expect(result.current.items.map((entry) => entry.id)).toEqual([
        'entry-1',
        'entry-2',
        'entry-3',
      ]);
    });

    expect(mockFetchCoachHistoryPage).toHaveBeenNthCalledWith(2, {
      limit: 2,
      cursor: 'cursor-2',
      excludeEntryId: null,
    });
  });

  it('does not retry non-transient coach history pagination errors', async () => {
    mockFetchCoachHistoryPage.mockRejectedValueOnce(
      new CoachServiceError('History page RPC unavailable', {
        code: 'coach_history_page_unavailable',
        status: 503,
      }),
    );

    const { result } = renderHook(() => useInfiniteCoachHistory({ pageSize: 10 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.error).toBeInstanceOf(Error);
    });

    expect(mockFetchCoachHistoryPage).toHaveBeenCalledTimes(1);
  });

  it('retries transient coach history pagination failures up to two times', async () => {
    jest.useFakeTimers();
    mockFetchCoachHistoryPage.mockRejectedValue(new Error('Temporary network failure'));

    const { result } = renderHook(() => useInfiniteCoachHistory({ pageSize: 10 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(mockFetchCoachHistoryPage).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      jest.advanceTimersByTime(5);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockFetchCoachHistoryPage).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      jest.advanceTimersByTime(5);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockFetchCoachHistoryPage).toHaveBeenCalledTimes(3);
      expect(result.current.error).toEqual(
        expect.objectContaining({
          message: 'Temporary network failure',
        }),
      );
    });
  });
});
