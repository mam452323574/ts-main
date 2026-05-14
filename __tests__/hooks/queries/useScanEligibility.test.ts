import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  SCAN_ELIGIBILITY_QUERY_KEY,
  useAllScanEligibility,
  useScanEligibility,
} from '@/hooks/queries/useScanEligibility';
import { ApiError, ApiService } from '@/services/api';

jest.mock('@/services/api', () => {
  const actual = jest.requireActual('@/services/api');
  return {
    ...actual,
    ApiService: {
      checkScanEligibilityOnly: jest.fn(),
      checkScanEligibilityBatch: jest.fn(),
    },
  };
});

const mockUseAuth = jest.fn();
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Infinity,
      },
    },
  });

  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
};

describe('useScanEligibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      session: { access_token: 'test-token', user: { id: 'test-user' } },
      loading: false,
    });
  });

  it('generates correct query key', () => {
    expect(SCAN_ELIGIBILITY_QUERY_KEY('test-user', 'body')).toEqual([
      'scanEligibility',
      'test-user',
      'body',
    ]);
    expect(SCAN_ELIGIBILITY_QUERY_KEY('test-user', 'health')).toEqual([
      'scanEligibility',
      'test-user',
      'health',
    ]);
    expect(SCAN_ELIGIBILITY_QUERY_KEY('test-user', 'nutrition')).toEqual([
      'scanEligibility',
      'test-user',
      'nutrition',
    ]);
    expect(SCAN_ELIGIBILITY_QUERY_KEY('test-user', 'super')).toEqual([
      'scanEligibility',
      'test-user',
      'super',
    ]);
  });

  it('fetches scan eligibility successfully', async () => {
    const mockData = {
      success: true,
      allowed: true,
      remaining: 3,
      limit: 3,
      message: 'Scan allowed',
    };
    (ApiService.checkScanEligibilityOnly as jest.Mock).mockResolvedValue(mockData);

    const { result } = renderHook(() => useScanEligibility('body'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockData);
    expect(ApiService.checkScanEligibilityOnly).toHaveBeenCalledWith('body');
  });

  it('does not fetch while auth hydration is still loading', () => {
    mockUseAuth.mockReturnValue({
      session: null,
      loading: true,
    });

    const { result } = renderHook(() => useScanEligibility('health'), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(ApiService.checkScanEligibilityOnly).not.toHaveBeenCalled();
  });
});

describe('useAllScanEligibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      session: { access_token: 'test-token', user: { id: 'test-user' } },
      loading: false,
    });
  });

  it('fetches eligibility for all scan types', async () => {
    const mockData = {
      success: true,
      allowed: true,
      remaining: 3,
      limit: 3,
      message: 'Scan allowed',
    };
    (ApiService.checkScanEligibilityBatch as jest.Mock).mockResolvedValue({
      data: {
        body: mockData,
        health: mockData,
        nutrition: mockData,
        super: mockData,
      },
      errors: {},
    });

    const { result } = renderHook(() => useAllScanEligibility(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(ApiService.checkScanEligibilityBatch).toHaveBeenCalledWith([
      'body',
      'health',
      'nutrition',
      'super',
    ]);
    expect(ApiService.checkScanEligibilityOnly).not.toHaveBeenCalled();
    expect(result.current.data.health).toEqual(mockData);
    expect(result.current.hasConnectivityError).toBe(false);
    expect(result.current.hasBlockingEligibilityError).toBe(false);
  });

  it('keeps derived result references stable across no-op rerenders', async () => {
    const mockData = {
      success: true,
      allowed: true,
      remaining: 3,
      limit: 3,
      message: 'Scan allowed',
    };
    (ApiService.checkScanEligibilityBatch as jest.Mock).mockResolvedValue({
      data: {
        body: mockData,
        health: mockData,
        nutrition: mockData,
        super: mockData,
      },
      errors: {},
    });

    const { result, rerender } = renderHook(() => useAllScanEligibility(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const stableData = result.current.data;
    const stableErrors = result.current.errors;
    const stableLoadingByScanType = result.current.loadingByScanType;
    const stableRefetchAll = result.current.refetchAll;
    const stableRefetchScanType = result.current.refetchScanType;

    rerender(undefined);

    expect(result.current.data).toBe(stableData);
    expect(result.current.errors).toBe(stableErrors);
    expect(result.current.loadingByScanType).toBe(stableLoadingByScanType);
    expect(result.current.refetchAll).toBe(stableRefetchAll);
    expect(result.current.refetchScanType).toBe(stableRefetchScanType);
  });

  it('keeps successful scan types populated when one query fails', async () => {
    (ApiService.checkScanEligibilityBatch as jest.Mock).mockResolvedValue({
      data: {
        body: {
          success: true,
          allowed: true,
          remaining: 1,
          limit: 1,
          message: 'body allowed',
        },
        health: {
          success: true,
          allowed: true,
          remaining: 1,
          limit: 1,
          message: 'health allowed',
        },
        super: {
          success: true,
          allowed: true,
          remaining: 1,
          limit: 1,
          message: 'super allowed',
        },
      },
      errors: {
        nutrition: new ApiError('schema mismatch', 'DATABASE'),
      },
    });

    const { result } = renderHook(() => useAllScanEligibility(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data.health).toEqual(
      expect.objectContaining({ message: 'health allowed' }),
    );
    expect(result.current.data.body).toEqual(
      expect.objectContaining({ message: 'body allowed' }),
    );
    expect(result.current.data.super).toEqual(
      expect.objectContaining({ message: 'super allowed' }),
    );
    expect(result.current.data.nutrition).toBeUndefined();
    expect(result.current.errors.nutrition).toMatchObject({
      type: 'DATABASE',
      message: 'schema mismatch',
    });
    expect(result.current.hasConnectivityError).toBe(false);
    expect(result.current.hasBlockingEligibilityError).toBe(true);
  });

  it('does not produce a connectivity flag when auth is not ready or no session exists', async () => {
    mockUseAuth.mockReturnValue({
      session: null,
      loading: true,
    });

    const { result, rerender } = renderHook(() => useAllScanEligibility(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isAuthReady).toBe(false);
    expect(result.current.hasConnectivityError).toBe(false);
    expect(ApiService.checkScanEligibilityBatch).not.toHaveBeenCalled();
    expect(ApiService.checkScanEligibilityOnly).not.toHaveBeenCalled();

    mockUseAuth.mockReturnValue({
      session: null,
      loading: false,
    });
    rerender(undefined);

    await waitFor(() => {
      expect(result.current.isAuthReady).toBe(true);
      expect(result.current.canQuery).toBe(false);
    });

    expect(result.current.hasConnectivityError).toBe(false);
    expect(result.current.hasBlockingEligibilityError).toBe(false);
    expect(ApiService.checkScanEligibilityBatch).not.toHaveBeenCalled();
    expect(ApiService.checkScanEligibilityOnly).not.toHaveBeenCalled();
  });

  it('flags only real network-classified errors as connectivity issues', async () => {
    (ApiService.checkScanEligibilityBatch as jest.Mock).mockResolvedValue({
      data: {
        body: {
          success: true,
          allowed: true,
          remaining: 1,
          limit: 1,
          message: 'body allowed',
        },
        nutrition: {
          success: true,
          allowed: true,
          remaining: 1,
          limit: 1,
          message: 'nutrition allowed',
        },
        super: {
          success: true,
          allowed: true,
          remaining: 1,
          limit: 1,
          message: 'super allowed',
        },
      },
      errors: {
        health: new ApiError('Network request failed', 'NETWORK'),
      },
    });

    const { result } = renderHook(() => useAllScanEligibility(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.errors.health).toMatchObject({
      type: 'NETWORK',
    });
    expect(result.current.hasConnectivityError).toBe(true);
    expect(result.current.hasBlockingEligibilityError).toBe(false);
  });
});
