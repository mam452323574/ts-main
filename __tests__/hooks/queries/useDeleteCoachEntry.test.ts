// Hotfix lock for F-01 residual (audit express 2026-05-27).
//
// Both `useDeleteCoachEntry` and `useRestoreCoachEntry` live in the same source
// file (`hooks/queries/useDeleteCoachEntry.ts`). The Coach idle screen consumes
// the `coach-screen-snapshot` Edge Function via `useCoachScreenSnapshot`, so
// any soft-delete / restore mutation that does not invalidate
// `COACH_SCREEN_SNAPSHOT_QUERY_KEY` leaves the "latest advice" UI stale until
// the next cold start. These tests lock the contract that both hooks
// invalidate the three relevant caches:
//   - COACH_UNIFIED_HISTORY_INFINITE_QUERY_KEY (the unified history feed)
//   - COACH_HISTORY_INFINITE_QUERY_KEY (the legacy requests-only feed)
//   - COACH_SCREEN_SNAPSHOT_QUERY_KEY (the Coach idle snapshot)
//
// They also lock the optimistic-update rollback contract on
// `useDeleteCoachEntry`.

import React from 'react';
import { cleanup, renderHook, waitFor } from '@testing-library/react-native';
import {
  type InfiniteData,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';

import { CoachServiceError } from '@/services/coach';
import {
  useDeleteCoachEntry,
  useRestoreCoachEntry,
} from '@/hooks/queries/useDeleteCoachEntry';
import { COACH_SCREEN_SNAPSHOT_QUERY_KEY } from '@/hooks/queries/useCoachScreenSnapshot';
import { COACH_HISTORY_INFINITE_QUERY_KEY } from '@/hooks/queries/useInfiniteCoachHistory';
import { COACH_UNIFIED_HISTORY_INFINITE_QUERY_KEY } from '@/hooks/queries/useInfiniteCoachUnifiedHistory';
import type { CoachUnifiedHistoryPage } from '@/shared/coachHistory';

const mockDeleteCoachEntry = jest.fn();
const mockRestoreCoachEntry = jest.fn();

jest.mock('@/services/coachHistorySoftDelete', () => ({
  deleteCoachEntry: (...args: unknown[]) => mockDeleteCoachEntry(...args),
  restoreCoachEntry: (...args: unknown[]) => mockRestoreCoachEntry(...args),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

interface TestHarness {
  Wrapper: React.ComponentType<{ children: React.ReactNode }>;
  queryClient: QueryClient;
  invalidateSpy: jest.SpyInstance;
}

function createHarness(): TestHarness {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { gcTime: Infinity, retry: false, staleTime: Infinity },
      mutations: { gcTime: Infinity, retry: false },
    },
  });
  const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  Wrapper.displayName = 'CoachDeleteEntryQueryClientWrapper';

  return { Wrapper, queryClient, invalidateSpy };
}

function entryInUnifiedPage(
  id: string,
): InfiniteData<CoachUnifiedHistoryPage> {
  return {
    pages: [
      {
        items: [
          {
            kind: 'entry',
            id,
            sort_at: '2026-05-27T08:00:00Z',
            // The hook only cares about kind + id when filtering; everything
            // else can be permissive so the test stays focused on the cache
            // semantics, not on the entry shape.
          } as CoachUnifiedHistoryPage['items'][number],
        ],
        has_more: false,
        next_cursor: null,
      },
    ],
    pageParams: [null],
  };
}

function invalidateCallsToKeys(spy: jest.SpyInstance): unknown[][] {
  return spy.mock.calls
    .map((call) => {
      const arg = call[0] as { queryKey?: unknown } | undefined;
      return arg?.queryKey;
    })
    .filter((key): key is unknown[] => Array.isArray(key));
}

describe('useDeleteCoachEntry', () => {
  afterEach(() => {
    cleanup();
    jest.clearAllMocks();
  });

  it('invalidates the unified history, legacy history, and Coach snapshot caches on success (F-01)', async () => {
    mockDeleteCoachEntry.mockResolvedValueOnce(undefined);
    const { Wrapper, invalidateSpy } = createHarness();

    const { result } = renderHook(() => useDeleteCoachEntry(), {
      wrapper: Wrapper,
    });

    result.current.mutate({ entryId: 'entry-1' });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const invalidatedKeys = invalidateCallsToKeys(invalidateSpy);
    expect(invalidatedKeys).toEqual(
      expect.arrayContaining([
        COACH_UNIFIED_HISTORY_INFINITE_QUERY_KEY,
        COACH_HISTORY_INFINITE_QUERY_KEY,
        COACH_SCREEN_SNAPSHOT_QUERY_KEY,
      ]),
    );
  });

  it('also invalidates the Coach snapshot when the mutation fails (so onSettled fires)', async () => {
    mockDeleteCoachEntry.mockRejectedValueOnce(
      new CoachServiceError('boom', { code: 'coach_delete_failed', status: 500 }),
    );
    const { Wrapper, invalidateSpy } = createHarness();

    const { result } = renderHook(() => useDeleteCoachEntry(), {
      wrapper: Wrapper,
    });

    result.current.mutate({ entryId: 'entry-1' });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    const invalidatedKeys = invalidateCallsToKeys(invalidateSpy);
    expect(invalidatedKeys).toEqual(
      expect.arrayContaining([COACH_SCREEN_SNAPSHOT_QUERY_KEY]),
    );
  });

  it('optimistically removes the entry from the unified history and rolls back on error', async () => {
    mockDeleteCoachEntry.mockRejectedValueOnce(
      new CoachServiceError('boom', { code: 'coach_delete_failed', status: 500 }),
    );
    const { Wrapper, queryClient } = createHarness();

    queryClient.setQueryData<InfiniteData<CoachUnifiedHistoryPage>>(
      [...COACH_UNIFIED_HISTORY_INFINITE_QUERY_KEY, 'user-1', false],
      entryInUnifiedPage('entry-1'),
    );

    const { result } = renderHook(() => useDeleteCoachEntry(), {
      wrapper: Wrapper,
    });

    result.current.mutate({ entryId: 'entry-1' });

    // Wait until the mutation actually fails and the rollback runs.
    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    const snapshot = queryClient.getQueryData<
      InfiniteData<CoachUnifiedHistoryPage>
    >([...COACH_UNIFIED_HISTORY_INFINITE_QUERY_KEY, 'user-1', false]);
    expect(snapshot?.pages[0]?.items.map((item) => item.id)).toEqual([
      'entry-1',
    ]);
  });
});

describe('useRestoreCoachEntry', () => {
  afterEach(() => {
    cleanup();
    jest.clearAllMocks();
  });

  it('invalidates the unified history, legacy history, and Coach snapshot caches on success (F-01)', async () => {
    mockRestoreCoachEntry.mockResolvedValueOnce(undefined);
    const { Wrapper, invalidateSpy } = createHarness();

    const { result } = renderHook(() => useRestoreCoachEntry(), {
      wrapper: Wrapper,
    });

    result.current.mutate({ entryId: 'entry-1' });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const invalidatedKeys = invalidateCallsToKeys(invalidateSpy);
    expect(invalidatedKeys).toEqual(
      expect.arrayContaining([
        COACH_UNIFIED_HISTORY_INFINITE_QUERY_KEY,
        COACH_HISTORY_INFINITE_QUERY_KEY,
        COACH_SCREEN_SNAPSHOT_QUERY_KEY,
      ]),
    );
  });

  it('also invalidates the Coach snapshot when the restore fails (so onSettled fires)', async () => {
    mockRestoreCoachEntry.mockRejectedValueOnce(
      new CoachServiceError('boom', {
        code: 'coach_restore_failed',
        status: 500,
      }),
    );
    const { Wrapper, invalidateSpy } = createHarness();

    const { result } = renderHook(() => useRestoreCoachEntry(), {
      wrapper: Wrapper,
    });

    result.current.mutate({ entryId: 'entry-1' });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    const invalidatedKeys = invalidateCallsToKeys(invalidateSpy);
    expect(invalidatedKeys).toEqual(
      expect.arrayContaining([COACH_SCREEN_SNAPSHOT_QUERY_KEY]),
    );
  });
});
