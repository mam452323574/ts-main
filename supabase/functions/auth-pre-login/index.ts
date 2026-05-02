// AUTH-VULN-03 fix (Wave 1.2d): per-account login lockout enforcement.
//
// This Edge Function is the handler for Supabase's "Password Verification
// Attempt" Auth Hook (`auth.password_verification_attempt`). It is called by
// GoTrue on every `POST /auth/v1/token?grant_type=password` attempt and can
// reject the attempt by returning `{decision: "reject"}`.
//
// IMPORTANT setup:
//   1. Supabase plan must be Pro+ to use HTTP Auth Hooks.
//   2. Configure the hook in dashboard:
//        Authentication → Hooks → Password Verification Attempt
//        URL: https://<project>.supabase.co/functions/v1/auth-pre-login
//        Type: HTTP
//        Secret: generate (also set as `AUTH_HOOK_SECRET` env var).
//   3. Set the Edge Function env var `AUTH_HOOK_SECRET` to the same value.
//
// Hook payload (per Supabase docs as of 2026-04):
//   {
//     "user_id": "uuid",
//     "valid":   true|false   // result of password verification
//   }
//
// We do NOT receive the email directly — we look it up via user_id when needed.
// (`user_id` is always provided because GoTrue resolves the email-to-user
// before firing the hook.)
//
// Hook response format:
//   { "decision": "continue" }                            // allow
//   { "decision": "reject", "message": "human string" }   // block
//
// Failure mode: if any error occurs (DB down, env var missing, etc.) we
// **fail closed** and reject the login. Better to deny one user than to
// silently disable lockout protection. The exception is the hook-secret
// verification: if the secret check itself fails we return 401, which
// causes GoTrue to fall back to its default behavior (allow). That's
// intentional — we don't want a misconfigured hook to lock out everyone.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

interface HookPayload {
  user_id?: string;
  valid?: boolean;
  // Some Supabase versions also include `email`; tolerate both.
  email?: string;
}

interface HookDecision {
  decision: 'continue' | 'reject';
  message?: string;
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function getEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function rejectResponse(message: string, status = 200): Response {
  // Hooks return 200 with a `reject` decision; reserve non-200 for transport
  // errors so GoTrue's hook telemetry stays clean.
  const body: HookDecision = { decision: 'reject', message };
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function allowResponse(): Response {
  const body: HookDecision = { decision: 'continue' };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  // 1. Method check.
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // 2. Verify the hook secret. This is the only thing protecting the endpoint
  //    from being called by random attackers spoofing failed-login records.
  let expectedSecret: string;
  try {
    expectedSecret = getEnv('AUTH_HOOK_SECRET');
  } catch (e) {
    console.error('[auth-pre-login] AUTH_HOOK_SECRET not set; refusing all calls');
    return new Response('Hook misconfigured', { status: 500 });
  }

  const auth = req.headers.get('authorization') ?? '';
  // Supabase sends `Authorization: Bearer <secret>` per HTTP Auth Hook spec.
  const presented = auth.startsWith('Bearer ') ? auth.slice(7).trim() : auth.trim();
  if (!presented || !constantTimeEquals(presented, expectedSecret)) {
    // Don't return decision here — let GoTrue fall back. See header comment.
    return new Response('Unauthorized', { status: 401 });
  }

  // 3. Parse payload.
  let payload: HookPayload;
  try {
    payload = await req.json();
  } catch {
    console.error('[auth-pre-login] malformed JSON payload');
    return rejectResponse('Login temporarily unavailable. Please try again.');
  }

  const userId = payload.user_id ?? null;
  const valid = payload.valid === true;

  // 4. Resolve email. Required for the (email, ip) lockout key.
  //    If the payload includes email, use it directly. Otherwise look up.
  let emailLower: string | null = payload.email?.toLowerCase() ?? null;

  // 5. Build service-role client.
  let admin;
  try {
    admin = createClient(
      getEnv('SUPABASE_URL'),
      getEnv('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { persistSession: false } },
    );
  } catch (e) {
    console.error('[auth-pre-login] failed to build admin client', e);
    // Fail closed: deny login rather than skip the lockout check.
    return rejectResponse('Login temporarily unavailable. Please try again.');
  }

  // If email wasn't in the payload, look it up via user_id.
  if (!emailLower && userId) {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data?.user?.email) {
      console.error('[auth-pre-login] failed to resolve email for user', {
        userId,
        error_code: error?.code,
      });
      return rejectResponse('Login temporarily unavailable. Please try again.');
    }
    emailLower = data.user.email.toLowerCase();
  }

  if (!emailLower) {
    // No email and no user_id — this shouldn't happen with `password_verification_attempt`,
    // but if it does, we have no key to lock by, so allow the attempt rather than
    // block all logins.
    console.warn('[auth-pre-login] no email or user_id in payload; allowing');
    return allowResponse();
  }

  // 6. Resolve client IP. The hook payload doesn't include the original IP
  //    (since it's a server-to-server call from GoTrue), so we use a sentinel.
  //    For per-account lockout this is acceptable: the attacker is rate-limited
  //    by email, not by IP. (IP-level limits are GoTrue's own.)
  //    A future enhancement would be to extend GoTrue's hook payload spec, but
  //    Supabase doesn't currently expose request IP in this hook.
  const ipPlaceholder = '127.0.0.1'; // INET literal that maps to "hook-internal".

  // 7. Check current lock state BEFORE recording, to avoid logging
  //    a "valid" attempt that we're going to reject anyway.
  if (!valid) {
    const { data: lockData, error: lockErr } = await admin
      .rpc('check_login_locked', { p_email: emailLower });

    if (lockErr) {
      console.error('[auth-pre-login] check_login_locked RPC failed', {
        error_code: lockErr.code,
      });
      return rejectResponse('Login temporarily unavailable. Please try again.');
    }

    const row = Array.isArray(lockData) ? lockData[0] : lockData;
    if (row?.locked) {
      // Already locked — reject without even recording (would extend lock).
      return rejectResponse(
        'Account temporarily locked due to too many failed login attempts. Please try again later.',
      );
    }
  }

  // 8. Record the attempt and apply lockout policy on failure.
  const { data: recordData, error: recordErr } = await admin.rpc(
    'record_login_attempt',
    {
      p_email: emailLower,
      p_ip: ipPlaceholder,
      p_success: valid,
    },
  );

  if (recordErr) {
    console.error('[auth-pre-login] record_login_attempt RPC failed', {
      error_code: recordErr.code,
    });
    // Fail closed.
    return rejectResponse('Login temporarily unavailable. Please try again.');
  }

  const result = Array.isArray(recordData) ? recordData[0] : recordData;
  if (result?.locked) {
    return rejectResponse(
      'Account locked due to too many failed login attempts. Please try again later.',
    );
  }

  // 9. Allow GoTrue to proceed (its own validation already determined `valid`).
  return allowResponse();
});
