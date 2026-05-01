import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = process.cwd();
const MIGRATION_PATH = path.join(
  REPO_ROOT,
  'supabase',
  'migrations',
  '20260428180000_add_coach_usage_quota.sql',
);

function readMigrationSource() {
  return fs.readFileSync(MIGRATION_PATH, 'utf8');
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
