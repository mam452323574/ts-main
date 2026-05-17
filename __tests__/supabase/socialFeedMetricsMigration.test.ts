import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = process.cwd();
const MIGRATION_PATH = path.join(
  REPO_ROOT,
  'supabase',
  'migrations',
  '20260522130000_social_feed_metrics.sql',
);

const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');

describe('social feed metrics migration (D6 + D7)', () => {
  describe('D6 — social_feed_arm_metrics', () => {
    it('creates the table with composite PK (arm, metric_day)', () => {
      expect(sql).toContain(
        'CREATE TABLE IF NOT EXISTS public.social_feed_arm_metrics',
      );
      expect(sql).toContain('PRIMARY KEY (arm, metric_day)');
      expect(sql).toMatch(/CHECK \(arm IN \('control', 'log_sat'\)\)/);
    });

    it('enables RLS with admin-only read policy', () => {
      expect(sql).toContain(
        'ALTER TABLE public.social_feed_arm_metrics ENABLE ROW LEVEL SECURITY',
      );
      expect(sql).toMatch(
        /CREATE POLICY "admins read arm metrics"[\s\S]+?account_tier = 'admin'/,
      );
    });

    it('provides compute_social_feed_arm() with deterministic hash-based arm', () => {
      expect(sql).toContain(
        'CREATE OR REPLACE FUNCTION public.compute_social_feed_arm',
      );
      expect(sql).toMatch(
        /CASE WHEN \(hash_value % 100\) < 50 THEN 'control' ELSE 'log_sat' END/,
      );
    });

    it('provides bump_social_feed_arm_metric() that upserts daily counters', () => {
      expect(sql).toContain(
        'CREATE OR REPLACE FUNCTION public.bump_social_feed_arm_metric',
      );
      expect(sql).toMatch(/ON CONFLICT \(arm, metric_day\) DO UPDATE/);
      expect(sql).toContain(
        "p_metric NOT IN ('impressions', 'reactions', 'comments', 'saves')",
      );
    });

    it('installs 4 triggers (impressions, reactions, comments, saves)', () => {
      expect(sql).toContain('tg_social_post_impressions_arm_metric');
      expect(sql).toContain('tg_social_post_likes_arm_metric');
      expect(sql).toContain('tg_social_comments_arm_metric');
      expect(sql).toContain('tg_social_post_saves_arm_metric');
    });

    it('counts only visible comment transitions (approved + non-deleted)', () => {
      expect(sql).toContain(
        'CREATE OR REPLACE FUNCTION public.handle_social_arm_comment_metric',
      );
      expect(sql).toMatch(/is_visible[\s\S]+?moderation_state = 'approved'/);
    });
  });

  describe('D7 — social_feed_health_v1 materialized view', () => {
    it('creates the materialized view grouping by (day, language, category)', () => {
      expect(sql).toContain(
        'CREATE MATERIALIZED VIEW public.social_feed_health_v1 AS',
      );
      expect(sql).toContain(
        "date_trunc('day', impression.impression_window)::date AS metric_day",
      );
      expect(sql).toContain('GROUP BY 1, 2, 3');
    });

    it('aggregates the right metrics (impressions, unique viewers, likes, comments, saves)', () => {
      expect(sql).toMatch(/COUNT\(\*\)::bigint AS impressions/);
      expect(sql).toMatch(/COUNT\(DISTINCT impression\.viewer_id\)::bigint AS unique_viewers/);
      expect(sql).toMatch(/SUM\(post\.like_count\)[\s\S]+?AS likes_total/);
      expect(sql).toMatch(/SUM\(post\.comment_count\)[\s\S]+?AS comments_total/);
      expect(sql).toMatch(/SUM\(post\.save_count\)[\s\S]+?AS saves_total/);
    });

    it('creates a unique index so REFRESH CONCURRENTLY works', () => {
      expect(sql).toMatch(
        /CREATE UNIQUE INDEX IF NOT EXISTS idx_social_feed_health_v1_unique[\s\S]+?\(metric_day, language_code, category\)/,
      );
    });

    it('exposes refresh_social_feed_health() to service_role only', () => {
      expect(sql).toContain(
        'CREATE OR REPLACE FUNCTION public.refresh_social_feed_health',
      );
      expect(sql).toContain(
        'REFRESH MATERIALIZED VIEW CONCURRENTLY public.social_feed_health_v1',
      );
      expect(sql).toMatch(
        /REVOKE EXECUTE ON FUNCTION public\.refresh_social_feed_health\(\) FROM PUBLIC, authenticated/,
      );
      expect(sql).toMatch(
        /GRANT EXECUTE ON FUNCTION public\.refresh_social_feed_health\(\) TO service_role/,
      );
    });
  });

  it('reloads the PostgREST schema cache', () => {
    expect(sql).toContain("SELECT pg_notify('pgrst', 'reload schema')");
  });
});
