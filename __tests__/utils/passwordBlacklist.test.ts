import { isCommonPassword } from '@/utils/passwordBlacklist';

describe('isCommonPassword (U2-δ)', () => {
  it.each([
    '123456',
    'password',
    'qwerty',
    'azerty',
    'admin',
    'letmein',
    'iloveyou',
    'motdepasse',
    'p@ssw0rd',
    'aaaaaaaa',
    '11111111',
    '0123456789',
  ])('rejette le mot de passe trivial (%s)', (value) => {
    expect(isCommonPassword(value)).toBe(true);
  });

  it.each([
    'Tr0ub4dor&3',
    'correct horse battery staple',
    'gn5tQ8wPlz9F',
    'Z9!fL2xK7mN',
  ])('accepte un mot de passe non trivial (%s)', (value) => {
    expect(isCommonPassword(value)).toBe(false);
  });

  it('compare en case-insensitive', () => {
    expect(isCommonPassword('Password')).toBe(true);
    expect(isCommonPassword('AZERTY')).toBe(true);
  });

  it("retourne false sur une chaîne vide", () => {
    expect(isCommonPassword('')).toBe(false);
  });
});
