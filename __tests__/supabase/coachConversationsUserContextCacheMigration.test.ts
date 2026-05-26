import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = process.cwd();

const MIGRATION_PATH = path.join(
  REPO_ROOT,
  'supabase',
  'migrations',
  '20260520220000_add_coach_conversations_user_context_cache.sql',
);

function readSource(target: string): string {
  return fs.readFileSync(target, 'utf8');
}

describe('coach_conversations user_context cache migration', () => {
  const source = readSource(MIGRATION_PATH);

  it('adds the three cache columns idempotently', () => {
    expect(source).toMatch(/ADD COLUMN IF NOT EXISTS user_context_snapshot_json jsonb/);
    expect(source).toMatch(/ADD COLUMN IF NOT EXISTS user_context_built_at timestamptz/);
    expect(source).toMatch(/ADD COLUMN IF NOT EXISTS user_context_built_for_scan_id uuid/);
  });

  it('caps the snapshot at 32 KB via a CHECK constraint', () => {
    expect(source).toContain('coach_conversations_user_context_size_check');
    expect(source).toMatch(/octet_length\(user_context_snapshot_json::text\)\s*<=\s*32768/);
    expect(source).toMatch(/user_context_snapshot_json IS NULL\s+OR/);
  });

  it('drops the constraint first to stay idempotent', () => {
    expect(source).toContain('DROP CONSTRAINT IF EXISTS coach_conversations_user_context_size_check');
  });

  it('creates a partial index on user_context_built_at', () => {
    expect(source).toContain('idx_coach_conversations_user_ctx_built_at');
    expect(source).toMatch(/WHERE user_context_built_at IS NOT NULL/);
  });

  it('notifies pgrst to reload the schema cache', () => {
    expect(source).toContain("NOTIFY pgrst, 'reload schema'");
  });

  it('does not add any new RLS policy (cache columns inherit existing service_role write policy)', () => {
    expect(source).not.toMatch(/CREATE POLICY/);
    expect(source).not.toMatch(/ENABLE ROW LEVEL SECURITY/);
  });
});
