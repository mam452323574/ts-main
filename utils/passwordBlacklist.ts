// Liste réduite des mots de passe les plus courants à bloquer côté client
// (U2-δ Phase 3). Source : entrées courantes issues de SecLists et exemples
// NIST 800-63B.
//
// On garde la liste petite (~80 entrées) pour ne pas embarquer 1 MB dans le
// bundle. Le serveur reste autoritaire — c'est juste une UX qui empêche un
// utilisateur naïf d'utiliser `password123` avant même de soumettre.

const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  '123456',
  '123456789',
  '12345678',
  '1234567890',
  '1234567',
  '12345',
  '0000',
  '00000000',
  'password',
  'password1',
  'password123',
  'password!',
  'qwerty',
  'qwerty123',
  'qwertyuiop',
  'azerty',
  'azertyuiop',
  'admin',
  'admin123',
  'administrator',
  'letmein',
  'welcome',
  'welcome1',
  'monkey',
  'dragon',
  'superman',
  'batman',
  'iloveyou',
  'princess',
  'sunshine',
  'football',
  'baseball',
  'master',
  'shadow',
  'michael',
  'jennifer',
  'jordan',
  'thomas',
  'andrew',
  'charlie',
  'killer',
  'trustno1',
  'starwars',
  'computer',
  'liverpool',
  'arsenal',
  'pokemon',
  'hello',
  'hello123',
  'abc123',
  'abcdef',
  'abcd1234',
  '111111',
  '1111111',
  '11111111',
  '666666',
  '7777777',
  '987654321',
  'samsung',
  'iphone',
  'google',
  'facebook',
  'qazwsx',
  'qazwsxedc',
  'changeme',
  'passw0rd',
  'p@ssword',
  'p@ssw0rd',
  'pa$$word',
  'pa$$w0rd',
  'motdepasse',
  'bonjour',
  'azerty123',
  'soleil',
  'cheval',
  'chocolat',
  'doudou',
  'amour',
]);

// Patterns triviaux : N occurrences du même caractère, ou suites simples.
const TRIVIAL_PATTERNS: ReadonlyArray<RegExp> = [
  /^(.)\1+$/, // "aaaaaaaa", "11111111"
  /^0123456789?$/,
  /^9876543210?$/,
];

export function isCommonPassword(password: string): boolean {
  const normalized = password.toLowerCase().trim();
  if (normalized.length === 0) {
    return false;
  }
  if (COMMON_PASSWORDS.has(normalized)) {
    return true;
  }
  return TRIVIAL_PATTERNS.some((pattern) => pattern.test(normalized));
}
