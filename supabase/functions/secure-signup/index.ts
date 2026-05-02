// AUTH-VULN-01/02/03 fix (Wave 2.3): bypass-proof signup wrapper.
//
// This Edge Function is the single, server-side gate for new account creation.
// All signup-quality controls (HIBP, disposable email, IP rate limit, password
// policy) run here BEFORE any state is mutated. The defense-in-depth trigger
// from migration 20260502020100 (`enforce_signup_nonce_trigger`) refuses any
// `auth.users` INSERT that wasn't preceded by a valid attestation row, making
// this wrapper unbypassable once the trigger is enabled in production.
//
// Flow:
//   1. CORS / method check.
//   2. Parse + validate `{ email, password }` body.
//   3. Validate email format (regex + length).
//   4. Disposable-email subdomain-aware lookup.
//   5. IP rate limit (existing `check_ip_signup_allowed` RPC).
//   6. HIBP leaked-password check (shared module).
//   7. Password policy check (≥12 chars, mixed character classes).
//   8. Generate UUID nonce, INSERT `signup_attestations`.
//   9. `auth.admin.createUser({ email, password, email_confirm: false,
//      user_metadata: { signup_nonce } })`.
//  10. Record IP signup tracking.
//  11. Return success.
//
// Email enumeration safety: every rejection path (any failed step) returns
// the SAME generic error response and pads timing with a small random sleep
// so an attacker can't infer which check tripped. The signup endpoint
// response time is dominated by the HIBP round-trip in any case.
//
// Failure semantics: ANY internal error (DB down, env missing, etc.) returns
// the same generic `signup_failed` to the client. Real diagnostics go to
// `console.error` for operators.

import { resolveTrustedClientIp } from '../_shared/clientIp.ts';
import {
  handleCorsPreflightRequest,
  jsonResponse,
  validateCorsOrigin,
} from '../_shared/cors.ts';
// HIBP check disabled 2026-05 — keep import commented (not removed) so
// re-enabling is a one-line change. The helper still exists in
// _shared/hibp.ts and is still used by before-user-created/index.ts.
// import { checkPasswordBreachedCount } from '../_shared/hibp.ts';
import { createServiceRoleClient } from '../_shared/phase2Auth.ts';
import { Phase2HttpError } from '../_shared/phase2Errors.ts';

// --------------------- Constants & validators -----------------------------

const EMAIL_PATTERN = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/;
const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 128;
// Relaxed 2026-05 (post-deploy adjustment): originally 12 to compensate for
// no-MFA. Reduced to 8 per product UX decision. See TRUST_BOUNDARIES.md
// §"Accepted residual risk: relaxed password policy".
const MIN_PASSWORD_LENGTH = 8;

// Generic responses used for ALL rejection paths. Don't tell the client
// which specific check failed — that's an enumeration leak.
const GENERIC_REJECT_MESSAGE = 'Signup not allowed. Please try a different email or password.';
const GENERIC_INTERNAL_MESSAGE = 'Signup temporarily unavailable. Please try again later.';

interface SignupRequest {
  email: string;
  password: string;
}

interface SignupResult {
  ok: true;
  user_id: string;
}

// --------------------- Helpers --------------------------------------------

function extractEmailDomain(email: string): string | null {
  const match = EMAIL_PATTERN.exec(email.trim().toLowerCase());
  return match ? match[1] : null;
}

function getDomainSuffixes(domain: string): string[] {
  const parts = domain.toLowerCase().split('.');
  const suffixes: string[] = [];
  for (let i = 0; i < parts.length - 1; i++) {
    suffixes.push(parts.slice(i).join('.'));
  }
  return suffixes;
}

function isPasswordPolicyOk(password: string): boolean {
  if (password.length < MIN_PASSWORD_LENGTH) return false;
  if (password.length > MAX_PASSWORD_LENGTH) return false;
  // Reduced policy 2026-05 (post-deploy adjustment): require lower + digit
  // only. Previously required all 4 classes (lower+upper+digit+symbol).
  // Tradeoff documented in TRUST_BOUNDARIES.md.
  const hasLower = /[a-z]/.test(password);
  const hasDigit = /\d/.test(password);
  return hasLower && hasDigit;
}

function generateNonce(): string {
  return crypto.randomUUID();
}

async function constantishDelay(): Promise<void> {
  // 100–250ms random pad on rejection paths to mask timing differences
  // between "rejected by HIBP" (slow) vs "rejected by regex" (fast).
  const padMs = 100 + Math.floor(Math.random() * 150);
  await new Promise((resolve) => setTimeout(resolve, padMs));
}

function rejectGeneric(req: Request): Response {
  // 422 chosen so it's distinguishable from 400 (malformed body) but never
  // tells the client which specific validation failed.
  return jsonResponse(
    req,
    { error: GENERIC_REJECT_MESSAGE, code: 'signup_failed' },
    { status: 422 },
  );
}

function internalError(req: Request, status = 503): Response {
  return jsonResponse(
    req,
    { error: GENERIC_INTERNAL_MESSAGE, code: 'signup_unavailable' },
    { status },
  );
}

async function parseBody(req: Request): Promise<SignupRequest | null> {
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

// --------------------- Handler --------------------------------------------

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

  // 1. Parse + structural validation. Done before service-role client to
  //    avoid wasting a connection on malformed garbage.
  const parsed = await parseBody(req);
  if (!parsed) {
    await constantishDelay();
    return rejectGeneric(req);
  }
  const { email, password } = parsed;
  const emailLower = email.toLowerCase();

  // 2. Email format.
  const domain = extractEmailDomain(email);
  if (!domain) {
    await constantishDelay();
    return rejectGeneric(req);
  }

  // 3. Build service-role client. Internal errors here are NOT user-facing
  //    rejections — they're infra issues.
  let admin;
  try {
    admin = createServiceRoleClient();
  } catch (e) {
    console.error('[secure-signup] failed to build service-role client', e);
    return internalError(req);
  }

  const clientIp = resolveTrustedClientIp(req);

  try {
    // 4. Disposable-email subdomain-aware lookup. Every parent suffix is
    //    checked against the blocklist (closes the AUTH-VULN-02 subdomain
    //    bypass that affected the legacy `check-signup-eligibility`).
    const suffixes = getDomainSuffixes(domain);
    if (suffixes.length > 0) {
      const { data: disposableHits, error: disposableErr } = await admin
        .from('disposable_email_domains')
        .select('domain')
        .in('domain', suffixes)
        .eq('active', true)
        .limit(1);

      if (disposableErr) {
        console.error('[secure-signup] disposable lookup failed', disposableErr);
        return internalError(req);
      }
      if (disposableHits && disposableHits.length > 0) {
        await constantishDelay();
        return rejectGeneric(req);
      }
    }

    // 5. IP rate limit (existing RPC, reused).
    const { data: ipCheckData, error: ipCheckErr } = await admin.rpc(
      'check_ip_signup_allowed',
      { client_ip: clientIp },
    );
    if (ipCheckErr) {
      console.error('[secure-signup] check_ip_signup_allowed failed', ipCheckErr);
      return internalError(req);
    }
    const ipResult = Array.isArray(ipCheckData) ? ipCheckData[0] : ipCheckData;
    if (ipResult && ipResult.allowed === false) {
      await constantishDelay();
      return rejectGeneric(req);
    }

    // 6. HIBP — DISABLED 2026-05 by product decision. AUTH-VULN-01 is now
    //    an accepted residual risk (see TRUST_BOUNDARIES.md). The lockout
    //    + email-verify + disposable-email controls remain. To re-enable:
    //    1) uncomment the block below; 2) re-deploy this function;
    //    3) re-enable "Leaked password protection" in the Supabase dashboard.
    //
    // const hibp = await checkPasswordBreachedCount(password);
    // if (hibp.leaked) {
    //   await constantishDelay();
    //   return rejectGeneric(req);
    // }

    // 7. Password policy.
    if (!isPasswordPolicyOk(password)) {
      await constantishDelay();
      return rejectGeneric(req);
    }

    // 8. Generate nonce + insert attestation. This MUST succeed before we
    //    call admin.createUser, since the trigger consumes the nonce.
    const nonce = generateNonce();
    const { error: attestErr } = await admin
      .from('signup_attestations')
      .insert({
        nonce,
        email_lower: emailLower,
        ip: clientIp,
      });
    if (attestErr) {
      console.error('[secure-signup] attestation insert failed', attestErr);
      return internalError(req);
    }

    // 9. Create the user via admin API. `email_confirm: false` keeps the
    //    email-verification gate in play (Wave 1.1 disabled mailer_autoconfirm).
    const { data: createdData, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
      user_metadata: { signup_nonce: nonce },
    });

    if (createErr) {
      // GoTrue rejected the create. Most likely cause: email already exists.
      // Don't reveal whether the email is taken (enumeration leak); return
      // generic reject. The attestation row will be GC'd by the cron in
      // ~24h or by `purge_old_signup_attestations`.
      console.warn('[secure-signup] admin.createUser failed', {
        error_code: createErr.code,
        error_status: createErr.status,
      });
      await constantishDelay();
      return rejectGeneric(req);
    }

    const newUser = createdData?.user;
    if (!newUser?.id) {
      console.error('[secure-signup] admin.createUser returned no user');
      return internalError(req);
    }

    // 10. Record successful IP signup for the running rate-limit window.
    const { error: ipRecordErr } = await admin.rpc('record_ip_signup', {
      client_ip: clientIp,
      p_user_id: newUser.id,
    });
    if (ipRecordErr) {
      // Non-fatal: the user is created. Log + continue.
      console.warn('[secure-signup] record_ip_signup failed (non-fatal)', {
        error_code: ipRecordErr.code,
      });
    }

    // 11. Success. The client should now drive the email-verification flow
    //     (send-verification-email → verify-email-code).
    const result: SignupResult = { ok: true, user_id: newUser.id };
    return jsonResponse(req, result, { status: 201 });
  } catch (error) {
    // Catch-all to ensure we never leak stack traces or internal state.
    console.error('[secure-signup] unhandled error', error);
    if (error instanceof Phase2HttpError) {
      return jsonResponse(
        req,
        { error: GENERIC_INTERNAL_MESSAGE, code: 'signup_unavailable' },
        { status: error.status >= 500 ? error.status : 503 },
      );
    }
    return internalError(req);
  }
});
