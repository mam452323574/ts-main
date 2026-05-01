// Simulation of backend scan frequency checking logic
// Replicates the logic in supabase/functions/check-and-record-scan/index.ts

describe('Backend Logic Simulation: Scan Frequency', () => {
  const DAY_MS = 24 * 60 * 60 * 1000;

  const SCAN_LIMITS = {
    free: {
      health: { count: 1, periodMs: DAY_MS },
      body: { count: 1, periodMs: DAY_MS },
      nutrition: { count: 1, periodMs: DAY_MS },
    },
  };

  const checkEligibility = (
    scanType: 'health' | 'body' | 'nutrition',
    scanTimestamps: string[],
    now: number,
    accountTier: 'free'
  ) => {
    const limit = SCAN_LIMITS[accountTier][scanType];
    const cutoffTime = now - limit.periodMs;
    const validTimestamps = scanTimestamps.filter(
      (ts: string) => new Date(ts).getTime() > cutoffTime
    );

    return {
      allowed: validTimestamps.length < limit.count,
      current_count: validTimestamps.length,
      limit: limit.count,
    };
  };

  const NOW = 1700000000000;
  const scanTypes: Array<'health' | 'body' | 'nutrition'> = [
    'health',
    'body',
    'nutrition',
  ];

  it('allows all free scan types when there is no recent scan', () => {
    scanTypes.forEach((scanType) => {
      const result = checkEligibility(scanType, [], NOW, 'free');

      expect(result.allowed).toBe(true);
      expect(result.current_count).toBe(0);
      expect(result.limit).toBe(1);
    });
  });

  it('blocks all free scan types when a scan happened 23 hours ago', () => {
    const twentyThreeHoursAgo = new Date(NOW - 23 * 60 * 60 * 1000).toISOString();

    scanTypes.forEach((scanType) => {
      const result = checkEligibility(scanType, [twentyThreeHoursAgo], NOW, 'free');

      expect(result.allowed).toBe(false);
      expect(result.current_count).toBe(1);
      expect(result.limit).toBe(1);
    });
  });

  it('reopens all free scan types once the previous scan is older than 24 hours', () => {
    const twentyFiveHoursAgo = new Date(NOW - 25 * 60 * 60 * 1000).toISOString();

    scanTypes.forEach((scanType) => {
      const result = checkEligibility(scanType, [twentyFiveHoursAgo], NOW, 'free');

      expect(result.allowed).toBe(true);
      expect(result.current_count).toBe(0);
      expect(result.limit).toBe(1);
    });
  });
});
