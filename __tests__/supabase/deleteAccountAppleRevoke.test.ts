import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(
  path.join(process.cwd(), 'supabase/functions/delete-account/index.ts'),
  'utf8',
);

describe('delete-account Apple token revocation hygiene', () => {
  it('accepts an Apple authorization code and keeps revocation best-effort', () => {
    expect(source).toContain('apple_authorization_code');
    expect(source).toContain('revokeAppleAuthorizationCode');
    expect(source).toContain('authorization_code_missing');
    expect(source).toContain('server_not_configured');
    expect(source).toContain('apple_revoke');
  });

  it('uses Apple token and revoke endpoints without logging token material', () => {
    expect(source).toContain('https://appleid.apple.com/auth/token');
    expect(source).toContain('https://appleid.apple.com/auth/revoke');
    expect(source).toContain('APPLE_SIGN_IN_CLIENT_ID');
    expect(source).toContain('APPLE_SIGN_IN_CLIENT_SECRET');
    expect(source).not.toContain('console.log(token');
    expect(source).not.toContain('console.warn(token');
  });
});
