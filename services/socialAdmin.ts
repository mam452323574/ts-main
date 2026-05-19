import { parseSocialCategoryValue } from '@/constants/social';
import {
  createMissingEdgeFunctionRouteMessage,
  getConfiguredSupabaseProjectLabel,
} from '@/services/edgeFunctions';
import { getSupabaseFunctionUrl } from '@/services/runtimeConfig';
import { supabase } from '@/services/supabase';
import type {
  ModerationState,
  SocialAdminAdjustPostReactionsRequest,
  SocialAdminAdjustPostReactionsResponse,
  SocialAdminModerationItem,
  SocialAdminModerationFilter,
  SocialAdminModerationQueueResponse,
  SocialAdminEradicateUserRequest,
  SocialAdminEradicateUserResponse,
  SocialAdminModerateUserRequest,
  SocialAdminModerateUserResponse,
  SocialCategory,
  SocialModerateContentRequest,
  SocialModerateContentResponse,
  SocialReclassifyPostRequest,
  SocialReclassifyPostResponse,
} from '@/types';

interface EdgeFunctionErrorPayload {
  error?: string;
  code?: string;
  details?: unknown;
  request_id?: string;
}

export interface SocialAdminServiceErrorDebugInfo {
  message: string;
  code: string | null;
  status: number | null;
  requestId: string | null;
  functionName: string | null;
  projectLabel: string | null;
  details: unknown;
}

export type SocialAdminFailureKind =
  | 'route_missing'
  | 'authentication'
  | 'admin_access'
  | 'payload_invalid'
  | 'schema_mismatch'
  | 'policy_denied'
  | 'network'
  | 'generic';

export class SocialAdminServiceError extends Error {
  code?: string;
  status?: number;
  details?: unknown;
  requestId?: string;
  functionName?: string;

  constructor(
    message: string,
    options: {
      code?: string;
      status?: number;
      details?: unknown;
      requestId?: string;
      functionName?: string;
    } = {},
  ) {
    super(message);
    this.name = 'SocialAdminServiceError';
    this.code = options.code;
    this.status = options.status;
    this.details = options.details;
    this.requestId = options.requestId;
    this.functionName = options.functionName;
  }
}

function shouldDebugSocialAdminService() {
  return typeof __DEV__ !== 'undefined' && __DEV__ && process.env.NODE_ENV !== 'test';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readEdgeFunctionErrorPayload(value: unknown): EdgeFunctionErrorPayload {
  if (!isRecord(value)) {
    return {};
  }

  return {
    error: typeof value.error === 'string' ? value.error : undefined,
    code: typeof value.code === 'string' ? value.code : undefined,
    details: value.details,
    request_id: typeof value.request_id === 'string' ? value.request_id : undefined,
  };
}

function readRequiredString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readBoolean(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0,
      )
    : [];
}

function readModerationState(value: unknown): ModerationState {
  return value === 'approved' ||
    value === 'rejected' ||
    value === 'flagged' ||
    value === 'hidden' ||
    value === 'removed' ||
    value === 'pending'
    ? value
    : 'pending';
}

function readSocialCategory(value: unknown): SocialCategory | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  return parseSocialCategoryValue(value);
}

function isSocialAdminAuthenticationErrorCode(code?: string | null) {
  return code === 'missing_authentication' ||
    code === 'missing_authorization' ||
    code === 'invalid_authentication' ||
    code === 'invalid_authorization';
}

function isSocialAdminAdminAccessErrorCode(code?: string | null) {
  return code === 'admin_required' || code === 'admin_profile_missing';
}

function isSocialAdminPayloadInvalidErrorCode(code?: string | null) {
  return code === 'social_admin_queue_invalid_payload' ||
    code === 'social_admin_moderate_user_invalid_payload' ||
    code === 'social_admin_eradicate_user_invalid_payload' ||
    code === 'social_admin_adjust_post_reactions_invalid_payload' ||
    code === 'social_reclassify_post_invalid_payload' ||
    code === 'adjust_reactions_invalid_payload' ||
    code === 'eradication_invalid_payload' ||
    code === 'invalid_category' ||
    code === 'invalid_payload' ||
    code === 'invalid_uuid' ||
    code === 'invalid_filter' ||
    code === 'invalid_json' ||
    code === 'payload_too_large';
}

function isSocialAdminSchemaMismatchErrorCode(code?: string | null) {
  return code === 'database_relation_missing' ||
    code === 'database_column_missing' ||
    code === 'database_rpc_missing';
}

function isSocialAdminPolicyDeniedErrorCode(code?: string | null) {
  return code === 'database_policy_denied';
}

function parseSocialAdminModerationItem(value: unknown): SocialAdminModerationItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const contentType = readRequiredString(value.content_type);
  const contentId = readRequiredString(value.content_id);
  const createdAt = readRequiredString(value.created_at);

  if (
    (contentType !== 'post' && contentType !== 'comment') ||
    !contentId ||
    !createdAt
  ) {
    return null;
  }

  const rawReasonCodes = Array.isArray(value.reason_codes) ? value.reason_codes : [];

  return {
    content_type: contentType,
    content_id: contentId,
    author_id: readOptionalString(value.author_id),
    author_username: readOptionalString(value.author_username),
    category: readSocialCategory(value.category),
    content_text: readOptionalString(value.content_text),
    asset_url: readOptionalString(value.asset_url),
    moderation_state: readModerationState(value.moderation_state),
    moderation_reason: readOptionalString(value.moderation_reason),
    moderation_provider: readOptionalString(value.moderation_provider),
    created_at: createdAt,
    open_reports: readNumber(value.open_reports),
    total_reports_24h: readNumber(value.total_reports_24h),
    unique_reporters_24h: readNumber(value.unique_reporters_24h),
    unique_viewer_count: readNumber(value.unique_viewer_count),
    reason_codes: rawReasonCodes.filter(
      (reasonCode): reasonCode is string =>
        typeof reasonCode === 'string' && reasonCode.trim().length > 0,
    ),
    last_reported_at: readOptionalString(value.last_reported_at),
    moderation_queued_at: readOptionalString(value.moderation_queued_at),
    moderation_claimed_at: readOptionalString(value.moderation_claimed_at),
    moderation_completed_at: readOptionalString(value.moderation_completed_at),
    moderation_attempt_count: readNumber(value.moderation_attempt_count),
    moderation_last_error: readOptionalString(value.moderation_last_error),
    raw_like_count: readNumber(value.raw_like_count),
    raw_dislike_count: readNumber(value.raw_dislike_count),
    admin_like_adjustment: readNumber(value.admin_like_adjustment),
    admin_dislike_adjustment: readNumber(value.admin_dislike_adjustment),
    effective_like_count: readNumber(value.effective_like_count),
    effective_dislike_count: readNumber(value.effective_dislike_count),
    author_active_bans: Array.isArray(value.author_active_bans)
      ? value.author_active_bans
          .map((ban) => {
            if (!isRecord(ban)) {
              return null;
            }

            const scope = readOptionalString(ban.scope);
            if (!scope) {
              return null;
            }

            return {
              scope,
              ends_at: readOptionalString(ban.ends_at),
              reason: readOptionalString(ban.reason),
            };
          })
          .filter(
            (
              ban,
            ): ban is SocialAdminModerationItem['author_active_bans'][number] => ban !== null,
          )
      : [],
  };
}

function parseSocialAdminModerationQueueResponse(
  value: unknown,
): SocialAdminModerationQueueResponse {
  if (!isRecord(value)) {
    throw new SocialAdminServiceError(
      `Social moderation queue on Supabase project "${getConfiguredSupabaseProjectLabel()}" returned an invalid payload.`,
      {
        code: 'social_admin_queue_invalid_payload',
        status: 500,
        functionName: 'social-list-moderation-queue',
      },
    );
  }

  const items = Array.isArray(value.items)
    ? value.items
        .map(parseSocialAdminModerationItem)
        .filter((item): item is SocialAdminModerationItem => item !== null)
    : [];

  return {
    success: true,
    items,
    pending_count: readNumber(value.pending_count),
    flagged_count: readNumber(value.flagged_count),
    reported_count: readNumber(value.reported_count),
    needs_review_count: readNumber(value.needs_review_count),
    processed_count: readNumber(value.processed_count),
    limit: readNumber(value.limit, items.length),
    has_more: readBoolean(value.has_more),
    next_cursor: readOptionalString(value.next_cursor),
  };
}

function parseSocialReclassifyPostResponse(
  value: unknown,
): SocialReclassifyPostResponse {
  if (!isRecord(value)) {
    throw new SocialAdminServiceError(
      `Social reclassification on Supabase project "${getConfiguredSupabaseProjectLabel()}" returned an invalid payload.`,
      {
        code: 'social_reclassify_post_invalid_payload',
        status: 500,
        functionName: 'social-reclassify-post',
      },
    );
  }

  const postId = readRequiredString(value.post_id);
  const previousCategory = readSocialCategory(value.previous_category);
  const category = readSocialCategory(value.category);
  const eventId = readRequiredString(value.event_id);

  if (!postId || !previousCategory || !category || !eventId) {
    throw new SocialAdminServiceError(
      `Social reclassification on Supabase project "${getConfiguredSupabaseProjectLabel()}" returned an invalid payload.`,
      {
        code: 'social_reclassify_post_invalid_payload',
        status: 500,
        functionName: 'social-reclassify-post',
      },
    );
  }

  return {
    success: true,
    post_id: postId,
    previous_category: previousCategory,
    category,
    event_id: eventId,
  };
}

function parseSocialAdminModerateUserResponse(
  value: unknown,
): SocialAdminModerateUserResponse {
  if (!isRecord(value)) {
    throw new SocialAdminServiceError(
      `Social user moderation on Supabase project "${getConfiguredSupabaseProjectLabel()}" returned an invalid payload.`,
      {
        code: 'social_admin_moderate_user_invalid_payload',
        status: 500,
        functionName: 'social-admin-moderate-user',
      },
    );
  }

  const action = readRequiredString(value.action);
  const targetUserId = readRequiredString(value.target_user_id);

  if (
    (action !== 'ban_user' && action !== 'revoke_ban' && action !== 'remove_avatar') ||
    !targetUserId
  ) {
    throw new SocialAdminServiceError(
      `Social user moderation on Supabase project "${getConfiguredSupabaseProjectLabel()}" returned an invalid payload.`,
      {
        code: 'social_admin_moderate_user_invalid_payload',
        status: 500,
        functionName: 'social-admin-moderate-user',
      },
    );
  }

  return {
    success: true,
    action,
    target_user_id: targetUserId,
    event_id: readOptionalString(value.event_id),
  };
}

function parseSocialAdminEradicateUserResponse(
  value: unknown,
): SocialAdminEradicateUserResponse {
  if (!isRecord(value)) {
    throw new SocialAdminServiceError(
      `Social user eradication on Supabase project "${getConfiguredSupabaseProjectLabel()}" returned an invalid payload.`,
      {
        code: 'social_admin_eradicate_user_invalid_payload',
        status: 500,
        functionName: 'social-admin-eradicate-user',
      },
    );
  }

  const targetUserId = readRequiredString(value.target_user_id);
  const operationId = readRequiredString(value.operation_id);
  const eventId = readRequiredString(value.event_id);
  const storageCleanupStatus = readRequiredString(value.storage_cleanup_status);

  if (
    !targetUserId ||
    !operationId ||
    !eventId ||
    (
      storageCleanupStatus !== 'completed' &&
      storageCleanupStatus !== 'partial' &&
      storageCleanupStatus !== 'failed'
    )
  ) {
    throw new SocialAdminServiceError(
      `Social user eradication on Supabase project "${getConfiguredSupabaseProjectLabel()}" returned an invalid payload.`,
      {
        code: 'social_admin_eradicate_user_invalid_payload',
        status: 500,
        functionName: 'social-admin-eradicate-user',
      },
    );
  }

  return {
    success: true,
    target_user_id: targetUserId,
    operation_id: operationId,
    event_id: eventId,
    post_count: readNumber(value.post_count),
    own_comment_count: readNumber(value.own_comment_count),
    cascaded_comment_count: readNumber(value.cascaded_comment_count),
    resolved_report_count: readNumber(value.resolved_report_count),
    ban_created: value.ban_created === true,
    storage_cleanup_status: storageCleanupStatus,
    deleted_asset_paths: readStringArray(value.deleted_asset_paths),
    failed_asset_paths: readStringArray(value.failed_asset_paths),
    deleted_avatar_paths: readStringArray(value.deleted_avatar_paths),
    failed_avatar_paths: readStringArray(value.failed_avatar_paths),
  };
}

function parseSocialAdminAdjustPostReactionsResponse(
  value: unknown,
): SocialAdminAdjustPostReactionsResponse {
  if (!isRecord(value)) {
    throw new SocialAdminServiceError(
      `Social post reaction adjustment on Supabase project "${getConfiguredSupabaseProjectLabel()}" returned an invalid payload.`,
      {
        code: 'social_admin_adjust_post_reactions_invalid_payload',
        status: 500,
        functionName: 'social-admin-adjust-post-reactions',
      },
    );
  }

  const postId = readRequiredString(value.post_id);
  const eventId = readRequiredString(value.event_id);

  if (!postId || !eventId) {
    throw new SocialAdminServiceError(
      `Social post reaction adjustment on Supabase project "${getConfiguredSupabaseProjectLabel()}" returned an invalid payload.`,
      {
        code: 'social_admin_adjust_post_reactions_invalid_payload',
        status: 500,
        functionName: 'social-admin-adjust-post-reactions',
      },
    );
  }

  return {
    success: true,
    post_id: postId,
    raw_like_count: readNumber(value.raw_like_count),
    raw_dislike_count: readNumber(value.raw_dislike_count),
    admin_like_adjustment: readNumber(value.admin_like_adjustment),
    admin_dislike_adjustment: readNumber(value.admin_dislike_adjustment),
    effective_like_count: readNumber(value.effective_like_count),
    effective_dislike_count: readNumber(value.effective_dislike_count),
    event_id: eventId,
  };
}

export function getSocialAdminServiceErrorDebugInfo(
  error: unknown,
): SocialAdminServiceErrorDebugInfo {
  if (error instanceof SocialAdminServiceError) {
    return {
      message: error.message,
      code: error.code ?? null,
      status: error.status ?? null,
      requestId: error.requestId ?? null,
      functionName: error.functionName ?? null,
      projectLabel: getConfiguredSupabaseProjectLabel(),
      details: error.details ?? null,
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      code: null,
      status: null,
      requestId: null,
      functionName: null,
      projectLabel: null,
      details: null,
    };
  }

  return {
    message: 'unknown',
    code: null,
    status: null,
    requestId: null,
    functionName: null,
    projectLabel: null,
    details: error ?? null,
  };
}

export function resolveSocialAdminFailureKindFromError(
  error: unknown,
): SocialAdminFailureKind {
  const debugInfo = getSocialAdminServiceErrorDebugInfo(error);

  if (debugInfo.code === 'edge_function_route_missing' || debugInfo.status === 404) {
    return 'route_missing';
  }

  if (debugInfo.code === 'edge_function_network_error') {
    return 'network';
  }

  if (isSocialAdminSchemaMismatchErrorCode(debugInfo.code)) {
    return 'schema_mismatch';
  }

  if (isSocialAdminPolicyDeniedErrorCode(debugInfo.code)) {
    return 'policy_denied';
  }

  if (isSocialAdminAuthenticationErrorCode(debugInfo.code)) {
    return 'authentication';
  }

  if (isSocialAdminAdminAccessErrorCode(debugInfo.code) || debugInfo.status === 403) {
    return 'admin_access';
  }

  if (isSocialAdminPayloadInvalidErrorCode(debugInfo.code)) {
    return 'payload_invalid';
  }

  return 'generic';
}

async function invokeSocialAdminEdgeFunction<TResponse>(options: {
  functionName: string;
  method?: 'GET' | 'POST';
  payload?: Record<string, unknown>;
  queryParams?: Record<string, string | undefined>;
  // S-09 — Permet aux callers de passer Idempotency-Key et autres headers
  // optionnels propages vers l'Edge Function.
  extraHeaders?: Record<string, string>;
}) {
  let functionUrl: string;

  try {
    functionUrl = getSupabaseFunctionUrl(options.functionName);
  } catch {
    throw new SocialAdminServiceError('Supabase URL is not configured', {
      code: 'missing_supabase_url',
      status: 500,
      functionName: options.functionName,
    });
  }

  const requestUrl = new URL(functionUrl);
  if (options.queryParams) {
    Object.entries(options.queryParams).forEach(([key, value]) => {
      if (typeof value === 'string' && value.length > 0) {
        requestUrl.searchParams.set(key, value);
      }
    });
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new SocialAdminServiceError('Authentication required', {
      code: 'missing_authentication',
      status: 401,
      functionName: options.functionName,
    });
  }

  let response: Response;
  try {
    response = await fetch(requestUrl.toString(), {
      method: options.method ?? 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        Accept: 'application/json; charset=utf-8',
        ...(options.method === 'GET'
          ? {}
          : { 'Content-Type': 'application/json' }),
        ...(options.extraHeaders ?? {}),
      },
      ...(options.method === 'GET'
        ? {}
        : { body: JSON.stringify(options.payload ?? {}) }),
    });
  } catch (error) {
    if (shouldDebugSocialAdminService()) {
      console.log('[SocialAdmin] network failure', {
        function_name: options.functionName,
        function_url: requestUrl.toString(),
        supabase_project: getConfiguredSupabaseProjectLabel(),
        details: error,
      });
    }

    throw new SocialAdminServiceError(
      error instanceof Error
        ? error.message
        : `Social admin route "${options.functionName}" could not be reached.`,
      {
        code: 'edge_function_network_error',
        details: error,
        functionName: options.functionName,
      },
    );
  }

  const responseText = await response.text();
  let responsePayload: unknown = null;
  if (responseText.trim().length > 0) {
    try {
      responsePayload = JSON.parse(responseText);
    } catch {
      responsePayload = null;
    }
  }

  if (!response.ok) {
    const errorPayload = readEdgeFunctionErrorPayload(responsePayload);
    const isMissingRoute = response.status === 404;
    const message = isMissingRoute
      ? createMissingEdgeFunctionRouteMessage('Social admin', options.functionName)
      : errorPayload.error ||
        `Social admin route "${options.functionName}" failed (${response.status}).`;

    if (shouldDebugSocialAdminService()) {
      console.log('[SocialAdmin] invoke failed', {
        function_name: options.functionName,
        function_url: requestUrl.toString(),
        supabase_project: getConfiguredSupabaseProjectLabel(),
        status: response.status,
        code: errorPayload.code ?? (isMissingRoute ? 'edge_function_route_missing' : null),
        request_id: errorPayload.request_id ?? null,
        details: errorPayload.details ?? responsePayload,
        message,
      });
    }

    throw new SocialAdminServiceError(message, {
      code: errorPayload.code ?? (isMissingRoute ? 'edge_function_route_missing' : undefined),
      status: response.status,
      details: errorPayload.details ?? responsePayload,
      requestId: errorPayload.request_id,
      functionName: options.functionName,
    });
  }

  return responsePayload as TResponse;
}

export async function fetchSocialAdminModerationQueue(
  filter: SocialAdminModerationFilter = 'needs_review',
  options: {
    limit?: number;
    cursor?: string | null;
  } = {},
) {
  const response = await invokeSocialAdminEdgeFunction<SocialAdminModerationQueueResponse>(
    {
      functionName: 'social-list-moderation-queue',
      method: 'GET',
      queryParams: {
        filter,
        limit: typeof options.limit === 'number' ? String(options.limit) : undefined,
        cursor: options.cursor ?? undefined,
      },
    },
  );

  return parseSocialAdminModerationQueueResponse(response);
}

export async function moderateSocialContent(
  request: SocialModerateContentRequest,
) {
  return invokeSocialAdminEdgeFunction<SocialModerateContentResponse>({
    functionName: 'social-moderate-content',
    method: 'POST',
    payload: request as unknown as Record<string, unknown>,
  });
}

export async function reclassifySocialPost(
  request: SocialReclassifyPostRequest,
) {
  const response = await invokeSocialAdminEdgeFunction<SocialReclassifyPostResponse>({
    functionName: 'social-reclassify-post',
    method: 'POST',
    payload: request as unknown as Record<string, unknown>,
  });

  return parseSocialReclassifyPostResponse(response);
}

function generateAdminIdempotencyKey(): string {
  // S-09 — Genere une cle stable par tentative client. Sur retry (network
  // glitch, double-tap UI), le caller doit reutiliser la meme cle pour que
  // le serveur retourne 409 idempotent_request_already_processed au lieu de
  // re-executer l'action destructive.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function moderateSocialUser(
  request: SocialAdminModerateUserRequest,
  options: { idempotencyKey?: string } = {},
) {
  const idempotencyKey =
    typeof options.idempotencyKey === 'string' && options.idempotencyKey.length > 0
      ? options.idempotencyKey
      : generateAdminIdempotencyKey();

  const response = await invokeSocialAdminEdgeFunction<SocialAdminModerateUserResponse>({
    functionName: 'social-admin-moderate-user',
    method: 'POST',
    payload: request as unknown as Record<string, unknown>,
    extraHeaders: { 'Idempotency-Key': idempotencyKey },
  });

  return parseSocialAdminModerateUserResponse(response);
}

export async function eradicateSocialUser(
  request: SocialAdminEradicateUserRequest,
  options: { idempotencyKey?: string } = {},
) {
  // S-09 — Idempotency-Key stable cote client : si non fourni, on en genere
  // un UUID. Toute retry reseau (network glitch, double-tap) gardera le meme
  // key et la RPC retournera l'outcome de la 1re execution au lieu de
  // re-eradiquer.
  const idempotencyKey =
    typeof options.idempotencyKey === 'string' && options.idempotencyKey.length > 0
      ? options.idempotencyKey
      : generateAdminIdempotencyKey();

  const response = await invokeSocialAdminEdgeFunction<SocialAdminEradicateUserResponse>({
    functionName: 'social-admin-eradicate-user',
    method: 'POST',
    payload: request as unknown as Record<string, unknown>,
    extraHeaders: { 'Idempotency-Key': idempotencyKey },
  });

  return parseSocialAdminEradicateUserResponse(response);
}

export async function adjustSocialPostReactions(
  request: SocialAdminAdjustPostReactionsRequest,
  options: { idempotencyKey?: string } = {},
) {
  const idempotencyKey =
    typeof options.idempotencyKey === 'string' && options.idempotencyKey.length > 0
      ? options.idempotencyKey
      : generateAdminIdempotencyKey();

  const response =
    await invokeSocialAdminEdgeFunction<SocialAdminAdjustPostReactionsResponse>({
      functionName: 'social-admin-adjust-post-reactions',
      method: 'POST',
      payload: request as unknown as Record<string, unknown>,
      extraHeaders: { 'Idempotency-Key': idempotencyKey },
    });

  return parseSocialAdminAdjustPostReactionsResponse(response);
}
