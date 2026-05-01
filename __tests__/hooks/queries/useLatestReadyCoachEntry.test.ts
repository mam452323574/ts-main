import React from 'react';
import { cleanup, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useLatestReadyCoachEntry } from '@/hooks/queries/useLatestReadyCoachEntry';

const mockFetchLatestReadyCoachEntry = jest.fn();

jest.mock('@/services/coach', () => ({
  fetchLatestReadyCoachEntry: (...args: unknown[]) =>
    mockFetchLatestReadyCoachEntry(...args),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1' },
  }),
}));

function createWrapper() {
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
}

describe('useLatestReadyCoachEntry', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches the latest ready entry scoped by persona and locale', async () => {
    mockFetchLatestReadyCoachEntry.mockResolvedValueOnce({
      id: 'entry-latest',
      title: 'Latest guidance',
      body: 'Keep going.',
      disclaimer: 'Wellness guidance only. This is not a diagnosis or medical advice.',
      persona_key: 'gentle_supportive',
      cta_label: null,
      cta_route: null,
      created_at: '2026-04-06T08:00:00.000Z',
      generated_at: '2026-04-06T08:00:00.000Z',
      source: 'n8n',
      status: 'ready',
    });

    const { result } = renderHook(
      () =>
        useLatestReadyCoachEntry({
          personaKey: 'gentle_supportive',
          locale: 'fr',
        }),
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetchLatestReadyCoachEntry).toHaveBeenCalledWith(
      {
        personaKey: 'gentle_supportive',
        promptType: null,
        locale: 'fr',
      },
    );
    expect(result.current.data).toEqual(
      expect.objectContaining({
        id: 'entry-latest',
        title: 'Latest guidance',
      }),
    );
  });

  it('can fetch the latest ready entry without a persona filter', async () => {
    mockFetchLatestReadyCoachEntry.mockResolvedValueOnce({
      id: 'entry-global',
      title: 'Latest saved guidance',
      body: 'Keep going.',
      disclaimer: 'Wellness guidance only. This is not a diagnosis or medical advice.',
      persona_key: 'strict_tough',
      has_valid_persona: true,
      cta_label: null,
      cta_route: null,
      created_at: '2026-04-06T08:00:00.000Z',
      generated_at: '2026-04-06T08:00:00.000Z',
      source: 'n8n',
      status: 'ready',
    });

    const { result } = renderHook(
      () =>
        useLatestReadyCoachEntry({
          locale: 'fr',
        }),
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetchLatestReadyCoachEntry).toHaveBeenCalledWith({
      personaKey: null,
      promptType: null,
      locale: 'fr',
    });
    expect(result.current.data).toEqual(
      expect.objectContaining({
        id: 'entry-global',
        persona_key: 'strict_tough',
      }),
    );
  });
});
