import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = process.cwd();

const MIGRATION_PATH = path.join(
  REPO_ROOT,
  'supabase',
  'migrations',
  '20260520230000_create_get_user_scan_summary_rpc.sql',
);

function readSource(target: string): string {
  return fs.readFileSync(target, 'utf8');
}

describe('get_user_scan_summary RPC migration', () => {
  const source = readSource(MIGRATION_PATH);

  it('creates the RPC with the expected signature', () => {
    expect(source).toMatch(/CREATE OR REPLACE FUNCTION public\.get_user_scan_summary\(p_user_id uuid\)/);
    expect(source).toContain('RETURNS jsonb');
    expect(source).toContain('LANGUAGE sql');
    expect(source).toContain('STABLE');
  });

  it('runs as SECURITY DEFINER with a pinned search_path', () => {
    expect(source).toContain('SECURITY DEFINER');
    expect(source).toContain('SET search_path = public');
  });

  it('counts total scans and the 7-day / 30-day rolling windows', () => {
    expect(source).toContain('COUNT(*)::int AS total');
    expect(source).toMatch(/COUNT\(\*\) FILTER \(\s*WHERE created_at > now\(\) - interval '7 days'\s*\)::int AS last_7d/);
    expect(source).toMatch(/COUNT\(\*\) FILTER \(\s*WHERE created_at > now\(\) - interval '30 days'\s*\)::int AS last_30d/);
  });

  it('exposes first/last scan timestamps', () => {
    expect(source).toContain('MIN(created_at) AS first_at');
    expect(source).toContain('MAX(created_at) AS last_at');
  });

  it('builds a per-scan_type counts map and falls back to an empty object', () => {
    expect(source).toContain('jsonb_object_agg(scan_type, scan_count)');
    expect(source).toMatch(/GROUP BY scan_type/);
    expect(source).toMatch(/COALESCE\(by_type\.counts, '\{\}'::jsonb\)/);
  });

  it('returns a jsonb object with all the expected keys', () => {
    const keys = ['total', 'last_7d', 'last_30d', 'first_at', 'last_at', 'by_type'];
    for (const key of keys) {
      expect(source).toContain(`'${key}',`);
    }
  });

  it('grants execute to service_role only and revokes from other roles', () => {
    expect(source).toContain('REVOKE ALL ON FUNCTION public.get_user_scan_summary(uuid) FROM PUBLIC');
    expect(source).toContain('REVOKE ALL ON FUNCTION public.get_user_scan_summary(uuid) FROM authenticated');
    expect(source).toContain('REVOKE ALL ON FUNCTION public.get_user_scan_summary(uuid) FROM anon');
    expect(source).toContain('GRANT EXECUTE ON FUNCTION public.get_user_scan_summary(uuid) TO service_role');
  });

  it('notifies pgrst to reload the schema cache', () => {
    expect(source).toContain("NOTIFY pgrst, 'reload schema'");
  });
});
