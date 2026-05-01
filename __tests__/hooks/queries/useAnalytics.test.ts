import { cleanup, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useAnalytics, ANALYTICS_QUERY_KEY } from '@/hooks/queries/useAnalytics';

// Mock ApiService
jest.mock('@/services/api', () => ({
  ApiService: {
    getAnalytics: jest.fn(),
  },
}));

import { ApiService } from '@/services/api';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
};

describe('useAnalytics', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('generates correct query key', () => {
    expect(ANALYTICS_QUERY_KEY('7days')).toEqual(['analytics', '7days']);
    expect(ANALYTICS_QUERY_KEY('30days')).toEqual(['analytics', '30days']);
  });

  it('fetches analytics data successfully', async () => {
    const mockData = {
      totalScans: 50,
      scansByType: { body: 20, health: 15, nutrition: 15 },
      trends: [],
    };
    (ApiService.getAnalytics as jest.Mock).mockResolvedValue(mockData);

    const { result } = renderHook(() => useAnalytics('7days'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockData);
    expect(ApiService.getAnalytics).toHaveBeenCalledWith('7days');
  });

  it('handles error state', async () => {
    (ApiService.getAnalytics as jest.Mock).mockRejectedValue(new Error('API Error'));

    const { result } = renderHook(() => useAnalytics('30days'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe('API Error');
  });

  it('fetches with different periods', async () => {
    const mockData = { totalScans: 100 };
    (ApiService.getAnalytics as jest.Mock).mockResolvedValue(mockData);

    const periods = ['7days', '30days'] as const;

    for (const period of periods) {
      const { result } = renderHook(() => useAnalytics(period), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(ApiService.getAnalytics).toHaveBeenCalledWith(period);
    }
  });
});
