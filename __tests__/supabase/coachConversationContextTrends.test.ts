import { buildCoachUserContext } from '@/supabase/functions/_shared/coachConversationContext';

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

function createMockClient(options: {
  scans?: MaybeSettableMock;
  userProfile?: MaybeSettableMock;
  scanSummary?: MaybeSettableMock;
} = {}) {
  const resolve = (opt: MaybeSettableMock | undefined): MaybeSettableMock =>
    opt ?? { data: null, error: null };

  const scansLimit = jest.fn(() => Promise.resolve(resolve(options.scans)));
  const scansOrder2 = jest.fn(() => ({ limit: scansLimit }));
  const scansOrder1 = jest.fn(() => ({ order: scansOrder2 }));
  const scansEq = jest.fn(() => ({ order: scansOrder1 }));
  const scansSelect = jest.fn(() => ({ eq: scansEq }));

  const profileMaybeSingle = jest.fn(() => Promise.resolve(resolve(options.userProfile)));
  const profileEq = jest.fn(() => ({ maybeSingle: profileMaybeSingle }));
  const profileSelect = jest.fn(() => ({ eq: profileEq }));

  const rpc = jest.fn((name: string) => {
    if (name === 'get_user_scan_summary') {
      return Promise.resolve(resolve(options.scanSummary));
    }
    throw new Error(`Unexpected rpc: ${name}`);
  });

  const from = jest.fn((table: string) => {
    if (table === 'scans') return { select: scansSelect };
    if (table === 'user_profiles') return { select: profileSelect };
    throw new Error(`Unexpected table: ${table}`);
  });

  return { from, rpc };
}

function makeScan(
  id: string,
  scanType: string,
  capturedAt: string,
  overallScore: number,
  metricsOverrides: Record<string, number | null> = {},
): ScanRow {
  const prefix = scanType === 'health' ? 'face_' : `${scanType}_`;
  const scan_metrics: Record<string, unknown> = { scan_id: id };
  for (const [k, v] of Object.entries(metricsOverrides)) {
    if (v === null) continue;
    scan_metrics[k.startsWith(prefix) ? k : `${prefix}${k}`] = v;
  }
  return {
    id,
    scan_type: scanType,
    analysis_result: { overall_score: overallScore },
    analyzed_at: capturedAt,
    created_at: capturedAt,
    scan_metrics,
  };
}

describe('buildCoachUserContext — trends', () => {
  const logSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  beforeEach(() => logSpy.mockClear());
  afterAll(() => logSpy.mockRestore());

  it('emits an improving direction when a higher-is-better metric goes up', async () => {
    const client = createMockClient({
      scans: {
        data: [
          // newest first per the DB ORDER BY analyzed_at DESC
          makeScan('n2', 'nutrition', '2026-05-19T10:00:00Z', 78, {
            hydration_contribution_score: 80,
          }),
          makeScan('n1', 'nutrition', '2026-05-15T10:00:00Z', 70, {
            hydration_contribution_score: 65,
          }),
        ],
        error: null,
      },
    });

    const context = await buildCoachUserContext(client, 'user-1', 'req-trend-1');
    expect(context).not.toBeNull();
    const trends = context!.trends!;
    expect(trends['nutrition.hydration_contribution_score']).toMatchObject({
      current: 80,
      previous: 65,
      delta: 15,
      direction: 'improving',
    });
    expect(trends['nutrition.overall_score']).toMatchObject({
      current: 78,
      previous: 70,
      delta: 8,
      direction: 'improving',
    });
  });

  it('emits an improving direction when a lower-is-better metric goes down', async () => {
    const client = createMockClient({
      scans: {
        data: [
          makeScan('n2', 'nutrition', '2026-05-19T10:00:00Z', 80, {
            inflammation_index_score: 40,
          }),
          makeScan('n1', 'nutrition', '2026-05-15T10:00:00Z', 75, {
            inflammation_index_score: 70,
          }),
        ],
        error: null,
      },
    });

    const context = await buildCoachUserContext(client, 'user-1', 'req-trend-2');
    const trends = context!.trends!;
    expect(trends['nutrition.inflammation_index_score'].direction).toBe('improving');
    expect(trends['nutrition.inflammation_index_score'].delta).toBe(-30);
  });

  it('omits trends entirely when only 1 scan is available', async () => {
    const client = createMockClient({
      scans: {
        data: [makeScan('only', 'body', '2026-05-19T10:00:00Z', 70, {
          recovery_readiness_score: 60,
        })],
        error: null,
      },
    });

    const context = await buildCoachUserContext(client, 'user-1', 'req-trend-3');
    expect(context).not.toBeNull();
    expect(context!.trends).toBeUndefined();
  });

  it('only uses the two newest scans of the same type to compute deltas', async () => {
    const client = createMockClient({
      scans: {
        data: [
          // 3 scans body, newest first
          makeScan('b3', 'body', '2026-05-19T10:00:00Z', 80, { recovery_readiness_score: 75 }),
          makeScan('b2', 'body', '2026-05-15T10:00:00Z', 70, { recovery_readiness_score: 60 }),
          makeScan('b1', 'body', '2026-05-10T10:00:00Z', 50, { recovery_readiness_score: 30 }),
        ],
        error: null,
      },
    });

    const context = await buildCoachUserContext(client, 'user-1', 'req-trend-4');
    const trends = context!.trends!;
    expect(trends['body.recovery_readiness_score']).toMatchObject({
      current: 75,
      previous: 60,
      delta: 15,
      direction: 'improving',
    });
  });

  it('does not mix metrics across scan types', async () => {
    const client = createMockClient({
      scans: {
        data: [
          makeScan('f2', 'health', '2026-05-19T10:00:00Z', 75, { skin_clarity_score: 80 }),
          makeScan('b2', 'body', '2026-05-19T10:00:00Z', 70, { recovery_readiness_score: 65 }),
          makeScan('f1', 'health', '2026-05-15T10:00:00Z', 70, { skin_clarity_score: 75 }),
          makeScan('b1', 'body', '2026-05-15T10:00:00Z', 60, { recovery_readiness_score: 55 }),
        ],
        error: null,
      },
    });

    const context = await buildCoachUserContext(client, 'user-1', 'req-trend-5');
    const trends = context!.trends!;
    expect(trends['face.skin_clarity_score']).toMatchObject({ current: 80, previous: 75 });
    expect(trends['body.recovery_readiness_score']).toMatchObject({ current: 65, previous: 55 });
    // No cross-type leak.
    expect(trends['body.skin_clarity_score']).toBeUndefined();
  });

  it('stable direction when the change is exactly 0', async () => {
    const client = createMockClient({
      scans: {
        data: [
          makeScan('n2', 'nutrition', '2026-05-19T10:00:00Z', 70, {
            hydration_contribution_score: 70,
          }),
          makeScan('n1', 'nutrition', '2026-05-15T10:00:00Z', 70, {
            hydration_contribution_score: 70,
          }),
        ],
        error: null,
      },
    });

    const context = await buildCoachUserContext(client, 'user-1', 'req-trend-6');
    const trends = context!.trends!;
    expect(trends['nutrition.hydration_contribution_score'].direction).toBe('stable');
    expect(trends['nutrition.overall_score'].direction).toBe('stable');
  });
});
