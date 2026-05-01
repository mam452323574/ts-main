import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = process.cwd();
const MIGRATION_PATH = path.join(
  REPO_ROOT,
  'supabase',
  'migrations',
  '20260417190000_fix_social_reaction_rpc_ambiguity.sql',
);
const COMMENT_LIKE_FIX_MIGRATION_PATH = path.join(
  REPO_ROOT,
  'supabase',
  'migrations',
  '20260429110000_harden_social_comment_like_rpc.sql',
);

function readMigrationSource(migrationPath = MIGRATION_PATH) {
  return fs.readFileSync(migrationPath, 'utf8');
}

describe('social reaction RPC ambiguity migration', () => {
  it('pins the upserts to named constraints so RETURNS TABLE output variables cannot collide', () => {
    const migrationSource = readMigrationSource();

    expect(migrationSource).toContain(
      'ON CONFLICT ON CONSTRAINT social_post_likes_post_user_unique DO UPDATE',
    );
    expect(migrationSource).toContain(
      'ON CONFLICT ON CONSTRAINT social_comment_likes_comment_user_unique DO UPDATE',
    );
    expect(migrationSource).not.toContain('ON CONFLICT (post_id, user_id)');
    expect(migrationSource).not.toContain('ON CONFLICT (comment_id, user_id)');
  });

  it('returns explicitly aliased contract columns for both RPCs', () => {
    const migrationSource = readMigrationSource();

    expect(migrationSource).toContain('target_post.id AS post_id');
    expect(migrationSource).toContain('normalized_reaction AS viewer_reaction');
    expect(migrationSource).toContain('COALESCE(target_post.like_count, 0) AS like_count');
    expect(migrationSource).toContain(
      'COALESCE(target_post.dislike_count, 0) AS dislike_count',
    );
    expect(migrationSource).toContain('target_comment.id AS comment_id');
    expect(migrationSource).toContain(') AS viewer_has_liked,');
    expect(migrationSource).toContain(
      'COALESCE(target_comment.like_count, 0) AS like_count',
    );
  });

  it('keeps the latest social comment like RPC pinned to the named unique constraint', () => {
    const migrationSource = readMigrationSource(COMMENT_LIKE_FIX_MIGRATION_PATH);

    expect(migrationSource).toContain(
      'CREATE OR REPLACE FUNCTION public.set_social_comment_like',
    );
    expect(migrationSource).toContain(
      'ON CONFLICT ON CONSTRAINT social_comment_likes_comment_user_unique DO UPDATE',
    );
    expect(migrationSource).not.toContain('ON CONFLICT (comment_id, user_id)');
    expect(migrationSource).toContain(
      'CONSTRAINT social_comment_likes_comment_user_unique',
    );
    expect(migrationSource).toContain(
      'REVOKE INSERT, UPDATE, DELETE ON public.social_comment_likes FROM authenticated',
    );
    expect(migrationSource).toContain('target_comment.id AS comment_id');
    expect(migrationSource).toContain(') AS viewer_has_liked,');
    expect(migrationSource).toContain(
      'GREATEST(COALESCE(target_comment.like_count, 0), 0) AS like_count',
    );
    expect(migrationSource).toContain("SELECT pg_notify('pgrst', 'reload schema')");
    expect(migrationSource).not.toMatch(/account_tier|premium|admin/i);
  });
});
