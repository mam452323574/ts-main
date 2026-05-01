import {
  EmailSchema,
  LoginCredentialsSchema,
  SignUpCredentialsSchema,
} from '@/utils/authSchemas';

describe('EmailSchema', () => {
  it.each([
    'user@example.com',
    'firstname.lastname@example.co.uk',
    'name+tag@example.io',
  ])('accepte un email RFC valide (%s)', (value) => {
    expect(EmailSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    'plaintext',
    'no@dot',
    '@example.com',
    'spaces in@example.com',
    'a'.repeat(260) + '@example.com',
  ])('rejette un email invalide (%s)', (value) => {
    expect(EmailSchema.safeParse(value).success).toBe(false);
  });
});

describe('LoginCredentialsSchema', () => {
  it('accepte des credentials valides', () => {
    expect(
      LoginCredentialsSchema.safeParse({
        email: 'a@b.co',
        password: 'short-but-ok',
      }).success,
    ).toBe(true);
  });

  it('rejette un password vide', () => {
    expect(
      LoginCredentialsSchema.safeParse({
        email: 'a@b.co',
        password: '',
      }).success,
    ).toBe(false);
  });

  it('rejette un password > 128 caractères (DoS)', () => {
    expect(
      LoginCredentialsSchema.safeParse({
        email: 'a@b.co',
        password: 'a'.repeat(200),
      }).success,
    ).toBe(false);
  });
});

describe('SignUpCredentialsSchema', () => {
  it('accepte des credentials valides avec confirmation matchée', () => {
    expect(
      SignUpCredentialsSchema.safeParse({
        email: 'new@example.com',
        password: 'longenough',
        confirmPassword: 'longenough',
      }).success,
    ).toBe(true);
  });

  it('rejette un password trop court (< 8)', () => {
    expect(
      SignUpCredentialsSchema.safeParse({
        email: 'new@example.com',
        password: 'short',
        confirmPassword: 'short',
      }).success,
    ).toBe(false);
  });

  it('rejette une confirmation différente', () => {
    const result = SignUpCredentialsSchema.safeParse({
      email: 'new@example.com',
      password: 'longenough',
      confirmPassword: 'mismatch1',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('passwords_do_not_match');
    }
  });

  it('rejette un mot de passe trivialement compromis (U2-δ)', () => {
    const result = SignUpCredentialsSchema.safeParse({
      email: 'new@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.message === 'password_too_common',
      );
      expect(issue).toBeDefined();
    }
  });
});

