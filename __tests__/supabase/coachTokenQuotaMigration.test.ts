import * as fs from 'fs';
import * as path from 'path';

const MIGRATION_PATH = path.join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260520200000_add_coach_token_quota.sql',
);

describe('CO-04 coach token quota migration', () => {
  const source = fs.readFileSync(MIGRATION_PATH, 'utf8');

  it('creates coach_token_consumption table with CHECK on estimated_tokens', () => {
    expect(source).toContain(
      'CREATE TABLE IF NOT EXISTS public.coach_token_consumption',
    );
    expect(source).toMatch(/estimated_tokens integer NOT NULL CHECK \(estimated_tokens >= 0\)/);
  });

  it('defines record_coach_token_consumption with hour + day defaults', () => {
    expect(source).toContain(
      'CREATE OR REPLACE FUNCTION public.record_coach_token_consumption',
    );
    expect(source).toContain('p_per_hour_limit integer DEFAULT 200000');
    expect(source).toContain('p_per_day_limit integer DEFAULT 1000000');
    expect(source).toContain('SECURITY DEFINER');
  });

  it('blocks insertion when hour or day window would overflow', () => {
    expect(source).toMatch(/v_hour_total \+ p_estimated_tokens > p_per_hour_limit/);
    expect(source).toMatch(/v_day_total \+ p_estimated_tokens > p_per_day_limit/);
    expect(source).toContain("'window_exceeded', v_window_exceeded");
  });

  it('aggregates with SUM over rolling windows', () => {
    expect(source).toContain(
      "SUM(estimated_tokens) FILTER (WHERE consumed_at > v_now - interval '1 hour')",
    );
    expect(source).toContain(
      "SUM(estimated_tokens) FILTER (WHERE consumed_at > v_now - interval '1 day')",
    );
  });

  it('grants execute to service_role only', () => {
    expect(source).toContain(
      'REVOKE EXECUTE ON FUNCTION public.record_coach_token_consumption(uuid, integer, integer, integer) FROM PUBLIC',
    );
    expect(source).toContain(
      'GRANT EXECUTE ON FUNCTION public.record_coach_token_consumption(uuid, integer, integer, integer) TO service_role',
    );
  });
});
