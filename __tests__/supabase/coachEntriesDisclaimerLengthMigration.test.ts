import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = process.cwd();
const MIGRATION_PATH = path.join(
  REPO_ROOT,
  'supabase',
  'migrations',
  '20260520180000_add_coach_entries_disclaimer_length_check.sql',
);

function readMigrationSource() {
  return fs.readFileSync(MIGRATION_PATH, 'utf8');
}

describe('coach_entries disclaimer length check migration (C-09)', () => {
  it('drops the existing constraint before re-adding it to stay idempotent', () => {
    const sql = readMigrationSource();
    expect(sql).toContain(
      'DROP CONSTRAINT IF EXISTS coach_entries_disclaimer_length_check',
    );
  });

  it('adds the disclaimer length check capping at 1000 chars and allowing NULL', () => {
    const sql = readMigrationSource();
    expect(sql).toContain('ADD CONSTRAINT coach_entries_disclaimer_length_check');
    expect(sql).toContain('disclaimer IS NULL');
    expect(sql).toContain('char_length(disclaimer) <= 1000');
  });

  it('does not drop or alter unrelated coach_entries constraints', () => {
    const sql = readMigrationSource();
    expect(sql).not.toMatch(/DROP CONSTRAINT IF EXISTS coach_entries_status_check/);
    expect(sql).not.toMatch(/DROP CONSTRAINT IF EXISTS coach_entries_user_cache_key_unique/);
    expect(sql).not.toMatch(/DROP CONSTRAINT IF EXISTS coach_entries_persona_key_check/);
  });

  it('asks PostgREST to reload its schema cache after the change', () => {
    const sql = readMigrationSource();
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'");
  });
});
