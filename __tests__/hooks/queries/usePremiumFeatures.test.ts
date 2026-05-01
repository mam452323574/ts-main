import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { usePremiumFeatures, PREMIUM_FEATURES_QUERY_KEY } from '@/hooks/queries/usePremiumFeatures';

// Mock supabase
const mockOrder = jest.fn();
const mockEq = jest.fn(() => ({ order: mockOrder }));
const mockSelect = jest.fn(() => ({ eq: mockEq }));

jest.mock('@/services/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: mockSelect,
    })),
  },
}));

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

describe('usePremiumFeatures', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('has correct query key', () => {
    expect(PREMIUM_FEATURES_QUERY_KEY).toEqual(['premiumFeatures']);
  });

  it('fetches premium features successfully', async () => {
    const mockFeatures = [
      {
        id: '1',
        feature_name: 'Unlimited Scans',
        category: 'Scans',
        enabled: true,
      },
      {
        id: '2',
        feature_name: 'Priority Support',
        category: 'Support',
        enabled: true,
      },
    ];

    mockOrder.mockResolvedValue({ data: mockFeatures, error: null });

    const { result } = renderHook(() => usePremiumFeatures(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockFeatures);
  });

  it('handles error state', async () => {
    mockOrder.mockResolvedValue({
      data: null,
      error: new Error('Failed to fetch features'),
    });

    const { result } = renderHook(() => usePremiumFeatures(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });

  it('returns empty array when no features', async () => {
    mockOrder.mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(() => usePremiumFeatures(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual([]);
  });
});
