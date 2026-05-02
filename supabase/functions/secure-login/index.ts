// AUTH-VULN-03 fix (Free-plan path, Phase 0): client-callable login wrapper.
//
// On Supabase Pro+, per-account lockout is enforced by the
// `password_verification_attempt` Auth Hook (handler: `auth-pre-login`).
// On the Free plan, that hook is unavailable, so we add this wrapper as a
// best-effort substitute. The mobile/web client calls `secure-login`
// instead of `supabase.auth.signInWithPassword()` directly. Any caller that
// bypasses the wrapper and hits `/auth/v1/token` directly with the public
// anon key will NOT be subject to the lockout — that's an accepted
// residual risk on the Free plan, documented in TRUST_BOUNDARIES.md and
// the SECURITY_FIX_PLAN_2026_05.md.
//
// Once you upgrade to Pro+ and enable the Auth Hook, this wrapper becomes
// redundant and is a deprecation candidate (DEPLOYMENT_PLAN_2026_05.md
// Phase 8.3).
//
// Flow:
//   1. Parse + validate `{email, password}` body.
//   2. Resolve client IP (cf-connecting-ip in prod).
//   3. Call `check_login_locked(email)` RPC. If locked → 429 reject.
//   4. Call `supabase.auth.signInWithPassword({email, password})` with
//      service-role admin client (this performs the actual auth).
//   5. Call `record_login_attempt(email, ip, success)` RPC, regardless of
//      outcome, to update lockout state.
//   6. Return either the session payload (success) or generic error
//      (failure). Same generic error for both "wrong password" and "user
//      doesn't exist" — preserves anti-enumeration.
//
// Note: we forward the full session to the client. The client treats this
// response identically to `signInWithPassword()` and persists the session
// into its Supabase client.
//
// Failure modes (fail-closed by default):
//   - Invalid JSON / missing fields → generic 400 reject.
//   - DB / service unavailable → generic 503 internal error.
//   - Lockout RPC fails → fail-closed (deny login) to avoid silently
//     disabling lockout protection.

import { resolveTrustedClientIp } from '../_shared/clientIp.ts';
import {
  handleCorsPreflightRequest,
  jsonResponse,
  validateCorsOrigin,
} from '../_shared/cors.ts';
import { createServiceRoleClient } from '../_shared/phase2Auth.ts';

const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 128;

const GENERIC_REJECT_MESSAGE = 'Invalid email or password.';
const LOCKOUT_MESSAGE = 'Account temporarily locked due to too many failed login attempts. Please try again later.';
const GENERIC_INTERNAL_MESSAGE = 'Login temporarily unavailable. Please try again later.';

interface LoginRequest {
  email: string;
  password: string;
}

async function parseBody(req: Request): Promise<LoginRequest | null> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return null;
  }
  if (!body || typeof body !== 'object') return null;
  const email = (body as Record<string, unknown>).email;
  const password = (body as Record<string, unknown>).password;
  if (typeof email !== 'string' || typeof password !== 'string') return null;
  if (!email.length || !password.length) return null;
  if (email.length > MAX_EMAIL_LENGTH) return null;
  if (password.length > MAX_PASSWORD_LENGTH) return null;
  return { email: email.trim(), password };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  const corsError = validateCorsOrigin(req);
  if (corsError) return corsError;

  if (req.method !== 'POST') {
    return jsonResponse(
      req,
      { error: 'Method not allowed', code: 'method_not_allowed' },
      { status: 405 },
    );
  }

  const parsed = await parseBody(req);
  if (!parsed) {
    return jsonResponse(
      req,
      { error: GENERIC_REJECT_MESSAGE, code: 'invalid_credentials' },
      { status: 400 },
    );
  }
  const { email, password } = parsed;
  const emailLower = email.toLowerCase();

  let admin;
  try {
    admin = createServiceRoleClient();
  } catch (e) {
    console.error('[secure-login] failed to build service-role client', e);
    return jsonResponse(
      req,
      { error: GENERIC_INTERNAL_MESSAGE, code: 'login_unavailable' },
      { status: 503 },
    );
  }

  const clientIp = resolveTrustedClientIp(req);
  // Convert string IP to inet-friendly form. resolveTrustedClientIp returns
  // 'unknown' if it can't determine — use a sentinel inet that won't collide
  // with real client IPs.
  const ipForRpc = clientIp === 'unknown' ? '0.0.0.0' : clientIp;

  // 1. Pre-flight lockout check.
  try {
    const { data: lockData, error: lockErr } = await admin.rpc(
      'check_login_locked',
      { p_email: emailLower },
    );
    if (lockErr) {
      console.error('[secure-login] check_login_locked failed', {
        error_code: lockErr.code,
      });
      return jsonResponse(
        req,
        { error: GENERIC_INTERNAL_MESSAGE, code: 'login_unavailable' },
        { status: 503 },
      );
    }
    const lockRow = Array.isArray(lockData) ? lockData[0] : lockData;
    if (lockRow?.locked) {
      return jsonResponse(
        req,
        { error: LOCKOUT_MESSAGE, code: 'account_locked' },
        { status: 429 },
      );
    }
  } catch (e) {
    console.error('[secure-login] lockout pre-check threw', e);
    return jsonResponse(
      req,
      { error: GENERIC_INTERNAL_MESSAGE, code: 'login_unavailable' },
      { status: 503 },
    );
  }

  // 2. Attempt sign-in. This is the actual GoTrue call — the wrapper just
  //    forwards the session if successful.
  const { data: signInData, error: signInError } =
    await admin.auth.signInWithPassword({ email, password });

  const success = !signInError && !!signInData?.session;

  // 3. Record the attempt. Do NOT block the response on this — we want the
  //    user to get their session ASAP and the lockout state to update
  //    asynchronously. Errors here are logged but don't fail the response.
  void admin
    .rpc('record_login_attempt', {
      p_email: emailLower,
      p_ip: ipForRpc,
      p_success: success,
    })
    .then((res: { error: { code?: string } | null }) => {
      if (res.error) {
        console.warn('[secure-login] record_login_attempt failed (non-fatal)', {
          error_code: res.error.code,
        });
      }
    });

  // 4. Return the result.
  if (!success) {
    // Generic message — same for "wrong password" and "user not found" —
    // preserves anti-enumeration (matches GoTrue's own behavior).
    return jsonResponse(
      req,
      { error: GENERIC_REJECT_MESSAGE, code: 'invalid_credentials' },
      { status: 401 },
    );
  }

  // Success — forward the session payload. The client will treat this
  // shape identically to signInWithPassword().
  return jsonResponse(
    req,
    {
      ok: true,
      session: signInData.session,
      user: signInData.user,
    },
    { status: 200 },
  );
});
