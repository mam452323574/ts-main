import {
  isReservedUsername,
  validateCanonicalUsername,
} from '@/utils/username';

describe('isReservedUsername (U2-ζ)', () => {
  it.each(['admin', 'root', 'support', 'system', 'helpdesk', 'official'])(
    'rejette %s comme réservé',
    (value) => {
      expect(isReservedUsername(value)).toBe(true);
    },
  );

  it('compare en case-insensitive', () => {
    expect(isReservedUsername('Admin')).toBe(true);
    expect(isReservedUsername('ROOT')).toBe(true);
  });

  it.each(['malo', 'fitcoach', 'health_user_42', 'andrea-r'])(
    'accepte %s',
    (value) => {
      expect(isReservedUsername(value)).toBe(false);
    },
  );
});

describe('validateCanonicalUsername (intégration mots réservés)', () => {
  it('flag invalid pour un username réservé même bien formé', () => {
    const result = validateCanonicalUsername('admin');
    expect(result.normalizedUsername).toBe('admin');
    expect(result.valid).toBe(false);
  });

  it('flag invalid pour un username réservé via aliasing NFKC', () => {
    // "Ⓐdmin" → NFKC normalise en "admin" minuscule
    const result = validateCanonicalUsername('Ⓐdmin');
    expect(result.normalizedUsername).toBe('admin');
    expect(result.valid).toBe(false);
  });

  it('flag valid pour un username légitime', () => {
    const result = validateCanonicalUsername('mscar32');
    expect(result.valid).toBe(true);
  });
});
