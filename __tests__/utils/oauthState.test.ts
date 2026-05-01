import { createOAuthState } from '@/utils/oauthState';

describe('createOAuthState', () => {
  let originalCrypto: Crypto | undefined;

  beforeEach(() => {
    originalCrypto = globalThis.crypto;
  });

  afterEach(() => {
    if (originalCrypto) {
      Object.defineProperty(globalThis, 'crypto', {
        value: originalCrypto,
        configurable: true,
      });
    }
  });

  it('produit un state hex de 32 caractères', () => {
    const state = createOAuthState();
    expect(state).toMatch(/^[0-9a-f]{32}$/);
  });

  it('produit des states distincts à chaque appel (entropie)', () => {
    const samples = new Set<string>();
    for (let i = 0; i < 32; i += 1) {
      samples.add(createOAuthState());
    }
    expect(samples.size).toBe(32);
  });

  it("lance une erreur quand crypto.getRandomValues est indisponible (PRNG faible refusé)", () => {
    Object.defineProperty(globalThis, 'crypto', {
      value: undefined,
      configurable: true,
    });

    expect(() => createOAuthState()).toThrow(/Secure RNG unavailable/);
  });

  it("lance une erreur si globalThis.crypto existe mais sans getRandomValues", () => {
    Object.defineProperty(globalThis, 'crypto', {
      value: {} as Crypto,
      configurable: true,
    });

    expect(() => createOAuthState()).toThrow(/Secure RNG unavailable/);
  });
});
