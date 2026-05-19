import * as fs from 'fs';
import * as path from 'path';

const MIGRATION_PATH = path.join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260520190000_add_scan_creation_rate_limit.sql',
);

describe('SC-01 scan creation rate limit migration', () => {
  const source = fs.readFileSync(MIGRATION_PATH, 'utf8');

  it('creates scan_creation_attempts table with RLS', () => {
    expect(source).toContain(
      'CREATE TABLE IF NOT EXISTS public.scan_creation_attempts',
    );
    expect(source).toContain('REFERENCES public.user_profiles(id) ON DELETE CASCADE');
    expect(source).toContain(
      'ALTER TABLE public.scan_creation_attempts ENABLE ROW LEVEL SECURITY',
    );
  });

  it('defines record_scan_creation_attempt as SECURITY DEFINER with default windows', () => {
    expect(source).toContain(
      'CREATE OR REPLACE FUNCTION public.record_scan_creation_attempt',
    );
    expect(source).toContain('SECURITY DEFINER');
    expect(source).toContain('SET search_path = public');
    expect(source).toContain('p_per_minute integer DEFAULT 10');
    expect(source).toContain('p_per_hour integer DEFAULT 60');
    expect(source).toContain('p_per_day integer DEFAULT 200');
  });

  it('returns allowed=false with window_exceeded when the limit is hit', () => {
    expect(source).toContain("'allowed', false");
    expect(source).toMatch(/v_window_exceeded\s*:=\s*'minute'/);
    expect(source).toMatch(/v_window_exceeded\s*:=\s*'hour'/);
    expect(source).toMatch(/v_window_exceeded\s*:=\s*'day'/);
  });

  it('garbage-collects entries older than 25 hours for the user', () => {
    expect(source).toMatch(/DELETE FROM public\.scan_creation_attempts[\s\S]+25 hours/);
  });

  it('grants execute to service_role only', () => {
    expect(source).toContain(
      'REVOKE EXECUTE ON FUNCTION public.record_scan_creation_attempt(uuid, integer, integer, integer) FROM PUBLIC',
    );
    expect(source).toContain(
      'GRANT EXECUTE ON FUNCTION public.record_scan_creation_attempt(uuid, integer, integer, integer) TO service_role',
    );
  });
});
