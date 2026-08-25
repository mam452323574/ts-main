import { act, cleanup, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useRecipes, RECIPES_QUERY_KEY } from '@/hooks/queries/useRecipes';

// Mock ApiService
jest.mock('@/services/api', () => ({
  ApiService: {
    getRecipes: jest.fn(),
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

describe('useRecipes', () => {
  afterEach(() => {
    cleanup();
    testQueryClients.forEach((queryClient) => queryClient.clear());
    testQueryClients.clear();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('has correct query key', () => {
    expect(RECIPES_QUERY_KEY).toEqual(['recipes']);
  });

  it('fetches recipes data successfully', async () => {
    const mockData = [
      { id: '1', name: 'Healthy Salad', ingredients: ['lettuce', 'tomato'] },
      { id: '2', name: 'Protein Smoothie', ingredients: ['banana', 'protein powder'] },
    ];
    (ApiService.getRecipes as jest.Mock).mockResolvedValue(mockData);

    const { result, unmount } = renderHook(() => useRecipes(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockData);
    expect(ApiService.getRecipes).toHaveBeenCalled();
    unmount();
  });

  it('handles loading state', async () => {
    let resolveRecipes!: (value: unknown[]) => void;
    (ApiService.getRecipes as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRecipes = resolve;
        }),
    );

    const { result, unmount } = renderHook(() => useRecipes(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolveRecipes([]);
    });
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    unmount();
  });

  it('handles error state', async () => {
    (ApiService.getRecipes as jest.Mock).mockRejectedValue(
      new Error('Failed to fetch recipes')
    );

    const { result, unmount } = renderHook(() => useRecipes(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe('Failed to fetch recipes');
    unmount();
  });

  it('returns empty array when no recipes', async () => {
    (ApiService.getRecipes as jest.Mock).mockResolvedValue([]);

    const { result, unmount } = renderHook(() => useRecipes(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual([]);
    unmount();
  });
});
