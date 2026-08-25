import * as fs from 'fs';
import * as path from 'path';

const MIGRATION_PATH = path.join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260630120000_allow_oauth_signup_nonce_bypass.sql',
);

const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');

describe('OAuth signup nonce bypass migration', () => {
  it('allows GoTrue-managed Apple and Google users through the signup nonce trigger', () => {
    expect(sql).toContain(
      'CREATE OR REPLACE FUNCTION public.enforce_signup_nonce()',
    );
    expect(sql).toContain("NEW.raw_app_meta_data->>'provider'");
    expect(sql).toContain("NEW.raw_app_meta_data->'providers'");
    expect(sql).toContain("v_provider IN ('apple', 'google')");
    expect(sql).toContain("v_providers ?| ARRAY['apple', 'google']");
  });

  it('keeps direct email signup protected by secure-signup attestation', () => {
    expect(sql).toContain("v_nonce_text := NEW.raw_user_meta_data->>'signup_nonce'");
    expect(sql).toContain(
      "RAISE EXCEPTION 'signup_nonce_invalid: must use the secure-signup wrapper'",
    );
    expect(sql).toContain(
      'v_consumed := public.consume_signup_attestation(v_nonce_uuid, NEW.email)',
    );
    expect(sql).toContain(
      "NEW.raw_user_meta_data := NEW.raw_user_meta_data - 'signup_nonce'",
    );
  });
});
