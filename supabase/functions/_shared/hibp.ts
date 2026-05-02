// Shared HIBP (HaveIBeenPwned) k-anonymity password check.
//
// Extracted from `before-user-created/index.ts` so that both `secure-signup`
// (the new bypass-proof signup wrapper) and the legacy `before-user-created`
// pre-check can share one implementation. See SECURITY_FIX_PLAN_2026_05.md
// (Wave 2.1) for the post-pentest context.
//
// Security model:
//   - The full password (or full SHA-1) NEVER leaves this function. We send
//     only the first 5 hex chars of SHA-1 to HIBP per their range API. The
//     suffix (35 hex chars) is matched locally against HIBP's response.
//   - Add-Padding: true asks HIBP to pad responses to a fixed-ish size so
//     the count of returned suffixes isn't observable from network traffic.
//   - Fail-OPEN on HIBP outage / network error (return `leaked: false`).
//     Rationale: better to allow the signup than break the funnel because of
//     a third-party outage. The other compensating controls (lockout, email
//     verify, password policy) still apply.
//   - Never log the password, the SHA-1, or the prefix.

const HIBP_RANGE_URL = 'https://api.pwnedpasswords.com/range/';
const HIBP_TIMEOUT_MS = 5000;

const textEncoder = new TextEncoder();

async function sha1HexUppercase(input: string): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-1', textEncoder.encode(input));
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0').toUpperCase())
    .join('');
}

export interface HibpCheckResult {
  leaked: boolean;
  count: number;
}

export async function checkPasswordBreachedCount(
  password: string,
  fetchImpl: typeof fetch = fetch,
): Promise<HibpCheckResult> {
  const hash = await sha1HexUppercase(password);
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), HIBP_TIMEOUT_MS);

  try {
    const response = await fetchImpl(`${HIBP_RANGE_URL}${prefix}`, {
      method: 'GET',
      headers: { 'Add-Padding': 'true' },
      signal: controller.signal,
    });

    if (!response.ok) {
      return { leaked: false, count: 0 };
    }

    const body = await response.text();

    for (const line of body.split('\r\n')) {
      const colonIndex = line.indexOf(':');
      if (colonIndex < 0) continue;

      const lineSuffix = line.slice(0, colonIndex).trim();
      if (lineSuffix !== suffix) continue;

      const count = Number.parseInt(line.slice(colonIndex + 1).trim(), 10);
      if (Number.isFinite(count) && count > 0) {
        return { leaked: true, count };
      }
    }

    return { leaked: false, count: 0 };
  } finally {
    clearTimeout(timeoutId);
  }
}
