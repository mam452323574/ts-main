import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { DEFAULT_APP_CONFIG } from '@/services/appConfig';
import { FEATURE_FLAGS_QUERY_KEY, useFeatureFlags } from '@/hooks/queries/useFeatureFlags';
import type { AppConfig } from '@/services/appConfig';

const mockFetchAppConfig = jest.fn();

jest.mock('@/services/appConfig', () => {
  const actual = jest.requireActual('@/services/appConfig');
  return {
    ...actual,
    fetchAppConfig: () => mockFetchAppConfig(),
  };
});

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

describe('useFeatureFlags', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses the expected query key', () => {
    expect(FEATURE_FLAGS_QUERY_KEY).toEqual(['appConfig', 'featureFlags']);
  });

  it('exposes default local flags immediately, then updates with fetched config', async () => {
    let resolveFetch: (value: AppConfig) => void = () => {};
    const pendingFetch = new Promise<AppConfig>((resolve) => {
      resolveFetch = resolve;
    });

    mockFetchAppConfig.mockReturnValueOnce(pendingFetch);

    const { result } = renderHook(() => useFeatureFlags(), {
      wrapper: createWrapper(),
    });

    expect(result.current.data).toEqual(DEFAULT_APP_CONFIG);

    resolveFetch({
      ...DEFAULT_APP_CONFIG,
      social_enabled: true,
      social_comments_enabled: true,
    });

    await waitFor(() => {
      expect(result.current.data).toEqual({
        ...DEFAULT_APP_CONFIG,
        social_enabled: true,
        social_comments_enabled: true,
      });
    });
  });
});
