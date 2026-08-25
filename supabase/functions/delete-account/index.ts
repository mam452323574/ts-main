import {
  handleCorsPreflightRequest,
  jsonResponse,
  validateCorsOrigin,
} from '../_shared/cors.ts';
import { createServiceRoleClient, requireAuthenticatedUser } from '../_shared/phase2Auth.ts';
import {
  createPhase2DatabaseError,
  Phase2HttpError,
  toPhase2ErrorPayload,
} from '../_shared/phase2Errors.ts';
import {
  createRequestId,
  logPhase2Error,
} from '../_shared/phase2Observability.ts';
import { readOptionalServerEnv } from '../_shared/phase2Env.ts';
import {
  assertNoUnknownKeys,
  isRecord,
  PHASE2_SOCIAL_BUCKET,
  readJsonBody,
} from '../_shared/phase2Utils.ts';
import {
  removeStorageObjectsIndividually,
  removeUserAvatar,
} from '../_shared/phase2SocialAdminActions.ts';

const DELETE_ACCOUNT_REQUEST_KEYS = [
  'confirmation',
  'apple_authorization_code',
] as const;
const DELETE_ACCOUNT_CONFIRMATION = 'DELETE_ACCOUNT';
const DEFAULT_APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
const DEFAULT_APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';

type AppleRevokeResult =
  | { attempted: false; reason: 'authorization_code_missing' | 'server_not_configured' }
  | {
      attempted: true;
      success: true;
      token_type_hint: 'refresh_token' | 'access_token';
    }
  | {
      attempted: true;
      success: false;
      reason: 'token_exchange_failed' | 'token_missing' | 'revoke_failed' | 'network_error';
      status?: number;
    };

function getPhase2ErrorStatus(error: unknown) {
  return error instanceof Phase2HttpError ? error.status : 500;
}

async function readDeleteAccountRequest(req: Request) {
  const payload = await readJsonBody(req, { maxBytes: 4096 });

  if (!isRecord(payload)) {
    throw new Phase2HttpError(400, 'invalid_payload', 'Request body must be an object');
  }

  assertNoUnknownKeys(payload, DELETE_ACCOUNT_REQUEST_KEYS, 'Delete account request');

  if (payload.confirmation !== DELETE_ACCOUNT_CONFIRMATION) {
    throw new Phase2HttpError(
      400,
      'delete_account_confirmation_required',
      'Account deletion confirmation is required',
    );
  }

  const rawAppleAuthorizationCode = payload.apple_authorization_code;
  if (rawAppleAuthorizationCode === undefined || rawAppleAuthorizationCode === null) {
    return { appleAuthorizationCode: null };
  }

  if (
    typeof rawAppleAuthorizationCode !== 'string' ||
    rawAppleAuthorizationCode.trim().length === 0 ||
    rawAppleAuthorizationCode.length > 2048
  ) {
    throw new Phase2HttpError(
      400,
      'invalid_apple_authorization_code',
      'Apple authorization code must be a non-empty string',
    );
  }

  return { appleAuthorizationCode: rawAppleAuthorizationCode.trim() };
}

function getAppleRevokeConfig() {
  const clientId = readOptionalServerEnv('APPLE_SIGN_IN_CLIENT_ID');
  const clientSecret = readOptionalServerEnv('APPLE_SIGN_IN_CLIENT_SECRET');

  if (!clientId || !clientSecret) {
    return null;
  }

  return {
    clientId,
    clientSecret,
    tokenUrl:
      readOptionalServerEnv('APPLE_SIGN_IN_TOKEN_URL') ?? DEFAULT_APPLE_TOKEN_URL,
    revokeUrl:
      readOptionalServerEnv('APPLE_SIGN_IN_REVOKE_URL') ?? DEFAULT_APPLE_REVOKE_URL,
  };
}

async function postAppleForm(url: string, params: URLSearchParams) {
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
}

async function revokeAppleAuthorizationCode(
  appleAuthorizationCode: string | null,
): Promise<AppleRevokeResult> {
  if (!appleAuthorizationCode) {
    return { attempted: false, reason: 'authorization_code_missing' };
  }

  const config = getAppleRevokeConfig();
  if (!config) {
    return { attempted: false, reason: 'server_not_configured' };
  }

  try {
    const tokenResponse = await postAppleForm(
      config.tokenUrl,
      new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code: appleAuthorizationCode,
        grant_type: 'authorization_code',
      }),
    );

    if (!tokenResponse.ok) {
      return {
        attempted: true,
        success: false,
        reason: 'token_exchange_failed',
        status: tokenResponse.status,
      };
    }

    const tokenPayload = await tokenResponse.json().catch(() => ({}));
    const refreshToken =
      typeof tokenPayload?.refresh_token === 'string'
        ? tokenPayload.refresh_token
        : null;
    const accessToken =
      typeof tokenPayload?.access_token === 'string'
        ? tokenPayload.access_token
        : null;
    const token = refreshToken ?? accessToken;
    const tokenTypeHint = refreshToken ? 'refresh_token' : 'access_token';

    if (!token) {
      return {
        attempted: true,
        success: false,
        reason: 'token_missing',
      };
    }

    const revokeResponse = await postAppleForm(
      config.revokeUrl,
      new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        token,
        token_type_hint: tokenTypeHint,
      }),
    );

    if (!revokeResponse.ok) {
      return {
        attempted: true,
        success: false,
        reason: 'revoke_failed',
        status: revokeResponse.status,
      };
    }

    return {
      attempted: true,
      success: true,
      token_type_hint: tokenTypeHint,
    };
  } catch (_error) {
    return {
      attempted: true,
      success: false,
      reason: 'network_error',
    };
  }
}

async function listUserSocialAssetPaths(client: any, userId: string) {
  const { data, error } = await client
    .from('social_posts')
    .select('asset_path')
    .eq('author_id', userId);

  if (error) {
    throw createPhase2DatabaseError(error, {
      contextLabel: 'Account deletion social asset lookup',
      fallbackCode: 'delete_account_social_asset_lookup_failed',
      fallbackMessage: 'Failed to inspect social assets before account deletion',
      relationName: 'social_posts',
    });
  }

  return (Array.isArray(data) ? data : [])
    .map((row) => typeof row?.asset_path === 'string' ? row.asset_path : null)
    .filter((path): path is string => typeof path === 'string' && path.trim().length > 0);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  const corsError = validateCorsOrigin(req);
  if (corsError) {
    return corsError;
  }

  const requestId = createRequestId();

  try {
    if (req.method !== 'POST') {
      throw new Phase2HttpError(405, 'method_not_allowed', 'Method not allowed');
    }

    const deleteRequest = await readDeleteAccountRequest(req);

    const client = createServiceRoleClient();
    const user = await requireAuthenticatedUser(client, req);
    const userId = user.id;
    const appleRevoke = await revokeAppleAuthorizationCode(
      deleteRequest.appleAuthorizationCode,
    );

    const socialAssetPaths = await listUserSocialAssetPaths(client, userId);
    const socialAssetCleanup = await removeStorageObjectsIndividually(
      client,
      PHASE2_SOCIAL_BUCKET,
      socialAssetPaths,
    );
    if (socialAssetCleanup.failedPaths.length > 0) {
      throw new Phase2HttpError(
        503,
        'delete_account_social_asset_cleanup_failed',
        'Failed to remove all social assets before account deletion',
        { failed_path_count: socialAssetCleanup.failedPaths.length },
      );
    }

    const { data: scanPurgeResult, error: scanPurgeError } = await client.rpc(
      'purge_user_scan_data',
      { p_user_id: userId },
    );
    if (scanPurgeError) {
      throw createPhase2DatabaseError(scanPurgeError, {
        contextLabel: 'Account deletion scan purge',
        fallbackCode: 'delete_account_scan_purge_failed',
        fallbackMessage: 'Failed to purge scan data before account deletion',
        rpcName: 'purge_user_scan_data',
      });
    }

    const avatarCleanup = await removeUserAvatar(client, userId);
    if (avatarCleanup.failedAvatarPaths.length > 0) {
      throw new Phase2HttpError(
        503,
        'delete_account_avatar_cleanup_failed',
        'Failed to remove all avatar assets before account deletion',
        { failed_path_count: avatarCleanup.failedAvatarPaths.length },
      );
    }

    const { error: profileDeleteError } = await client
      .from('user_profiles')
      .delete()
      .eq('id', userId);
    if (profileDeleteError) {
      throw createPhase2DatabaseError(profileDeleteError, {
        contextLabel: 'Account profile deletion',
        fallbackCode: 'delete_account_profile_failed',
        fallbackMessage: 'Failed to delete the user profile',
        relationName: 'user_profiles',
      });
    }

    const { error: authDeleteError } = await client.auth.admin.deleteUser(userId);
    if (authDeleteError) {
      throw new Phase2HttpError(
        500,
        'delete_account_auth_failed',
        'Failed to delete the authentication user',
      );
    }

    return jsonResponse(req, {
      success: true,
      user_id: userId,
      scan_purge: scanPurgeResult ?? null,
      social_assets_deleted: socialAssetCleanup.deletedPaths.length,
      avatar_assets_deleted: avatarCleanup.deletedAvatarPaths.length,
      apple_revoke: appleRevoke,
    });
  } catch (error) {
    logPhase2Error('[delete-account] Request failed', error, {
      request_id: requestId,
    });

    return jsonResponse(req, toPhase2ErrorPayload(error, { requestId }), {
      status: getPhase2ErrorStatus(error),
    });
  }
});
