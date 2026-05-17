import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = process.cwd();
const MIGRATION_PATH = path.join(
  REPO_ROOT,
  'supabase',
  'migrations',
  '20260518120000_social_feed_phase_b.sql',
);

function readMigration(p: string) {
  return fs.readFileSync(p, 'utf8');
}

describe('social feed Phase B migration', () => {
  const sql = readMigration(MIGRATION_PATH);

  describe('schema additions', () => {
    it('adds unique_view_count NOT NULL DEFAULT 0 on social_posts', () => {
      expect(sql).toMatch(
        /ALTER TABLE public\.social_posts\s+ADD COLUMN IF NOT EXISTS unique_view_count integer NOT NULL DEFAULT 0/,
      );
    });

    it('creates a partial index on unique_view_count (visible posts only)', () => {
      expect(sql).toContain('idx_social_posts_unique_view_count');
      expect(sql).toMatch(
        /CREATE INDEX IF NOT EXISTS idx_social_posts_unique_view_count[\s\S]+?WHERE deleted_at IS NULL/,
      );
    });

    it('creates social_follows with (follower_id, followee_id) PK and no-self check', () => {
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.social_follows');
      expect(sql).toContain('PRIMARY KEY (follower_id, followee_id)');
      expect(sql).toContain('CHECK (follower_id <> followee_id)');
    });

    it('creates social_user_hidden_authors with (viewer_id, author_id) PK and no-self check', () => {
      expect(sql).toContain(
        'CREATE TABLE IF NOT EXISTS public.social_user_hidden_authors',
      );
      expect(sql).toContain('PRIMARY KEY (viewer_id, author_id)');
      expect(sql).toContain('CHECK (viewer_id <> author_id)');
    });

    it('creates social_viewer_author_affinity with 4 counters and non-negative checks', () => {
      expect(sql).toContain(
        'CREATE TABLE IF NOT EXISTS public.social_viewer_author_affinity',
      );
      expect(sql).toContain('like_count integer NOT NULL DEFAULT 0');
      expect(sql).toContain('dislike_count integer NOT NULL DEFAULT 0');
      expect(sql).toContain('comment_count integer NOT NULL DEFAULT 0');
      expect(sql).toContain('unique_view_count integer NOT NULL DEFAULT 0');
      expect(sql).toContain('CHECK (like_count >= 0)');
      expect(sql).toContain('CHECK (dislike_count >= 0)');
      expect(sql).toContain('CHECK (comment_count >= 0)');
      expect(sql).toContain('CHECK (unique_view_count >= 0)');
    });
  });

  describe('row-level security', () => {
    it('enables RLS on all three new tables', () => {
      expect(sql).toContain(
        'ALTER TABLE public.social_follows ENABLE ROW LEVEL SECURITY',
      );
      expect(sql).toContain(
        'ALTER TABLE public.social_user_hidden_authors ENABLE ROW LEVEL SECURITY',
      );
      expect(sql).toContain(
        'ALTER TABLE public.social_viewer_author_affinity ENABLE ROW LEVEL SECURITY',
      );
    });

    it('social_follows: viewer can only read/insert/delete their own rows', () => {
      expect(sql).toMatch(
        /CREATE POLICY "viewer can read own follows"[\s\S]+?USING \(follower_id = auth\.uid\(\)\)/,
      );
      expect(sql).toMatch(
        /CREATE POLICY "viewer can insert own follows"[\s\S]+?WITH CHECK \(follower_id = auth\.uid\(\)\)/,
      );
      expect(sql).toMatch(
        /CREATE POLICY "viewer can delete own follows"[\s\S]+?USING \(follower_id = auth\.uid\(\)\)/,
      );
    });

    it('social_user_hidden_authors: FOR ALL policy gated on viewer_id = auth.uid()', () => {
      expect(sql).toMatch(
        /CREATE POLICY "viewer can manage own hidden list"[\s\S]+?FOR ALL TO authenticated[\s\S]+?USING \(viewer_id = auth\.uid\(\)\)[\s\S]+?WITH CHECK \(viewer_id = auth\.uid\(\)\)/,
      );
    });

    it('social_viewer_author_affinity: read-only policy; writes only via SECURITY DEFINER triggers', () => {
      expect(sql).toMatch(
        /CREATE POLICY "viewer can read own affinity"[\s\S]+?FOR SELECT TO authenticated[\s\S]+?USING \(viewer_id = auth\.uid\(\)\)/,
      );
      // No INSERT/UPDATE/DELETE policy on the affinity table
      expect(sql).not.toMatch(
        /CREATE POLICY[^\n]+ON public\.social_viewer_author_affinity[\s\S]{0,200}?(INSERT|UPDATE|DELETE)/,
      );
    });
  });

  describe('triggers', () => {
    it('B1 — increments social_posts.unique_view_count O(1) on social_post_views insert', () => {
      expect(sql).toContain(
        'CREATE OR REPLACE FUNCTION public.handle_social_post_unique_view_increment',
      );
      expect(sql).toMatch(
        /SET unique_view_count = unique_view_count \+ 1\s*\n\s*WHERE id = NEW\.post_id/,
      );
      expect(sql).toContain(
        'CREATE TRIGGER tg_social_post_views_increment_unique_view_count',
      );
    });

    it('B3 — affinity trigger on social_post_likes handles INSERT/UPDATE/DELETE and skips self-reactions', () => {
      expect(sql).toContain(
        'CREATE OR REPLACE FUNCTION public.handle_social_post_like_affinity',
      );
      expect(sql).toMatch(
        /CREATE TRIGGER tg_social_post_likes_affinity[\s\S]+?AFTER INSERT OR UPDATE OR DELETE ON public\.social_post_likes/,
      );
      // Self-skip: when author = viewer, RETURN without writing affinity
      expect(sql).toMatch(/IF author IS NULL OR author = viewer THEN/);
    });

    it('B3 — affinity trigger on social_comments distinguishes visible vs hidden state', () => {
      expect(sql).toContain(
        'CREATE OR REPLACE FUNCTION public.handle_social_comment_affinity',
      );
      expect(sql).toMatch(
        /CREATE TRIGGER tg_social_comments_affinity[\s\S]+?AFTER INSERT OR UPDATE OR DELETE ON public\.social_comments/,
      );
      expect(sql).toContain("moderation_state = 'approved'");
    });

    it('B3 — affinity trigger on social_post_views increments unique_view_count', () => {
      expect(sql).toContain(
        'CREATE OR REPLACE FUNCTION public.handle_social_view_affinity',
      );
      expect(sql).toContain(
        'CREATE TRIGGER tg_social_post_views_affinity',
      );
    });

    it('all triggers run as SECURITY DEFINER with explicit search_path', () => {
      const definerCount = (sql.match(/SECURITY DEFINER SET search_path = public/g) ?? []).length;
      expect(definerCount).toBeGreaterThanOrEqual(4); // 4 affinity/view triggers
    });
  });

  describe('calculate_social_post_rank_v5', () => {
    it('is created without dropping v4 (rollback safety)', () => {
      expect(sql).toContain(
        'CREATE OR REPLACE FUNCTION public.calculate_social_post_rank_v5',
      );
      expect(sql).not.toContain(
        'DROP FUNCTION IF EXISTS public.calculate_social_post_rank_v4',
      );
    });

    it('adds p_unique_view_count as the new 13th parameter', () => {
      expect(sql).toMatch(/p_unique_view_count\s+integer/);
    });

    it('preserves the v4 baseline weights and the auto-hide modulation', () => {
      expect(sql).toContain('like_weight constant numeric := 3.0');
      expect(sql).toContain('dislike_weight constant numeric := 4.0');
      expect(sql).toContain('rejection_penalty_cap constant numeric := 18.0');
      expect(sql).toContain("auto_hide_provider constant text := 'threshold_auto_hide'");
      expect(sql).toContain('auto_hide_rejection_factor constant numeric := 0.5');
      expect(sql).toContain('language_match_boost constant numeric := 7.0');
      expect(sql).toContain('country_match_boost constant numeric := 3.5');
    });

    it('adds unique_view_signal = ln(1+N) * 0.5 to the score', () => {
      expect(sql).toContain('unique_view_weight constant numeric := 0.5');
      expect(sql).toMatch(
        /unique_view_signal := LN\(1 \+ GREATEST\(COALESCE\(p_unique_view_count, 0\), 0\)\)\s*\n?\s*\* unique_view_weight/,
      );
      expect(sql).toMatch(/RETURN[\s\S]+?\+ unique_view_signal/);
    });
  });

  describe('get_social_feed_page (Phase B RPC)', () => {
    it('drops the v4 5-arg signature before recreating it', () => {
      expect(sql).toContain(
        'DROP FUNCTION IF EXISTS public.get_social_feed_page(text, integer, integer, text, text);',
      );
    });

    it('keeps the same 5-arg signature so the client does not have to change', () => {
      expect(sql).toContain('p_viewer_language_code text DEFAULT NULL');
      expect(sql).toContain('p_viewer_country_code text DEFAULT NULL');
      expect(sql).toMatch(
        /GRANT EXECUTE ON FUNCTION public\.get_social_feed_page\(\s*text,\s*integer,\s*integer,\s*text,\s*text\s*\)\s*TO authenticated/,
      );
    });

    it('extends the RETURNS TABLE with unique_view_count and viewer_follows_author', () => {
      expect(sql).toMatch(/RETURNS TABLE\s*\([\s\S]*unique_view_count integer[\s\S]*viewer_follows_author boolean[\s\S]*\)/);
    });

    it('declares the viewer-specific CTEs for hidden authors, follows, and affinity', () => {
      expect(sql).toMatch(/viewer_hidden_authors AS \(\s*SELECT[\s\S]+?FROM public\.social_user_hidden_authors/);
      expect(sql).toMatch(/viewer_follows AS \(\s*SELECT[\s\S]+?FROM public\.social_follows/);
      expect(sql).toMatch(/viewer_affinity AS \(\s*SELECT[\s\S]+?FROM public\.social_viewer_author_affinity/);
    });

    it('B4 — filters out posts authored by hidden authors via NOT EXISTS', () => {
      expect(sql).toMatch(
        /AND NOT EXISTS \(\s*SELECT 1 FROM viewer_hidden_authors[\s\S]+?WHERE hidden\.author_id = post\.author_id\s*\)/,
      );
    });

    it('B2 — applies a +5.0 boost when the viewer follows the author', () => {
      expect(sql).toContain('follow_boost_weight constant numeric := 5.0');
      expect(sql).toMatch(
        /CASE\s+WHEN viewer_follow\.author_id IS NOT NULL THEN follow_boost_weight/,
      );
    });

    it('B3 — applies bounded affinity boost (positive cap 3.0, negative cap 2.0)', () => {
      expect(sql).toContain('affinity_positive_cap constant numeric := 3.0');
      expect(sql).toContain('affinity_negative_cap constant numeric := 2.0');
      expect(sql).toContain('affinity_like_weight constant numeric := 0.5');
      expect(sql).toContain('affinity_comment_weight constant numeric := 0.3');
      expect(sql).toContain('affinity_view_weight constant numeric := 0.1');
      expect(sql).toContain('affinity_dislike_weight constant numeric := 0.5');
    });

    it('routes scoring through calculate_social_post_rank_v5', () => {
      expect(sql).toContain('public.calculate_social_post_rank_v5(');
      // The 13th arg passed must be the post unique_view_count
      expect(sql).toMatch(/post\.moderation_provider,\s*\n?\s*post\.unique_view_count/);
    });

    it('preserves Phase A invariants: ban filter (A1) and author diversity penalty (A3)', () => {
      expect(sql).toContain(
        "AND NOT public.is_user_banned(post.author_id, 'posts')",
      );
      expect(sql).toContain('author_diversity_penalty constant numeric := 2.5');
      expect(sql).toMatch(/AS author_position/);
    });

    it('keeps the viewer-private branch intact (sort_group=0)', () => {
      expect(sql).toContain("post.moderation_state <> 'approved'");
      expect(sql).toContain('post.author_id = viewer_uid');
      expect(sql).toContain('0 AS sort_group');
    });

    it('reloads the PostgREST schema cache after recreating the RPC', () => {
      expect(sql).toContain("SELECT pg_notify('pgrst', 'reload schema')");
    });
  });
});
