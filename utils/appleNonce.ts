import * as Crypto from 'expo-crypto';

export async function createAppleNonceHash(rawNonce: string): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce,
    { encoding: Crypto.CryptoEncoding.HEX },
  );
}
