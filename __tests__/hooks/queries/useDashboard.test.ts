import { act, cleanup, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useDashboard, DASHBOARD_QUERY_KEY } from '@/hooks/queries/useDashboard';
import { ApiService } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';

jest.mock('@/services/api', () => ({
  ApiService: {
    getDashboard: jest.fn(),
  },
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}));

const mockUseAuth = useAuth as jest.Mock;
const testQueryClients = new Set<QueryClient>();

const setAuthUser = (userId: string | null) => {
  mockUseAuth.mockReturnValue({
    user: userId ? { id: userId } : null,
  });
};

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

describe('useDashboard', () => {
  afterEach(() => {
    cleanup();
    testQueryClients.forEach((queryClient) => queryClient.clear());
    testQueryClients.clear();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    setAuthUser('user-123');
  });

  it('has correct query key', () => {
    expect(DASHBOARD_QUERY_KEY).toEqual(['dashboard']);
  });

  it('fetches dashboard data successfully', async () => {
    const mockData = {
      user: { name: 'Test User' },
      stats: { totalScans: 10 },
      recentScans: [],
    };
    (ApiService.getDashboard as jest.Mock).mockResolvedValue(mockData);

    const { result, unmount } = renderHook(() => useDashboard(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockData);
    expect(ApiService.getDashboard).toHaveBeenCalled();
    unmount();
  });

  it('handles loading state', async () => {
    let resolveDashboard!: (value: unknown) => void;
    (ApiService.getDashboard as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDashboard = resolve;
        }),
    );

    const { result, unmount } = renderHook(() => useDashboard(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolveDashboard({});
    });
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    unmount();
  });

  it('handles error state', async () => {
    (ApiService.getDashboard as jest.Mock).mockRejectedValue(
      new Error('Dashboard fetch failed')
    );

    const { result, unmount } = renderHook(() => useDashboard(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe('Dashboard fetch failed');
    unmount();
  });

  it('is disabled when there is no authenticated user', () => {
    setAuthUser(null);
    (ApiService.getDashboard as jest.Mock).mockResolvedValue({});

    const { result, unmount } = renderHook(() => useDashboard(), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(ApiService.getDashboard).not.toHaveBeenCalled();
    unmount();
  });
});
