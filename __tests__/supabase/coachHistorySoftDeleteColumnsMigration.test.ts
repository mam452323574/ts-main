import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = process.cwd();
const COLUMNS_MIGRATION_PATH = path.join(
  REPO_ROOT,
  'supabase',
  'migrations',
  '20260527120000_add_coach_history_soft_delete_columns.sql',
);

function read(p: string) {
  return fs.readFileSync(p, 'utf8');
}

describe('coach soft-delete columns migration', () => {
  const sql = read(COLUMNS_MIGRATION_PATH);

  it('adds deleted_at to coach_entries (idempotent)', () => {
    expect(sql).toMatch(
      /ALTER TABLE public\.coach_entries\s+ADD COLUMN IF NOT EXISTS deleted_at timestamptz/,
    );
  });

  it('adds hidden_at to coach_conversations (idempotent)', () => {
    expect(sql).toMatch(
      /ALTER TABLE public\.coach_conversations\s+ADD COLUMN IF NOT EXISTS hidden_at timestamptz/,
    );
  });

  it('drops the legacy cache_key UNIQUE constraint so soft-deletes do not block regeneration', () => {
    expect(sql).toMatch(
      /DROP CONSTRAINT IF EXISTS coach_entries_user_cache_key_unique/,
    );
  });

  it('replaces it with a partial UNIQUE index restricted to live rows', () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS coach_entries_user_cache_key_active_unique[\s\S]*?WHERE deleted_at IS NULL/,
    );
  });

  it('adds the unified-history sort indexes for both tables', () => {
    expect(sql).toContain('idx_coach_entries_history_active_sort');
    expect(sql).toContain('idx_coach_conversations_user_visible_updated_at');
    expect(sql).toContain('idx_coach_conversations_user_visible_activity');
  });

  it('backfills hidden_at from the legacy archived_at value', () => {
    // The unified-history filter switches from "status <> archived" to
    // "hidden_at IS NULL". Without this backfill, previously archived
    // conversations would suddenly reappear in the user history.
    expect(sql).toMatch(
      /UPDATE public\.coach_conversations\s+SET hidden_at = COALESCE\(archived_at, updated_at\)[\s\S]+WHERE status = 'archived'\s+AND hidden_at IS NULL/,
    );
  });

  it('wraps the schema mutation in a BEGIN/COMMIT block', () => {
    expect(sql).toContain('BEGIN;');
    expect(sql).toContain('COMMIT;');
  });

  it('reloads the PostgREST schema cache so the new columns are immediately queryable', () => {
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'");
  });
});
