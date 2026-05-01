import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = process.cwd();
const MIGRATION_PATH = path.join(
  REPO_ROOT,
  'supabase',
  'migrations',
  '20260425241000_restore_authenticated_runtime_access.sql',
);

function readMigrationSource() {
  return fs.readFileSync(MIGRATION_PATH, 'utf8');
}

describe('authenticated runtime access restore migration', () => {
  it('restores authenticated execute on social feed RPCs and the ranking helper', () => {
    const migrationSource = readMigrationSource();

    expect(migrationSource).toContain(
      'GRANT EXECUTE ON FUNCTION public.calculate_social_post_rank(',
    );
    expect(migrationSource).toContain('timestamptz');
    expect(migrationSource).toContain('integer');
    expect(migrationSource).toContain(') TO authenticated;');
    expect(migrationSource).toContain(
      'GRANT EXECUTE ON FUNCTION public.get_social_feed_page(text, integer, integer)',
    );
    expect(migrationSource).toContain(
      'GRANT EXECUTE ON FUNCTION public.get_social_comments_for_post(uuid)',
    );
    expect(migrationSource).toContain(
      'GRANT EXECUTE ON FUNCTION public.get_social_comments_page(uuid, timestamptz, uuid, integer)',
    );
    expect(migrationSource).toContain(
      'GRANT EXECUTE ON FUNCTION public.get_social_post_detail(uuid)',
    );
  });

  it('recreates social read policies without exposing moderation-only content', () => {
    const migrationSource = readMigrationSource();

    expect(migrationSource).toContain(
      'CREATE POLICY "Authenticated users can view social posts"',
    );
    expect(migrationSource).toContain('author_id = (select auth.uid())');
    expect(migrationSource).toContain("moderation_state = 'approved'");
    expect(migrationSource).toContain(
      'CREATE POLICY "Authenticated users can view social comments"',
    );
    expect(migrationSource).toContain(
      'post_visibility.moderation_state = \'approved\'',
    );
    expect(migrationSource).toContain(
      'post_visibility.author_id = (select auth.uid())',
    );
  });

  it('restores scan image storage policies for user scan paths without aal requirements', () => {
    const migrationSource = readMigrationSource();
    const lowerSource = migrationSource.toLowerCase();

    expect(migrationSource).toContain(
      'DROP POLICY IF EXISTS "Users can upload own scan images" ON storage.objects',
    );
    expect(migrationSource).toContain(
      'CREATE POLICY "Users can upload own scan images"',
    );
    expect(migrationSource).toContain("bucket_id = 'scan-images'");
    expect(migrationSource).toContain(
      '(storage.foldername(name))[1] = (select auth.uid())::text',
    );
    expect(migrationSource).toContain("(storage.foldername(name))[2] = 'scans'");
    expect(lowerSource).not.toContain('aal');
  });

  it('reloads PostgREST schema after policy and grant restoration', () => {
    const migrationSource = readMigrationSource();

    expect(migrationSource).toContain("NOTIFY pgrst, 'reload schema';");
  });
});
