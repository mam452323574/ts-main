import * as fs from 'fs';
import * as path from 'path';

const MIGRATION_PATH = path.join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260430120000_fix_social_viewer_visible_comment_count.sql',
);

const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');

describe('social viewer-visible comment count migration', () => {
  it('adds the partial index used by the viewer-aware pending count', () => {
    expect(sql).toContain(
      'CREATE INDEX IF NOT EXISTS idx_social_comments_viewer_visible_pending',
    );
    expect(sql).toContain(
      'ON public.social_comments (post_id, author_id, moderation_state)',
    );
    expect(sql).toContain('WHERE deleted_at IS NULL');
  });

  it('returns viewer_visible_comment_count from feed and detail RPCs', () => {
    expect(sql).toContain(
      'DROP FUNCTION IF EXISTS public.get_social_feed_page',
    );
    expect(sql).toContain(
      'DROP FUNCTION IF EXISTS public.get_social_post_detail(uuid);',
    );
    expect(sql).toMatch(
      /CREATE FUNCTION public\.get_social_feed_page[\s\S]*comment_count integer,\s*viewer_visible_comment_count integer/,
    );
    expect(sql).toMatch(
      /CREATE FUNCTION public\.get_social_post_detail[\s\S]*comment_count integer,\s*viewer_visible_comment_count integer/,
    );
  });

  it('computes display counts from approved server count plus only own pending comments', () => {
    expect(sql).toContain('own_pending_comment_counts AS');
    expect(sql).toContain('COALESCE(post.comment_count, 0) +');
    expect(sql).toContain(
      'COALESCE(own_pending_comment_counts.own_pending_count, 0)',
    );
    expect(sql).toContain('comment.deleted_at IS NULL');
    expect(sql).toContain('comment.author_id = viewer_uid');
    expect(sql).toContain("comment.moderation_state = 'pending'");
  });

  it('keeps comment_count owned by existing triggers instead of redefining it', () => {
    expect(sql).not.toMatch(/UPDATE\s+public\.social_posts[\s\S]*comment_count/i);
    expect(sql).not.toMatch(/CREATE\s+(OR\s+REPLACE\s+)?TRIGGER/i);
    expect(sql).not.toMatch(/DROP\s+TRIGGER/i);
  });

  it('keeps grants and reloads the PostgREST schema cache', () => {
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.get_social_feed_page\(\s*text,\s*integer,\s*integer,\s*text,\s*text\s*\)\s+TO authenticated/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.get_social_post_detail\(uuid\)\s+TO authenticated/,
    );
    expect(sql).toContain("SELECT pg_notify('pgrst', 'reload schema');");
  });
});
