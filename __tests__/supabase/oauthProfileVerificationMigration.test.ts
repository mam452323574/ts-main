import * as fs from 'fs';
import * as path from 'path';

const MIGRATION_PATH = path.join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260524180000_verify_confirmed_oauth_profiles.sql',
);

const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');

describe('confirmed OAuth profile verification migration', () => {
  it('marks only provider-confirmed OAuth repairs as email verified', () => {
    expect(sql).toContain(
      'CREATE OR REPLACE FUNCTION public.repair_missing_user_profile',
    );
    expect(sql).toContain("v_provider IN ('google', 'apple')");
    expect(sql).toContain('v_email_confirmed_at IS NOT NULL');
    expect(sql).toContain('WHEN v_oauth_verified THEN true');
    expect(sql).toContain('ELSE public.user_profiles.email_verified');
  });

  it('backfills confirmed OAuth profiles and preserves the OTP path for email accounts', () => {
    expect(sql).toContain('UPDATE public.user_profiles AS profile');
    expect(sql).toContain(
      "COALESCE(auth_user.raw_app_meta_data->>'provider', '') IN ('google', 'apple')",
    );
    expect(sql).toContain('auth_user.email_confirmed_at IS NOT NULL');
    expect(sql).toContain(
      'email/password accounts keep their existing verification path.',
    );
    expect(sql).toContain("SELECT pg_notify('pgrst', 'reload schema');");
  });
});
