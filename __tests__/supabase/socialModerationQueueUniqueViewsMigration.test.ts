import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = process.cwd();
const MIGRATION_PATH = path.join(
  REPO_ROOT,
  'supabase',
  'migrations',
  '20260419120000_restore_social_moderation_queue_unique_views.sql',
);

function readMigrationSource() {
  return fs.readFileSync(MIGRATION_PATH, 'utf8');
}

describe('social moderation queue unique views migration', () => {
  it('restores the moderation queue unique viewer rollup for posts', () => {
    const migrationSource = readMigrationSource();

    expect(migrationSource).toContain('post_view_rollups AS (');
    expect(migrationSource).toContain('FROM public.social_post_views');
    expect(migrationSource).toContain(
      'COALESCE(post_view_rollups.unique_viewer_count, 0) AS unique_viewer_count',
    );
    expect(migrationSource).toContain('0::integer AS unique_viewer_count');
  });

  it('preserves admin reaction adjustments and active bans on the moderation queue view', () => {
    const migrationSource = readMigrationSource();

    expect(migrationSource).toContain('social_post.admin_like_adjustment');
    expect(migrationSource).toContain('social_post.admin_dislike_adjustment');
    expect(migrationSource).toContain('AS effective_like_count');
    expect(migrationSource).toContain('AS effective_dislike_count');
    expect(migrationSource).toContain("COALESCE(author_bans.active_bans, '[]'::jsonb) AS author_active_bans");
  });
});
