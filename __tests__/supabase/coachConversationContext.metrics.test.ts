import {
  buildRecentScanDigest,
  buildCoachUserContext,
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
  const scansLimit = jest.fn(() => Promise.resolve(resolveMock(options.scans)));
  const scansOrder2 = jest.fn(() => ({ limit: scansLimit }));
  const scansOrder1 = jest.fn(() => ({ order: scansOrder2 }));
  const scansEq = jest.fn(() => ({ order: scansOrder1 }));
  const scansSelect = jest.fn(() => ({ eq: scansEq }));

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

  return { client: { from, rpc }, spies: { scansSelect } };
}

function makeScanRow(overrides: Partial<ScanRow> = {}): ScanRow {
  return {
    id: 'scan-1',
    scan_type: 'health',
    analysis_result: null,
    analyzed_at: '2026-05-18T10:00:00.000Z',
    created_at: '2026-05-18T09:50:00.000Z',
    ...overrides,
  };
}

describe('buildRecentScanDigest — scan_metrics enrichment', () => {
  it('exposes nutrition_hydration_contribution_score as metrics.hydration_contribution_score', async () => {
    const { client } = createMockClient({
      scans: {
        data: [
          makeScanRow({
            id: 'nutri-1',
            scan_type: 'nutrition',
            scan_metrics: {
              scan_id: 'nutri-1',
              scan_type: 'nutrition',
              nutrition_hydration_contribution_score: 75,
              nutrition_meal_balance_score: 68,
              nutrition_sodium_level_score: 60,
            },
          }),
        ],
        error: null,
      },
    });
    const digest = await buildRecentScanDigest(client, 'user-1');
    expect(digest).toHaveLength(1);
    expect(digest[0].metrics).toBeDefined();
    expect((digest[0].metrics as Record<string, unknown>).hydration_contribution_score).toBe(75);
    expect((digest[0].metrics as Record<string, unknown>).meal_balance_score).toBe(68);
    expect((digest[0].metrics as Record<string, unknown>).sodium_level_score).toBe(60);
  });

  it('maps scans.scan_type=health to face_* columns', async () => {
    const { client } = createMockClient({
      scans: {
        data: [
          makeScanRow({
            id: 'face-1',
            scan_type: 'health',
            scan_metrics: {
              scan_id: 'face-1',
              scan_type: 'face',
              face_skin_clarity_score: 78,
              face_under_eye_shadow_score: 62,
            },
          }),
        ],
        error: null,
      },
    });
    const digest = await buildRecentScanDigest(client, 'user-1');
    expect((digest[0].metrics as Record<string, unknown>).skin_clarity_score).toBe(78);
    expect((digest[0].metrics as Record<string, unknown>).under_eye_shadow_score).toBe(62);
  });

  it('does not include body_* columns in a face scan metrics block', async () => {
    const { client } = createMockClient({
      scans: {
        data: [
          makeScanRow({
            id: 'face-1',
            scan_type: 'health',
            scan_metrics: {
              face_skin_clarity_score: 78,
              body_recovery_readiness_score: 80, // wrong bucket, must be ignored
            },
          }),
        ],
        error: null,
      },
    });
    const digest = await buildRecentScanDigest(client, 'user-1');
    const metrics = digest[0].metrics as Record<string, unknown>;
    expect(metrics.skin_clarity_score).toBe(78);
    expect(metrics.recovery_readiness_score).toBeUndefined();
  });

  it('omits the metrics sub-object when scan_metrics is null', async () => {
    const { client } = createMockClient({
      scans: {
        data: [
          makeScanRow({
            id: 'lonely-1',
            scan_type: 'body',
            scan_metrics: null,
          }),
        ],
        error: null,
      },
    });
    const digest = await buildRecentScanDigest(client, 'user-1');
    expect(digest[0].metrics).toBeUndefined();
    expect(digest[0].scan_type).toBe('body');
  });

  it('tolerates scan_metrics returned as a single-element array (1-to-many fallback)', async () => {
    const { client } = createMockClient({
      scans: {
        data: [
          makeScanRow({
            id: 'wrapped-1',
            scan_type: 'nutrition',
            scan_metrics: [
              {
                nutrition_hydration_contribution_score: 80,
              },
            ],
          }),
        ],
        error: null,
      },
    });
    const digest = await buildRecentScanDigest(client, 'user-1');
    expect((digest[0].metrics as Record<string, unknown>).hydration_contribution_score).toBe(80);
  });

  it('omits null columns from the metrics block', async () => {
    const { client } = createMockClient({
      scans: {
        data: [
          makeScanRow({
            id: 's-mix',
            scan_type: 'face',
            scan_metrics: {
              face_skin_clarity_score: 78,
              face_under_eye_shadow_score: null,
              face_hydration_level: null,
            },
          }),
        ],
        error: null,
      },
    });
    const digest = await buildRecentScanDigest(client, 'user-1');
    const metrics = digest[0].metrics as Record<string, unknown>;
    expect(metrics.skin_clarity_score).toBe(78);
    expect('under_eye_shadow_score' in metrics).toBe(false);
    expect('hydration_level' in metrics).toBe(false);
  });

  it('orders priority keys first in the JSON serialization', async () => {
    const { client } = createMockClient({
      scans: {
        data: [
          makeScanRow({
            id: 'ordered-1',
            scan_type: 'nutrition',
            scan_metrics: {
              nutrition_inflammation_index_score: 50,
              nutrition_meal_balance_score: 60,
              nutrition_hydration_contribution_score: 75,
              nutrition_processing_level_score: 40,
            },
          }),
        ],
        error: null,
      },
    });
    const digest = await buildRecentScanDigest(client, 'user-1');
    const serialized = JSON.stringify(digest[0].metrics);
    // hydration_contribution_score must appear BEFORE inflammation_index_score
    expect(serialized.indexOf('hydration_contribution_score')).toBeGreaterThan(-1);
    expect(serialized.indexOf('hydration_contribution_score')).toBeLessThan(
      serialized.indexOf('inflammation_index_score'),
    );
  });

  it('exposes a scan_id field when the row has an id', async () => {
    const { client } = createMockClient({
      scans: {
        data: [
          makeScanRow({
            id: 'with-id',
            scan_type: 'body',
            scan_metrics: { body_recovery_readiness_score: 70 },
          }),
        ],
        error: null,
      },
    });
    const digest = await buildRecentScanDigest(client, 'user-1');
    expect(digest[0].scan_id).toBe('with-id');
  });

  it('queries the scans table with scan_metrics(*) embedded', async () => {
    const { client, spies } = createMockClient({ scans: { data: [], error: null } });
    await buildRecentScanDigest(client, 'user-1');
    const firstCall = spies.scansSelect.mock.calls[0];
    expect(firstCall).toBeDefined();
    const calledWith = (firstCall as unknown as [string])[0];
    expect(typeof calledWith).toBe('string');
    expect(calledWith).toContain('scan_metrics(*)');
    expect(calledWith).toContain('analysis_result');
  });
});

describe('buildCoachUserContext — end-to-end with metrics', () => {
  const logSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

  beforeEach(() => logSpy.mockClear());
  afterAll(() => logSpy.mockRestore());

  it('produces a user_context where the hydration score is reachable for the LLM', async () => {
    const { client } = createMockClient({
      userProfile: { data: null, error: null },
      scans: {
        data: [
          makeScanRow({
            id: 'nutri-x',
            scan_type: 'nutrition',
            scan_metrics: {
              nutrition_hydration_contribution_score: 82,
              nutrition_meal_balance_score: 70,
            },
          }),
        ],
        error: null,
      },
      scanSummary: {
        data: { total: 1, last_7d: 1, last_30d: 1, first_at: null, last_at: null, by_type: { nutrition: 1 } },
        error: null,
      },
    });

    const context = await buildCoachUserContext(client, 'user-1', 'req-metrics');
    expect(context).not.toBeNull();
    expect(context!.recent_scan_digest).toBeDefined();
    const entry = context!.recent_scan_digest![0];
    expect(entry.metrics).toBeDefined();
    expect((entry.metrics as Record<string, unknown>).hydration_contribution_score).toBe(82);
    expect(context!.scan_summary?.total).toBe(1);
  });
});
