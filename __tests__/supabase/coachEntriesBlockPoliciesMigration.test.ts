import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = process.cwd();
const MIGRATION_PATH = path.join(
  REPO_ROOT,
  'supabase',
  'migrations',
  '20260520180200_add_coach_entries_block_policies.sql',
);

function readMigrationSource() {
  return fs.readFileSync(MIGRATION_PATH, 'utf8');
}

describe('coach_entries BLOCK policies migration (C-06 backport)', () => {
  it('keeps the existing SELECT policy intact (no DROP on it)', () => {
    const sql = readMigrationSource();
    expect(sql).not.toMatch(/DROP POLICY[^;]*Authenticated users can view own coach entries/);
    expect(sql).not.toMatch(/coach_entries_owner_select/);
  });

  it('blocks INSERT for authenticated with WITH CHECK (false)', () => {
    const sql = readMigrationSource();
    expect(sql).toContain('DROP POLICY IF EXISTS "coach_entries_block_insert"');
    expect(sql).toMatch(
      /CREATE POLICY "coach_entries_block_insert"[\s\S]+FOR INSERT[\s\S]+TO authenticated[\s\S]+WITH CHECK \(false\)/,
    );
  });

  it('blocks UPDATE for authenticated with USING (false) AND WITH CHECK (false)', () => {
    const sql = readMigrationSource();
    expect(sql).toContain('DROP POLICY IF EXISTS "coach_entries_block_update"');
    expect(sql).toMatch(
      /CREATE POLICY "coach_entries_block_update"[\s\S]+FOR UPDATE[\s\S]+TO authenticated[\s\S]+USING \(false\)[\s\S]+WITH CHECK \(false\)/,
    );
  });

  it('blocks DELETE for authenticated with USING (false)', () => {
    const sql = readMigrationSource();
    expect(sql).toContain('DROP POLICY IF EXISTS "coach_entries_block_delete"');
    expect(sql).toMatch(
      /CREATE POLICY "coach_entries_block_delete"[\s\S]+FOR DELETE[\s\S]+TO authenticated[\s\S]+USING \(false\)/,
    );
  });

  it('revokes INSERT/UPDATE/DELETE from authenticated as redundant defense-in-depth', () => {
    const sql = readMigrationSource();
    expect(sql).toContain(
      'REVOKE INSERT, UPDATE, DELETE ON TABLE public.coach_entries FROM authenticated',
    );
  });

  it('asks PostgREST to reload its schema cache after the change', () => {
    const sql = readMigrationSource();
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'");
  });

  it('does not REVOKE or drop SELECT', () => {
    const sql = readMigrationSource();
    expect(sql).not.toMatch(/REVOKE SELECT/);
    expect(sql).not.toMatch(/REVOKE ALL/);
  });
});
