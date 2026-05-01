import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  usePremiumPotential,
  PREMIUM_POTENTIAL_QUERY_KEY,
} from '@/hooks/queries/usePremiumPotential';

jest.mock('@/services/api', () => ({
  ApiService: {
    getPremiumPotentialData: jest.fn(),
  },
}));

import { ApiService } from '@/services/api';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
};

describe('usePremiumPotential', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('generates the expected query key', () => {
    expect(PREMIUM_POTENTIAL_QUERY_KEY('health')).toEqual([
      'premiumPotential',
      'health',
      'latest',
    ]);
    expect(PREMIUM_POTENTIAL_QUERY_KEY('body', 'scan-123')).toEqual([
      'premiumPotential',
      'body',
      'scan-123',
    ]);
  });

  it('fetches premium potential data successfully', async () => {
    const mockData = {
      scanType: 'health' as const,
      currentScan: null,
      historicalAverage30d: 81,
      scanCountTotal: 4,
      recentScoreHistory: [],
    };

    (ApiService.getPremiumPotentialData as jest.Mock).mockResolvedValue(mockData);

    const { result } = renderHook(() => usePremiumPotential('health'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockData);
    expect(ApiService.getPremiumPotentialData).toHaveBeenCalledWith('health', null);
  });

  it('passes the explicit scan id through to the service', async () => {
    (ApiService.getPremiumPotentialData as jest.Mock).mockResolvedValue({
      scanType: 'body',
      currentScan: null,
      historicalAverage30d: null,
      scanCountTotal: 1,
      recentScoreHistory: [],
    });

    const { result } = renderHook(() => usePremiumPotential('body', 'scan-987'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
      expect(ApiService.getPremiumPotentialData).toHaveBeenCalledWith('body', 'scan-987');
    });
  });

  it('surfaces service errors', async () => {
    (ApiService.getPremiumPotentialData as jest.Mock).mockRejectedValue(new Error('RPC failed'));

    const { result } = renderHook(() => usePremiumPotential('nutrition'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe('RPC failed');
  });
});
