import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = process.cwd();
const MIGRATION_PATH = path.join(
  REPO_ROOT,
  'supabase',
  'migrations',
  '20260524120000_social_feed_keyset.sql',
);

const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');

describe('social feed keyset migration (D2)', () => {
  it('creates the new overload with p_cursor text (3rd arg) — without dropping the offset overload', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.get_social_feed_page');
    expect(sql).toContain('p_cursor text DEFAULT NULL');
    expect(sql).not.toContain('DROP FUNCTION IF EXISTS public.get_social_feed_page(text, integer, integer, text, text)');
  });

  it('grants EXECUTE on the new 5-arg signature (text, integer, text, text, text)', () => {
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.get_social_feed_page\(\s*text,\s*integer,\s*text,\s*text,\s*text\s*\)\s*TO authenticated/,
    );
  });

  it('extends RETURNS TABLE with next_cursor text', () => {
    expect(sql).toMatch(/RETURNS TABLE\s*\([\s\S]*next_cursor text[\s\S]*\)/);
  });

  it('parses the cursor "<rs>:<id>" defensively (malformed → first page)', () => {
    expect(sql).toMatch(/cursor_parts := string_to_array\(btrim\(p_cursor\), ':'\)/);
    expect(sql).toMatch(/cursor_rs := cursor_parts\[1\]::numeric/);
    expect(sql).toMatch(/cursor_id := cursor_parts\[2\]::uuid/);
    expect(sql).toMatch(/EXCEPTION WHEN OTHERS THEN\s*\n\s*cursor_active := false/);
  });

  it('uses tuple comparison (feed_sort_score, id) < (cursor_rs, cursor_id) for keyset filtering', () => {
    expect(sql).toMatch(
      /\(scored_public\.feed_sort_score, scored_public\.id\) < \(cursor_rs, cursor_id\)/,
    );
  });

  it('excludes viewer-private posts (sort_group=0) once paging past the first page', () => {
    expect(sql).toMatch(/AND NOT cursor_active\s+-- on a cursor page/);
  });

  it('computes next_cursor as last public row "feed_sort_score:id" via LAST_VALUE window', () => {
    expect(sql).toMatch(
      /LAST_VALUE\([\s\S]+?feed_sort_score::text \|\| ':' \|\| combined_feed\.id::text/,
    );
    expect(sql).toMatch(/ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING/);
  });

  it('preserves Phase A/B/C/D invariants (ban, hidden, follow, affinity, v7 scoring)', () => {
    expect(sql).toContain("AND NOT public.is_user_banned(post.author_id, 'posts')");
    expect(sql).toContain('viewer_hidden_authors AS');
    expect(sql).toContain('viewer_follows AS');
    expect(sql).toContain('viewer_affinity AS');
    expect(sql).toContain('viewer_saves AS');
    expect(sql).toContain('public.calculate_social_post_rank_v7(');
    expect(sql).toContain('author_diversity_penalty constant numeric := 2.5');
    expect(sql).toContain('follow_boost_weight constant numeric := 5.0');
  });

  it('reloads the PostgREST schema cache', () => {
    expect(sql).toContain("SELECT pg_notify('pgrst', 'reload schema')");
  });
});
