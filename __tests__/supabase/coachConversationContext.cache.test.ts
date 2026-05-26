import { getCachedOrFreshUserContext } from '@/supabase/functions/_shared/coachConversationContext';

interface CacheRow {
  user_context_snapshot_json: unknown;
  user_context_built_at: string | null;
  user_context_built_for_scan_id: string | null;
}

interface MockOptions {
  cacheRow: CacheRow | null;
  latestScanId: string | null;
  userProfile?: { data: unknown; error: unknown };
  scans?: { data: unknown; error: unknown };
  scanSummary?: { data: unknown; error: unknown };
  /** Captures the patch passed to UPDATE coach_conversations */
  onConversationUpdate?: (patch: Record<string, unknown>) => void;
  /** Force the UPDATE to error */
  conversationUpdateError?: unknown;
}

function createMockClient(opts: MockOptions) {
  // coach_conversations SELECT
  const convSelectMaybeSingle = jest.fn(() =>
    Promise.resolve({ data: opts.cacheRow, error: null }),
  );
  const convSelectEq2 = jest.fn(() => ({ maybeSingle: convSelectMaybeSingle }));
  const convSelectEq1 = jest.fn(() => ({ eq: convSelectEq2 }));
  const convSelect = jest.fn(() => ({ eq: convSelectEq1 }));

  // coach_conversations UPDATE
  const convUpdateEq2 = jest.fn(() =>
    Promise.resolve({ data: null, error: opts.conversationUpdateError ?? null }),
  );
  const convUpdateEq1 = jest.fn(() => ({ eq: convUpdateEq2 }));
  const convUpdate = jest.fn((patch: Record<string, unknown>) => {
    opts.onConversationUpdate?.(patch);
    return { eq: convUpdateEq1 };
  });

  // scans SELECT (latest)
  const scansLatestMaybeSingle = jest.fn(() =>
    Promise.resolve({
      data: opts.latestScanId ? { id: opts.latestScanId } : null,
      error: null,
    }),
  );
  const scansLatestLimit = jest.fn(() => ({ maybeSingle: scansLatestMaybeSingle }));
  const scansLatestOrder = jest.fn(() => ({ limit: scansLatestLimit }));
  const scansLatestEq = jest.fn(() => ({ order: scansLatestOrder }));

  // scans SELECT (digest builder)
  const scansLimit = jest.fn(() => Promise.resolve(opts.scans ?? { data: [], error: null }));
  const scansOrder2 = jest.fn(() => ({ limit: scansLimit }));
  const scansOrder1 = jest.fn(() => ({ order: scansOrder2 }));
  const scansEq = jest.fn(() => ({ order: scansOrder1 }));

  // scans.select: route between the 2 patterns based on the selected columns.
  const scansSelect = jest.fn((columns: string) => {
    if (columns === 'id') {
      return { eq: scansLatestEq };
    }
    return { eq: scansEq };
  });

  // user_profiles SELECT
  const profileMaybeSingle = jest.fn(() =>
    Promise.resolve(opts.userProfile ?? { data: null, error: null }),
  );
  const profileEq = jest.fn(() => ({ maybeSingle: profileMaybeSingle }));
  const profileSelect = jest.fn(() => ({ eq: profileEq }));

  const rpc = jest.fn((name: string) => {
    if (name === 'get_user_scan_summary') {
      return Promise.resolve(opts.scanSummary ?? { data: null, error: null });
    }
    throw new Error(`Unexpected rpc: ${name}`);
  });

  const from = jest.fn((table: string) => {
    if (table === 'coach_conversations') {
      return { select: convSelect, update: convUpdate };
    }
    if (table === 'scans') return { select: scansSelect };
    if (table === 'user_profiles') return { select: profileSelect };
    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    client: { from, rpc },
    spies: {
      convSelect,
      convUpdate,
      scansSelect,
      rpc,
      profileMaybeSingle,
      scansLimit,
    },
  };
}

describe('getCachedOrFreshUserContext', () => {
  const logSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  beforeEach(() => logSpy.mockClear());
  afterAll(() => logSpy.mockRestore());

  it('returns the cached snapshot when fresh and the latest scan_id matches', async () => {
    const snapshot = {
      inferred_persona: { detected_diet_signals: ['vegan'] },
      recent_scan_digest: [{ scan_type: 'body', captured_at: '2026-05-18T10:00:00Z' }],
    };
    const { client, spies } = createMockClient({
      cacheRow: {
        user_context_snapshot_json: snapshot,
        user_context_built_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        user_context_built_for_scan_id: 'scan-99',
      },
      latestScanId: 'scan-99',
    });

    const context = await getCachedOrFreshUserContext(client, 'user-1', 'conv-1', 'req-cache-1');
    expect(context).toEqual(snapshot);
    expect(spies.convUpdate).not.toHaveBeenCalled();
    // The digest builder should not have been invoked
    expect(spies.rpc).not.toHaveBeenCalled();
    expect(spies.profileMaybeSingle).not.toHaveBeenCalled();
  });

  it('rebuilds when the cache age exceeds the TTL', async () => {
    const expiredAt = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 60 min ago
    let capturedPatch: Record<string, unknown> | null = null;
    const { client, spies } = createMockClient({
      cacheRow: {
        user_context_snapshot_json: { inferred_persona: { x: 1 } },
        user_context_built_at: expiredAt,
        user_context_built_for_scan_id: 'scan-99',
      },
      latestScanId: 'scan-99',
      userProfile: { data: null, error: null },
      scans: {
        data: [
          {
            id: 'scan-99',
            scan_type: 'body',
            analysis_result: { overall_score: 80 },
            analyzed_at: '2026-05-19T10:00:00Z',
            created_at: '2026-05-19T10:00:00Z',
            scan_metrics: null,
          },
        ],
        error: null,
      },
      onConversationUpdate: (patch) => {
        capturedPatch = patch;
      },
    });

    const context = await getCachedOrFreshUserContext(client, 'user-1', 'conv-1', 'req-cache-2');

    expect(context).not.toBeNull();
    expect(context!.recent_scan_digest).toHaveLength(1);
    expect(spies.convUpdate).toHaveBeenCalledTimes(1);
    expect(capturedPatch).toBeTruthy();
    expect((capturedPatch as any).user_context_built_for_scan_id).toBe('scan-99');
    expect((capturedPatch as any).user_context_snapshot_json).toBeDefined();
  });

  it('rebuilds when the latest scan_id changed (new scan since cache)', async () => {
    const recentAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { client, spies } = createMockClient({
      cacheRow: {
        user_context_snapshot_json: { inferred_persona: { stale: true } },
        user_context_built_at: recentAt,
        user_context_built_for_scan_id: 'scan-old',
      },
      latestScanId: 'scan-new', // changed
      userProfile: { data: null, error: null },
      scans: { data: [], error: null },
    });

    const context = await getCachedOrFreshUserContext(client, 'user-1', 'conv-1', 'req-cache-3');

    expect(spies.convUpdate).toHaveBeenCalled();
    expect(context).toBeNull(); // no scans, no profile -> empty context
  });

  it('builds fresh and persists when no cache row exists', async () => {
    let capturedPatch: Record<string, unknown> | null = null;
    const { client, spies } = createMockClient({
      cacheRow: null,
      latestScanId: 'scan-new',
      userProfile: { data: null, error: null },
      scans: {
        data: [
          {
            id: 'scan-new',
            scan_type: 'health',
            analysis_result: { overall_score: 78 },
            analyzed_at: '2026-05-19T10:00:00Z',
            created_at: '2026-05-19T10:00:00Z',
            scan_metrics: { face_skin_clarity_score: 80 },
          },
        ],
        error: null,
      },
      onConversationUpdate: (patch) => {
        capturedPatch = patch;
      },
    });

    const context = await getCachedOrFreshUserContext(client, 'user-1', 'conv-1', 'req-cache-4');
    expect(context).not.toBeNull();
    expect(context!.recent_scan_digest).toHaveLength(1);
    expect(spies.convUpdate).toHaveBeenCalled();
    expect((capturedPatch as any).user_context_built_for_scan_id).toBe('scan-new');
  });

  it('does not throw when persistence fails — returns the fresh context anyway', async () => {
    const { client } = createMockClient({
      cacheRow: null,
      latestScanId: null,
      userProfile: { data: null, error: null },
      scans: { data: [], error: null },
      conversationUpdateError: { message: 'persist-down' },
    });

    const context = await getCachedOrFreshUserContext(client, 'user-1', 'conv-1', 'req-cache-5');
    expect(context).toBeNull();
    // Logged but no throw
    const messages = logSpy.mock.calls.map((args) => args[0]);
    expect(messages.some((m) => typeof m === 'string' && m.includes('cache persist degraded'))).toBe(true);
  });

  it('treats both user-has-no-scan AND cache-built-for-no-scan as a match', async () => {
    const recentAt = new Date(Date.now() - 60 * 1000).toISOString();
    const snapshot = { inferred_persona: { detected_diet_signals: ['veggie'] } };
    const { client, spies } = createMockClient({
      cacheRow: {
        user_context_snapshot_json: snapshot,
        user_context_built_at: recentAt,
        user_context_built_for_scan_id: null,
      },
      latestScanId: null,
    });

    const context = await getCachedOrFreshUserContext(client, 'user-1', 'conv-1', 'req-cache-6');
    expect(context).toEqual(snapshot);
    expect(spies.convUpdate).not.toHaveBeenCalled();
  });

  it('respects an explicit ttlMs override', async () => {
    const recentAt = new Date(Date.now() - 10 * 1000).toISOString(); // 10s old
    const { client, spies } = createMockClient({
      cacheRow: {
        user_context_snapshot_json: { inferred_persona: { x: 1 } },
        user_context_built_at: recentAt,
        user_context_built_for_scan_id: 'scan-1',
      },
      latestScanId: 'scan-1',
      userProfile: { data: null, error: null },
      scans: { data: [], error: null },
    });

    // ttlMs lower than the cache age -> miss
    await getCachedOrFreshUserContext(client, 'user-1', 'conv-1', 'req-cache-7', { ttlMs: 1000 });
    expect(spies.convUpdate).toHaveBeenCalled();
  });
});
