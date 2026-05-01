import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = process.cwd();
const MIGRATION_PATH = path.join(
  REPO_ROOT,
  'supabase',
  'migrations',
  '20260428233000_scanner_quota_countdown_contract.sql',
);

function readMigrationSource() {
  return fs.readFileSync(MIGRATION_PATH, 'utf8');
}

describe('scan quota recharge metadata migration', () => {
  it('returns server-anchored recharge metadata from reserve_scan_quota', () => {
    const migrationSource = readMigrationSource();

    expect(migrationSource).toContain('CREATE OR REPLACE FUNCTION public.reserve_scan_quota');
    expect(migrationSource).toContain("'next_recharge_at'");
    expect(migrationSource).toContain("'nextRechargeAt'");
    expect(migrationSource).toContain("'server_now_ms'");
    expect(migrationSource).toContain("'next_available_date'");
    expect(migrationSource).toContain("'used'");
    expect(migrationSource).toContain("'available'");
    expect(migrationSource).toContain("v_now - interval '24 hours'");
    expect(migrationSource).toContain("v_oldest::timestamptz + interval '24 hours'");
  });

  it('does not let check_only bypass exhausted quotas', () => {
    const migrationSource = readMigrationSource();

    expect(migrationSource).toContain('v_check_allowed := v_has_quota_slot OR v_has_welcome_credit;');
    expect(migrationSource).toContain('IF NOT v_check_allowed THEN');
    expect(migrationSource).toContain("'allowed', false");
    expect(migrationSource).toContain("'allowed', true");
    expect(migrationSource).not.toContain("'allowed', true,\n      'message', CASE WHEN v_welcome_credit_count > 0");
  });

  it('keeps the RPC service-role only and reloads PostgREST schema', () => {
    const migrationSource = readMigrationSource();

    expect(migrationSource).toContain(
      'REVOKE ALL ON FUNCTION public.reserve_scan_quota(uuid, text, boolean) FROM PUBLIC;',
    );
    expect(migrationSource).toContain(
      'GRANT EXECUTE ON FUNCTION public.reserve_scan_quota(uuid, text, boolean) TO service_role;',
    );
    expect(migrationSource).toContain("NOTIFY pgrst, 'reload schema';");
  });
});
