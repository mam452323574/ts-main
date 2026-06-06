import React from 'react';
import { cleanup, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useInfiniteCoachUnifiedHistory } from '@/hooks/queries/useInfiniteCoachUnifiedHistory';

const mockFetchCoachUnifiedHistoryPage = jest.fn();

jest.mock('@/services/coachHistorySoftDelete', () => ({
  fetchCoachUnifiedHistoryPage: (...args: unknown[]) =>
    mockFetchCoachUnifiedHistoryPage(...args),
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

  Wrapper.displayName = 'CoachUnifiedHistoryQueryClientWrapper';

  return Wrapper;
}

function entry(id: string, sortAt: string) {
  return {
    kind: 'entry' as const,
    id,
    user_id: 'user-1',
    sort_at: sortAt,
    title: `Entry ${id}`,
    body: `Body ${id}`,
    persona_key: 'gentle_supportive' as const,
    locale: null,
    status: 'ready',
    created_at: sortAt,
    updated_at: sortAt,
    generated_at: sortAt,
    source: 'n8n',
    prompt_type: null,
    question_key: null,
    question_text: null,
    response_version: null,
    content_json: null,
    cta_label: null,
    cta_route: null,
    expires_at: null,
    disclaimer: null,
    deleted_at: null,
  };
}

function conversation(id: string, sortAt: string) {
  return {
    kind: 'conversation' as const,
    id,
    user_id: 'user-1',
    sort_at: sortAt,
    title: `Chat ${id}`,
    persona_key: 'gentle_supportive' as const,
    locale: null,
    status: 'active',
    created_at: sortAt,
    updated_at: sortAt,
    message_count: 0,
    user_message_count: 0,
    account_tier_at_start: 'premium' as const,
    last_user_message_at: sortAt,
    last_assistant_message_at: sortAt,
    ended_at: null,
    ended_reason: null,
    archived_at: null,
    hidden_at: null,
    metadata: {},
    conversation_status: 'active' as const,
  };
}

describe('useInfiniteCoachUnifiedHistory', () => {
  afterEach(() => {
    cleanup();
    jest.clearAllMocks();
  });

  it('fetches the first page on mount and exposes mixed-kind items in order', async () => {
    mockFetchCoachUnifiedHistoryPage.mockResolvedValueOnce({
      items: [
        conversation('c-1', '2026-04-10T08:00:00Z'),
        entry('e-1', '2026-04-09T08:00:00Z'),
      ],
      has_more: false,
      next_cursor: null,
    });

    const { result } = renderHook(() => useInfiniteCoachUnifiedHistory(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetchCoachUnifiedHistoryPage).toHaveBeenCalledWith({
      limit: 20,
      cursor: null,
      includeHidden: false,
    });
    expect(result.current.items.map((item) => `${item.kind}:${item.id}`)).toEqual([
      'conversation:c-1',
      'entry:e-1',
    ]);
    expect(result.current.hasNextPage).toBe(false);
  });

  it('appends the next page and dedupes on the (kind, id) composite key', async () => {
    mockFetchCoachUnifiedHistoryPage
      .mockResolvedValueOnce({
        items: [
          entry('e-1', '2026-04-10T08:00:00Z'),
          conversation('c-1', '2026-04-09T08:00:00Z'),
        ],
        has_more: true,
        next_cursor: { sort_at: '2026-04-09T08:00:00Z', kind: 'conversation', id: 'c-1' },
      })
      .mockResolvedValueOnce({
        items: [
          // overlap on (conversation, c-1) — must be deduped.
          conversation('c-1', '2026-04-09T08:00:00Z'),
          entry('e-2', '2026-04-08T08:00:00Z'),
        ],
        has_more: false,
        next_cursor: null,
      });

    const { result } = renderHook(() => useInfiniteCoachUnifiedHistory({ pageSize: 2 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
      expect(result.current.hasNextPage).toBe(true);
    });

    await result.current.fetchNextPage();

    await waitFor(() => {
      expect(result.current.hasNextPage).toBe(false);
      expect(result.current.items.map((item) => `${item.kind}:${item.id}`)).toEqual([
        'entry:e-1',
        'conversation:c-1',
        'entry:e-2',
      ]);
    });

    // Verify the second page received the next_cursor verbatim.
    expect(mockFetchCoachUnifiedHistoryPage).toHaveBeenNthCalledWith(2, {
      limit: 2,
      cursor: { sort_at: '2026-04-09T08:00:00Z', kind: 'conversation', id: 'c-1' },
      includeHidden: false,
    });
  });

  it('does NOT distinguish an entry from a conversation that happen to share an id', async () => {
    // Regression guard: previous prototype keyed dedup on id alone, which
    // collapsed an entry and a conversation that happened to share their
    // primary key. The composite (kind, id) prevents that.
    mockFetchCoachUnifiedHistoryPage.mockResolvedValueOnce({
      items: [
        entry('shared', '2026-04-10T08:00:00Z'),
        conversation('shared', '2026-04-10T07:00:00Z'),
      ],
      has_more: false,
      next_cursor: null,
    });

    const { result } = renderHook(() => useInfiniteCoachUnifiedHistory(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.items.map((item) => `${item.kind}:${item.id}`)).toEqual([
      'entry:shared',
      'conversation:shared',
    ]);
  });

  it('passes includeHidden through to the service when the caller opts in (trash UI hook-up)', async () => {
    mockFetchCoachUnifiedHistoryPage.mockResolvedValueOnce({
      items: [],
      has_more: false,
      next_cursor: null,
    });

    renderHook(() => useInfiniteCoachUnifiedHistory({ includeHidden: true }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(mockFetchCoachUnifiedHistoryPage).toHaveBeenCalled();
    });
    expect(mockFetchCoachUnifiedHistoryPage).toHaveBeenCalledWith(
      expect.objectContaining({ includeHidden: true }),
    );
  });
});
