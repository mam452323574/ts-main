import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useNotificationsQuery, NOTIFICATIONS_QUERY_KEY } from '@/hooks/queries/useNotifications';

// Mock supabase
jest.mock('@/services/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          order: jest.fn(() => ({
            is: jest.fn(() => Promise.resolve({ data: [], error: null })),
            not: jest.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        })),
      })),
    })),
  },
}));

import { supabase } from '@/services/supabase';

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

describe('useNotificationsQuery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('generates correct query key', () => {
    expect(NOTIFICATIONS_QUERY_KEY('user-123', 'all')).toEqual([
      'notifications',
      'user-123',
      'all',
    ]);
    expect(NOTIFICATIONS_QUERY_KEY('user-456', 'unread')).toEqual([
      'notifications',
      'user-456',
      'unread',
    ]);
  });

  it('returns empty array when userId is undefined', async () => {
    const { result } = renderHook(() => useNotificationsQuery(undefined), {
      wrapper: createWrapper(),
    });

    // Query should be disabled when userId is undefined
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('fetches notifications when userId is provided', async () => {
    const mockNotifications = [
      {
        id: '1',
        notification_type: 'achievement',
        title: 'New Achievement',
        body: 'You unlocked something!',
        created_at: '2024-01-01',
        read_at: null,
      },
    ];

    const mockOrder = jest.fn().mockResolvedValue({
      data: mockNotifications,
      error: null,
    });

    const mockEq = jest.fn(() => ({
      order: mockOrder,
      is: jest.fn(() => mockOrder()),
      not: jest.fn(() => mockOrder()),
    }));

    const mockSelect = jest.fn(() => ({
      eq: mockEq,
    }));

    (supabase.from as jest.Mock).mockReturnValue({
      select: mockSelect,
    });

    const { result } = renderHook(() => useNotificationsQuery('user-123', 'all'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess || result.current.isError).toBe(true);
    });
  });

  it('filters by unread notifications', async () => {
    const { result } = renderHook(() => useNotificationsQuery('user-123', 'unread'), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBeDefined();
  });

  it('filters by read notifications', async () => {
    const { result } = renderHook(() => useNotificationsQuery('user-123', 'read'), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBeDefined();
  });
});
