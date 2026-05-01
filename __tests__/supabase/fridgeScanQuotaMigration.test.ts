import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = process.cwd();
const MIGRATION_PATH = path.join(
  REPO_ROOT,
  'supabase',
  'migrations',
  '20260429110100_update_fridge_scan_quota_to_5.sql',
);

function readMigrationSource() {
  return fs.readFileSync(MIGRATION_PATH, 'utf8');
}

describe('fridge scan quota migration', () => {
  it('raises the server-owned Chef quota to five premium requests', () => {
    const migrationSource = readMigrationSource();

    expect(migrationSource).toContain(
      'CREATE OR REPLACE FUNCTION public.reserve_fridge_scan_quota',
    );
    expect(migrationSource).toContain('v_limit integer := 5;');
    expect(migrationSource).toContain(
      "'message_key', 'fridge_scan.limit_reached_with_time'",
    );
  });

  it('keeps free users locked, admin bypass, and rolling 24h reset behavior', () => {
    const migrationSource = readMigrationSource();

    expect(migrationSource).toContain("IF v_account_tier = 'free' THEN");
    expect(migrationSource).toContain("'code', 'fridge_scan_premium_required'");
    expect(migrationSource).toContain(
      "IF v_account_tier <> 'admin' AND v_current_count >= v_limit THEN",
    );
    expect(migrationSource).toContain(
      "'quota_bypassed', v_account_tier = 'admin'",
    );
    expect(migrationSource).toContain(
      "created_at >= v_now - interval '24 hours'",
    );
    expect(migrationSource).toContain("v_oldest + interval '24 hours'");
  });
});
