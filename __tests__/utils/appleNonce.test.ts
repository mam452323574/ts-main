const mockDigestStringAsync = jest.fn();

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: {
    SHA256: 'SHA-256',
  },
  CryptoEncoding: {
    HEX: 'hex',
  },
  digestStringAsync: (...args: unknown[]) => mockDigestStringAsync(...args),
}));

import { createAppleNonceHash } from '@/utils/appleNonce';

describe('createAppleNonceHash', () => {
  beforeEach(() => {
    mockDigestStringAsync.mockResolvedValue('a'.repeat(64));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns the SHA-256 hex digest expected by Apple native auth', async () => {
    await expect(createAppleNonceHash('raw-nonce-1')).resolves.toBe(
      'a'.repeat(64),
    );

    expect(mockDigestStringAsync).toHaveBeenCalledWith(
      'SHA-256',
      'raw-nonce-1',
      { encoding: 'hex' },
    );
  });
});
