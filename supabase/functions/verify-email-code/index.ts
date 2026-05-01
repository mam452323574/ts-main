import {
  handleCorsPreflightRequest,
  jsonResponse,
  validateCorsOrigin,
} from '../_shared/cors.ts';
import {
  createServiceRoleClient,
  requireAuthenticatedUserAllowingAal1,
} from '../_shared/phase2Auth.ts';
import { Phase2HttpError } from '../_shared/phase2Errors.ts';
import { requireServerEnv } from '../_shared/phase2Env.ts';

const MAX_ATTEMPTS = 5;

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function hashVerificationCode(options: {
  userId: string;
  email: string;
  type: string;
  code: string;
  pepper: string;
}) {
  return sha256Hex(
    `${options.userId}:${options.email.toLowerCase()}:${options.type}:${options.code}:${options.pepper}`,
  );
}

function timingSafeEqual(left: string, right: string) {
  const maxLength = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;

  for (let index = 0; index < maxLength; index += 1) {
    mismatch |=
      (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return mismatch === 0;
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

    const pepper = requireServerEnv('EMAIL_VERIFICATION_CODE_PEPPER', {
      code: 'missing_email_verification_code_pepper',
      message: 'EMAIL_VERIFICATION_CODE_PEPPER is not configured',
    });
    const client = createServiceRoleClient();
    const user = await requireAuthenticatedUserAllowingAal1(client, req);
    const body = await req.json().catch(() => ({}));
    const code = String((body as Record<string, unknown>).code ?? '').trim();
    const email = user.email?.trim().toLowerCase();

    if (!/^\d{6}$/.test(code)) {
      throw new Phase2HttpError(400, 'invalid_code', 'Verification code must contain 6 digits');
    }

    if (!email) {
      throw new Phase2HttpError(400, 'missing_user_email', 'Authenticated user has no email');
    }

    const { data: verificationCode, error: fetchError } = await client
      .from('verification_codes')
      .select('id, code_hash, expires_at, attempts_count')
      .eq('user_id', user.id)
      .eq('email', email)
      .eq('type', 'signup')
      .is('verified_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // U2-θ Phase 3 — anti-enumeration : on retourne le même code générique
    // `code_invalid` pour "code introuvable" et "code expiré". Un attaquant
    // ne peut pas distinguer si un userId a une vérif en cours expirée ou
    // jamais initiée. `too_many_attempts` reste distinct car cette branche
    // nécessite déjà un code valide récemment ⇒ pas de leak d'enumeration.
    if (
      fetchError ||
      !verificationCode ||
      new Date(verificationCode.expires_at).getTime() < Date.now()
    ) {
      throw new Phase2HttpError(400, 'code_invalid', 'Verification code is invalid or has expired');
    }

    if ((verificationCode.attempts_count ?? 0) >= MAX_ATTEMPTS) {
      throw new Phase2HttpError(429, 'too_many_attempts', 'Too many verification attempts');
    }

    const expectedHash = await hashVerificationCode({
      userId: user.id,
      email,
      type: 'signup',
      code,
      pepper,
    });

    if (!timingSafeEqual(String(verificationCode.code_hash), expectedHash)) {
      const newAttempts = (verificationCode.attempts_count ?? 0) + 1;
      await client
        .from('verification_codes')
        .update({ attempts_count: newAttempts })
        .eq('id', verificationCode.id);

      throw new Phase2HttpError(401, 'code_incorrect', 'Verification code is incorrect', {
        remainingAttempts: Math.max(0, MAX_ATTEMPTS - newAttempts),
      });
    }

    const verifiedAt = new Date().toISOString();
    await client
      .from('verification_codes')
      .update({ verified_at: verifiedAt })
      .eq('id', verificationCode.id);

    await client
      .from('user_profiles')
      .update({ email_verified: true })
      .eq('id', user.id);

    return jsonResponse(req, { success: true, verified: true }, { status: 200 });
  } catch (error) {
    const status = error instanceof Phase2HttpError ? error.status : 500;
    const code = error instanceof Phase2HttpError ? error.code : 'verification_failed';
    const message =
      error instanceof Error ? error.message : 'Failed to verify email code';

    console.error('[verify-email-code] failed', { code, message });
    return jsonResponse(req, { error: message, code }, { status });
  }
});
