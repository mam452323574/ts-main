import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = process.cwd();
const COLUMNS_MIGRATION_PATH = path.join(
  REPO_ROOT,
  'supabase',
  'migrations',
  '20260426170000_social_feed_locale_country_columns.sql',
);
const RPC_MIGRATION_PATH = path.join(
  REPO_ROOT,
  'supabase',
  'migrations',
  '20260426170100_social_feed_ranking_v3.sql',
);

function readMigration(p: string) {
  return fs.readFileSync(p, 'utf8');
}

describe('social feed ranking v3 migrations', () => {
  describe('20260426170000 — locale/country columns', () => {
    const sql = readMigration(COLUMNS_MIGRATION_PATH);

    it('adds nullable language_code and country_code on social_posts and user_profiles', () => {
      expect(sql).toContain('ALTER TABLE public.social_posts');
      expect(sql).toContain('ADD COLUMN IF NOT EXISTS language_code text NULL');
      expect(sql).toContain('ADD COLUMN IF NOT EXISTS country_code text NULL');
      expect(sql).toContain('ALTER TABLE public.user_profiles');
    });

    it('enforces ISO format with NULL-tolerant CHECK constraints', () => {
      expect(sql).toContain(
        "CHECK (language_code IS NULL OR language_code ~ '^[a-z]{2}$')",
      );
      expect(sql).toContain(
        "CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$')",
      );
    });

    it('re-grants INSERT and UPDATE on user_profiles to include the new columns', () => {
      expect(sql).toContain('GRANT INSERT (');
      expect(sql).toContain('GRANT UPDATE (');
      expect(sql).toMatch(/GRANT UPDATE\s*\([^)]*language_code[^)]*country_code[^)]*\)/);
      expect(sql).toMatch(/GRANT INSERT\s*\([^)]*language_code[^)]*country_code[^)]*\)/);
    });

    it('reloads the PostgREST schema cache after the column additions', () => {
      expect(sql).toContain("SELECT pg_notify('pgrst', 'reload schema')");
    });
  });

  describe('20260426170100 — ranking v3 RPC', () => {
    const sql = readMigration(RPC_MIGRATION_PATH);

    it('creates a fresh calculate_social_post_rank_v3 function (without dropping v2)', () => {
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.calculate_social_post_rank_v3');
      expect(sql).not.toContain('DROP FUNCTION IF EXISTS public.calculate_social_post_rank(');
    });

    it('uses balanced locale boost weights (7.0 language / 3.5 country)', () => {
      expect(sql).toContain('language_match_boost constant numeric := 7.0');
      expect(sql).toContain('country_match_boost constant numeric := 3.5');
    });

    it('treats either-side NULL as a neutral boost (no penalty)', () => {
      expect(sql).toContain('p_post_language_code IS NOT NULL');
      expect(sql).toContain('p_viewer_language_code IS NOT NULL');
      expect(sql).toContain('p_post_country_code IS NOT NULL');
      expect(sql).toContain('p_viewer_country_code IS NOT NULL');
    });

    it('drops the prior 3-arg signature before recreating get_social_feed_page', () => {
      expect(sql).toContain(
        'DROP FUNCTION IF EXISTS public.get_social_feed_page(text, integer, integer);',
      );
    });

    it('extends get_social_feed_page with two nullable viewer-context params', () => {
      expect(sql).toContain('p_viewer_language_code text DEFAULT NULL');
      expect(sql).toContain('p_viewer_country_code text DEFAULT NULL');
    });

    it('returns the new language_code and country_code columns', () => {
      expect(sql).toMatch(/RETURNS TABLE\s*\([\s\S]*language_code text[\s\S]*country_code text[\s\S]*\)/);
    });

    it('resolves the viewer context via auth.uid() fallback only when needed', () => {
      expect(sql).toContain('viewer_uid uuid := auth.uid()');
      expect(sql).toContain('FROM public.user_profiles AS profile');
      expect(sql).toMatch(
        /IF \(resolved_viewer_language IS NULL OR resolved_viewer_country IS NULL\)\s*\n\s*AND viewer_uid IS NOT NULL THEN/,
      );
    });

    it('grants EXECUTE on the new 5-arg signature to authenticated', () => {
      expect(sql).toMatch(
        /GRANT EXECUTE ON FUNCTION public\.get_social_feed_page\(\s*text,\s*integer,\s*integer,\s*text,\s*text\s*\)\s*TO authenticated/,
      );
    });

    it('keeps the v2 ordering tiebreakers stable (sort_group, then created_at, id)', () => {
      expect(sql).toContain('ORDER BY');
      expect(sql).toContain('combined_feed.sort_group ASC');
      expect(sql).toContain('combined_feed.created_at DESC');
      expect(sql).toContain('combined_feed.id DESC');
    });

    it('preserves the viewer-private branch (sort_group=0) for the author of pending posts', () => {
      expect(sql).toContain("post.moderation_state <> 'approved'");
      expect(sql).toContain('post.author_id = viewer_uid');
      expect(sql).toContain('0 AS sort_group');
    });
  });
});
