import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = process.cwd();
const MIGRATION_PATH = path.join(
  REPO_ROOT,
  'supabase',
  'migrations',
  '20260520180500_add_coach_snapshot_rate_limit.sql',
);

function readMigrationSource() {
  return fs.readFileSync(MIGRATION_PATH, 'utf8');
}

describe('coach-screen-snapshot rate limit migration (N-D)', () => {
  it('creates a dedicated attempts table with no client RLS policies', () => {
    const sql = readMigrationSource();
    expect(sql).toContain(
      'CREATE TABLE IF NOT EXISTS public.coach_snapshot_attempts',
    );
    expect(sql).toContain(
      'ALTER TABLE public.coach_snapshot_attempts ENABLE ROW LEVEL SECURITY',
    );
    expect(sql).not.toContain('CREATE POLICY');
  });

  it('exposes record_coach_snapshot_attempt with generous defaults (30/600/2000)', () => {
    const sql = readMigrationSource();
    expect(sql).toContain(
      'CREATE OR REPLACE FUNCTION public.record_coach_snapshot_attempt(',
    );
    expect(sql).toContain('p_per_minute integer DEFAULT 30');
    expect(sql).toContain('p_per_hour integer DEFAULT 600');
    expect(sql).toContain('p_per_day integer DEFAULT 2000');
  });

  it('uses sliding 1-minute / 1-hour / 1-day windows', () => {
    const sql = readMigrationSource();
    expect(sql).toContain("attempted_at > v_now - interval '1 minute'");
    expect(sql).toContain("attempted_at > v_now - interval '1 hour'");
    expect(sql).toContain("attempted_at > v_now - interval '1 day'");
  });

  it('returns {allowed: false, window_exceeded: ...} when over budget', () => {
    const sql = readMigrationSource();
    expect(sql).toContain("'allowed', false");
    expect(sql).toContain("'window_exceeded'");
  });

  it('only grants EXECUTE to service_role, never to authenticated', () => {
    const sql = readMigrationSource();
    expect(sql).toContain(
      'REVOKE EXECUTE ON FUNCTION public.record_coach_snapshot_attempt(uuid, integer, integer, integer) FROM PUBLIC',
    );
    expect(sql).toContain(
      'GRANT EXECUTE ON FUNCTION public.record_coach_snapshot_attempt(uuid, integer, integer, integer) TO service_role',
    );
    expect(sql).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.record_coach_snapshot_attempt[\s\S]*TO authenticated/,
    );
  });

  it('is SECURITY DEFINER with a fixed search_path', () => {
    const sql = readMigrationSource();
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain('SET search_path = public');
  });

  it('garbage-collects attempts older than 25 hours per user', () => {
    const sql = readMigrationSource();
    expect(sql).toContain(
      "DELETE FROM public.coach_snapshot_attempts",
    );
    expect(sql).toContain("attempted_at < v_now - interval '25 hours'");
  });
});
