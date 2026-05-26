import {
  coachQuotaSourceForRequest,
  CoachServiceError,
  getCoachQuotaBucketKeyFromError,
  mergeCoachQuotaForBucket,
  parseCoachQuotaStatus,
  selectCoachQuotaBucket,
} from '@/services/coach';
import type { CoachQuotaStatus } from '@/types';

const FRESH_FREE_QUOTA = (): CoachQuotaStatus =>
  parseCoachQuotaStatus({
    account_tier: 'free',
    limit: 1,
    used_count: 0,
    available: 1,
    next_recharge_at: null,
    unlimited: false,
    window_seconds: 86400,
    as_of: '2026-05-26T12:00:00.000Z',
    buckets: {
      general: {
        limit: 1,
        used_count: 0,
        available: 1,
        next_recharge_at: null,
        window_seconds: 86400,
      },
      scan_cta: {
        limit: 1,
        used_count: 0,
        available: 1,
        next_recharge_at: null,
        window_seconds: 86400,
      },
    },
  })!;

describe('coachQuotaSourceForRequest', () => {
  it('returns scan_cta when the request carries a scan intent', () => {
    expect(coachQuotaSourceForRequest({ hasScanIntent: true })).toBe('scan_cta');
  });

  it('returns general when no scan intent is provided', () => {
    expect(coachQuotaSourceForRequest({ hasScanIntent: false })).toBe('general');
    expect(coachQuotaSourceForRequest({ hasScanIntent: null })).toBe('general');
    expect(coachQuotaSourceForRequest({})).toBe('general');
  });

  it('ignores promptType (the gate must not branch on a fragile string)', () => {
    // Even with prompt_type that LOOKS like a scan-CTA flow ("latest_scan_issue_resolution"),
    // we still return general unless hasScanIntent is explicitly true.
    expect(
      coachQuotaSourceForRequest({
        hasScanIntent: false,
        promptType: 'latest_scan_issue_resolution',
      }),
    ).toBe('general');
  });
});

describe('parseCoachQuotaStatus with split buckets', () => {
  it('preserves the server-emitted buckets when present', () => {
    const parsed = parseCoachQuotaStatus({
      account_tier: 'free',
      limit: 1,
      used_count: 1,
      available: 0,
      next_recharge_at: '2026-05-27T12:00:00.000Z',
      unlimited: false,
      window_seconds: 86400,
      as_of: '2026-05-26T12:00:00.000Z',
      buckets: {
        general: {
          limit: 1,
          used_count: 1,
          available: 0,
          next_recharge_at: '2026-05-27T12:00:00.000Z',
          window_seconds: 86400,
        },
        scan_cta: {
          limit: 1,
          used_count: 0,
          available: 1,
          next_recharge_at: null,
          window_seconds: 86400,
        },
      },
    })!;

    expect(parsed.buckets?.general).toEqual({
      limit: 1,
      used_count: 1,
      available: 0,
      next_recharge_at: '2026-05-27T12:00:00.000Z',
      window_seconds: 86400,
    });
    expect(parsed.buckets?.scan_cta).toEqual({
      limit: 1,
      used_count: 0,
      available: 1,
      next_recharge_at: null,
      window_seconds: 86400,
    });
  });

  it('synthesises buckets from top-level fields on a legacy payload', () => {
    // No `buckets` field — comes from a pre-migration server during rollout
    // or from an error payload that only carries the consumed bucket.
    const parsed = parseCoachQuotaStatus({
      account_tier: 'free',
      limit: 1,
      used_count: 1,
      available: 0,
      next_recharge_at: '2026-05-27T12:00:00.000Z',
      unlimited: false,
      window_seconds: 86400,
      as_of: '2026-05-26T12:00:00.000Z',
    })!;

    // The general bucket mirrors the top-level pool — this is exactly what
    // the legacy single-pool semantics did.
    expect(parsed.buckets?.general.available).toBe(0);
    expect(parsed.buckets?.general.next_recharge_at).toBe(
      '2026-05-27T12:00:00.000Z',
    );
    // The scan_cta bucket is assumed permissive on a legacy payload: we
    // refuse to pre-block the user when we have no information. The server
    // is authoritative on the 429.
    expect(parsed.buckets?.scan_cta.available).toBe(1);
    expect(parsed.buckets?.scan_cta.used_count).toBe(0);
  });

  it('admin tier carries unlimited buckets', () => {
    const parsed = parseCoachQuotaStatus({
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
    })!;
    expect(parsed.unlimited).toBe(true);
    expect(parsed.buckets?.general.limit).toBeNull();
    expect(parsed.buckets?.general.available).toBeNull();
    expect(parsed.buckets?.scan_cta.limit).toBeNull();
    expect(parsed.buckets?.scan_cta.available).toBeNull();
  });
});

describe('selectCoachQuotaBucket', () => {
  it('returns the general bucket when source=general', () => {
    const quota = FRESH_FREE_QUOTA();
    expect(selectCoachQuotaBucket(quota, 'general')).toEqual(
      quota.buckets!.general,
    );
  });

  it('returns the scan_cta bucket when source=scan_cta', () => {
    const quota = FRESH_FREE_QUOTA();
    expect(selectCoachQuotaBucket(quota, 'scan_cta')).toEqual(
      quota.buckets!.scan_cta,
    );
  });

  it('returns null when the quota is null/undefined', () => {
    expect(selectCoachQuotaBucket(null, 'general')).toBeNull();
    expect(selectCoachQuotaBucket(undefined, 'scan_cta')).toBeNull();
  });

  it('falls back to mirroring top-level when buckets are missing (rollout safety)', () => {
    // Manually construct a CoachQuotaStatus with no buckets — simulates an
    // older state in the React Query cache that has not yet been refreshed
    // post-migration.
    const legacyQuota = {
      account_tier: 'free',
      limit: 1,
      used_count: 1,
      available: 0,
      next_recharge_at: '2026-05-27T12:00:00.000Z',
      unlimited: false,
      window_seconds: 86400,
      as_of: '2026-05-26T12:00:00.000Z',
    } as unknown as CoachQuotaStatus;

    const generalBucket = selectCoachQuotaBucket(legacyQuota, 'general');
    expect(generalBucket).toEqual({
      limit: 1,
      used_count: 1,
      available: 0,
      next_recharge_at: '2026-05-27T12:00:00.000Z',
      window_seconds: 86400,
    });

    // For the scan_cta bucket on a legacy payload we mirror top-level too —
    // we do not invent a permissive available because we cannot prove that
    // the bucket has slots. The server stays authoritative on the 429.
    const scanCtaBucket = selectCoachQuotaBucket(legacyQuota, 'scan_cta');
    expect(scanCtaBucket).toEqual({
      limit: 1,
      used_count: 1,
      available: 0,
      next_recharge_at: '2026-05-27T12:00:00.000Z',
      window_seconds: 86400,
    });
  });
});

describe('getCoachQuotaBucketKeyFromError', () => {
  function buildQuotaError(details: Record<string, unknown>): CoachServiceError {
    return new CoachServiceError('quota', {
      functionName: 'coach-generate-response',
      code: 'coach_quota_exhausted',
      status: 429,
      details,
    });
  }

  it('reads quota_bucket from the error details when present', () => {
    expect(
      getCoachQuotaBucketKeyFromError(
        buildQuotaError({ quota_bucket: 'scan_cta' }),
      ),
    ).toBe('scan_cta');
    expect(
      getCoachQuotaBucketKeyFromError(
        buildQuotaError({ quota_bucket: 'general' }),
      ),
    ).toBe('general');
  });

  it('falls back to deriving from quota_source if quota_bucket is missing', () => {
    expect(
      getCoachQuotaBucketKeyFromError(
        buildQuotaError({ quota_source: 'coach_scan_cta_generation' }),
      ),
    ).toBe('scan_cta');
    expect(
      getCoachQuotaBucketKeyFromError(
        buildQuotaError({ quota_source: 'coach_scan_cta_cache' }),
      ),
    ).toBe('scan_cta');
    expect(
      getCoachQuotaBucketKeyFromError(
        buildQuotaError({ quota_source: 'coach_generation' }),
      ),
    ).toBe('general');
    expect(
      getCoachQuotaBucketKeyFromError(
        buildQuotaError({ quota_source: 'coach_cache' }),
      ),
    ).toBe('general');
  });

  it('returns null on non-Coach errors or empty details', () => {
    expect(getCoachQuotaBucketKeyFromError(new Error('boom'))).toBeNull();
    expect(getCoachQuotaBucketKeyFromError(null)).toBeNull();
    expect(getCoachQuotaBucketKeyFromError(buildQuotaError({}))).toBeNull();
  });
});

// ===========================================================================
// UI gating scenarios (H20–H22). These tests chain the helpers the way
// CoachScreen does, so a regression in the screen wiring would be caught
// without having to bootstrap a full React tree.
// ===========================================================================

describe('UI gating scenarios — CoachScreen helpers integration', () => {
  function snapshotFromBuckets(opts: {
    accountTier: 'free' | 'premium' | 'admin';
    generalAvailable: number;
    generalNextRecharge: string | null;
    scanCtaAvailable: number;
    scanCtaNextRecharge: string | null;
    perBucketLimit?: number;
  }) {
    const limit = opts.perBucketLimit ?? 1;
    return parseCoachQuotaStatus({
      account_tier: opts.accountTier,
      limit,
      used_count: Math.max(0, limit - opts.generalAvailable),
      available: opts.generalAvailable,
      next_recharge_at: opts.generalNextRecharge,
      unlimited: false,
      window_seconds: 86400,
      as_of: '2026-05-26T12:00:00.000Z',
      buckets: {
        general: {
          limit,
          used_count: Math.max(0, limit - opts.generalAvailable),
          available: opts.generalAvailable,
          next_recharge_at: opts.generalNextRecharge,
          window_seconds: 86400,
        },
        scan_cta: {
          limit,
          used_count: Math.max(0, limit - opts.scanCtaAvailable),
          available: opts.scanCtaAvailable,
          next_recharge_at: opts.scanCtaNextRecharge,
          window_seconds: 86400,
        },
      },
    })!;
  }

  it('H20: a scanner-CTA submission (scanIntent present) maps to the scan_cta bucket', () => {
    const source = coachQuotaSourceForRequest({ hasScanIntent: true });
    expect(source).toBe('scan_cta');

    const snapshot = snapshotFromBuckets({
      accountTier: 'free',
      generalAvailable: 0,
      generalNextRecharge: '2026-05-27T08:00:00.000Z',
      scanCtaAvailable: 1,
      scanCtaNextRecharge: null,
    });
    const activeBucket = selectCoachQuotaBucket(snapshot, source);

    // The CoachScreen check `(activeBucket.available ?? 0) <= 0` resolves to
    // false here → the screen lets the auto-submit run, the request goes to
    // the server with scan_intent set, and the server reserves coach_scan_cta_*.
    expect(activeBucket?.available).toBe(1);
    // Cooldown displayed if blocked: would be null (still available).
    expect(activeBucket?.next_recharge_at).toBeNull();
  });

  it('H21: a 429 on scanner CTA must show the scan_cta cooldown WITHOUT blocking general presets', () => {
    // Free user starts with general=1/1 and scan_cta=0/1. Clicks scanner CTA,
    // server returns 429 with the scan_cta cooldown already projected.
    const previousSnapshot = snapshotFromBuckets({
      accountTier: 'free',
      generalAvailable: 1,
      generalNextRecharge: null,
      scanCtaAvailable: 0,
      scanCtaNextRecharge: '2026-05-27T12:00:00.000Z',
    });

    // Error payload as parsed from the 429 details. The server already
    // projected the scan_cta bucket into the top-level fields (so the alert
    // copy sees the right cooldown without needing to know about buckets).
    const errorQuota = parseCoachQuotaStatus({
      account_tier: 'free',
      limit: 1,
      used_count: 1,
      available: 0,
      next_recharge_at: '2026-05-27T12:00:00.000Z',
      unlimited: false,
      window_seconds: 86400,
      as_of: '2026-05-26T12:00:00.000Z',
    })!;

    const merged = mergeCoachQuotaForBucket(
      previousSnapshot,
      errorQuota,
      'scan_cta',
    );

    // The alert reads the top-level cooldown — it is the scan_cta one.
    expect(merged.next_recharge_at).toBe('2026-05-27T12:00:00.000Z');
    expect(merged.available).toBe(0);

    // CRITICAL: the general bucket is preserved with its `available: 1`.
    // A subsequent preset click must NOT be gated by the scan_cta exhaustion.
    expect(merged.buckets?.general.available).toBe(1);
    expect(merged.buckets?.general.next_recharge_at).toBeNull();

    // selectCoachQuotaBucket called for a preset click (source=general)
    // returns the still-available bucket → the screen does not block.
    const generalView = selectCoachQuotaBucket(merged, 'general');
    expect(generalView?.available).toBe(1);
  });

  it('H22: a 429 on general must show the general cooldown WITHOUT blocking a scanner CTA', () => {
    const previousSnapshot = snapshotFromBuckets({
      accountTier: 'free',
      generalAvailable: 0,
      generalNextRecharge: '2026-05-27T08:00:00.000Z',
      scanCtaAvailable: 1,
      scanCtaNextRecharge: null,
    });

    const errorQuota = parseCoachQuotaStatus({
      account_tier: 'free',
      limit: 1,
      used_count: 1,
      available: 0,
      next_recharge_at: '2026-05-27T08:00:00.000Z',
      unlimited: false,
      window_seconds: 86400,
      as_of: '2026-05-26T08:00:00.000Z',
    })!;

    const merged = mergeCoachQuotaForBucket(
      previousSnapshot,
      errorQuota,
      'general',
    );

    expect(merged.next_recharge_at).toBe('2026-05-27T08:00:00.000Z');
    expect(merged.buckets?.general.available).toBe(0);

    // The scanner CTA flow must remain unblocked.
    expect(merged.buckets?.scan_cta.available).toBe(1);
    const scanView = selectCoachQuotaBucket(merged, 'scan_cta');
    expect(scanView?.available).toBe(1);
    expect(scanView?.next_recharge_at).toBeNull();
  });

  it('handles the premium 8+8 ladder: each bucket has its own cooldown', () => {
    // Premium with general=8/8 exhausted but scan_cta=4/8 still available.
    const snapshot = snapshotFromBuckets({
      accountTier: 'premium',
      generalAvailable: 0,
      generalNextRecharge: '2026-05-27T10:00:00.000Z',
      scanCtaAvailable: 4,
      scanCtaNextRecharge: '2026-05-27T07:00:00.000Z',
      perBucketLimit: 8,
    });

    // A preset click would see general exhausted with the 10:00 cooldown.
    const generalView = selectCoachQuotaBucket(snapshot, 'general');
    expect(generalView?.available).toBe(0);
    expect(generalView?.next_recharge_at).toBe('2026-05-27T10:00:00.000Z');

    // A scanner CTA click sees scan_cta still has 4 slots, with the earlier
    // 07:00 recharge anchored on the OLDEST consumed event.
    const scanView = selectCoachQuotaBucket(snapshot, 'scan_cta');
    expect(scanView?.available).toBe(4);
    expect(scanView?.next_recharge_at).toBe('2026-05-27T07:00:00.000Z');
  });
});

describe('mergeCoachQuotaForBucket', () => {
  it('preserves the other bucket from the previous snapshot when the error only carries the consumed one', () => {
    const previous = FRESH_FREE_QUOTA();
    expect(previous.buckets?.scan_cta.available).toBe(1);
    expect(previous.buckets?.general.available).toBe(1);

    // A 429 came back from a scan_cta exhaustion — the error quota was
    // already projected onto scan_cta by the server (top-level fields == the
    // scan_cta cooldown). The parsed status synthesizes the general bucket
    // from top-level too (so its `general.available` looks like 0 in the
    // error payload), but the SNAPSHOT still knows general has 1 slot.
    const fromError = parseCoachQuotaStatus({
      account_tier: 'free',
      limit: 1,
      used_count: 1,
      available: 0,
      next_recharge_at: '2026-05-27T12:00:00.000Z',
      unlimited: false,
      window_seconds: 86400,
      as_of: '2026-05-26T12:00:00.000Z',
    })!;

    const merged = mergeCoachQuotaForBucket(previous, fromError, 'scan_cta');

    // scan_cta: updated from error (now exhausted with the cooldown).
    expect(merged.buckets?.scan_cta).toEqual({
      limit: 1,
      used_count: 1,
      available: 0,
      next_recharge_at: '2026-05-27T12:00:00.000Z',
      window_seconds: 86400,
    });
    // general: preserved from previous snapshot — still has 1 slot.
    expect(merged.buckets?.general).toEqual(previous.buckets!.general);
    expect(merged.buckets?.general.available).toBe(1);
    // Top-level mirrors the consumed bucket (the server's projection
    // contract). The alert "next request in X" reads this and sees the
    // scan_cta cooldown.
    expect(merged.next_recharge_at).toBe('2026-05-27T12:00:00.000Z');
    expect(merged.available).toBe(0);
  });

  it('updates the general bucket when general is the exhausted one', () => {
    const previous = FRESH_FREE_QUOTA();
    const fromError = parseCoachQuotaStatus({
      account_tier: 'free',
      limit: 1,
      used_count: 1,
      available: 0,
      next_recharge_at: '2026-05-27T08:00:00.000Z',
      unlimited: false,
      window_seconds: 86400,
      as_of: '2026-05-26T08:00:00.000Z',
    })!;

    const merged = mergeCoachQuotaForBucket(previous, fromError, 'general');

    expect(merged.buckets?.general.available).toBe(0);
    expect(merged.buckets?.general.next_recharge_at).toBe(
      '2026-05-27T08:00:00.000Z',
    );
    expect(merged.buckets?.scan_cta).toEqual(previous.buckets!.scan_cta);
  });
});
