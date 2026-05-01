import * as fs from 'fs';
import * as path from 'path';

const MIGRATION_PATH = path.join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260429120000_sort_social_comments_by_likes.sql',
);

const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');

describe('social comments sort by likes migration', () => {
  it('adds a filtered post popularity cursor index without removing existing indexes', () => {
    expect(sql).toContain(
      'CREATE INDEX IF NOT EXISTS idx_social_comments_post_likes_id_desc',
    );
    expect(sql).toContain(
      'ON public.social_comments (post_id, like_count DESC, id DESC)',
    );
    expect(sql).toContain('WHERE deleted_at IS NULL');
    expect(sql).not.toMatch(/DROP INDEX/i);
  });

  it('replaces the created_at cursor RPC signature with like_count cursor params', () => {
    expect(sql).toContain(
      'DROP FUNCTION IF EXISTS public.get_social_comments_page(uuid, timestamptz, uuid, integer);',
    );
    expect(sql).toContain(
      'DROP FUNCTION IF EXISTS public.get_social_comments_page(uuid, integer, uuid, integer);',
    );
    expect(sql).toContain('CREATE FUNCTION public.get_social_comments_page(');
    expect(sql).toContain('p_cursor_like_count integer DEFAULT NULL');
    expect(sql).toContain('p_cursor_id uuid DEFAULT NULL');
    expect(sql).not.toContain('p_cursor_created_at');
  });

  it('returns the full comment projection expected by the mobile parser', () => {
    expect(sql).toMatch(/RETURNS TABLE\s*\([\s\S]*id uuid[\s\S]*post_id uuid/);
    expect(sql).toMatch(/created_at timestamptz[\s\S]*like_count integer/);
    expect(sql).toContain('viewer_has_liked boolean');
    expect(sql).toMatch(
      /moderation_state text[\s\S]*moderation_status text[\s\S]*deleted_at timestamptz/,
    );
  });

  it('uses the deterministic like_count and id cursor for subsequent pages', () => {
    expect(sql).toContain(
      '(comment.like_count, comment.id) < (p_cursor_like_count, p_cursor_id)',
    );
    expect(sql).toContain('ORDER BY comment.like_count DESC, comment.id DESC');
  });

  it('keeps security and PostgREST contract details in place', () => {
    expect(sql).toContain('SECURITY INVOKER');
    expect(sql).toContain('comment.moderation_state = \'approved\'');
    expect(sql).toContain('OR comment.author_id = auth.uid()');
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION\s+public\.get_social_comments_page\(uuid, integer, uuid, integer\)\s+TO authenticated/,
    );
    expect(sql).toContain("SELECT pg_notify('pgrst', 'reload schema');");
  });
});
