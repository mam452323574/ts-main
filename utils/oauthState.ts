// Génère un state OAuth à 16 octets aléatoires (32 caractères hex).
// Refuse de retomber sur un PRNG non cryptographique : si
// `crypto.getRandomValues` est indisponible, on lance plutôt que de
// produire un state prévisible exploitable en CSRF.
//
// Voir P0-2 dans FRONTEND_SECURITY_AUDIT.md. Le polyfill
// `react-native-get-random-values` est importé en tête de app/_layout.tsx.
export function createOAuthState(): string {
  const cryptoApi = globalThis.crypto;

  if (!cryptoApi?.getRandomValues) {
    throw new Error(
      '[Auth] Secure RNG unavailable: cannot generate OAuth state'
    );
  }

  const bytes = new Uint8Array(16);
  cryptoApi.getRandomValues(bytes);

  return Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}
