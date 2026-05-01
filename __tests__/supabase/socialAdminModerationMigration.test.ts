import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = process.cwd();
const MIGRATION_PATH = path.join(
  REPO_ROOT,
  'supabase',
  'migrations',
  '20260418173000_social_admin_eradication_and_reaction_adjustments.sql',
);

function readMigrationSource() {
  return fs.readFileSync(MIGRATION_PATH, 'utf8');
}

describe('social admin eradication and reaction adjustment migration', () => {
  it('adds signed admin reaction adjustment columns and clamps effective counters', () => {
    const migrationSource = readMigrationSource();

    expect(migrationSource).toContain('ADD COLUMN IF NOT EXISTS admin_like_adjustment integer NOT NULL DEFAULT 0');
    expect(migrationSource).toContain('ADD COLUMN IF NOT EXISTS admin_dislike_adjustment integer NOT NULL DEFAULT 0');
    expect(migrationSource).toContain('CREATE OR REPLACE FUNCTION public.get_effective_social_reaction_count');
    expect(migrationSource).toContain('GREATEST(0, COALESCE(p_raw_count, 0) + COALESCE(p_admin_adjustment, 0))');
    expect(migrationSource).toContain('CREATE OR REPLACE FUNCTION public.set_social_post_admin_reaction_adjustments');
  });

  it('routes feed and ranking through effective counters instead of raw counts only', () => {
    const migrationSource = readMigrationSource();

    expect(migrationSource).toContain('public.get_effective_social_reaction_count(');
    expect(migrationSource).toContain('public.calculate_social_post_rank(');
    expect(migrationSource).toContain('viewer_private_posts.effective_like_count AS like_count');
    expect(migrationSource).toContain('ranked_public_posts.effective_dislike_count AS dislike_count');
  });

  it('creates the admin eradication RPC with soft removal, report resolution, and a global ban', () => {
    const migrationSource = readMigrationSource();

    expect(migrationSource).toContain('CREATE OR REPLACE FUNCTION public.admin_eradicate_social_user_content');
    expect(migrationSource).toContain("moderation_reason = 'admin_eradication'");
    expect(migrationSource).toContain("moderation_reason = 'parent_post_eradicated'");
    expect(migrationSource).toContain("workflow_status = 'resolved'");
    expect(migrationSource).toContain("'eradicate_user_content'");
    expect(migrationSource).toContain("'all'");
  });

  it('extends moderation events and the moderation queue for admin-only operations', () => {
    const migrationSource = readMigrationSource();

    expect(migrationSource).toContain("target_type IN ('post', 'comment', 'user')");
    expect(migrationSource).toContain("'ban_user'");
    expect(migrationSource).toContain("'remove_avatar'");
    expect(migrationSource).toContain("'adjust_reactions'");
    expect(migrationSource).toContain('author_active_bans');
    expect(migrationSource).toContain('effective_like_count');
    expect(migrationSource).toContain('effective_dislike_count');
  });
});
