import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = process.cwd();
const MIGRATION_PATH = path.join(
  REPO_ROOT,
  'supabase',
  'migrations',
  '20260526160000_release_stuck_coach_pending_entries.sql',
);

function readMigrationSource() {
  return fs.readFileSync(MIGRATION_PATH, 'utf8');
}

describe('release_stuck_coach_pending_entries migration', () => {
  it('declares the RPC with an integer cutoff parameter defaulting to 10 minutes', () => {
    const sql = readMigrationSource();

    expect(sql).toContain(
      'CREATE OR REPLACE FUNCTION public.release_stuck_coach_pending_entries(',
    );
    expect(sql).toContain('p_max_age_minutes integer DEFAULT 10');
    expect(sql).toContain('RETURNS jsonb');
    expect(sql).toContain('SECURITY DEFINER');
  });

  it('refunds coach_usage_events linked to stuck pending entries (status accepted → refunded)', () => {
    const sql = readMigrationSource();

    // Refund step targets coach_usage_events with status='accepted' linked to
    // a stuck pending entry — and writes a typed refund_reason for ops.
    expect(sql).toContain('UPDATE public.coach_usage_events');
    expect(sql).toContain("status = 'refunded'");
    expect(sql).toContain("'refund_reason', 'coach_generation_timeout'");
    expect(sql).toContain("evt.status = 'accepted'");
  });

  it('flips stuck entries to status=error with the coach_generation_timeout code', () => {
    const sql = readMigrationSource();

    expect(sql).toContain('UPDATE public.coach_entries');
    expect(sql).toContain("status = 'error'");
    expect(sql).toContain("error_code = 'coach_generation_timeout'");
    expect(sql).toContain("status = 'pending'");
    // The cutoff is computed from p_max_age_minutes via make_interval and
    // applied with `created_at < v_cutoff` so the filter is age-based.
    expect(sql).toContain('make_interval(mins => p_max_age_minutes)');
    expect(sql).toContain('created_at < v_cutoff');
  });

  it('is idempotent by construction — predicates skip already-processed rows', () => {
    const sql = readMigrationSource();

    // The entry update only touches status='pending' rows; if a previous
    // sweep already flipped them to 'error' (or a happy-path background task
    // wrote 'ready'), the predicate filters them out → no double work.
    // The event refund only touches status='accepted' rows; already-refunded
    // rows are skipped.
    expect(sql).toContain("WHERE status = 'pending'");
    expect(sql).toContain("WHERE evt.status = 'accepted'");
  });

  it('returns a jsonb summary with released_count and refunded_count for observability', () => {
    const sql = readMigrationSource();

    expect(sql).toContain("'released_count', v_released_count");
    expect(sql).toContain("'refunded_count', v_refunded_count");
    expect(sql).toContain("'cutoff_at'");
    expect(sql).toContain("'ran_at'");
  });

  it('rejects a non-positive cutoff so a misuse can never refund every event', () => {
    const sql = readMigrationSource();

    expect(sql).toContain('p_max_age_minutes IS NULL OR p_max_age_minutes < 1');
    expect(sql).toContain('RAISE EXCEPTION');
  });

  it('is service-role only — no PUBLIC grant', () => {
    const sql = readMigrationSource();

    expect(sql).toContain(
      'REVOKE ALL ON FUNCTION public.release_stuck_coach_pending_entries(integer) FROM PUBLIC',
    );
    expect(sql).toContain(
      'GRANT EXECUTE ON FUNCTION public.release_stuck_coach_pending_entries(integer) TO service_role',
    );
  });

  it('schedules an idempotent pg_cron job with a graceful fallback', () => {
    const sql = readMigrationSource();

    // Mirrors the pattern in 20260524130000_social_feed_health_cron.sql: the
    // schedule block is guarded by pg_extension lookup, the previous job is
    // unscheduled before being re-scheduled (idempotent), and a notice is
    // emitted when pg_cron is missing so operators can wire an external cron.
    expect(sql).toContain("FROM pg_extension WHERE extname = 'pg_cron'");
    expect(sql).toContain("WHERE jobname = 'release_stuck_coach_pending_entries'");
    expect(sql).toContain('cron.unschedule');
    expect(sql).toContain('cron.schedule');
    expect(sql).toContain("'*/5 * * * *'");
    expect(sql).toContain('RAISE NOTICE');
  });

  it('reloads PostgREST schema cache after the migration commits', () => {
    const sql = readMigrationSource();

    expect(sql).toContain("NOTIFY pgrst, 'reload schema'");
  });
});
