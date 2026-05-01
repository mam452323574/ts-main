// F-01 mitigation — HIBP password check (HaveIBeenPwned k-anonymity).
//
// This Edge Function is a public, pre-auth endpoint that exposes a single
// check: "is this password present in a known data breach?" — using HIBP's
// k-anonymity range API so the full password (or full SHA-1) never leaves
// this function.
//
// Note on Supabase Auth Hooks: at the time of writing, Supabase's "Auth
// Hooks" do NOT receive the raw password during signup (it is hashed by
// GoTrue before any hook fires). To actually block a leaked password we
// run this as a CLIENT-SIDE precheck: the signup flow calls this endpoint
// with the candidate password BEFORE calling supabase.auth.signUp(), and
// aborts the signup if `leaked: true`. The function is named
// `before-user-created` to stay forward-compatible if Supabase ever exposes
// a true pre-creation hook with password access.
//
// Security model:
//   - Public endpoint (verify_jwt = false in config.toml). It must be public
//     because the user is not yet authenticated at signup.
//   - Receives passwords over HTTPS only (Supabase Edge Functions are TLS).
//   - The password is NEVER logged, persisted, or returned. Only the
//     SHA-1 prefix (5 chars) is sent to HIBP, per their k-anonymity
//     protocol — they cannot recover the full password from a 5-char prefix.
//   - Fail-open: if HIBP is unreachable (timeout / 5xx), we return
//     `leaked: false` and let signup proceed. We prefer keeping the signup
//     funnel available over blocking on a third-party outage.

import {
  handleCorsPreflightRequest,
  jsonResponse,
  validateCorsOrigin,
} from '../_shared/cors.ts';
import { Phase2HttpError } from '../_shared/phase2Errors.ts';

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
      headers: {
        // Add-Padding hides the actual count of returned suffixes from any
        // network observer (HIBP pads the response to a fixed-ish size).
        'Add-Padding': 'true',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      // Fail-open on non-2xx upstream — better to allow signup than to break
      // the funnel because of a HIBP outage.
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  const corsError = validateCorsOrigin(req);
  if (corsError) {
    return corsError;
  }

  try {
    if (req.method !== 'POST') {
      throw new Phase2HttpError(405, 'method_not_allowed', 'Method not allowed');
    }

    const body = await req.json().catch(() => null);
    const password =
      body && typeof body.password === 'string' && body.password.length > 0
        ? body.password
        : null;

    if (!password) {
      throw new Phase2HttpError(
        400,
        'invalid_payload',
        'Password is required and must be a non-empty string',
      );
    }

    let result: HibpCheckResult;
    try {
      result = await checkPasswordBreachedCount(password);
    } catch (error) {
      // Fail-open on network / abort. Never log the password or its hash.
      console.warn('[before-user-created] HIBP check failed, failing open', {
        error_name: error instanceof Error ? error.name : 'unknown',
      });
      result = { leaked: false, count: 0 };
    }

    return jsonResponse(
      req,
      { leaked: result.leaked, count: result.count },
      { status: 200 },
    );
  } catch (error) {
    const status = error instanceof Phase2HttpError ? error.status : 500;
    const code =
      error instanceof Phase2HttpError ? error.code : 'before_user_created_failed';
    const message =
      error instanceof Error ? error.message : 'Failed to validate password';

    console.error('[before-user-created] failed', { code, message });
    return jsonResponse(req, { error: message, code }, { status });
  }
});
