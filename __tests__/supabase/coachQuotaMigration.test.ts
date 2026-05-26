import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = process.cwd();
const MIGRATION_PATH = path.join(
  REPO_ROOT,
  'supabase',
  'migrations',
  '20260428180000_add_coach_usage_quota.sql',
);
const SPLIT_BUCKETS_MIGRATION_PATH = path.join(
  REPO_ROOT,
  'supabase',
  'migrations',
  '20260526120000_split_coach_quota_buckets.sql',
);

function readMigrationSource() {
  return fs.readFileSync(MIGRATION_PATH, 'utf8');
}

function readSplitBucketsMigrationSource() {
  return fs.readFileSync(SPLIT_BUCKETS_MIGRATION_PATH, 'utf8');
}

describe('coach quota migration', () => {
  it('adds a server-owned Coach usage event ledger with no direct client policies', () => {
    const migrationSource = readMigrationSource();

    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS public.coach_usage_events');
    expect(migrationSource).toContain('ALTER TABLE public.coach_usage_events ENABLE ROW LEVEL SECURITY;');
    expect(migrationSource).toContain('REVOKE ALL ON TABLE public.coach_usage_events FROM PUBLIC;');
    expect(migrationSource).not.toContain('CREATE POLICY');
  });

  it('models free, premium, and admin limits from account_tier', () => {
    const migrationSource = readMigrationSource();

    expect(migrationSource).toContain("WHEN account_tier IN ('premium', 'admin') THEN account_tier");
    expect(migrationSource).toContain("IF v_account_tier = 'admin' THEN");
    expect(migrationSource).toContain("'unlimited', true");
    expect(migrationSource).toContain("WHEN v_account_tier = 'premium' THEN 8");
    expect(migrationSource).toContain('ELSE 1');
  });

  it('uses a rolling 24h window and individual next recharge timestamps', () => {
    const migrationSource = readMigrationSource();

    expect(migrationSource).toContain("requested_at > (p_now - interval '24 hours')");
    expect(migrationSource).toContain("v_oldest_requested_at + interval '24 hours'");
    expect(migrationSource).toContain("'next_recharge_at'");
    expect(migrationSource).not.toContain("date_trunc('day'");
  });

  it('keeps quota reservation atomic and service-role only', () => {
    const migrationSource = readMigrationSource();

    expect(migrationSource).toContain('pg_advisory_xact_lock');
    expect(migrationSource).toContain('FOR UPDATE');
    expect(migrationSource).toContain('CREATE OR REPLACE FUNCTION public.reserve_coach_quota');
    expect(migrationSource).toContain("'code', 'coach_quota_exhausted'");
    expect(migrationSource).toContain(
      'GRANT EXECUTE ON FUNCTION public.reserve_coach_quota(uuid, text, text) TO service_role;',
    );
    expect(migrationSource).toContain("NOTIFY pgrst, 'reload schema';");
  });
});

// ===========================================================================
// 20260526120000_split_coach_quota_buckets.sql — independent quotas for the
// Coach preset flow vs the scanner-CTA flow.
// Free = 1/24h per bucket, premium = 8/24h per bucket, admin unlimited.
// ===========================================================================

describe('coach quota split-buckets migration', () => {
  it('widens the source CHECK constraint to accept the two new scan-CTA sources', () => {
    const sql = readSplitBucketsMigrationSource();

    expect(sql).toContain(
      'ALTER TABLE public.coach_usage_events\n  DROP CONSTRAINT IF EXISTS coach_usage_events_source_check;',
    );
    // All four sources must appear in the new CHECK list.
    expect(sql).toContain("'coach_generation'");
    expect(sql).toContain("'coach_cache'");
    expect(sql).toContain("'coach_scan_cta_generation'");
    expect(sql).toContain("'coach_scan_cta_cache'");
  });

  it('exposes a bucket helper that maps sources to general vs scan_cta', () => {
    const sql = readSplitBucketsMigrationSource();

    expect(sql).toContain(
      'CREATE OR REPLACE FUNCTION public.coach_quota_bucket_for_source(p_source text)',
    );
    // The historical sources stay in the general bucket — no backfill is
    // required because the function returns 'general' for everything except
    // the two new scan-CTA sources.
    expect(sql).toContain("WHEN p_source IN ('coach_scan_cta_generation', 'coach_scan_cta_cache')");
    expect(sql).toContain("THEN 'scan_cta'");
    expect(sql).toContain("ELSE 'general'");
  });

  it('build_coach_quota_status_json returns both buckets with the agreed shape', () => {
    const sql = readSplitBucketsMigrationSource();

    expect(sql).toContain(
      'CREATE OR REPLACE FUNCTION public.build_coach_quota_status_json(',
    );
    // The new structured shape: quota.buckets.{general, scan_cta}.
    expect(sql).toContain("'buckets', jsonb_build_object(");
    expect(sql).toContain("'general', v_bucket_general");
    expect(sql).toContain("'scan_cta', v_bucket_scan_cta");
    // Each bucket must carry these five fields per the contract.
    for (const field of [
      "'limit'",
      "'used_count'",
      "'available'",
      "'next_recharge_at'",
      "'window_seconds'",
    ]) {
      expect(sql).toContain(field);
    }
  });

  it('keeps top-level quota fields for backward compatibility (mirrors the general bucket)', () => {
    const sql = readSplitBucketsMigrationSource();

    // Top-level fields must still be present so clients that predate this
    // migration (e.g. older mobile builds) keep functioning.
    expect(sql).toContain("'account_tier', v_account_tier");
    expect(sql).toContain("'limit', v_limit_general");
    expect(sql).toContain("'used_count', v_used_general");
    expect(sql).toContain('v_limit_general - v_used_general');
    expect(sql).toContain("'unlimited', false");
    expect(sql).toContain("'window_seconds', 86400");
    expect(sql).toContain("'as_of', to_jsonb(p_now) #>> '{}'");
  });

  it('models the per-tier per-bucket limits (free=1, premium=8, admin unlimited)', () => {
    const sql = readSplitBucketsMigrationSource();

    expect(sql).toContain(
      "v_limit_general := CASE WHEN v_account_tier = 'premium' THEN 8 ELSE 1 END;",
    );
    // Both buckets sized identically by design.
    expect(sql).toContain('v_limit_scan_cta := v_limit_general;');
    // Admin short-circuit returns unlimited on both buckets.
    expect(sql).toContain("IF v_account_tier = 'admin' THEN");
    expect(sql).toContain("'unlimited', true");
  });

  it('keeps the rolling 24h window and per-bucket next_recharge_at math', () => {
    const sql = readSplitBucketsMigrationSource();

    expect(sql).toContain("requested_at > (p_now - interval '24 hours')");
    expect(sql).toContain('v_oldest_general + interval \'24 hours\'');
    expect(sql).toContain('v_oldest_scan_cta + interval \'24 hours\'');
    expect(sql).not.toContain("date_trunc('day'");
  });

  it('counts accepted events per bucket via the FILTER + bucket helper, ignoring refunded events', () => {
    const sql = readSplitBucketsMigrationSource();

    expect(sql).toContain(
      "FILTER (\n        WHERE public.coach_quota_bucket_for_source(source) = 'general'\n      )",
    );
    expect(sql).toContain(
      "FILTER (\n        WHERE public.coach_quota_bucket_for_source(source) = 'scan_cta'\n      )",
    );
    expect(sql).toContain("AND status = 'accepted'");
  });

  it('reserve_coach_quota routes the new sources to the scan_cta bucket and preserves the atomic lock', () => {
    const sql = readSplitBucketsMigrationSource();

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.reserve_coach_quota(');
    // The source whitelist inside the RPC matches the new CHECK constraint.
    expect(sql).toContain(
      "IF p_source NOT IN (\n    'coach_generation',\n    'coach_cache',\n    'coach_scan_cta_generation',\n    'coach_scan_cta_cache'\n  ) THEN",
    );
    // Same atomic-locking semantics as the original migration.
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toContain('FOR UPDATE');
    // Bucket selection happens inside the critical section.
    expect(sql).toContain(
      "v_bucket_key := public.coach_quota_bucket_for_source(p_source);",
    );
    expect(sql).toContain("v_bucket_status := v_status -> 'buckets' -> v_bucket_key;");
    expect(sql).toContain("'code', 'coach_quota_exhausted'");
  });

  it('attach_coach_quota_event accepts the two new sources (still bucket-agnostic by id)', () => {
    const sql = readSplitBucketsMigrationSource();

    expect(sql).toContain(
      'CREATE OR REPLACE FUNCTION public.attach_coach_quota_event(',
    );
    expect(sql).toContain(
      "IF p_source IS NOT NULL AND p_source NOT IN (\n    'coach_generation',\n    'coach_cache',\n    'coach_scan_cta_generation',\n    'coach_scan_cta_cache'\n  ) THEN",
    );
  });

  it('refund_coach_quota_event stays bucket-agnostic — refunds restore the correct bucket via source', () => {
    const sql = readSplitBucketsMigrationSource();

    // Refund flips a single row by id to status='refunded'. Because bucket
    // membership is derived from `source` (never stored), refunding a
    // scan_cta event automatically credits back the scan_cta bucket and
    // never the general bucket — no special-casing required.
    expect(sql).toContain(
      'CREATE OR REPLACE FUNCTION public.refund_coach_quota_event(',
    );
    expect(sql).toContain("SET\n    status = 'refunded'");
    expect(sql).toContain("AND status = 'accepted'");

    // Slice the actual function body (from its CREATE to the matching $$;)
    // so we don't accidentally include the surrounding helpers like
    // build_coach_quota_status_json which legitimately mention 'buckets'.
    const refundCreateIdx = sql.indexOf(
      'CREATE OR REPLACE FUNCTION public.refund_coach_quota_event(',
    );
    const refundBodyStart = sql.indexOf('AS $$', refundCreateIdx);
    const refundBodyEnd = sql.indexOf('$$;', refundBodyStart);
    expect(refundBodyStart).toBeGreaterThan(refundCreateIdx);
    expect(refundBodyEnd).toBeGreaterThan(refundBodyStart);
    const refundBody = sql.slice(refundBodyStart, refundBodyEnd);

    // The function body must not branch on, look up, or even mention bucket
    // logic — it operates purely on a single event row by id.
    expect(refundBody).not.toMatch(/bucket/i);
  });

  it('keeps every RPC service_role only (no PUBLIC grants leaked)', () => {
    const sql = readSplitBucketsMigrationSource();

    for (const fn of [
      'coach_quota_bucket_for_source(text)',
      'build_coach_quota_status_json(uuid, timestamptz)',
      'reserve_coach_quota(uuid, text, text)',
      'attach_coach_quota_event(uuid, uuid, uuid, text)',
      'refund_coach_quota_event(uuid, uuid, text)',
    ]) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${fn} FROM PUBLIC;`);
      expect(sql).toContain(
        `GRANT EXECUTE ON FUNCTION public.${fn} TO service_role;`,
      );
    }
    expect(sql).toContain("NOTIFY pgrst, 'reload schema';");
  });

  it('does not create a new table or backfill historical events', () => {
    const sql = readSplitBucketsMigrationSource();

    // The plan is to extend an existing table — no new tables introduced.
    expect(sql).not.toMatch(/CREATE TABLE/);
    // Historical events with source='coach_generation'|'coach_cache' must
    // continue to live in coach_usage_events untouched. The only acceptable
    // INSERT into coach_usage_events is the one inside reserve_coach_quota
    // that creates the *new* event for the current reservation — that is the
    // existing contract, not a backfill. Reject any top-level UPDATE rewrite
    // of the source column (which would be the canonical backfill shape).
    expect(sql).not.toMatch(/UPDATE\s+public\.coach_usage_events\s+SET\s+source/i);
    // Reject the canonical "INSERT ... SELECT ... FROM coach_usage_events"
    // shape that would copy historical rows under new sources.
    expect(sql).not.toMatch(
      /INSERT\s+INTO\s+public\.coach_usage_events[\s\S]{0,200}SELECT/i,
    );
  });
});
