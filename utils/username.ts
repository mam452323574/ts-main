export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;
export const USERNAME_PATTERN = /^[a-z0-9_-]{3,20}$/;

// U2-ζ Phase 3 — usernames qu'on refuse côté client pour éviter les confusions
// (un user qui prend "admin" peut tromper d'autres utilisateurs en se faisant
// passer pour un compte officiel). Le RLS / Edge Functions backend doivent
// idéalement répliquer cette liste, mais ce check côté client suffit dans la
// majorité des cas car le username doit être set via `upsertSafeProfile` qui
// passe par la même validation.
const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  'admin',
  'admins',
  'administrator',
  'administrators',
  'root',
  'system',
  'sys',
  'support',
  'help',
  'helpdesk',
  'staff',
  'team',
  'official',
  'security',
  'moderator',
  'mod',
  'mods',
  'owner',
  'founder',
  'ceo',
  'cto',
  'api',
  'www',
  'mail',
  'email',
  'noreply',
  'no-reply',
  'postmaster',
  'webmaster',
  'health-scan',
  'healthscan',
  'health_scan',
  'anonymous',
  'anon',
  'null',
  'undefined',
  'me',
  'self',
  'user',
  'users',
  'account',
  'accounts',
  'login',
  'signup',
  'register',
  'auth',
  'oauth',
  'logout',
  'settings',
  'profile',
  'profiles',
  'dashboard',
  'home',
  'index',
  'app',
  'mobile',
  'web',
  'test',
  'tests',
  'demo',
  'guest',
]);

export function isReservedUsername(value: string): boolean {
  return RESERVED_USERNAMES.has(value.toLowerCase());
}

export function normalizeUsernameInput(value: string) {
  return value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9_-]/g, '');
}

export function isCanonicalUsername(value: string) {
  return USERNAME_PATTERN.test(value);
}

export function validateCanonicalUsername(value: string) {
  const normalizedUsername = normalizeUsernameInput(value);
  const valid =
    isCanonicalUsername(normalizedUsername) &&
    !isReservedUsername(normalizedUsername);

  return {
    normalizedUsername,
    valid,
  };
}
