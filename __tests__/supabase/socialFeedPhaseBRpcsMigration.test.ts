import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = process.cwd();
const MIGRATION_PATH = path.join(
  REPO_ROOT,
  'supabase',
  'migrations',
  '20260518130000_social_phase_b_rpcs.sql',
);

function readMigration(p: string) {
  return fs.readFileSync(p, 'utf8');
}

describe('social Phase B RPCs migration', () => {
  const sql = readMigration(MIGRATION_PATH);

  describe('set_social_follow', () => {
    it('is created with SECURITY INVOKER and an explicit search_path', () => {
      expect(sql).toContain(
        'CREATE OR REPLACE FUNCTION public.set_social_follow',
      );
      expect(sql).toMatch(
        /CREATE OR REPLACE FUNCTION public\.set_social_follow[\s\S]+?SECURITY INVOKER\s*\n\s*SET search_path = public, auth/,
      );
    });

    it('rejects unauthenticated calls and missing/self author_id', () => {
      expect(sql).toMatch(
        /IF viewer_uid IS NULL THEN\s*\n\s*RAISE EXCEPTION 'Authentication required'/,
      );
      expect(sql).toMatch(
        /IF viewer_uid = p_author_id THEN\s*\n\s*RAISE EXCEPTION 'Cannot follow yourself'/,
      );
      expect(sql).toContain("USING ERRCODE = '22023'");
    });

    it('rejects unknown action values (only follow/unfollow/NULL allowed)', () => {
      expect(sql).toMatch(
        /normalized_action NOT IN \('follow', 'unfollow'\)/,
      );
    });

    it('toggles when action is NULL, otherwise applies the explicit state', () => {
      expect(sql).toMatch(/IF normalized_action IS NULL THEN\s*\n\s*result_following := NOT already_following/);
      expect(sql).toMatch(/ELSIF normalized_action = 'follow' THEN\s*\n\s*result_following := true/);
    });

    it('writes idempotently via INSERT ON CONFLICT DO NOTHING / DELETE', () => {
      expect(sql).toMatch(
        /INSERT INTO public\.social_follows[\s\S]+?ON CONFLICT \(follower_id, followee_id\) DO NOTHING/,
      );
      expect(sql).toMatch(
        /DELETE FROM public\.social_follows\s*\n\s*WHERE follower_id = viewer_uid AND followee_id = p_author_id/,
      );
    });

    it('returns a jsonb object with author_id and the resulting following flag', () => {
      expect(sql).toMatch(
        /RETURN jsonb_build_object\(\s*\n\s*'author_id', p_author_id,\s*\n\s*'following', result_following\s*\n\s*\)/,
      );
    });

    it('grants EXECUTE to authenticated', () => {
      expect(sql).toMatch(
        /GRANT EXECUTE ON FUNCTION public\.set_social_follow\(uuid, text\) TO authenticated/,
      );
    });
  });

  describe('set_social_hidden_author', () => {
    it('is created with SECURITY INVOKER and an explicit search_path', () => {
      expect(sql).toContain(
        'CREATE OR REPLACE FUNCTION public.set_social_hidden_author',
      );
      expect(sql).toMatch(
        /CREATE OR REPLACE FUNCTION public\.set_social_hidden_author[\s\S]+?SECURITY INVOKER\s*\n\s*SET search_path = public, auth/,
      );
    });

    it('rejects unauthenticated calls and self-hide', () => {
      expect(sql).toMatch(
        /IF viewer_uid = p_author_id THEN\s*\n\s*RAISE EXCEPTION 'Cannot hide yourself'/,
      );
    });

    it('rejects unknown action values (only hide/unhide/NULL allowed)', () => {
      expect(sql).toMatch(
        /normalized_action NOT IN \('hide', 'unhide'\)/,
      );
    });

    it('writes idempotently to social_user_hidden_authors', () => {
      expect(sql).toMatch(
        /INSERT INTO public\.social_user_hidden_authors[\s\S]+?ON CONFLICT \(viewer_id, author_id\) DO NOTHING/,
      );
      expect(sql).toMatch(
        /DELETE FROM public\.social_user_hidden_authors\s*\n\s*WHERE viewer_id = viewer_uid AND author_id = p_author_id/,
      );
    });

    it('returns a jsonb object with author_id and the resulting hidden flag', () => {
      expect(sql).toMatch(
        /RETURN jsonb_build_object\(\s*\n\s*'author_id', p_author_id,\s*\n\s*'hidden', result_hidden\s*\n\s*\)/,
      );
    });

    it('grants EXECUTE to authenticated', () => {
      expect(sql).toMatch(
        /GRANT EXECUTE ON FUNCTION public\.set_social_hidden_author\(uuid, text\) TO authenticated/,
      );
    });
  });

  it('reloads the PostgREST schema cache after creating the functions', () => {
    expect(sql).toContain("SELECT pg_notify('pgrst', 'reload schema')");
  });
});
