import {
  buildCoachUserContext,
  buildRecentScanDigest,
  type CoachRecentScanDigestEntry,
} from '@/supabase/functions/_shared/coachConversationContext';

interface ScanRow {
  id: string;
  scan_type: unknown;
  analysis_result: unknown;
  analyzed_at: unknown;
  created_at: unknown;
  scan_metrics?: unknown;
}

interface MaybeSettableMock {
  data: unknown;
  error: unknown;
}

interface MockClientOptions {
  scans?: MaybeSettableMock | (() => MaybeSettableMock);
  userProfile?: MaybeSettableMock | (() => MaybeSettableMock);
  scanSummary?: MaybeSettableMock | (() => MaybeSettableMock);
}

function resolveMock(option: MockClientOptions[keyof MockClientOptions] | undefined): MaybeSettableMock {
  if (typeof option === 'function') return option();
  if (option) return option;
  return { data: null, error: null };
}

function createMockClient(options: MockClientOptions = {}) {
  const scansLimit = jest.fn();
  const scansOrder2 = jest.fn(() => ({ limit: scansLimit }));
  const scansOrder1 = jest.fn(() => ({ order: scansOrder2 }));
  const scansEq = jest.fn(() => ({ order: scansOrder1 }));
  const scansSelect = jest.fn(() => ({ eq: scansEq }));

  scansLimit.mockImplementation(() => {
    const result = resolveMock(options.scans);
    return Promise.resolve(result);
  });

  const profileMaybeSingle = jest.fn(() => Promise.resolve(resolveMock(options.userProfile)));
  const profileEq = jest.fn(() => ({ maybeSingle: profileMaybeSingle }));
  const profileSelect = jest.fn(() => ({ eq: profileEq }));

  const rpc = jest.fn((name: string) => {
    if (name === 'get_user_scan_summary') {
      return Promise.resolve(resolveMock(options.scanSummary));
    }
    throw new Error(`Unexpected rpc in mock: ${name}`);
  });

  const from = jest.fn((table: string) => {
    if (table === 'scans') return { select: scansSelect };
    if (table === 'user_profiles') return { select: profileSelect };
    throw new Error(`Unexpected table in mock: ${table}`);
  });

  return {
    client: { from, rpc },
    spies: {
      from,
      rpc,
      scansSelect,
      scansEq,
      scansOrder1,
      scansOrder2,
      scansLimit,
      profileSelect,
      profileEq,
      profileMaybeSingle,
    },
  };
}

function makeScanRow(overrides: Partial<ScanRow> = {}): ScanRow {
  return {
    id: 'scan-1',
    scan_type: 'body',
    analysis_result: null,
    analyzed_at: '2026-05-18T10:00:00.000Z',
    created_at: '2026-05-18T09:50:00.000Z',
    ...overrides,
  };
}

describe('buildRecentScanDigest', () => {
  it('returns an empty array when the user has no scans', async () => {
    const { client } = createMockClient({ scans: { data: [], error: null } });
    const digest = await buildRecentScanDigest(client, 'user-1');
    expect(digest).toEqual([]);
  });

  it('returns at most `limit` entries with newest first as ordered by the DB', async () => {
    const rows = [
      makeScanRow({ id: 's1', analyzed_at: '2026-05-20T10:00:00.000Z' }),
      makeScanRow({ id: 's2', analyzed_at: '2026-05-19T10:00:00.000Z' }),
      makeScanRow({ id: 's3', analyzed_at: '2026-05-18T10:00:00.000Z' }),
    ];
    const { client, spies } = createMockClient({ scans: { data: rows, error: null } });
    const digest = await buildRecentScanDigest(client, 'user-1', 3);
    expect(digest).toHaveLength(3);
    expect(digest[0].captured_at).toBe('2026-05-20T10:00:00.000Z');
    expect(digest[2].captured_at).toBe('2026-05-18T10:00:00.000Z');
    expect(spies.scansLimit).toHaveBeenCalledWith(3);
    expect(spies.scansOrder1).toHaveBeenCalledWith('analyzed_at', {
      ascending: false,
      nullsFirst: false,
    });
  });

  it('selects scan_metrics(*) alongside the scan columns', () => {
    const { client, spies } = createMockClient({ scans: { data: [], error: null } });
    return buildRecentScanDigest(client, 'user-1').then(() => {
      expect(spies.scansSelect).toHaveBeenCalledWith(
        expect.stringContaining('scan_metrics(*)'),
      );
    });
  });

  it('falls back to created_at when analyzed_at is missing', async () => {
    const { client } = createMockClient({
      scans: {
        data: [
          makeScanRow({
            analyzed_at: null,
            created_at: '2026-04-01T08:00:00.000Z',
          }),
        ],
        error: null,
      },
    });
    const digest = await buildRecentScanDigest(client, 'user-1');
    expect(digest).toEqual([
      {
        scan_id: 'scan-1',
        scan_type: 'body',
        captured_at: '2026-04-01T08:00:00.000Z',
      },
    ]);
  });

  it('skips rows missing both scan_type and captured_at', async () => {
    const { client } = createMockClient({
      scans: {
        data: [
          makeScanRow({ scan_type: null, analyzed_at: null, created_at: null }),
          makeScanRow({ id: 's2' }),
        ],
        error: null,
      },
    });
    const digest = await buildRecentScanDigest(client, 'user-1');
    expect(digest).toHaveLength(1);
    expect(digest[0].scan_type).toBe('body');
  });

  it('extracts overall_score from analysis_result when it is a finite number in [0, 100]', async () => {
    const { client } = createMockClient({
      scans: {
        data: [
          makeScanRow({ analysis_result: { overall_score: 78 } }),
          makeScanRow({ id: 's2', analysis_result: { score: 42 } }),
          makeScanRow({ id: 's3', analysis_result: { summary: { score: 60 } } }),
        ],
        error: null,
      },
    });
    const digest = await buildRecentScanDigest(client, 'user-1');
    expect(digest.map((entry) => entry.overall_score)).toEqual([78, 42, 60]);
  });

  it('excludes overall_score when it is out of range or non-numeric', async () => {
    const { client } = createMockClient({
      scans: {
        data: [
          makeScanRow({ analysis_result: { overall_score: 150 } }),
          makeScanRow({ id: 's2', analysis_result: { overall_score: -5 } }),
          makeScanRow({ id: 's3', analysis_result: { overall_score: 'high' } }),
        ],
        error: null,
      },
    });
    const digest = await buildRecentScanDigest(client, 'user-1');
    for (const entry of digest) {
      expect(entry.overall_score).toBeUndefined();
    }
  });

  it('truncates a long summary with an ellipsis suffix (400 chars max)', async () => {
    const longSummary = 'A'.repeat(800);
    const { client } = createMockClient({
      scans: {
        data: [makeScanRow({ analysis_result: { analysis_summary: longSummary } })],
        error: null,
      },
    });
    const digest = await buildRecentScanDigest(client, 'user-1');
    expect(digest[0].summary).toBeDefined();
    expect(digest[0].summary!.length).toBe(400);
    expect(digest[0].summary!.endsWith('…')).toBe(true);
  });

  it('keeps a short summary intact', async () => {
    const { client } = createMockClient({
      scans: {
        data: [makeScanRow({ analysis_result: { summary: 'Quick recap.' } })],
        error: null,
      },
    });
    const digest = await buildRecentScanDigest(client, 'user-1');
    expect(digest[0].summary).toBe('Quick recap.');
  });

  it('returns up to four findings, each clamped to 160 chars', async () => {
    const long = 'F'.repeat(200);
    const { client } = createMockClient({
      scans: {
        data: [
          makeScanRow({
            analysis_result: {
              findings: [long, 'short finding', 'third finding', 'fourth finding', 'fifth finding'],
            },
          }),
        ],
        error: null,
      },
    });
    const digest = await buildRecentScanDigest(client, 'user-1');
    expect(digest[0].top_findings).toHaveLength(4);
    expect(digest[0].top_findings![0].length).toBe(160);
    expect(digest[0].top_findings![0].endsWith('…')).toBe(true);
    expect(digest[0].top_findings![1]).toBe('short finding');
  });

  it('does not throw when analysis_result is a string or garbage value', async () => {
    const { client } = createMockClient({
      scans: {
        data: [
          makeScanRow({ analysis_result: 'garbage' }),
          makeScanRow({ id: 's2', analysis_result: 42 }),
          makeScanRow({ id: 's3', analysis_result: [] }),
        ],
        error: null,
      },
    });
    const digest = await buildRecentScanDigest(client, 'user-1');
    expect(digest).toHaveLength(3);
    for (const entry of digest) {
      expect(entry.overall_score).toBeUndefined();
      expect(entry.summary).toBeUndefined();
      expect(entry.top_findings).toBeUndefined();
    }
  });

  it('throws when Supabase returns an error', async () => {
    const { client } = createMockClient({
      scans: { data: null, error: { message: 'boom' } },
    });
    await expect(buildRecentScanDigest(client, 'user-1')).rejects.toMatchObject({
      message: 'boom',
    });
  });

  it('produces a JSON payload of three rich entries under 3 KB', async () => {
    const rows: ScanRow[] = ['s1', 's2', 's3'].map((id, idx) =>
      makeScanRow({
        id,
        scan_type: idx === 0 ? 'body' : idx === 1 ? 'health' : 'nutrition',
        analysis_result: {
          overall_score: 80 - idx * 5,
          analysis_summary:
            'Energy stable, hydration moderate, recovery slightly delayed after yesterday session.',
          findings: [
            'Posture asymmetry on the left side',
            'Mid-back tightness noted on rotation',
          ],
        },
      }),
    );
    const { client } = createMockClient({ scans: { data: rows, error: null } });
    const digest = await buildRecentScanDigest(client, 'user-1');
    expect(JSON.stringify(digest).length).toBeLessThan(3000);
  });
});

describe('buildCoachUserContext', () => {
  const logSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

  beforeEach(() => {
    logSpy.mockClear();
  });

  afterAll(() => {
    logSpy.mockRestore();
  });

  function makeStoredPersona(overrides: Record<string, unknown> = {}) {
    return {
      detected_diet_signals: ['vegan'],
      detected_strong_focus: null,
      suggested_goals: ['weight_loss'],
      suggested_persona_key: null,
      last_updated_at: '2026-05-15T10:00:00.000Z',
      update_count: 2,
      ...overrides,
    };
  }

  it('returns inferred_persona and recent_scan_digest when both reads succeed', async () => {
    const { client } = createMockClient({
      userProfile: { data: { inferred_persona: makeStoredPersona() }, error: null },
      scans: { data: [makeScanRow()], error: null },
      scanSummary: { data: null, error: null },
    });

    const context = await buildCoachUserContext(client, 'user-1', 'req-1');

    expect(context).not.toBeNull();
    expect(context!.inferred_persona).toMatchObject({
      detected_diet_signals: ['vegan'],
      suggested_goals: ['weight_loss'],
    });
    expect(context!.recent_scan_digest).toHaveLength(1);
  });

  it('omits inferred_persona when the profile row is null', async () => {
    const { client } = createMockClient({
      userProfile: { data: null, error: null },
      scans: { data: [makeScanRow()], error: null },
      scanSummary: { data: null, error: null },
    });

    const context = await buildCoachUserContext(client, 'user-1', 'req-2');

    expect(context).not.toBeNull();
    expect(context!.inferred_persona).toBeUndefined();
    expect(context!.recent_scan_digest).toHaveLength(1);
  });

  it('omits inferred_persona when normalization yields null (no meaningful signals)', async () => {
    const { client } = createMockClient({
      userProfile: { data: { inferred_persona: {} }, error: null },
      scans: { data: [makeScanRow()], error: null },
      scanSummary: { data: null, error: null },
    });

    const context = await buildCoachUserContext(client, 'user-1', 'req-3');

    expect(context).not.toBeNull();
    expect(context!.inferred_persona).toBeUndefined();
  });

  it('omits recent_scan_digest when the user has no scans', async () => {
    const { client } = createMockClient({
      userProfile: { data: { inferred_persona: makeStoredPersona() }, error: null },
      scans: { data: [], error: null },
      scanSummary: { data: null, error: null },
    });

    const context = await buildCoachUserContext(client, 'user-1', 'req-4');

    expect(context).not.toBeNull();
    expect(context!.recent_scan_digest).toBeUndefined();
    expect(context!.inferred_persona).toMatchObject({ detected_diet_signals: ['vegan'] });
  });

  it('returns null when both reads yield no usable data', async () => {
    const { client } = createMockClient({
      userProfile: { data: null, error: null },
      scans: { data: [], error: null },
      scanSummary: { data: null, error: null },
    });

    const context = await buildCoachUserContext(client, 'user-1', 'req-5');

    expect(context).toBeNull();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('logs and skips the failing side without throwing when one read errors', async () => {
    const { client } = createMockClient({
      userProfile: { data: { inferred_persona: makeStoredPersona() }, error: null },
      scans: { data: null, error: { message: 'scans-down' } },
      scanSummary: { data: null, error: null },
    });

    const context = await buildCoachUserContext(client, 'user-1', 'req-6');

    expect(context).not.toBeNull();
    expect(context!.inferred_persona).toMatchObject({ detected_diet_signals: ['vegan'] });
    expect(context!.recent_scan_digest).toBeUndefined();
    expect(logSpy).toHaveBeenCalled();
    const messages = logSpy.mock.calls.map((args) => args[0]);
    expect(messages.some((m) => typeof m === 'string' && m.includes('user_context fetch degraded'))).toBe(true);
  });

  it('returns null when all three reads throw', async () => {
    const { client } = createMockClient({
      userProfile: { data: null, error: { message: 'profile-down' } },
      scans: { data: null, error: { message: 'scans-down' } },
      scanSummary: { data: null, error: { message: 'summary-down' } },
    });

    const context = await buildCoachUserContext(client, 'user-1', 'req-7');

    expect(context).toBeNull();
    expect(logSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('includes scan_summary when the RPC returns a non-zero total', async () => {
    const { client } = createMockClient({
      userProfile: { data: null, error: null },
      scans: { data: [makeScanRow()], error: null },
      scanSummary: {
        data: {
          total: 12,
          last_7d: 3,
          last_30d: 8,
          first_at: '2026-01-10T00:00:00.000Z',
          last_at: '2026-05-18T10:00:00.000Z',
          by_type: { body: 6, health: 4, nutrition: 2 },
        },
        error: null,
      },
    });

    const context = await buildCoachUserContext(client, 'user-1', 'req-8');

    expect(context).not.toBeNull();
    expect(context!.scan_summary).toMatchObject({
      total: 12,
      last_7d: 3,
      last_30d: 8,
      by_type: { body: 6, health: 4, nutrition: 2 },
    });
  });

  it('omits scan_summary when total is 0 (no scans)', async () => {
    const { client } = createMockClient({
      userProfile: { data: { inferred_persona: makeStoredPersona() }, error: null },
      scans: { data: [], error: null },
      scanSummary: {
        data: { total: 0, last_7d: 0, last_30d: 0, first_at: null, last_at: null, by_type: {} },
        error: null,
      },
    });

    const context = await buildCoachUserContext(client, 'user-1', 'req-9');

    expect(context).not.toBeNull();
    expect(context!.scan_summary).toBeUndefined();
  });
});

describe('CoachRecentScanDigestEntry shape', () => {
  it('serializes only the populated fields', () => {
    const entry: CoachRecentScanDigestEntry = {
      scan_type: 'body',
      captured_at: '2026-05-18T10:00:00.000Z',
      overall_score: 75,
    };
    expect(JSON.parse(JSON.stringify(entry))).toEqual({
      scan_type: 'body',
      captured_at: '2026-05-18T10:00:00.000Z',
      overall_score: 75,
    });
  });
});
