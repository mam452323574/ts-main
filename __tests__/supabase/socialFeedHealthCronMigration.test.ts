import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = process.cwd();
const MIGRATION_PATH = path.join(
  REPO_ROOT,
  'supabase',
  'migrations',
  '20260524130000_social_feed_health_cron.sql',
);

const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');

describe('social feed health cron migration (D7)', () => {
  it('only schedules when pg_cron extension is installed', () => {
    expect(sql).toMatch(
      /IF EXISTS \(SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'\)/,
    );
  });

  it('unschedules existing jobs with the same name before scheduling (idempotent)', () => {
    expect(sql).toMatch(
      /PERFORM cron\.unschedule\(jobid\)[\s\S]+?WHERE jobname = 'refresh_social_feed_health_v1'/,
    );
  });

  it('schedules nightly refresh of social_feed_health_v1 at 03:00 UTC', () => {
    expect(sql).toMatch(
      /cron\.schedule\(\s*'refresh_social_feed_health_v1',\s*'0 3 \* \* \*',\s*\$cron\$ SELECT public\.refresh_social_feed_health\(\); \$cron\$\s*\)/,
    );
  });

  it('emits a NOTICE fallback when pg_cron is unavailable', () => {
    expect(sql).toContain(
      "RAISE NOTICE 'pg_cron extension not available; refresh_social_feed_health() must be invoked manually or via an external scheduler.'",
    );
  });

  it('reloads the PostgREST schema cache', () => {
    expect(sql).toContain("SELECT pg_notify('pgrst', 'reload schema')");
  });
});
