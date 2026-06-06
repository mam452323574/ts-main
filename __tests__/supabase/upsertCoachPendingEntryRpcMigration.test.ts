import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = process.cwd();
const RPC_MIGRATION_PATH = path.join(
  REPO_ROOT,
  'supabase',
  'migrations',
  '20260527130000_add_upsert_coach_pending_entry_rpc.sql',
);
const PARTIAL_INDEX_MIGRATION_PATH = path.join(
  REPO_ROOT,
  'supabase',
  'migrations',
  '20260527120000_add_coach_history_soft_delete_columns.sql',
);

function read(p: string) {
  return fs.readFileSync(p, 'utf8');
}

describe('upsert_coach_pending_entry RPC migration', () => {
  const sql = read(RPC_MIGRATION_PATH);

  it('runs after the partial-index migration (timestamp ordering)', () => {
    // The RPC depends on the partial unique index created earlier the same day.
    expect(PARTIAL_INDEX_MIGRATION_PATH < RPC_MIGRATION_PATH).toBe(true);
  });

  it('defines the upsert RPC with the expected signature and return type', () => {
    expect(sql).toContain(
      'CREATE OR REPLACE FUNCTION public.upsert_coach_pending_entry(',
    );
    expect(sql).toContain('p_user_id uuid');
    expect(sql).toContain('p_cache_key text');
    expect(sql).toContain('p_values jsonb');
    expect(sql).toContain('RETURNS public.coach_entries');
  });

  it('is SECURITY DEFINER with a pinned search_path', () => {
    const block = sql.match(
      /CREATE OR REPLACE FUNCTION public\.upsert_coach_pending_entry[\s\S]+?\$\$;/,
    )?.[0];
    expect(block).toContain('SECURITY DEFINER');
    expect(block).toContain('SET search_path = public, auth');
  });

  it('targets the partial unique index via WHERE deleted_at IS NULL (the bug fix)', () => {
    // This is the entire point of the migration. PostgREST's .upsert() cannot
    // pass this WHERE predicate, which is why we had to introduce a dedicated
    // RPC. Without this exact clause PostgreSQL falls back to 42P10
    // (invalid_column_reference) on every call.
    expect(sql).toMatch(
      /ON CONFLICT \(user_id, cache_key\) WHERE deleted_at IS NULL/,
    );
  });

  it('never resurrects soft-deleted rows (no UPDATE of deleted_at)', () => {
    const block = sql.match(
      /CREATE OR REPLACE FUNCTION public\.upsert_coach_pending_entry[\s\S]+?\$\$;/,
    )?.[0];
    // The DO UPDATE SET block must not touch deleted_at — a soft-deleted row
    // is filtered out by the partial-index WHERE clause and a brand new active
    // row is INSERTed instead.
    expect(block).not.toMatch(/deleted_at\s*=/);
  });

  it('validates inputs and raises invalid_argument on null parameters', () => {
    const block = sql.match(
      /CREATE OR REPLACE FUNCTION public\.upsert_coach_pending_entry[\s\S]+?\$\$;/,
    )?.[0];
    expect(block).toMatch(
      /IF p_user_id IS NULL OR p_cache_key IS NULL OR p_values IS NULL THEN/,
    );
    expect(block).toContain("USING ERRCODE = '22023'");
  });

  it('refreshes updated_at on conflict', () => {
    const block = sql.match(
      /CREATE OR REPLACE FUNCTION public\.upsert_coach_pending_entry[\s\S]+?\$\$;/,
    )?.[0];
    expect(block).toMatch(/updated_at\s*=\s*now\(\)/);
  });

  describe('grants', () => {
    it('revokes execute from PUBLIC', () => {
      expect(sql).toContain(
        'REVOKE EXECUTE ON FUNCTION public.upsert_coach_pending_entry(uuid, text, jsonb) FROM PUBLIC',
      );
    });

    it('grants execute to service_role only (matches sibling delete_coach_entry RPC pattern)', () => {
      expect(sql).toContain(
        'GRANT EXECUTE ON FUNCTION public.upsert_coach_pending_entry(uuid, text, jsonb) TO service_role',
      );
      expect(sql).not.toMatch(
        /GRANT EXECUTE ON FUNCTION public\.upsert_coach_pending_entry[\s\S]+TO authenticated/,
      );
    });
  });

  it('reloads the PostgREST schema cache so the new RPC is immediately callable', () => {
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'");
  });
});
