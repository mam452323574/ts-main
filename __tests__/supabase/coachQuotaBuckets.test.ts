import {
  coachQuotaBucketForSource,
  normalizeCoachQuotaStatus,
  type CoachQuotaStatus,
} from '@/supabase/functions/_shared/coachQuota';

const FREE_RPC_PAYLOAD = (overrides: Partial<{
  used_general: number;
  used_scan_cta: number;
  next_general: string | null;
  next_scan_cta: string | null;
}> = {}) => {
  const usedGeneral = overrides.used_general ?? 0;
  const usedScanCta = overrides.used_scan_cta ?? 0;
  return {
    account_tier: 'free' as const,
    limit: 1,
    used_count: usedGeneral,
    available: Math.max(0, 1 - usedGeneral),
    next_recharge_at: overrides.next_general ?? null,
    unlimited: false,
    window_seconds: 86400,
    as_of: '2026-05-26T12:00:00.000Z',
    buckets: {
      general: {
        limit: 1,
        used_count: usedGeneral,
        available: Math.max(0, 1 - usedGeneral),
        next_recharge_at: overrides.next_general ?? null,
        window_seconds: 86400,
      },
      scan_cta: {
        limit: 1,
        used_count: usedScanCta,
        available: Math.max(0, 1 - usedScanCta),
        next_recharge_at: overrides.next_scan_cta ?? null,
        window_seconds: 86400,
      },
    },
  };
};

describe('coachQuotaBucketForSource', () => {
  it('maps coach_generation to the general bucket (legacy event behaviour)', () => {
    expect(coachQuotaBucketForSource('coach_generation')).toBe('general');
  });

  it('maps coach_cache to the general bucket (legacy cache hit)', () => {
    expect(coachQuotaBucketForSource('coach_cache')).toBe('general');
  });

  it('maps coach_scan_cta_generation to the scan_cta bucket', () => {
    expect(coachQuotaBucketForSource('coach_scan_cta_generation')).toBe(
      'scan_cta',
    );
  });

  it('maps coach_scan_cta_cache to the scan_cta bucket', () => {
    expect(coachQuotaBucketForSource('coach_scan_cta_cache')).toBe('scan_cta');
  });
});

describe('normalizeCoachQuotaStatus — split buckets shape', () => {
  it('free first general request: bucket general 1→0, scan_cta still 1', () => {
    // Mirrors test case (1): right after the first preset request lands, the
    // RPC reports used_general=1 / available_general=0 and the scan_cta
    // bucket is untouched.
    const normalized = normalizeCoachQuotaStatus(
      FREE_RPC_PAYLOAD({
        used_general: 1,
        next_general: '2026-05-27T12:00:00.000Z',
      }),
    );
    expect(normalized.account_tier).toBe('free');
    expect(normalized.unlimited).toBe(false);
    expect(normalized.buckets.general).toEqual({
      limit: 1,
      used_count: 1,
      available: 0,
      next_recharge_at: '2026-05-27T12:00:00.000Z',
      window_seconds: 86400,
    });
    expect(normalized.buckets.scan_cta).toEqual({
      limit: 1,
      used_count: 0,
      available: 1,
      next_recharge_at: null,
      window_seconds: 86400,
    });
    // Top-level fields mirror `general` for backward compat.
    expect(normalized.limit).toBe(1);
    expect(normalized.available).toBe(0);
    expect(normalized.next_recharge_at).toBe('2026-05-27T12:00:00.000Z');
  });

  it('free scan_cta still available even when general is exhausted', () => {
    // Test case (3): a free user has burned their preset quota but the
    // scan_cta bucket is still 1/1 — clicking a scanner CTA must succeed.
    const normalized = normalizeCoachQuotaStatus(
      FREE_RPC_PAYLOAD({
        used_general: 1,
        next_general: '2026-05-27T12:00:00.000Z',
        used_scan_cta: 0,
      }),
    );
    expect(normalized.buckets.general.available).toBe(0);
    expect(normalized.buckets.scan_cta.available).toBe(1);
  });

  it('free second scan_cta request: bucket scan_cta blocked, general untouched', () => {
    // Test case (4): scan_cta exhausted independently of general.
    const normalized = normalizeCoachQuotaStatus(
      FREE_RPC_PAYLOAD({
        used_general: 0,
        used_scan_cta: 1,
        next_scan_cta: '2026-05-27T12:00:00.000Z',
      }),
    );
    expect(normalized.buckets.general.available).toBe(1);
    expect(normalized.buckets.scan_cta.available).toBe(0);
    expect(normalized.buckets.scan_cta.next_recharge_at).toBe(
      '2026-05-27T12:00:00.000Z',
    );
  });

  it('premium 8+8 per bucket', () => {
    // Test case (5): premium ships 8/24h on each bucket independently.
    const normalized = normalizeCoachQuotaStatus({
      account_tier: 'premium',
      limit: 8,
      used_count: 5,
      available: 3,
      next_recharge_at: '2026-05-27T12:00:00.000Z',
      unlimited: false,
      window_seconds: 86400,
      as_of: '2026-05-26T12:00:00.000Z',
      buckets: {
        general: {
          limit: 8,
          used_count: 5,
          available: 3,
          next_recharge_at: '2026-05-27T12:00:00.000Z',
          window_seconds: 86400,
        },
        scan_cta: {
          limit: 8,
          used_count: 2,
          available: 6,
          next_recharge_at: '2026-05-27T08:00:00.000Z',
          window_seconds: 86400,
        },
      },
    });
    expect(normalized.account_tier).toBe('premium');
    expect(normalized.buckets.general.limit).toBe(8);
    expect(normalized.buckets.general.available).toBe(3);
    expect(normalized.buckets.scan_cta.limit).toBe(8);
    expect(normalized.buckets.scan_cta.available).toBe(6);
  });

  it('admin unlimited on both buckets', () => {
    // Test case (6): admin tier short-circuits to unlimited everywhere.
    const normalized = normalizeCoachQuotaStatus({
      account_tier: 'admin',
      limit: null,
      used_count: 0,
      available: null,
      next_recharge_at: null,
      unlimited: true,
      window_seconds: 86400,
      as_of: '2026-05-26T12:00:00.000Z',
      buckets: {
        general: {
          limit: null,
          used_count: 0,
          available: null,
          next_recharge_at: null,
          window_seconds: 86400,
        },
        scan_cta: {
          limit: null,
          used_count: 0,
          available: null,
          next_recharge_at: null,
          window_seconds: 86400,
        },
      },
    });
    expect(normalized.unlimited).toBe(true);
    expect(normalized.limit).toBeNull();
    expect(normalized.available).toBeNull();
    expect(normalized.buckets.general.limit).toBeNull();
    expect(normalized.buckets.general.available).toBeNull();
    expect(normalized.buckets.scan_cta.limit).toBeNull();
    expect(normalized.buckets.scan_cta.available).toBeNull();
  });

  it('falls back to mirroring top-level fields when the RPC omits buckets (rollout safety)', () => {
    // A stale RPC (pre-split-buckets migration) hitting a post-migration Edge
    // worker must not crash the worker. We fall back to mirroring the old
    // single-pool semantics into both buckets so the client keeps moving.
    const normalized = normalizeCoachQuotaStatus({
      account_tier: 'free',
      limit: 1,
      used_count: 0,
      available: 1,
      next_recharge_at: null,
      unlimited: false,
      window_seconds: 86400,
      as_of: '2026-05-26T12:00:00.000Z',
    });
    expect(normalized.buckets.general.available).toBe(1);
    expect(normalized.buckets.scan_cta.available).toBe(1);
  });

  it('CoachQuotaStatus shape stays type-compatible with the legacy interface', () => {
    // Compile-time-ish guard: legacy code that reads top-level fields keeps
    // working without knowing about buckets.
    const normalized: CoachQuotaStatus = normalizeCoachQuotaStatus(
      FREE_RPC_PAYLOAD(),
    );
    expect(typeof normalized.account_tier).toBe('string');
    expect(typeof normalized.window_seconds).toBe('number');
    expect(Object.keys(normalized.buckets)).toEqual(['general', 'scan_cta']);
  });
});
