import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = process.cwd();
const MIGRATION_PATH = path.join(
  REPO_ROOT,
  'supabase',
  'migrations',
  '20260425143000_edge_worker_and_admin_queue_hardening.sql',
);

function readMigrationSource() {
  return fs.readFileSync(MIGRATION_PATH, 'utf8');
}

describe('edge worker and admin moderation queue hardening migration', () => {
  it('creates nonce storage for timestamped worker signatures without anon grants', () => {
    const migrationSource = readMigrationSource();

    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS public.edge_request_nonces');
    expect(migrationSource).toContain('PRIMARY KEY (purpose, nonce_hash)');
    expect(migrationSource).toContain('ALTER TABLE public.edge_request_nonces ENABLE ROW LEVEL SECURITY');
    expect(migrationSource).toContain('REVOKE ALL ON public.edge_request_nonces FROM anon, authenticated');
    expect(migrationSource).toContain('GRANT SELECT, INSERT, DELETE ON public.edge_request_nonces TO service_role');
  });

  it('adds service-role audit storage for admin queue reads', () => {
    const migrationSource = readMigrationSource();

    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS public.admin_audit_events');
    expect(migrationSource).toContain('actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL');
    expect(migrationSource).toContain('REVOKE ALL ON public.admin_audit_events FROM anon, authenticated');
    expect(migrationSource).toContain('GRANT SELECT, INSERT ON public.admin_audit_events TO service_role');
  });

  it('exposes only an explicit paginated moderation queue RPC to service_role', () => {
    const migrationSource = readMigrationSource();

    expect(migrationSource).toContain('CREATE OR REPLACE FUNCTION public.list_social_moderation_queue_page');
    expect(migrationSource).toContain('p_limit integer DEFAULT 50');
    expect(migrationSource).toContain('p_offset integer DEFAULT 0');
    expect(migrationSource).toContain('LIMIT normalized_limit');
    expect(migrationSource).toContain('OFFSET normalized_offset');
    expect(migrationSource).toContain("'has_more', normalized_offset + normalized_limit < filtered_count.total_count");
    expect(migrationSource).toContain(
      'REVOKE ALL ON FUNCTION public.list_social_moderation_queue_page(text, integer, integer)',
    );
    expect(migrationSource).toContain(
      'GRANT EXECUTE ON FUNCTION public.list_social_moderation_queue_page(text, integer, integer)',
    );
  });
});
