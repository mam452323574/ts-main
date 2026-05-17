import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = process.cwd();
const MIGRATION_PATH = path.join(
  REPO_ROOT,
  'supabase',
  'migrations',
  '20260522120000_social_feed_phase_d.sql',
);

const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');

describe('social feed Phase D migration (D1+D3+D4+D5)', () => {
  describe('schema additions', () => {
    it('adds last_engagement_at and author_post_sequence_snapshot columns', () => {
      expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS last_engagement_at timestamptz/);
      expect(sql).toMatch(
        /ADD COLUMN IF NOT EXISTS author_post_sequence_snapshot integer/,
      );
    });

    it('creates partial indexes on the new columns', () => {
      expect(sql).toMatch(
        /CREATE INDEX IF NOT EXISTS idx_social_posts_last_engagement_at[\s\S]+?WHERE deleted_at IS NULL/,
      );
      expect(sql).toMatch(
        /CREATE INDEX IF NOT EXISTS idx_social_posts_author_seq_snapshot[\s\S]+?WHERE deleted_at IS NULL/,
      );
    });
  });

  describe('backfill', () => {
    it('backfills last_engagement_at from max(post.created_at, latest reaction, latest comment)', () => {
      expect(sql).toMatch(
        /UPDATE public\.social_posts AS post[\s\S]+?SET last_engagement_at = GREATEST\([\s\S]+?WHERE last_engagement_at IS NULL/,
      );
      expect(sql).toContain('MAX(r.updated_at)');
      expect(sql).toContain('MAX(c.created_at)');
      expect(sql).toContain("AND c.moderation_state = 'approved'");
    });

    it('backfills author_post_sequence_snapshot via ROW_NUMBER per author', () => {
      expect(sql).toMatch(
        /ROW_NUMBER\(\) OVER \(\s*PARTITION BY author_id\s*ORDER BY created_at ASC, id ASC\s*\)::integer AS seq/,
      );
      expect(sql).toContain('SET author_post_sequence_snapshot = numbered.seq');
    });
  });

  describe('triggers (D1, D4)', () => {
    it('D1 — bumps last_engagement_at on every like/dislike change', () => {
      expect(sql).toContain(
        'CREATE OR REPLACE FUNCTION public.handle_social_post_last_engagement_from_like',
      );
      expect(sql).toMatch(
        /CREATE TRIGGER tg_social_post_likes_last_engagement[\s\S]+?AFTER INSERT OR UPDATE OR DELETE ON public\.social_post_likes/,
      );
    });

    it('D1 — bumps last_engagement_at when a comment changes visibility', () => {
      expect(sql).toContain(
        'CREATE OR REPLACE FUNCTION public.handle_social_post_last_engagement_from_comment',
      );
      expect(sql).toMatch(/IF is_visible <> was_visible THEN/);
      expect(sql).toMatch(
        /CREATE TRIGGER tg_social_comments_last_engagement[\s\S]+?AFTER INSERT OR UPDATE OR DELETE ON public\.social_comments/,
      );
    });

    it('D4 — BEFORE INSERT trigger assigns author_post_sequence_snapshot', () => {
      expect(sql).toContain(
        'CREATE OR REPLACE FUNCTION public.assign_social_post_author_sequence',
      );
      expect(sql).toMatch(
        /NEW\.author_post_sequence_snapshot := COALESCE\([\s\S]+?\) \+ 1/,
      );
      expect(sql).toMatch(
        /CREATE TRIGGER tg_social_posts_assign_author_sequence[\s\S]+?BEFORE INSERT ON public\.social_posts/,
      );
    });

    it('D4 — also defaults last_engagement_at to created_at on insert when NULL', () => {
      expect(sql).toMatch(
        /IF NEW\.last_engagement_at IS NULL THEN\s*\n\s*NEW\.last_engagement_at := NEW\.created_at/,
      );
    });
  });

  describe('calculate_social_post_rank_v7', () => {
    it('is created without dropping v6 (rollback safety)', () => {
      expect(sql).toContain(
        'CREATE OR REPLACE FUNCTION public.calculate_social_post_rank_v7',
      );
      expect(sql).not.toContain(
        'DROP FUNCTION IF EXISTS public.calculate_social_post_rank_v6',
      );
    });

    it('adds p_last_engagement_at (D1) and p_exploration_seed (D3) parameters', () => {
      expect(sql).toMatch(/p_last_engagement_at\s+timestamptz/);
      expect(sql).toMatch(/p_exploration_seed\s+numeric/);
    });

    it('D5 — uses log-saturated engagement weights instead of linear ones', () => {
      expect(sql).toContain('log_like_weight constant numeric := 5.0');
      expect(sql).toContain('log_dislike_weight constant numeric := 6.0');
      expect(sql).toContain('log_commenter_weight constant numeric := 4.0');
      expect(sql).toMatch(/log_likes := LN\(1 \+ GREATEST\(COALESCE\(p_effective_like_count, 0\), 0\)\)/);
      expect(sql).toMatch(/log_dislikes := LN\(1 \+ GREATEST\(COALESCE\(p_effective_dislike_count, 0\), 0\)\)/);
      expect(sql).toMatch(/log_commenters := LN\(1 \+ GREATEST\(COALESCE\(p_distinct_commenter_count, 0\), 0\)\)/);
    });

    it('D1 — multiplies engagement by exp(-age_engagement_h / 24)', () => {
      expect(sql).toContain('engagement_freshness_tau_hours constant numeric := 24.0');
      expect(sql).toMatch(
        /engagement_freshness := EXP\(- engagement_age_hours \/ engagement_freshness_tau_hours\)/,
      );
      expect(sql).toMatch(/\) \* engagement_freshness;/);
    });

    it('D1 — keeps engagement_freshness = 1 when last_engagement_at is NULL', () => {
      expect(sql).toMatch(/IF p_last_engagement_at IS NULL THEN\s*\n\s*engagement_freshness := 1\.0/);
    });

    it('D3 — clamps exploration seed to [-1, +1] and scales by amplitude 0.5', () => {
      expect(sql).toContain('exploration_amplitude constant numeric := 0.5');
      expect(sql).toMatch(/LEAST\(1\.0, GREATEST\(-1\.0, p_exploration_seed\)\)[\s\S]+?\* exploration_amplitude/);
    });

    it('preserves v6 invariants (locale boosts, rejection cap, save signal)', () => {
      expect(sql).toContain('rejection_penalty_cap constant numeric := 18.0');
      expect(sql).toContain('language_match_boost constant numeric := 7.0');
      expect(sql).toContain('country_match_boost constant numeric := 3.5');
      expect(sql).toContain('save_weight constant numeric := 5.0');
      expect(sql).toContain('nuanced_reaction_boost_cap constant numeric := 1.0');
    });

    it('aggregates all signals in the final RETURN', () => {
      expect(sql).toMatch(/\+ engagement[\s\S]+?\+ exploration_noise/);
    });
  });

  describe('get_social_feed_page (Phase D RPC)', () => {
    it('drops the v6 5-arg signature and recreates with the same offset-based shape (no D2 yet)', () => {
      expect(sql).toContain(
        'DROP FUNCTION IF EXISTS public.get_social_feed_page(text, integer, integer, text, text);',
      );
      expect(sql).toContain('p_offset integer DEFAULT 0');
      expect(sql).toContain('p_viewer_language_code text DEFAULT NULL');
      expect(sql).toMatch(
        /GRANT EXECUTE ON FUNCTION public\.get_social_feed_page\(\s*text,\s*integer,\s*integer,\s*text,\s*text\s*\)\s*TO authenticated/,
      );
    });

    it('routes scoring through calculate_social_post_rank_v7 with the new params', () => {
      expect(sql).toContain('public.calculate_social_post_rank_v7(');
      expect(sql).toMatch(/post\.last_engagement_at,/);
      // Exploration seed: hash-derived numeric centered around 0
      expect(sql).toMatch(/'x' \|\| substr\(md5\(post\.id::text \|\| COALESCE\(viewer_uid::text, ''\)\), 1, 8\)/);
    });

    it('D4 — reads author_post_sequence_snapshot directly (no CTE)', () => {
      expect(sql).toContain('post.author_post_sequence_snapshot');
      expect(sql).not.toMatch(/WITH author_post_sequences AS/);
    });

    it('preserves Phase A/B/C invariants (bans, hidden authors, saves, affinity, follow boost)', () => {
      expect(sql).toContain(
        "AND NOT public.is_user_banned(post.author_id, 'posts')",
      );
      expect(sql).toContain('viewer_hidden_authors AS');
      expect(sql).toContain('viewer_follows AS');
      expect(sql).toContain('viewer_affinity AS');
      expect(sql).toContain('viewer_saves AS');
      expect(sql).toContain('follow_boost_weight constant numeric := 5.0');
      expect(sql).toContain('author_diversity_penalty constant numeric := 2.5');
    });

    it('keeps the viewer-private branch intact (sort_group=0)', () => {
      expect(sql).toContain("post.moderation_state <> 'approved'");
      expect(sql).toContain('post.author_id = viewer_uid');
      expect(sql).toContain('0 AS sort_group');
    });

    it('reloads the PostgREST schema cache', () => {
      expect(sql).toContain("SELECT pg_notify('pgrst', 'reload schema')");
    });
  });
});
