import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = process.cwd();
const MIGRATION_PATH = path.join(
  REPO_ROOT,
  'supabase',
  'migrations',
  '20260428190000_restore_social_comments_feature_access.sql',
);

function readMigrationSource() {
  return fs.readFileSync(MIGRATION_PATH, 'utf8');
}

describe('social comments feature access migration', () => {
  it('keeps mobile comments enabled without changing the global social flag on existing rows', () => {
    const migrationSource = readMigrationSource();

    expect(migrationSource).toContain('INSERT INTO public.app_feature_flags');
    expect(migrationSource).toContain('social_comments_enabled');
    expect(migrationSource).toContain('ON CONFLICT (scope) DO UPDATE SET');
    expect(migrationSource).toContain('social_comments_enabled = true');
    expect(migrationSource).not.toContain('social_enabled = true');
  });

  it('restores authenticated config reads and feature flag RPC access', () => {
    const migrationSource = readMigrationSource();

    expect(migrationSource).toContain(
      'GRANT SELECT ON public.app_feature_flags TO authenticated;',
    );
    expect(migrationSource).toContain(
      'GRANT SELECT ON public.app_config TO authenticated;',
    );
    expect(migrationSource).toContain(
      'GRANT EXECUTE ON FUNCTION public.get_phase2_feature_flags(text) TO authenticated;',
    );
    expect(migrationSource).toContain(
      'CREATE POLICY "Authenticated users can view app feature flags"',
    );
    expect(migrationSource).toContain('USING (true)');
    expect(migrationSource).toContain("NOTIFY pgrst, 'reload schema';");
  });
});
