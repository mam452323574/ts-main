import { createClient } from 'npm:@supabase/supabase-js@2.58.0';
import {
  getOptionalSocialModerationWorkerHmacSecret,
  getSupabaseServerConfig,
  requireServerEnv,
} from './phase2Env.ts';
import { createPhase2DatabaseError, Phase2HttpError } from './phase2Errors.ts';
import type { Phase2ModerationActor } from './phase2Types.ts';

interface AuthenticatedEdgeUser {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}

export const SOCIAL_MODERATION_WORKER_TIMESTAMP_HEADER = 'x-worker-timestamp';
export const SOCIAL_MODERATION_WORKER_NONCE_HEADER = 'x-worker-nonce';
export const SOCIAL_MODERATION_WORKER_SIGNATURE_HEADER = 'x-worker-signature';

const SOCIAL_MODERATION_WORKER_SIGNATURE_PREFIX = 'sha256=';
const SOCIAL_MODERATION_WORKER_SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;
const SOCIAL_MODERATION_WORKER_NONCE_PURPOSE = 'social_moderation_worker';
const textEncoder = new TextEncoder();

function readOptionalMetadataString(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
) {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function resolveAuthenticatedUserEmail(user: AuthenticatedEdgeUser) {
  return typeof user.email === 'string' && user.email.trim().length > 0
    ? user.email.trim()
    : `${user.id}@oauth.temp`;
}

function resolveAuthenticatedUserAvatarUrl(user: AuthenticatedEdgeUser) {
  const userMetadata = user.user_metadata;

  return (
    readOptionalMetadataString(userMetadata, 'avatar_url') ||
    readOptionalMetadataString(userMetadata, 'avatarUrl') ||
    readOptionalMetadataString(userMetadata, 'picture')
  );
}

export function createServiceRoleClient() {
  const { supabaseUrl, serviceRoleKey } = getSupabaseServerConfig();

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function getSupabaseUrlOrThrow() {
  return requireServerEnv('SUPABASE_URL', {
    code: 'missing_supabase_url',
    message: 'SUPABASE_URL is not configured',
  });
}

export function readAuthorizationBearerToken(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    throw new Phase2HttpError(401, 'missing_authorization', 'Missing authorization header');
  }

  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) {
    throw new Phase2HttpError(401, 'invalid_authorization', 'Invalid authorization header');
  }

  return token;
}

function decodeJwtPayload(token: string) {
  try {
    const payloadSegment = token.split('.')[1];
    if (!payloadSegment) {
      return null;
    }

    const base64 = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
    const paddedBase64 = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      '=',
    );
    return JSON.parse(atob(paddedBase64)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function assertAal2BearerToken(_token: string) {
  // MFA / AAL2 a ete retiree de l'app (decision produit). Cette verification
  // etait appelee par requireAuthenticatedUser pour bloquer les sessions AAL1
  // sur les operations sensibles. Avec la suppression de la MFA, AAL1 est le
  // niveau maximum atteignable et ce check ferait crasher toutes les Edge
  // Functions qui l'appellent. On neutralise sans supprimer la fonction pour
  // garder requireAuthenticatedUser fonctionnelle sans toucher aux call-sites.
  //
  // ┌─────────────────────────────────────────────────────────────────────┐
  // │ ACCEPTED RISK 2026-05 (post-Shannon pentest, finding AUTH-VULN-07): │
  // │ This no-op means any password-only (AAL1) session can access ALL    │
  // │ 34 authenticated Edge Functions, including health-data and billing  │
  // │ surfaces. The pentest proved a brute-force-to-takeover chain in     │
  // │ ≤8 attempts against any known account email.                        │
  // │                                                                     │
  // │ This is documented as an accepted residual risk in:                 │
  // │   - TRUST_BOUNDARIES.md §"Accepted residual risk: AAL1-only"        │
  // │   - SECURITY_AUDIT_SUPABASE.md §"MFA disabled"                      │
  // │                                                                     │
  // │ Compensating controls (Waves 1-3 of SECURITY_FIX_PLAN_2026_05.md):  │
  // │   - Per-account login lockout (auth-pre-login hook + RPCs)          │
  // │   - secure-signup wrapper + nonce trigger for signup controls       │
  // │   - App email verification gate (user_profiles.email_verified)      │
  // │   - relaxed 8-char password policy requiring lowercase + digit       │
  // │                                                                     │
  // │ Re-enabling MFA: restore the AAL2 check (decoded JWT.aal === 'aal2')│
  // │ here, then audit Edge Functions for which ones legitimately need to │
  // │ accept AAL1 (e.g. login-flow itself).                               │
  // └─────────────────────────────────────────────────────────────────────┘
}

function arrayBufferToHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(value));
  return arrayBufferToHex(digest);
}

export function buildSocialModerationWorkerSignaturePayload(options: {
  req: Request;
  rawBody: string;
  timestamp: string;
  nonce: string;
}) {
  const pathname = new URL(options.req.url).pathname;
  return [
    options.req.method.toUpperCase(),
    pathname,
    options.timestamp,
    options.nonce,
    options.rawBody,
  ].join('.');
}

async function createHmacSha256Signature(payload: string, secret: string) {
  const signingKey = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    {
      name: 'HMAC',
      hash: 'SHA-256',
    },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    signingKey,
    textEncoder.encode(payload),
  );

  return `${SOCIAL_MODERATION_WORKER_SIGNATURE_PREFIX}${arrayBufferToHex(signature)}`;
}

export async function createSocialModerationWorkerSignature(options: {
  req: Request;
  rawBody: string;
  timestamp: string;
  nonce: string;
  secret: string;
}) {
  return createHmacSha256Signature(
    buildSocialModerationWorkerSignaturePayload(options),
    options.secret,
  );
}

// Constant-time string comparison. Now exported (AUTH-VULN-06 fix) so
// other Edge Functions (e.g. revenuecat-webhook) can avoid the timing-unsafe
// `===` / `!==` operators when comparing secrets / bearer tokens.
export function timingSafeEqual(left: string, right: string) {
  const maxLength = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;

  for (let index = 0; index < maxLength; index += 1) {
    mismatch |=
      (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return mismatch === 0;
}

export async function requireAuthenticatedUserAllowingAal1(client: any, req: Request) {
  const token = readAuthorizationBearerToken(req);

  const {
    data: { user },
    error,
  } = await client.auth.getUser(token);

  if (error || !user) {
    throw new Phase2HttpError(401, 'invalid_authentication', 'Invalid authentication');
  }

  return user;
}

export async function requireAuthenticatedUser(client: any, req: Request) {
  const token = readAuthorizationBearerToken(req);
  assertAal2BearerToken(token);

  const {
    data: { user },
    error,
  } = await client.auth.getUser(token);

  if (error || !user) {
    throw new Phase2HttpError(401, 'invalid_authentication', 'Invalid authentication');
  }

  return user;
}

export async function ensureUserProfileExistsForAuthenticatedUser(
  client: any,
  user: AuthenticatedEdgeUser,
) {
  const readExistingProfile = async () => {
    const { data, error } = await client
      .from('user_profiles')
      .select('id, email, username, avatar_url, account_tier')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      throw createPhase2DatabaseError(error, {
        contextLabel: 'Authenticated user profile lookup',
        fallbackCode: 'user_profile_lookup_failed',
        fallbackMessage: 'Failed to verify the authenticated user profile',
        relationName: 'user_profiles',
      });
    }

    return data ?? null;
  };

  const existingProfile = await readExistingProfile();
  if (existingProfile) {
    return existingProfile;
  }

  const { data: createdProfile, error: insertError } = await client
    .from('user_profiles')
    .insert({
      id: user.id,
      email: resolveAuthenticatedUserEmail(user),
      username: null,
      avatar_url: resolveAuthenticatedUserAvatarUrl(user),
    })
    .select('id, email, username, avatar_url, account_tier')
    .single();

  if (!insertError && createdProfile) {
    return createdProfile;
  }

  if (insertError?.code === '23505') {
    const duplicatedProfile = await readExistingProfile();
    if (duplicatedProfile) {
      return duplicatedProfile;
    }
  }

  throw createPhase2DatabaseError(insertError, {
    contextLabel: 'Authenticated user profile repair',
    fallbackCode: 'user_profile_repair_failed',
    fallbackMessage: 'Failed to repair the authenticated user profile',
    relationName: 'user_profiles',
  });
}

function hasSocialModerationWorkerSignatureHeaders(req: Request) {
  return Boolean(
    req.headers.get(SOCIAL_MODERATION_WORKER_TIMESTAMP_HEADER) ||
      req.headers.get(SOCIAL_MODERATION_WORKER_NONCE_HEADER) ||
      req.headers.get(SOCIAL_MODERATION_WORKER_SIGNATURE_HEADER),
  );
}

function readRequiredWorkerHeader(req: Request, headerName: string) {
  const value = req.headers.get(headerName);
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Phase2HttpError(
      401,
      'missing_worker_signature',
      'Missing moderation worker signature headers',
    );
  }

  return value.trim();
}

async function rememberSocialModerationWorkerNonce(
  client: any,
  nonce: string,
) {
  const now = new Date();
  const nonceHash = await sha256Hex(nonce);

  await client
    .from('edge_request_nonces')
    .delete()
    .eq('purpose', SOCIAL_MODERATION_WORKER_NONCE_PURPOSE)
    .lte('expires_at', now.toISOString());

  const { error } = await client.from('edge_request_nonces').insert({
    purpose: SOCIAL_MODERATION_WORKER_NONCE_PURPOSE,
    nonce_hash: nonceHash,
    expires_at: new Date(
      now.getTime() + SOCIAL_MODERATION_WORKER_SIGNATURE_TOLERANCE_MS,
    ).toISOString(),
  });

  if (!error) {
    return;
  }

  if (error.code === '23505') {
    throw new Phase2HttpError(
      401,
      'replayed_worker_nonce',
      'Moderation worker signature nonce was already used',
    );
  }

  throw createPhase2DatabaseError(error, {
    contextLabel: 'Moderation worker nonce persistence',
    fallbackCode: 'worker_nonce_persist_failed',
    fallbackMessage: 'Failed to persist moderation worker nonce',
    relationName: 'edge_request_nonces',
  });
}

async function requireSocialModerationWorkerSignature(
  client: any,
  req: Request,
  rawBody: string,
): Promise<Phase2ModerationActor> {
  const secret = getOptionalSocialModerationWorkerHmacSecret();
  if (!secret) {
    throw new Phase2HttpError(
      500,
      'missing_worker_hmac_secret',
      'PHASE2_SOCIAL_MODERATION_WORKER_HMAC_SECRET is not configured',
    );
  }

  const timestamp = readRequiredWorkerHeader(
    req,
    SOCIAL_MODERATION_WORKER_TIMESTAMP_HEADER,
  );
  const nonce = readRequiredWorkerHeader(req, SOCIAL_MODERATION_WORKER_NONCE_HEADER);
  const signature = readRequiredWorkerHeader(
    req,
    SOCIAL_MODERATION_WORKER_SIGNATURE_HEADER,
  );

  if (nonce.length > 256) {
    throw new Phase2HttpError(401, 'invalid_worker_nonce', 'Invalid worker nonce');
  }

  const timestampMs = Date.parse(timestamp);
  if (
    !Number.isFinite(timestampMs) ||
    Math.abs(Date.now() - timestampMs) >
      SOCIAL_MODERATION_WORKER_SIGNATURE_TOLERANCE_MS
  ) {
    throw new Phase2HttpError(
      401,
      'stale_worker_signature',
      'Moderation worker signature timestamp is outside the allowed window',
    );
  }

  const expectedSignature = await createSocialModerationWorkerSignature({
    req,
    rawBody,
    timestamp,
    nonce,
    secret,
  });

  if (!timingSafeEqual(signature, expectedSignature)) {
    throw new Phase2HttpError(
      401,
      'invalid_worker_signature',
      'Invalid moderation worker signature',
    );
  }

  await rememberSocialModerationWorkerNonce(client, nonce);

  return {
    actor_type: 'system',
    actor_id: null,
    actor_label: 'social-moderation-worker',
  };
}

export async function requireSocialModerationWorkerOrAdmin(
  client: any,
  req: Request,
  options: {
    rawBody?: string;
  } = {},
): Promise<Phase2ModerationActor> {
  if (hasSocialModerationWorkerSignatureHeaders(req)) {
    if (typeof options.rawBody !== 'string') {
      throw new Phase2HttpError(
        500,
        'missing_worker_signature_body',
        'Moderation worker signature verification requires the raw request body',
      );
    }

    return requireSocialModerationWorkerSignature(client, req, options.rawBody);
  }

  const token = readAuthorizationBearerToken(req);

  assertAal2BearerToken(token);

  const {
    data: { user },
    error,
  } = await client.auth.getUser(token);

  if (error || !user) {
    throw new Phase2HttpError(401, 'invalid_authentication', 'Invalid authentication');
  }

  await requireAdminUserProfile(client, user.id);

  return {
    actor_type: 'admin',
    actor_id: user.id,
    actor_label: null,
  };
}

export async function requireAdminUserProfile(client: any, userId: string) {
  const { data: profile, error } = await client
    .from('user_profiles')
    .select('id, account_tier')
    .eq('id', userId)
    .maybeSingle();

  if (error || !profile) {
    throw new Phase2HttpError(403, 'admin_profile_missing', 'Admin profile not found');
  }

  if (profile.account_tier !== 'admin') {
    throw new Phase2HttpError(403, 'admin_required', 'Admin access is required');
  }

  return profile;
}

// S-04 — audit trail des actions admin destructrices.
// Chaque appel d'une Edge Function social-admin-* loggue un evenement dans
// public.admin_audit_events (table cree par 20260425143000). Le service_role
// est le seul GRANT INSERT, donc seuls les Edge Functions ecrivent dedans.
export async function logAdminAuditEvent(
  client: any,
  options: {
    actorId: string;
    action: string;
    requestId?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await client.from('admin_audit_events').insert({
      actor_id: options.actorId,
      action: options.action,
      request_id: options.requestId ?? null,
      metadata: options.metadata ?? {},
    });
  } catch (error) {
    // Audit log failures must not break the underlying admin action — they
    // surface in observability (logPhase2Error) instead. The DB row is best
    // effort; a missing row triggers an alert in the audit dashboard.
    // eslint-disable-next-line no-console
    console.error('[phase2Auth] Failed to write admin_audit_events row', error);
  }
}

// S-03 — rate limit glissant pour les Edge Functions admin destructrices.
// Compte les actions du meme actor_id sur les `windowMs` derniers ms et
// refuse si le seuil est atteint. Stockage = admin_audit_events (deja cree).
// Les actions whitelistees sont uniquement celles passees via `actionPattern`
// pour ne pas bloquer un admin legitime qui modere de la queue (action='approve').
export async function enforceAdminRateLimit(
  client: any,
  options: {
    actorId: string;
    actionPattern: string;
    maxActions: number;
    windowMs: number;
  },
): Promise<void> {
  const since = new Date(Date.now() - options.windowMs).toISOString();

  const { count, error } = await client
    .from('admin_audit_events')
    .select('id', { count: 'exact', head: true })
    .eq('actor_id', options.actorId)
    .like('action', options.actionPattern)
    .gte('created_at', since);

  if (error) {
    // En cas d'echec de la lecture du compteur, on log et on laisse passer
    // l'action (fail-open). Bloquer un admin legitime sur un probleme reseau
    // serait pire que d'autoriser N+1 actions.
    // eslint-disable-next-line no-console
    console.error('[phase2Auth] Failed to read admin_audit_events for rate limit', error);
    return;
  }

  if ((count ?? 0) >= options.maxActions) {
    throw new Phase2HttpError(
      429,
      'admin_rate_limit_exceeded',
      `Admin rate limit exceeded: ${options.maxActions} ${options.actionPattern} per ${
        options.windowMs / 60000
      } minutes`,
    );
  }
}
