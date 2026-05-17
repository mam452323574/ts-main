import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = process.cwd();
const RPC_MIGRATION_PATH = path.join(
  REPO_ROOT,
  'supabase',
  'migrations',
  '20260517120000_social_feed_ranking_v4.sql',
);

function readMigration(p: string) {
  return fs.readFileSync(p, 'utf8');
}

describe('social feed ranking v4 migration', () => {
  const sql = readMigration(RPC_MIGRATION_PATH);

  describe('calculate_social_post_rank_v4', () => {
    it('creates the v4 scoring function without dropping v3', () => {
      expect(sql).toContain(
        'CREATE OR REPLACE FUNCTION public.calculate_social_post_rank_v4',
      );
      expect(sql).not.toContain(
        'DROP FUNCTION IF EXISTS public.calculate_social_post_rank_v3',
      );
    });

    it('adds p_moderation_provider as the new 12th parameter', () => {
      expect(sql).toMatch(/p_moderation_provider\s+text/);
    });

    it('preserves the v3 baseline weights (freshness 48, like 3, dislike 4, etc.)', () => {
      expect(sql).toContain('freshness_numerator constant numeric := 48.0');
      expect(sql).toContain('freshness_offset constant numeric := 2.0');
      expect(sql).toContain('like_weight constant numeric := 3.0');
      expect(sql).toContain('dislike_weight constant numeric := 4.0');
      expect(sql).toContain('distinct_commenter_weight constant numeric := 4.0');
      expect(sql).toContain('impression_weight constant numeric := 1.5');
      expect(sql).toContain('language_match_boost constant numeric := 7.0');
      expect(sql).toContain('country_match_boost constant numeric := 3.5');
    });

    it('raises the rejection penalty cap from 9 to 18', () => {
      expect(sql).toContain('rejection_penalty_cap constant numeric := 18.0');
    });

    it('halves the rejection weight for posts auto-hidden by the report threshold', () => {
      expect(sql).toContain("auto_hide_provider constant text := 'threshold_auto_hide'");
      expect(sql).toContain('auto_hide_rejection_factor constant numeric := 0.5');
      expect(sql).toMatch(
        /WHEN p_moderation_provider = auto_hide_provider THEN auto_hide_rejection_factor/,
      );
    });

    it('still keeps locale boosts NULL-safe (no penalty when either side is NULL)', () => {
      expect(sql).toContain('p_post_language_code IS NOT NULL');
      expect(sql).toContain('p_viewer_language_code IS NOT NULL');
      expect(sql).toContain('p_post_country_code IS NOT NULL');
      expect(sql).toContain('p_viewer_country_code IS NOT NULL');
    });
  });

  describe('get_social_feed_page (v4 RPC)', () => {
    it('drops the v3 5-arg signature before recreating it', () => {
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

    it('routes scoring through calculate_social_post_rank_v4 (passing moderation_provider)', () => {
      expect(sql).toContain('public.calculate_social_post_rank_v4(');
      expect(sql).toMatch(/post\.moderation_provider\s*\n?\s*\)\s+AS rank_score/);
    });

    it('A1 — filters out posts from authors currently banned for posting', () => {
      expect(sql).toContain(
        "AND NOT public.is_user_banned(post.author_id, 'posts')",
      );
    });

    it('A3 — computes author_position alongside category_position', () => {
      expect(sql).toMatch(
        /PARTITION BY public_posts\.author_id\s*\n\s*ORDER BY\s*\n\s*public_posts\.rank_score DESC/,
      );
      expect(sql).toMatch(/AS author_position/);
    });

    it('A3 — applies the author diversity penalty to feed_sort_score', () => {
      expect(sql).toContain(
        'author_diversity_penalty constant numeric := 2.5',
      );
      expect(sql).toMatch(
        /GREATEST\(ranked_public_posts\.author_position - 1, 0\)::numeric\s*\n?\s*\*\s*author_diversity_penalty/,
      );
    });

    it('preserves the soft category diversity penalty (1.5 per position)', () => {
      expect(sql).toMatch(
        /GREATEST\(ranked_public_posts\.category_position - 1, 0\)::numeric \* 1\.5/,
      );
    });

    it('keeps the viewer-private branch intact for the author of pending posts', () => {
      expect(sql).toContain("post.moderation_state <> 'approved'");
      expect(sql).toContain('post.author_id = viewer_uid');
      expect(sql).toContain('0 AS sort_group');
    });

    it('reloads the PostgREST schema cache after recreating the RPC', () => {
      expect(sql).toContain("SELECT pg_notify('pgrst', 'reload schema')");
    });
  });
});
