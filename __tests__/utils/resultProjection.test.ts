import {
  buildLoadingTrajectoryPlaceholder,
  buildThirtyDayProjection,
} from '@/utils/resultProjection';

function expectFutureMonotonicProjection(
  projection: ReturnType<typeof buildThirtyDayProjection>,
) {
  expect(projection.points).toHaveLength(31);

  for (let index = 1; index < projection.points.length; index += 1) {
    const previous = projection.points[index - 1];
    const current = projection.points[index];

    expect(current?.chartValue).toBeGreaterThanOrEqual(
      previous?.chartValue ?? 0,
    );
    expect(current?.date).toBeDefined();
  }
}

describe('buildThirtyDayProjection', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('anchors missing current dates on today in UTC instead of history', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-31T15:32:10.000Z'));

    const projection = buildThirtyDayProjection({
      scanType: 'face',
      currentScore: 68,
      history: [
        { date: '2026-03-10', score: 62 },
        { date: '2026-03-24', score: 66 },
      ],
    });

    expect(projection.points[0]?.date).toBe('2026-03-31');
    expect(projection.points[30]?.date).toBe('2026-04-30');
    expectFutureMonotonicProjection(projection);
  });

  it('keeps the single-scan low-score case motivational but moderate', () => {
    const projection = buildThirtyDayProjection({
      scanType: 'face',
      currentScore: 42,
      currentDate: '2026-03-27T09:00:00.000Z',
      history: [],
    });

    expect(projection.projectionMode).toBe('generic');
    expect(projection.projectedDisplayValue).toBeGreaterThan(42);
    expect(projection.projectedDisplayValue).toBeLessThanOrEqual(52);
    expect(projection.projectedDeltaDisplayValue).toBeGreaterThanOrEqual(3);
    expectFutureMonotonicProjection(projection);
  });

  it('keeps the single-scan high-score case near the ceiling with a very small delta', () => {
    const lowProjection = buildThirtyDayProjection({
      scanType: 'face',
      currentScore: 42,
      currentDate: '2026-03-27T09:00:00.000Z',
      history: [],
    });
    const highProjection = buildThirtyDayProjection({
      scanType: 'face',
      currentScore: 91,
      currentDate: '2026-03-27T09:00:00.000Z',
      history: [],
    });

    expect(highProjection.projectedDisplayValue).toBeLessThanOrEqual(93);
    expect(highProjection.projectedDeltaDisplayValue).toBeLessThanOrEqual(2);
    expect(lowProjection.projectedDeltaDisplayValue).toBeGreaterThan(
      highProjection.projectedDeltaDisplayValue,
    );
  });

  it('projects regular improvements better than irregular histories with the same current score', () => {
    const regular = buildThirtyDayProjection({
      scanType: 'body',
      currentScore: 68,
      currentDate: '2026-03-27T09:00:00.000Z',
      history: [
        { date: '2026-03-05', score: 56 },
        { date: '2026-03-12', score: 60 },
        { date: '2026-03-19', score: 64 },
        { date: '2026-03-24', score: 66 },
      ],
    });
    const irregular = buildThirtyDayProjection({
      scanType: 'body',
      currentScore: 68,
      currentDate: '2026-03-27T09:00:00.000Z',
      history: [
        { date: '2026-03-05', score: 56 },
        { date: '2026-03-12', score: 67 },
        { date: '2026-03-19', score: 58 },
        { date: '2026-03-24', score: 66 },
      ],
    });

    expect(regular.projectedChartValue).toBeGreaterThan(
      irregular.projectedChartValue,
    );
    expect(regular.projectedDisplayValue).toBeGreaterThanOrEqual(
      irregular.projectedDisplayValue,
    );
    expectFutureMonotonicProjection(regular);
    expectFutureMonotonicProjection(irregular);
  });

  it('uses dense history without letting a single outlier create an absurd projection', () => {
    const baseline = buildThirtyDayProjection({
      scanType: 'nutrition',
      currentScore: 71,
      currentDate: '2026-03-27T09:00:00.000Z',
      history: [
        { date: '2026-02-10', score: 58 },
        { date: '2026-02-17', score: 60 },
        { date: '2026-02-24', score: 62 },
        { date: '2026-03-03', score: 64 },
        { date: '2026-03-10', score: 66 },
        { date: '2026-03-17', score: 68 },
        { date: '2026-03-24', score: 70 },
      ],
    });
    const withOutlier = buildThirtyDayProjection({
      scanType: 'nutrition',
      currentScore: 71,
      currentDate: '2026-03-27T09:00:00.000Z',
      history: [
        { date: '2026-02-10', score: 58 },
        { date: '2026-02-17', score: 60 },
        { date: '2026-02-24', score: 98 },
        { date: '2026-03-03', score: 64 },
        { date: '2026-03-10', score: 66 },
        { date: '2026-03-17', score: 68 },
        { date: '2026-03-24', score: 70 },
      ],
    });

    expect(baseline.projectionMode).toBe('personalized');
    expect(withOutlier.projectionMode).toBe('personalized');
    expect(
      Math.abs(
        withOutlier.projectedDisplayValue - baseline.projectedDisplayValue,
      ),
    ).toBeLessThanOrEqual(2);
  });

  it('uses fractional chart values instead of rounding the rendered series too early', () => {
    const projection = buildThirtyDayProjection({
      scanType: 'nutrition',
      currentScore: 63,
      currentDate: '2026-03-27T09:00:00.000Z',
      history: [
        { date: '2026-03-05', score: 58 },
        { date: '2026-03-12', score: 59 },
        { date: '2026-03-19', score: 61 },
        { date: '2026-03-24', score: 62 },
      ],
    });

    expect(
      projection.points.some(
        (point) => !Number.isInteger(point.chartValue) && point.day > 0,
      ),
    ).toBe(true);
  });

  it('deduplicates same-day history and ignores future or invalid history points', () => {
    const projection = buildThirtyDayProjection({
      scanType: 'body',
      currentScore: 74,
      currentDate: '2026-03-27T09:00:00.000Z',
      history: [
        { date: '2026-03-10', score: 70 },
        { date: '2026-03-10T18:00:00.000Z', score: 76 },
        { date: '2026-03-27T08:00:00.000Z', score: 72 },
        { date: '2026-04-02', score: 90 },
        { date: 'invalid-date', score: 90 },
        { date: '2026-03-22', score: Number.NaN },
      ],
    });

    expect(projection.historyPointCount).toBe(1);
    expect(projection.points[0]?.date).toBe('2026-03-27');
    expect(projection.currentDisplayValue).toBe(74);
    expectFutureMonotonicProjection(projection);
  });

  it('reduces optimistic gains when the recent history is clearly negative', () => {
    const stable = buildThirtyDayProjection({
      scanType: 'body',
      currentScore: 61,
      currentDate: '2026-03-27T09:00:00.000Z',
      history: [
        { date: '2026-03-03', score: 57 },
        { date: '2026-03-10', score: 58 },
        { date: '2026-03-17', score: 59 },
        { date: '2026-03-24', score: 60 },
      ],
    });
    const negative = buildThirtyDayProjection({
      scanType: 'body',
      currentScore: 61,
      currentDate: '2026-03-27T09:00:00.000Z',
      history: [
        { date: '2026-03-03', score: 70 },
        { date: '2026-03-10', score: 67 },
        { date: '2026-03-17', score: 63 },
        { date: '2026-03-24', score: 60 },
      ],
    });

    expect(negative.projectedDisplayValue).toBeLessThan(
      stable.projectedDisplayValue,
    );
    expect(negative.projectedDisplayValue).toBeGreaterThanOrEqual(61);
  });

  it('keeps sparse high-risk super projections conservative while still moving risk downward', () => {
    const sparseHighRisk = buildThirtyDayProjection({
      scanType: 'super_health_v2',
      currentScore: 82,
      currentDate: '2026-03-27T09:00:00.000Z',
      history: [{ date: '2026-03-20', score: 84 }],
    });
    const richerModerateRisk = buildThirtyDayProjection({
      scanType: 'super_health_v2',
      currentScore: 62,
      currentDate: '2026-03-27T09:00:00.000Z',
      history: [
        { date: '2026-03-03', score: 70 },
        { date: '2026-03-10', score: 67 },
        { date: '2026-03-17', score: 64 },
        { date: '2026-03-24', score: 63 },
      ],
    });

    expect(sparseHighRisk.direction).toBe('down');
    expect(
      sparseHighRisk.points[sparseHighRisk.points.length - 1]?.displayValue,
    ).toBeLessThan(sparseHighRisk.points[0]?.displayValue ?? 100);
    expect(
      sparseHighRisk.currentDisplayValue - sparseHighRisk.projectedDisplayValue,
    ).toBeLessThanOrEqual(3);
    expect(
      richerModerateRisk.currentDisplayValue -
        richerModerateRisk.projectedDisplayValue,
    ).toBeGreaterThanOrEqual(
      sparseHighRisk.currentDisplayValue - sparseHighRisk.projectedDisplayValue,
    );
  });

  it('survives missing or inconsistent history payloads without leaking historical anchors', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-31T04:12:00.000Z'));

    const projection = buildThirtyDayProjection({
      scanType: 'nutrition',
      currentScore: 64,
      history: [
        { date: '', score: 50 },
        { date: 'invalid', score: 80 },
        { date: '2026-06-01', score: 90 },
        { date: '2026-03-15', score: Number.NaN },
      ],
    });

    expect(projection.historyPointCount).toBe(0);
    expect(projection.points[0]?.date).toBe('2026-03-31');
    expect(projection.points[30]?.date).toBe('2026-04-30');
    expectFutureMonotonicProjection(projection);
  });

  it('builds a neutral loading placeholder disconnected from premium progression', () => {
    const placeholder = buildLoadingTrajectoryPlaceholder({
      scanType: 'face',
      currentScore: 74,
      currentDate: '2026-03-27T09:00:00.000Z',
    });

    expect(placeholder).toHaveLength(31);
    expect(new Set(placeholder.map((point) => point.chartValue)).size).toBe(1);
    expect(placeholder[0]?.date).toBe('2026-03-27');
    expect(placeholder[30]?.date).toBe('2026-04-26');
  });
});
