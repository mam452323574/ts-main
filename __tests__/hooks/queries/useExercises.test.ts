import { act, cleanup, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useExercises, EXERCISES_QUERY_KEY } from '@/hooks/queries/useExercises';

// Mock ApiService
jest.mock('@/services/api', () => ({
  ApiService: {
    getExercises: jest.fn(),
  },
}));

import { ApiService } from '@/services/api';

const testQueryClients = new Set<QueryClient>();

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  testQueryClients.add(queryClient);

  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
};

describe('useExercises', () => {
  afterEach(() => {
    cleanup();
    testQueryClients.forEach((queryClient) => queryClient.clear());
    testQueryClients.clear();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('has correct query key', () => {
    expect(EXERCISES_QUERY_KEY).toEqual(['exercises']);
  });

  it('fetches exercises data successfully', async () => {
    const mockData = [
      { id: '1', name: 'Push-ups', description: 'Classic push-ups' },
      { id: '2', name: 'Squats', description: 'Basic squats' },
    ];
    (ApiService.getExercises as jest.Mock).mockResolvedValue(mockData);

    const { result, unmount } = renderHook(() => useExercises(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockData);
    expect(ApiService.getExercises).toHaveBeenCalled();
    unmount();
  });

  it('handles loading state', async () => {
    let resolveExercises!: (value: unknown[]) => void;
    (ApiService.getExercises as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveExercises = resolve;
        }),
    );

    const { result, unmount } = renderHook(() => useExercises(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolveExercises([]);
    });
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    unmount();
  });

  it('handles error state', async () => {
    (ApiService.getExercises as jest.Mock).mockRejectedValue(
      new Error('Failed to fetch exercises')
    );

    const { result, unmount } = renderHook(() => useExercises(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe('Failed to fetch exercises');
    unmount();
  });

  it('returns empty array when no exercises', async () => {
    (ApiService.getExercises as jest.Mock).mockResolvedValue([]);

    const { result, unmount } = renderHook(() => useExercises(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual([]);
    unmount();
  });
});
