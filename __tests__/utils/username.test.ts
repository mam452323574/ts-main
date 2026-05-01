import {
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  isCanonicalUsername,
  normalizeUsernameInput,
  validateCanonicalUsername,
} from '@/utils/username';

describe('username utils', () => {
  it('normalizes usernames to the backend-owned canonical lowercase format', () => {
    expect(normalizeUsernameInput('  Malo_User  ')).toBe('malo_user');
    expect(normalizeUsernameInput('Jean Luc-92')).toBe('jeanluc-92');
  });

  it('accepts canonical usernames that match the strict storage rule', () => {
    expect(isCanonicalUsername('malo_123')).toBe(true);
    expect(isCanonicalUsername('abc')).toBe(true);
    expect(isCanonicalUsername('a'.repeat(USERNAME_MAX_LENGTH))).toBe(true);
  });

  it('rejects usernames that fall outside the strict canonical rule', () => {
    expect(isCanonicalUsername('Abc')).toBe(false);
    expect(isCanonicalUsername('ab')).toBe(false);
    expect(isCanonicalUsername('name.with.dot')).toBe(false);
    expect(isCanonicalUsername('a'.repeat(USERNAME_MAX_LENGTH + 1))).toBe(false);
  });

  it('returns the normalized candidate together with its validity', () => {
    expect(validateCanonicalUsername('  Malo User  ')).toEqual({
      normalizedUsername: 'malouser',
      valid: true,
    });

    expect(validateCanonicalUsername('a'.repeat(USERNAME_MIN_LENGTH - 1))).toEqual({
      normalizedUsername: 'aa',
      valid: false,
    });
  });
});
