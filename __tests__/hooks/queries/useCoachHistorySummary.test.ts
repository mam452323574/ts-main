import React from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useCoachHistorySummary } from '@/hooks/queries/useCoachHistorySummary';
import { CoachServiceError } from '@/services/coach';

const mockFetchCoachHistorySummary = jest.fn();

jest.mock('@/services/coach', () => {
  const actual = jest.requireActual('@/services/coach');
  return {
    ...actual,
    fetchCoachHistorySummary: (...args: unknown[]) => mockFetchCoachHistorySummary(...args),
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

  Wrapper.displayName = 'CoachHistorySummaryQueryClientWrapper';

  return Wrapper;
}

describe('useCoachHistorySummary', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('fetches the exact coach history summary for the requested exclusion id', async () => {
    mockFetchCoachHistorySummary.mockResolvedValueOnce({
      total_count: 12,
      latest_entry_at: '2026-04-10T10:00:00.000Z',
    });

    const { result } = renderHook(
      () => useCoachHistorySummary({ excludeEntryId: 'entry-active' }),
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetchCoachHistorySummary).toHaveBeenCalledWith({
      excludeEntryId: 'entry-active',
    });
    expect(result.current.data).toEqual({
      total_count: 12,
      latest_entry_at: '2026-04-10T10:00:00.000Z',
    });
  });

  it('does not retry non-transient coach history summary errors', async () => {
    mockFetchCoachHistorySummary.mockRejectedValueOnce(
      new CoachServiceError('History summary RPC unavailable', {
        code: 'coach_history_summary_unavailable',
        status: 503,
      }),
    );

    const { result } = renderHook(
      () => useCoachHistorySummary({ excludeEntryId: 'entry-active' }),
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => {
      expect(result.current.error).toBeInstanceOf(Error);
    });

    expect(mockFetchCoachHistorySummary).toHaveBeenCalledTimes(1);
  });

  it('retries transient coach history summary failures up to two times', async () => {
    jest.useFakeTimers();
    mockFetchCoachHistorySummary.mockRejectedValue(new Error('Temporary network failure'));

    const { result } = renderHook(
      () => useCoachHistorySummary({ excludeEntryId: 'entry-active' }),
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => {
      expect(mockFetchCoachHistorySummary).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      jest.advanceTimersByTime(5);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockFetchCoachHistorySummary).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      jest.advanceTimersByTime(5);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockFetchCoachHistorySummary).toHaveBeenCalledTimes(3);
      expect(result.current.error).toEqual(
        expect.objectContaining({
          message: 'Temporary network failure',
        }),
      );
    });
  });
});
