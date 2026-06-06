// P0 test for F-01 (audit final 2026-05-27).
//
// `fetchCoachEntries` and `fetchLatestReadyCoachEntry` must filter out
// soft-deleted rows (`deleted_at IS NOT NULL`). Otherwise an entry that the
// user just deleted from their history could resurface as the "latest advice"
// on the idle Coach screen — a silent UX regression.
//
// This file is a focused, defense-in-depth complement to the broader
// `__tests__/services/coach.test.ts`: it locks the contract that the soft-delete
// filter is wired into the actual Supabase query chain, and that the parsed
// outcomes are coherent for both an active row and an absent row (the filter is
// server-side; here we simulate both shapes of response).

import {
  fetchCoachEntries,
  fetchLatestReadyCoachEntry,
} from '@/services/coach';

jest.mock('@/utils/observability', () => ({
  logOperationalError: jest.fn(),
  logExpectedFailure: jest.fn(),
  logOperationalInfo: jest.fn(),
}));

const { supabase } = jest.requireMock('@/services/supabase') as {
  supabase: {
    from: jest.Mock;
    rpc: jest.Mock;
    auth: {
      getSession: jest.Mock;
    };
  };
};

function createCoachEntriesQueryMock(
  data: unknown,
  options: { error?: unknown; onIs?: jest.Mock } = {},
) {
  const { error = null, onIs = jest.fn() } = options;
  const queryResult = { data, error };
  const queryChain: any = {
    data,
    error,
    limit: jest.fn().mockResolvedValue(queryResult),
  };
  queryChain.order = jest.fn(() => queryChain);
  queryChain.is = jest.fn((field: string, value: unknown) => {
    onIs(field, value);
    return queryChain;
  });
  // The unawaited chain itself resolves to the result (the production code
  // sometimes awaits the builder directly instead of calling .limit()).
  queryChain.then = (resolve: (value: typeof queryResult) => unknown) =>
    Promise.resolve(queryResult).then(resolve);
  return {
    select: jest.fn(() => queryChain),
  };
}

function createLatestEntryQueryMock(
  data: unknown,
  options: {
    error?: unknown;
    onEq?: jest.Mock;
    onIs?: jest.Mock;
  } = {},
) {
  const { error = null, onEq = jest.fn(), onIs = jest.fn() } = options;
  const maybeSingle = jest.fn().mockResolvedValue({ data, error });
  const filterChain: any = {
    eq: jest.fn((field: string, value: unknown) => {
      onEq(field, value);
      return filterChain;
    }),
    is: jest.fn((field: string, value: unknown) => {
      onIs(field, value);
      return filterChain;
    }),
    not: jest.fn(() => filterChain),
    neq: jest.fn(() => filterChain),
    order: jest.fn(() => ({
      order: jest.fn(() => ({
        limit: jest.fn(() => ({ maybeSingle })),
      })),
    })),
  };
  return {
    select: jest.fn(() => filterChain),
  };
}

function buildActiveCoachEntryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry-active',
    title: 'Latest active advice',
    body: 'You are doing great — keep hydrating.',
    disclaimer:
      'Wellness guidance only. This is not a diagnosis or medical advice.',
    persona_key: 'gentle_supportive',
    cta_label: null,
    cta_route: null,
    created_at: '2026-05-27T09:00:00.000Z',
    generated_at: '2026-05-27T09:00:00.000Z',
    updated_at: '2026-05-27T09:00:00.000Z',
    source: 'n8n',
    status: 'ready',
    response_payload_json: {},
    deleted_at: null,
    ...overrides,
  };
}

describe('Coach service filters out soft-deleted rows (F-01)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { access_token: 'token-test' } },
    });
  });

  describe('fetchCoachEntries', () => {
    it("wires `.is('deleted_at', null)` into the Supabase query chain", async () => {
      const isCalls = jest.fn();
      supabase.from.mockImplementation((table: string) => {
        if (table !== 'coach_entries') {
          throw new Error(`Unexpected table ${table}`);
        }
        return createCoachEntriesQueryMock([], { onIs: isCalls });
      });

      await fetchCoachEntries();

      expect(isCalls).toHaveBeenCalledWith('deleted_at', null);
      expect(isCalls).toHaveBeenCalledTimes(1);
    });

    it('returns an active row when the server response includes it (deleted_at = null)', async () => {
      supabase.from.mockReturnValue(
        createCoachEntriesQueryMock([buildActiveCoachEntryRow()]),
      );

      await expect(fetchCoachEntries()).resolves.toEqual([
        expect.objectContaining({
          id: 'entry-active',
          status: 'ready',
        }),
      ]);
    });

    it('returns an empty array when the server filters out all soft-deleted rows', async () => {
      // The .is('deleted_at', null) clause is server-side, so we simulate the
      // filtered outcome: PostgREST returns [] when every candidate had
      // deleted_at IS NOT NULL.
      supabase.from.mockReturnValue(createCoachEntriesQueryMock([]));

      await expect(fetchCoachEntries()).resolves.toEqual([]);
    });
  });

  describe('fetchLatestReadyCoachEntry', () => {
    it("wires `.is('deleted_at', null)` into the Supabase query chain", async () => {
      const isCalls = jest.fn();
      supabase.from.mockImplementation((table: string) => {
        if (table !== 'coach_entries') {
          throw new Error(`Unexpected table ${table}`);
        }
        return createLatestEntryQueryMock(null, { onIs: isCalls });
      });

      await fetchLatestReadyCoachEntry({ locale: 'fr' });

      expect(isCalls).toHaveBeenCalledWith('deleted_at', null);
    });

    it('keeps the existing status=ready and locale filters alongside the deleted_at filter (no regression)', async () => {
      const eqCalls = jest.fn();
      const isCalls = jest.fn();
      supabase.from.mockImplementation((table: string) => {
        if (table !== 'coach_entries') {
          throw new Error(`Unexpected table ${table}`);
        }
        return createLatestEntryQueryMock(null, {
          onEq: eqCalls,
          onIs: isCalls,
        });
      });

      await fetchLatestReadyCoachEntry({ locale: 'fr' });

      expect(isCalls).toHaveBeenCalledWith('deleted_at', null);
      expect(eqCalls).toHaveBeenCalledWith('status', 'ready');
      expect(eqCalls).toHaveBeenCalledWith('locale', 'fr');
    });

    it('returns the active row as the latest advice when the server provides one (deleted_at = null)', async () => {
      supabase.from.mockReturnValue(
        createLatestEntryQueryMock(
          buildActiveCoachEntryRow({
            id: 'entry-latest-active',
            generated_at: '2026-05-27T11:00:00.000Z',
            locale: 'fr',
          }),
        ),
      );

      await expect(
        fetchLatestReadyCoachEntry({ locale: 'fr' }),
      ).resolves.toEqual(
        expect.objectContaining({
          id: 'entry-latest-active',
          status: 'ready',
        }),
      );
    });

    it('returns null as the latest advice when the only candidate was soft-deleted (server filtered it out)', async () => {
      // The .is('deleted_at', null) clause is server-side. When the only
      // candidate row has deleted_at IS NOT NULL, PostgREST returns no row and
      // maybeSingle resolves with data: null. The client must not synthesize a
      // fake "latest" — it must report null.
      supabase.from.mockReturnValue(createLatestEntryQueryMock(null));

      await expect(
        fetchLatestReadyCoachEntry({ locale: 'fr' }),
      ).resolves.toBeNull();
    });
  });
});
