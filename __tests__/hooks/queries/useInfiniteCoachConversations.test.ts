import React from 'react';
import { cleanup, render, renderHook, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useInfiniteCoachConversations } from '@/hooks/queries/useInfiniteCoachConversations';

const mockFetchCoachConversationsPage = jest.fn();

jest.mock('@/services/coachConversation', () => ({
  fetchCoachConversationsPage: (...args: unknown[]) =>
    mockFetchCoachConversationsPage(...args),
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
        gcTime: Infinity,
        retry: false,
      },
    },
  });

  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  Wrapper.displayName = 'CoachConversationsQueryClientWrapper';

  return { Wrapper, queryClient };
}

function buildPage(ids: string[]) {
  return {
    items: ids.map((id) => ({
      id,
      user_id: 'user-1',
      created_at: '2026-05-26T09:00:00.000Z',
      updated_at: '2026-05-27T09:00:00.000Z',
      title: null,
      persona_key: 'gentle_supportive' as const,
      locale: 'fr',
      status: 'active' as const,
      message_count: 2,
      user_message_count: 1,
      account_tier_at_start: 'free' as const,
      last_user_message_at: '2026-05-27T08:00:00.000Z',
      last_assistant_message_at: '2026-05-27T09:00:00.000Z',
      ended_at: null,
      ended_reason: null,
      archived_at: null,
      metadata: {},
      first_user_message_preview: `First ${id}`,
      last_message_preview: `Last ${id}`,
      last_message_at: '2026-05-27T09:00:00.000Z',
    })),
    has_more: false,
    next_cursor: null,
  };
}

describe('useInfiniteCoachConversations', () => {
  afterEach(() => {
    cleanup();
    jest.clearAllMocks();
  });

  it('loads the global inbox with persona_key null when no filter is requested', async () => {
    mockFetchCoachConversationsPage.mockResolvedValueOnce(buildPage(['conv-global']));

    const { result } = renderHook(() => useInfiniteCoachConversations(), {
      wrapper: createWrapper().Wrapper,
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetchCoachConversationsPage).toHaveBeenCalledWith({
      limit: 20,
      cursor: null,
      include_archived: false,
      persona_key: null,
    });
    expect(result.current.items.map((item) => item.id)).toEqual(['conv-global']);
  });

  it('uses the direct global page as the single inbox source of truth', async () => {
    mockFetchCoachConversationsPage.mockResolvedValueOnce({
      items: [
        {
          ...buildPage(['conv-mira']).items[0],
          id: 'conv-mira',
          persona_key: 'patient_calm',
          updated_at: '2026-05-27T10:00:00.000Z',
          last_message_at: '2026-05-27T10:00:00.000Z',
        },
        {
          ...buildPage(['conv-noah']).items[0],
          id: 'conv-noah',
          persona_key: 'gentle_supportive',
        },
      ],
      has_more: false,
      next_cursor: null,
    });

    const { result } = renderHook(() => useInfiniteCoachConversations(), {
      wrapper: createWrapper().Wrapper,
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.items.map((item) => item.id)).toEqual([
      'conv-mira',
      'conv-noah',
    ]);
    expect(mockFetchCoachConversationsPage).toHaveBeenCalledTimes(1);
    expect(mockFetchCoachConversationsPage).toHaveBeenCalledWith({
      limit: 20,
      cursor: null,
      include_archived: false,
      persona_key: null,
    });
  });

  it('refetches the inbox on remount even while the cached global page is still fresh', async () => {
    const queryClient = createWrapper().queryClient;
    const originalConsoleError = console.error;
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation((...args: Parameters<typeof console.error>) => {
        const [firstArg] = args;
        if (
          typeof firstArg === 'string' &&
          firstArg.includes('overlapping act() calls')
        ) {
          return;
        }
        originalConsoleError(...args);
      });

    try {
      mockFetchCoachConversationsPage
        .mockResolvedValueOnce(buildPage(['conv-empty-cache']))
        .mockResolvedValueOnce(buildPage(['conv-after-remount']));

      function Probe() {
        const query = useInfiniteCoachConversations();
        return React.createElement(
          React.Fragment,
          null,
          React.createElement(Text, { testID: 'items' }, query.items.map((item) => item.id).join(',')),
          React.createElement(Text, { testID: 'status' }, query.isSuccess ? 'success' : 'pending'),
        );
      }

      const firstMount = render(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(Probe),
        ),
      );

      await waitFor(() => {
        expect(firstMount.getByTestId('status').props.children).toBe('success');
      });
      expect(mockFetchCoachConversationsPage).toHaveBeenCalledTimes(1);

      firstMount.unmount();

      const secondMount = render(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(Probe),
        ),
      );

      await waitFor(() => {
        expect(mockFetchCoachConversationsPage).toHaveBeenCalledTimes(2);
      });
      await waitFor(() => {
        expect(secondMount.getByTestId('items').props.children).toBe('conv-after-remount');
      });
      secondMount.unmount();
      queryClient.clear();
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});
