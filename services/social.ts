import * as FileSystemLegacy from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Sharing from 'expo-sharing';
import { decode as decodeBase64 } from 'base64-arraybuffer';
import { Platform } from 'react-native';

import {
  SOCIAL_COMMENT_MAX_LENGTH,
  SOCIAL_COMMENTS_PAGE_SIZE,
  SOCIAL_FEED_PAGE_SIZE,
  SOCIAL_IMPRESSION_BATCH_SIZE,
  SOCIAL_POST_MAX_LENGTH,
  SOCIAL_STORAGE_BUCKET,
  normalizeSocialCategoryValue,
} from '@/constants/social';
import {
  getConfiguredSupabaseProjectLabel,
  invokeAuthedEdgeFunction,
} from './edgeFunctions';
import { supabase } from './supabase';
import {
  AuthenticatedStorageSessionError,
  uploadAuthenticatedStorageObject,
} from '@/services/authenticatedStorage';
import { logOperationalError } from '@/utils/observability';
import {
  parseShareStoryPayload,
  resolveDefaultSocialCategoryForSharePayload as resolveDefaultSocialCategoryForSharePayloadFromShare,
} from '@/utils/shareStory';

import type {
  ShareStoryPayload,
  SocialCategory,
  SocialComment,
  SocialCreateCommentRequest,
  SocialCreateCommentResponse,
  SocialCreatePostRequest,
  SocialCreatePostResponse,
  SocialDeleteCommentRequest,
  SocialDeleteCommentResponse,
  SocialDeletePostRequest,
  SocialDeletePostResponse,
  SocialCommentsPage,
  SocialFeedPage,
  SocialFollowAuthorRequest,
  SocialFollowAuthorResponse,
  SocialHideAuthorRequest,
  SocialHideAuthorResponse,
  SocialPost,
  SocialPublicProfile,
  SocialReactionState,
  SocialRecordImpressionsRequest,
  SocialRecordImpressionsResponse,
  SocialRecordPostViewsRequest,
  SocialRecordPostViewsResponse,
  SocialReportContentRequest,
  SocialReportContentResponse,
  SocialReserveUploadResponse,
  SocialReportTargetType,
  SocialSetCommentLikeRequest,
  SocialSetCommentLikeResponse,
  SocialSetReactionRequest,
  SocialSetReactionResponse,
  SocialUpdateCommentRequest,
  SocialUpdateCommentResponse,
  UserProfile,
} from '@/types';

interface SupabaseErrorLike {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}

export class SocialServiceError extends Error {
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
    this.name = 'SocialServiceError';
    this.code = options.code;
    this.status = options.status;
    this.details = options.details;
    this.requestId = options.requestId;
    this.functionName = options.functionName;
  }
}

interface SocialAlertDiagnosticLabels {
  routeLabel: string;
  codeLabel?: string;
  requestIdLabel: string;
  statusLabel: string;
}

const GENERIC_SOCIAL_PUBLISH_ERROR_CODES = new Set([
  'social_upload_lookup_failed',
  'reserved_upload_not_found',
  'invalid_upload_reference',
  'social_post_create_failed',
  'social_post_finalize_failed',
  'database_relation_missing',
  'database_column_missing',
  'database_rpc_missing',
  'database_policy_denied',
  'database_malformed_payload',
  'database_constraint_violation',
  'database_transient_failure',
  'internal_error',
]);

export const DEFAULT_SOCIAL_FEED_PAGE: SocialFeedPage = {
  items: [],
  next_cursor: null,
};

export function isGenericSocialPublishError(error: unknown) {
  return (
    error instanceof SocialServiceError &&
    typeof error.code === 'string' &&
    GENERIC_SOCIAL_PUBLISH_ERROR_CODES.has(error.code)
  );
}

export function resolveSocialPublishErrorMessage(
  error: unknown,
  fallbackMessage: string,
) {
  if (isGenericSocialPublishError(error)) {
    return fallbackMessage;
  }

  if (error instanceof SocialServiceError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallbackMessage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toSupabaseErrorLike(error: unknown): SupabaseErrorLike {
  if (!error || typeof error !== 'object') {
    return {};
  }

  return error as SupabaseErrorLike;
}

function buildSupabaseErrorHaystack(error: unknown) {
  const supabaseError = toSupabaseErrorLike(error);

  return [
    supabaseError.message,
    supabaseError.details,
    supabaseError.hint,
  ]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase();
}

function isMissingSocialRelationError(error: unknown) {
  const supabaseError = toSupabaseErrorLike(error);
  const errorCode = supabaseError.code ?? '';

  if (errorCode === '42P01' || errorCode === 'PGRST205') {
    return true;
  }

  const haystack = buildSupabaseErrorHaystack(error);

  return (
    (
      haystack.includes('social_posts') ||
      haystack.includes('social_comments') ||
      haystack.includes('relation')
    ) &&
    haystack.includes('does not exist')
  );
}

function isMissingSocialRpcError(error: unknown) {
  const supabaseError = toSupabaseErrorLike(error);
  const errorCode = supabaseError.code ?? '';
  const haystack = buildSupabaseErrorHaystack(error);

  return (
    errorCode === '42883' ||
    errorCode === 'PGRST202' ||
    haystack.includes('could not find function') ||
    haystack.includes('function') && haystack.includes('does not exist')
  );
}

function isMissingSupabaseColumnError(error: unknown) {
  const supabaseError = toSupabaseErrorLike(error);
  const errorCode = supabaseError.code ?? '';
  const haystack = buildSupabaseErrorHaystack(error);

  return (
    errorCode === '42703' ||
    errorCode === 'PGRST204' ||
    (haystack.includes('column') && haystack.includes('does not exist'))
  );
}

function isSupabasePolicyDeniedError(error: unknown) {
  const supabaseError = toSupabaseErrorLike(error);
  const errorCode = supabaseError.code ?? '';
  const haystack = buildSupabaseErrorHaystack(error);

  return (
    errorCode === '42501' ||
    haystack.includes('permission denied') ||
    haystack.includes('row-level security')
  );
}

function isSocialPostUnavailableError(error: unknown) {
  const supabaseError = toSupabaseErrorLike(error);
  return supabaseError.code === 'P0001' &&
    typeof supabaseError.message === 'string' &&
    supabaseError.message.toLowerCase().includes('social post not found');
}

function createSocialServiceError(
  message: string,
  options: {
    code?: string;
    status?: number;
    details?: unknown;
    requestId?: string;
    functionName?: string;
  } = {},
) {
  return new SocialServiceError(message, options);
}

function createSocialMutationSchemaMismatchError(
  message: string,
  options: {
    code: string;
    functionName: string;
    details: unknown;
  },
) {
  return createSocialServiceError(message, {
    code: options.code,
    status: 503,
    details: options.details,
    functionName: options.functionName,
  });
}

function parseRequiredRemovedSocialEntityResponse<
  TResponse extends SocialDeleteCommentResponse | SocialDeletePostResponse,
>(
  value: unknown,
  options: {
    functionName: string;
    idField: 'comment_id' | 'post_id';
    expectedId: string;
    errorCode: string;
    malformedMessage: string;
    requirePostId?: boolean;
  },
) {
  if (!isRecord(value)) {
    throw createSocialMutationSchemaMismatchError(options.malformedMessage, {
      code: options.errorCode,
      details: value,
      functionName: options.functionName,
    });
  }

  const entityId = value[options.idField];
  const hasValidPostId =
    !options.requirePostId ||
    (typeof value.post_id === 'string' && value.post_id.trim().length > 0);

  if (
    value.success !== true ||
    typeof entityId !== 'string' ||
    entityId !== options.expectedId ||
    typeof value.deleted_at !== 'string' ||
    value.deleted_at.trim().length === 0 ||
    value.moderation_state !== 'removed' ||
    !hasValidPostId
  ) {
    throw createSocialMutationSchemaMismatchError(options.malformedMessage, {
      code: options.errorCode,
      details: value,
      functionName: options.functionName,
    });
  }

  return value as TResponse;
}

export function buildSocialAlertMessageWithDiagnostics(
  error: unknown,
  fallbackMessage: string,
  labels: SocialAlertDiagnosticLabels,
) {
  if (!(error instanceof SocialServiceError)) {
    return error instanceof Error ? error.message : fallbackMessage;
  }

  const diagnostics: string[] = [];

  if (error.functionName) {
    diagnostics.push(`${labels.routeLabel}: ${error.functionName}`);
  }

  if (error.code) {
    diagnostics.push(`${labels.codeLabel ?? 'Code'}: ${error.code}`);
  }

  if (typeof error.status === 'number') {
    diagnostics.push(`${labels.statusLabel}: ${error.status}`);
  }

  if (error.requestId) {
    diagnostics.push(`${labels.requestIdLabel}: ${error.requestId}`);
  }

  return diagnostics.length > 0
    ? `${fallbackMessage}\n\n${diagnostics.join(' | ')}`
    : fallbackMessage;
}

function createSocialFeedQueryUnavailableError(error: unknown) {
  return createSocialServiceError(
    `Social feed query "get_social_feed_page" is unavailable on Supabase project "${getConfiguredSupabaseProjectLabel()}".`,
    {
      code: 'social_feed_query_unavailable',
      status: 503,
      details: error,
    },
  );
}

function createSocialCommentsQueryUnavailableError(error: unknown) {
  return createSocialServiceError(
    `Social comments query "get_social_comments_for_post" is unavailable on Supabase project "${getConfiguredSupabaseProjectLabel()}".`,
    {
      code: 'social_comments_query_unavailable',
      status: 503,
      details: error,
    },
  );
}

function createSocialCommentsPageQueryUnavailableError(error: unknown) {
  return createSocialServiceError(
    `Social comments query "get_social_comments_page" is unavailable on Supabase project "${getConfiguredSupabaseProjectLabel()}".`,
    {
      code: 'social_comments_query_unavailable',
      status: 503,
      details: error,
    },
  );
}

function createSocialCommentsPageSchemaMismatchError(error: unknown) {
  return createSocialServiceError(
    `Social comments on Supabase project "${getConfiguredSupabaseProjectLabel()}" are missing required database schema for "get_social_comments_page".`,
    {
      code: 'social_comments_schema_mismatch',
      status: 503,
      details: error,
    },
  );
}

function createSocialPostQueryUnavailableError(error: unknown) {
  return createSocialServiceError(
    `Social post query "get_social_post_detail" is unavailable on Supabase project "${getConfiguredSupabaseProjectLabel()}".`,
    {
      code: 'social_post_query_unavailable',
      status: 503,
      details: error,
    },
  );
}

function createSocialFeedSchemaMismatchError(error: unknown) {
  return createSocialServiceError(
    `Social feed on Supabase project "${getConfiguredSupabaseProjectLabel()}" is missing required database schema for "get_social_feed_page".`,
    {
      code: 'social_feed_schema_mismatch',
      status: 503,
      details: error,
    },
  );
}

function createSocialPostSchemaMismatchError(error: unknown) {
  return createSocialServiceError(
    `Social post detail on Supabase project "${getConfiguredSupabaseProjectLabel()}" is missing required database schema for "get_social_post_detail".`,
    {
      code: 'social_post_schema_mismatch',
      status: 503,
      details: error,
    },
  );
}

function createSocialCommentsSchemaMismatchError(error: unknown) {
  return createSocialServiceError(
    `Social comments on Supabase project "${getConfiguredSupabaseProjectLabel()}" are missing required database schema for "get_social_comments_for_post".`,
    {
      code: 'social_comments_schema_mismatch',
      status: 503,
      details: error,
    },
  );
}

function createSocialPublicProfileSchemaMismatchError(error: unknown) {
  return createSocialServiceError(
    `Social public profile on Supabase project "${getConfiguredSupabaseProjectLabel()}" is missing required columns on "user_profiles".`,
    {
      code: 'social_profile_schema_mismatch',
      status: 503,
      details: error,
    },
  );
}

function createSocialFeedPolicyDeniedError(error: unknown) {
  return createSocialServiceError(
    `Social feed access is denied by Supabase policies or grants on project "${getConfiguredSupabaseProjectLabel()}".`,
    {
      code: 'social_feed_policy_denied',
      status: 403,
      details: error,
    },
  );
}

function createSocialPostPolicyDeniedError(error: unknown) {
  return createSocialServiceError(
    `Social post detail access is denied by Supabase policies or grants on project "${getConfiguredSupabaseProjectLabel()}".`,
    {
      code: 'social_post_policy_denied',
      status: 403,
      details: error,
    },
  );
}

function createSocialCommentsPolicyDeniedError(error: unknown) {
  return createSocialServiceError(
    `Social comments access is denied by Supabase policies or grants on project "${getConfiguredSupabaseProjectLabel()}".`,
    {
      code: 'social_comments_policy_denied',
      status: 403,
      details: error,
    },
  );
}

function createSocialPublicProfilePolicyDeniedError(error: unknown) {
  return createSocialServiceError(
    `Social public profile access is denied by Supabase policies or grants on project "${getConfiguredSupabaseProjectLabel()}".`,
    {
      code: 'social_profile_policy_denied',
      status: 403,
      details: error,
    },
  );
}

function createSocialReadError(
  fallbackMessage: string,
  fallbackCode: string,
  error: unknown,
) {
  const supabaseError = toSupabaseErrorLike(error);

  return createSocialServiceError(
    typeof supabaseError.message === 'string' && supabaseError.message.length > 0
      ? supabaseError.message
      : fallbackMessage,
    {
      code: supabaseError.code ?? fallbackCode,
      status: 500,
      details: error,
    },
  );
}

function createSocialFeedReadError(error: unknown) {
  if (isMissingSocialRpcError(error)) {
    return createSocialFeedQueryUnavailableError(error);
  }

  if (isMissingSocialRelationError(error) || isMissingSupabaseColumnError(error)) {
    return createSocialFeedSchemaMismatchError(error);
  }

  if (isSupabasePolicyDeniedError(error)) {
    return createSocialFeedPolicyDeniedError(error);
  }

  return createSocialReadError(
    'Failed to load social feed.',
    'social_feed_load_failed',
    error,
  );
}

function createSocialCommentsReadError(error: unknown) {
  if (isMissingSocialRpcError(error)) {
    return createSocialCommentsQueryUnavailableError(error);
  }

  if (isMissingSocialRelationError(error) || isMissingSupabaseColumnError(error)) {
    return createSocialCommentsSchemaMismatchError(error);
  }

  if (isSupabasePolicyDeniedError(error)) {
    return createSocialCommentsPolicyDeniedError(error);
  }

  return createSocialReadError(
    'Failed to load social comments.',
    'social_comments_load_failed',
    error,
  );
}

function createSocialCommentsPageReadError(error: unknown) {
  if (isMissingSocialRpcError(error)) {
    return createSocialCommentsPageQueryUnavailableError(error);
  }

  if (isMissingSocialRelationError(error) || isMissingSupabaseColumnError(error)) {
    return createSocialCommentsPageSchemaMismatchError(error);
  }

  if (isSupabasePolicyDeniedError(error)) {
    return createSocialCommentsPolicyDeniedError(error);
  }

  return createSocialReadError(
    'Failed to load social comments.',
    'social_comments_load_failed',
    error,
  );
}

function createSocialPostReadError(error: unknown) {
  if (isMissingSocialRpcError(error)) {
    return createSocialPostQueryUnavailableError(error);
  }

  if (isMissingSocialRelationError(error) || isMissingSupabaseColumnError(error)) {
    return createSocialPostSchemaMismatchError(error);
  }

  if (isSupabasePolicyDeniedError(error)) {
    return createSocialPostPolicyDeniedError(error);
  }

  return createSocialReadError(
    'Failed to load the social post.',
    'social_post_load_failed',
    error,
  );
}

function createSocialPublicProfileReadError(error: unknown) {
  if (isMissingSocialRelationError(error) || isMissingSupabaseColumnError(error)) {
    return createSocialPublicProfileSchemaMismatchError(error);
  }

  if (isSupabasePolicyDeniedError(error)) {
    return createSocialPublicProfilePolicyDeniedError(error);
  }

  return createSocialReadError(
    'Failed to load the public social profile.',
    'social_profile_load_failed',
    error,
  );
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

function readOptionalNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readBoolean(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

const SOCIAL_REACTION_DISTRIBUTION_KEYS = ['like', 'dislike', 'laugh', 'wow', 'sad'] as const;

function parseSocialReactionDistribution(value: unknown): Record<string, number> | null {
  if (!isRecord(value)) {
    return null;
  }
  const result: Record<string, number> = {};
  for (const key of SOCIAL_REACTION_DISTRIBUTION_KEYS) {
    const raw = (value as Record<string, unknown>)[key];
    const numeric = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isFinite(numeric) && numeric > 0) {
      result[key] = numeric;
    }
  }
  return Object.keys(result).length === 0 ? null : result;
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isValidSocialReactionState(
  value: unknown,
): value is SocialReactionState {
  return (
    value === 'like' ||
    value === 'dislike' ||
    value === 'neutral' ||
    value === 'laugh' ||
    value === 'wow' ||
    value === 'sad'
  );
}

function readRequiredCommentLikeCount(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value;
  }

  throw createSocialCommentsSchemaMismatchError(
    new Error('Missing required "like_count" column in social comments payload.'),
  );
}

function readRequiredCommentViewerHasLiked(value: unknown) {
  if (typeof value === 'boolean') {
    return value;
  }

  throw createSocialCommentsSchemaMismatchError(
    new Error('Missing required "viewer_has_liked" column in social comments payload.'),
  );
}

function readModerationStatus(value: unknown): SocialPost['moderation_status'] {
  return value === 'approved' ||
    value === 'rejected' ||
    value === 'flagged' ||
    value === 'hidden' ||
    value === 'removed' ||
    value === 'pending'
    ? value
    : 'pending';
}

function readReactionState(value: unknown): SocialReactionState {
  return value === 'like' || value === 'dislike' ? value : 'neutral';
}

function readSocialCategory(value: unknown): SocialCategory {
  return normalizeSocialCategoryValue(value);
}

function readSharePayloadSnapshot(value: unknown): ShareStoryPayload | null {
  return parseShareStoryPayload(value);
}

export function normalizeSocialTextInput(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

export function validateSocialPostInput(value?: string | null) {
  const normalizedValue = normalizeSocialTextInput(value ?? '');
  if (normalizedValue.length > SOCIAL_POST_MAX_LENGTH) {
    throw new SocialServiceError(
      `Post content must be ${SOCIAL_POST_MAX_LENGTH} characters or fewer`,
      {
        code: 'text_too_long',
        status: 400,
      },
    );
  }

  return normalizedValue;
}

export function validateSocialCommentInput(value: string) {
  const normalizedValue = normalizeSocialTextInput(value);
  if (!normalizedValue) {
    throw new SocialServiceError('Comment content is required', {
      code: 'invalid_payload',
      status: 400,
    });
  }

  if (normalizedValue.length > SOCIAL_COMMENT_MAX_LENGTH) {
    throw new SocialServiceError(
      `Comment content must be ${SOCIAL_COMMENT_MAX_LENGTH} characters or fewer`,
      {
        code: 'text_too_long',
        status: 400,
      },
    );
  }

  return normalizedValue;
}

function parseSocialPostRow(row: unknown): SocialPost | null {
  if (!isRecord(row)) {
    return null;
  }

  const id = readRequiredString(row.id);
  const authorId = readRequiredString(row.author_id);
  const createdAt = readRequiredString(row.created_at);

  if (!id || !authorId || !createdAt) {
    return null;
  }

  const moderationStatus = readModerationStatus(row.moderation_status ?? row.moderation_state);
  const viewerReaction = readReactionState(row.viewer_reaction);

  return {
    id,
    author_id: authorId,
    author_username: readOptionalString(row.author_username),
    author_avatar_url: readOptionalString(row.author_avatar_url),
    category: readSocialCategory(row.category),
    content_text: readOptionalString(row.content_text) ?? '',
    scan_id: readOptionalString(row.scan_id),
    share_payload_snapshot: readSharePayloadSnapshot(row.share_payload_snapshot),
    asset_path: readOptionalString(row.asset_path),
    asset_url: readOptionalString(row.asset_url),
    image_url: readOptionalString(row.image_url),
    created_at: createdAt,
    like_count: readNumber(row.like_count),
    dislike_count: readNumber(row.dislike_count),
    comment_count: readNumber(row.comment_count),
    unique_view_count: readNumber(row.unique_view_count),
    reaction_distribution: parseSocialReactionDistribution(row.reaction_distribution),
    viewer_visible_comment_count: readOptionalNumber(
      row.viewer_visible_comment_count,
    ),
    viewer_reaction: viewerReaction,
    viewer_has_liked: viewerReaction === 'like' || readBoolean(row.viewer_has_liked),
    viewer_follows_author: readBoolean(row.viewer_follows_author),
    moderation_status: moderationStatus,
    moderation_state: readModerationStatus(row.moderation_state ?? moderationStatus),
    moderation_reason: readOptionalString(row.moderation_reason),
    moderation_provider: readOptionalString(row.moderation_provider),
    rejection_count: readNumber(row.rejection_count),
    last_rejected_at: readOptionalString(row.last_rejected_at),
    deleted_at: readOptionalString(row.deleted_at),
    language_code: readOptionalString(row.language_code),
    country_code: readOptionalString(row.country_code),
  };
}

function parseSocialCommentRow(row: unknown): SocialComment | null {
  if (!isRecord(row)) {
    return null;
  }

  const id = readRequiredString(row.id);
  const postId = readRequiredString(row.post_id);
  const authorId = readRequiredString(row.author_id);
  const createdAt = readRequiredString(row.created_at);

  if (!id || !postId || !authorId || !createdAt) {
    return null;
  }

  const moderationStatus = readModerationStatus(row.moderation_status ?? row.moderation_state);

  return {
    id,
    post_id: postId,
    author_id: authorId,
    author_username: readOptionalString(row.author_username),
    author_avatar_url: readOptionalString(row.author_avatar_url),
    content_text: readOptionalString(row.content_text) ?? '',
    created_at: createdAt,
    like_count: readRequiredCommentLikeCount(row.like_count),
    viewer_has_liked: readRequiredCommentViewerHasLiked(row.viewer_has_liked),
    moderation_status: moderationStatus,
    moderation_state: readModerationStatus(row.moderation_state ?? moderationStatus),
    moderation_reason: readOptionalString(row.moderation_reason),
    moderation_provider: readOptionalString(row.moderation_provider),
    rejection_count: readNumber(row.rejection_count),
    last_rejected_at: readOptionalString(row.last_rejected_at),
    deleted_at: readOptionalString(row.deleted_at),
  };
}

function parseSocialPublicProfileRow(row: unknown): SocialPublicProfile | null {
  if (!isRecord(row)) {
    return null;
  }

  const id = readRequiredString(row.id);
  const createdAt = readRequiredString(row.created_at);

  if (!id || !createdAt) {
    return null;
  }

  return {
    id,
    username: readOptionalString(row.username),
    avatar_url: readOptionalString(row.avatar_url),
    account_created_at: readOptionalString(row.account_created_at),
    created_at: createdAt,
    scan_count: readNumber(row.scan_count),
  };
}

function parseRequiredSocialCommentPayload(
  value: unknown,
  options: {
    functionName: string;
    expectedCommentId?: string;
  },
) {
  const comment = parseSocialCommentRow(value);

  if (!comment || (options.expectedCommentId && comment.id !== options.expectedCommentId)) {
    throw new SocialServiceError(
      'Social comment mutation returned malformed data.',
      {
        code: 'social_comment_schema_mismatch',
        status: 503,
        details: value,
        functionName: options.functionName,
      },
    );
  }

  return comment;
}

function parseCursor(cursor?: string | null) {
  if (!cursor) {
    return 0;
  }

  const numericCursor = Number.parseInt(cursor, 10);
  return Number.isFinite(numericCursor) && numericCursor >= 0 ? numericCursor : 0;
}

function isCompositeCursor(cursor: string | null | undefined): cursor is string {
  if (typeof cursor !== 'string' || cursor.length === 0) {
    return false;
  }
  return cursor.includes(':');
}

async function invokeAuthedSocialFunction<TResponse>(
  functionName: string,
  payload: Record<string, unknown>,
  responseSchema?: import('zod').ZodTypeAny,
) {
  return invokeAuthedEdgeFunction<TResponse, SocialServiceError>({
    scopeLabel: 'Social',
    functionName,
    payload,
    responseSchema,
    createError: (message, options) =>
      createSocialServiceError(message, {
        code: options.code,
        status: options.status,
        details: options.details,
        requestId: options.requestId,
        functionName: options.functionName,
      }),
  });
}

function assertLocalSocialAssetUri(sourceUri: string) {
  const trimmedUri = sourceUri.trim();
  const lowerUri = trimmedUri.toLowerCase();

  if (
    lowerUri.startsWith('http://') ||
    lowerUri.startsWith('https://') ||
    lowerUri.startsWith('data:') ||
    lowerUri.includes('/storage/v1/object/sign/') ||
    lowerUri.includes('scan-images/')
  ) {
    throw new SocialServiceError(
      'Social assets must be generated from a stable local source, not a signed scan URL',
      {
        code: 'invalid_asset_source',
        status: 400,
      },
    );
  }

  return trimmedUri;
}

async function reserveSocialUpload(mimeType: string) {
  return invokeAuthedSocialFunction<SocialReserveUploadResponse>(
    'social-reserve-upload',
    {
      mime_type: mimeType,
    },
  );
}

export function buildStableSocialSharePayloadSnapshot(
  payload: ShareStoryPayload,
): ShareStoryPayload {
  return {
    ...payload,
    heroImageUri: null,
  };
}

export function resolveDefaultSocialCategoryForSharePayload(
  payload?: ShareStoryPayload | null,
): SocialCategory {
  return resolveDefaultSocialCategoryForSharePayloadFromShare(payload);
}

async function readSocialAssetArrayBuffer(uri: string) {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    const blob = await response.blob();

    if (typeof blob.arrayBuffer !== 'function') {
      throw new SocialServiceError('The image could not be prepared for upload.', {
        code: 'asset_prepare_failed',
        status: 400,
      });
    }

    return blob.arrayBuffer();
  }

  const fileInfo = await FileSystemLegacy.getInfoAsync(uri);

  if (!fileInfo.exists) {
    throw new SocialServiceError('The image could not be prepared for upload.', {
      code: 'asset_prepare_failed',
      status: 400,
    });
  }

  const base64Payload = await FileSystemLegacy.readAsStringAsync(uri, {
    encoding: FileSystemLegacy.EncodingType.Base64,
  });

  if (!base64Payload) {
    throw new SocialServiceError('The image could not be prepared for upload.', {
      code: 'asset_prepare_failed',
      status: 400,
    });
  }

  return decodeBase64(base64Payload);
}

// P2-I Phase 2 — limite taille post-compression d'un asset social (8 MB).
const MAX_SOCIAL_ASSET_SIZE_BYTES = 8 * 1024 * 1024;
// P2-J Phase 2 — TTL d'une signed URL servie au client pour un asset social.
const SOCIAL_ASSET_SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 jours

export async function uploadSocialAssetFromUri(options: {
  sourceUri: string;
  userId: string;
}) {
  try {
    const normalizedUri = assertLocalSocialAssetUri(options.sourceUri);
    const manipulatedImage = await ImageManipulator.manipulateAsync(
      normalizedUri,
      [],
      {
        compress: 0.9,
        format: ImageManipulator.SaveFormat.JPEG,
      },
    );

    const arrayBuffer = await readSocialAssetArrayBuffer(manipulatedImage.uri);

    if (arrayBuffer.byteLength > MAX_SOCIAL_ASSET_SIZE_BYTES) {
      throw new SocialServiceError(
        'The image is too large to share (limit 8 MB after compression).',
        {
          code: 'asset_too_large',
          status: 400,
          details: { size: arrayBuffer.byteLength, limit: MAX_SOCIAL_ASSET_SIZE_BYTES },
        },
      );
    }

    const reservation = await reserveSocialUpload('image/jpeg');
    const assetPath = reservation.asset_path;

    const { error: uploadError } = await uploadAuthenticatedStorageObject({
      bucket: SOCIAL_STORAGE_BUCKET,
      path: assetPath,
      fileBody: arrayBuffer,
      ownerUserId: options.userId,
      context: 'social asset upload',
      fileOptions: {
        contentType: 'image/jpeg',
        upsert: false,
      },
    });

    if (uploadError) {
      throw new SocialServiceError(uploadError.message, {
        code: uploadError.name,
        status: 400,
        details: uploadError,
      });
    }

    // P2-J Phase 2 — signed URL avec TTL au lieu de getPublicUrl permanent.
    // Si l'asset est supprimé côté DB, l'URL devient inutilisable après TTL
    // au lieu de rester accessible indéfiniment.
    const { data: signedData, error: signedError } = await supabase.storage
      .from(SOCIAL_STORAGE_BUCKET)
      .createSignedUrl(assetPath, SOCIAL_ASSET_SIGNED_URL_TTL_SECONDS);

    if (signedError || !signedData?.signedUrl) {
      throw new SocialServiceError('Could not create signed URL for the uploaded asset.', {
        code: 'asset_signed_url_failed',
        status: 500,
        details: signedError,
      });
    }

    return {
      uploadId: reservation.upload_id,
      assetPath,
      assetUrl: signedData.signedUrl,
    };
  } catch (error) {
    if (error instanceof SocialServiceError) {
      throw error;
    }

    if (error instanceof AuthenticatedStorageSessionError) {
      throw new SocialServiceError('Authentication required to upload social asset.', {
        code: error.code,
        status: error.status,
        details: error,
      });
    }

    throw new SocialServiceError('The image could not be prepared for upload.', {
      code: 'asset_prepare_failed',
      status: 400,
      details: error,
    });
  }
}

export async function removeSocialAsset(assetPath: string) {
  if (!assetPath) {
    return;
  }

  await supabase.storage.from(SOCIAL_STORAGE_BUCKET).remove([assetPath]);
}

export interface SocialFeedViewerContext {
  languageCode?: string | null;
  countryCode?: string | null;
}

export async function fetchSocialFeed(
  category: SocialCategory | 'all' = 'all',
  cursor?: string | null,
  pageSize = SOCIAL_FEED_PAGE_SIZE,
  viewerContext?: SocialFeedViewerContext,
): Promise<SocialFeedPage> {
  // Keyset cursor temporarily disabled: PostgREST doesn't support function
  // overloading, so we keep the legacy offset-based signature live and route
  // every call through it. Re-enable when the cursor signature is brought back
  // (e.g. via a renamed RPC) and the client is shipped accordingly.
  const offset = parseCursor(cursor);

  try {
    const { data, error } = await supabase.rpc('get_social_feed_page', {
      p_category: category === 'all' ? null : category,
      p_limit: pageSize,
      p_offset: offset,
      p_viewer_language_code: viewerContext?.languageCode ?? null,
      p_viewer_country_code: viewerContext?.countryCode ?? null,
    });

    if (error) {
      const socialError = createSocialFeedReadError(error);

      logOperationalError('[Social] Failed to fetch social feed', socialError, {
        category,
      });
      throw socialError;
    }

    const rawRows = Array.isArray(data) ? data : [];
    const items = rawRows
      .map(parseSocialPostRow)
      .filter((item): item is SocialPost => item !== null);

    return {
      items,
      next_cursor: rawRows.length >= pageSize ? String(offset + pageSize) : null,
    };
  } catch (error) {
    if (error instanceof SocialServiceError) {
      throw error;
    }

    logOperationalError('[Social] Unexpected social feed failure', error, {
      category,
    });
    throw createSocialReadError(
      'Failed to load social feed.',
      'social_feed_load_failed',
      error,
    );
  }
}

export async function fetchSocialComments(postId: string): Promise<SocialComment[]> {
  if (!postId) {
    return [];
  }

  try {
    const { data, error } = await supabase.rpc('get_social_comments_for_post', {
      p_post_id: postId,
    });

    if (error) {
      if (isSocialPostUnavailableError(error)) {
        throw new SocialServiceError('Social post not found', {
          code: 'post_not_found',
          status: 404,
          details: error,
        });
      }

      const socialError = createSocialCommentsReadError(error);

      logOperationalError('[Social] Failed to fetch social comments', socialError, {
        post_id: postId,
      });
      throw socialError;
    }

    return (Array.isArray(data) ? data : [])
      .map(parseSocialCommentRow)
      .filter((item): item is SocialComment => item !== null);
  } catch (error) {
    if (error instanceof SocialServiceError) {
      throw error;
    }

    logOperationalError('[Social] Unexpected social comments failure', error, {
      post_id: postId,
    });
    throw createSocialReadError(
      'Failed to load social comments.',
      'social_comments_load_failed',
      error,
    );
  }
}

const SOCIAL_COMMENTS_CURSOR_SEPARATOR = '|';
const MAX_SOCIAL_COMMENTS_PAGE_SIZE = 50;

function normalizeSocialCommentLikeCountForSort(value: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

export function compareSocialCommentsByPopularity(
  leftComment: SocialComment,
  rightComment: SocialComment,
) {
  const byLikeCount =
    normalizeSocialCommentLikeCountForSort(rightComment.like_count) -
    normalizeSocialCommentLikeCountForSort(leftComment.like_count);
  if (byLikeCount !== 0) {
    return byLikeCount;
  }

  return rightComment.id.localeCompare(leftComment.id);
}

export function encodeSocialCommentsPageCursor(comment: SocialComment): string {
  const likeCount = normalizeSocialCommentLikeCountForSort(comment.like_count);
  return `${likeCount}${SOCIAL_COMMENTS_CURSOR_SEPARATOR}${comment.id}`;
}

function parseSocialCommentsPageCursor(
  cursor: string | null | undefined,
): { likeCount: number; id: string } | null {
  if (typeof cursor !== 'string' || cursor.length === 0) {
    return null;
  }

  const separatorIndex = cursor.indexOf(SOCIAL_COMMENTS_CURSOR_SEPARATOR);
  if (separatorIndex <= 0 || separatorIndex === cursor.length - 1) {
    return null;
  }

  const likeCountToken = cursor.slice(0, separatorIndex);
  const id = cursor.slice(separatorIndex + 1);
  const likeCount = Number(likeCountToken);

  if (
    likeCountToken.length === 0 ||
    !Number.isInteger(likeCount) ||
    likeCount < 0 ||
    id.length === 0
  ) {
    return null;
  }

  return { likeCount, id };
}

export async function fetchSocialCommentsPage(
  postId: string,
  cursor?: string | null,
  pageSize: number = SOCIAL_COMMENTS_PAGE_SIZE,
): Promise<SocialCommentsPage> {
  if (!postId) {
    return { items: [], next_cursor: null };
  }

  const parsedCursor = parseSocialCommentsPageCursor(cursor);
  const effectivePageSize = Math.min(
    Math.max(1, Math.floor(pageSize) || SOCIAL_COMMENTS_PAGE_SIZE),
    MAX_SOCIAL_COMMENTS_PAGE_SIZE,
  );

  try {
    const { data, error } = await supabase.rpc('get_social_comments_page', {
      p_post_id: postId,
      p_cursor_like_count: parsedCursor?.likeCount ?? null,
      p_cursor_id: parsedCursor?.id ?? null,
      p_page_size: effectivePageSize,
    });

    if (error) {
      if (isSocialPostUnavailableError(error)) {
        throw new SocialServiceError('Social post not found', {
          code: 'post_not_found',
          status: 404,
          details: error,
        });
      }

      const socialError = createSocialCommentsPageReadError(error);

      logOperationalError(
        '[Social] Failed to fetch paginated social comments',
        socialError,
        { post_id: postId },
      );
      throw socialError;
    }

    const items = (Array.isArray(data) ? data : [])
      .map(parseSocialCommentRow)
      .filter((item): item is SocialComment => item !== null);

    const reachedEnd = items.length < effectivePageSize;
    const lastItem = items[items.length - 1];

    return {
      items,
      next_cursor:
        reachedEnd || !lastItem ? null : encodeSocialCommentsPageCursor(lastItem),
    };
  } catch (error) {
    if (error instanceof SocialServiceError) {
      throw error;
    }

    logOperationalError(
      '[Social] Unexpected paginated social comments failure',
      error,
      { post_id: postId },
    );
    throw createSocialReadError(
      'Failed to load social comments.',
      'social_comments_load_failed',
      error,
    );
  }
}

export async function fetchSocialPostDetail(postId: string): Promise<SocialPost> {
  if (!postId) {
    throw new SocialServiceError('Social post not found', {
      code: 'post_not_found',
      status: 404,
    });
  }

  try {
    const { data, error } = await supabase.rpc('get_social_post_detail', {
      p_post_id: postId,
    });

    if (error) {
      if (isSocialPostUnavailableError(error)) {
        throw new SocialServiceError('Social post not found', {
          code: 'post_not_found',
          status: 404,
          details: error,
        });
      }

      const socialError = createSocialPostReadError(error);

      logOperationalError('[Social] Failed to fetch social post detail', socialError, {
        post_id: postId,
      });
      throw socialError;
    }

    const rawRow = Array.isArray(data) ? data[0] : data;
    const post = parseSocialPostRow(rawRow);

    if (!post || post.id !== postId) {
      throw createSocialPostSchemaMismatchError(
        new Error('Missing required social post detail payload.'),
      );
    }

    return post;
  } catch (error) {
    if (error instanceof SocialServiceError) {
      throw error;
    }

    logOperationalError('[Social] Unexpected social post detail failure', error, {
      post_id: postId,
    });
    throw createSocialReadError(
      'Failed to load the social post.',
      'social_post_load_failed',
      error,
    );
  }
}

export async function fetchSocialPublicProfile(
  userId: string,
): Promise<SocialPublicProfile | null> {
  if (!userId) {
    return null;
  }

  try {
    // B-01 backend audit — lit uniquement les colonnes publiques via la vue
    // dédiée. La table user_profiles est désormais restreinte à auth.uid() = id.
    const { data, error } = await supabase
      .from('user_profiles_public')
      .select('id, username, avatar_url, account_created_at, created_at, scan_count')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      const socialError = createSocialPublicProfileReadError(error);

      logOperationalError('[Social] Failed to fetch social public profile', socialError, {
        user_id: userId,
      });
      throw socialError;
    }

    if (!data) {
      return null;
    }

    const profile = parseSocialPublicProfileRow(data);

    if (!profile || profile.id !== userId) {
      throw createSocialPublicProfileSchemaMismatchError(
        new Error('Missing required social public profile payload.'),
      );
    }

    return profile;
  } catch (error) {
    if (error instanceof SocialServiceError) {
      throw error;
    }

    logOperationalError('[Social] Unexpected social public profile failure', error, {
      user_id: userId,
    });
    throw createSocialReadError(
      'Failed to load the public social profile.',
      'social_profile_load_failed',
      error,
    );
  }
}

interface CreateSocialPostInput {
  viewerProfile: Pick<UserProfile, 'id' | 'username' | 'avatar_url'>;
  category: SocialCreatePostRequest['category'];
  contentText?: string | null;
  scanId?: string | null;
  sharePayload?: ShareStoryPayload | null;
  assetSourceUri?: string | null;
  languageCode?: string | null;
}

export async function createSocialPost(
  input: CreateSocialPostInput,
): Promise<SocialPost> {
  const normalizedContentText = validateSocialPostInput(input.contentText);
  const stableSharePayload = input.sharePayload
    ? buildStableSocialSharePayloadSnapshot(input.sharePayload)
    : null;
  const normalizedLanguageCode =
    typeof input.languageCode === 'string'
      && /^[a-z]{2}$/.test(input.languageCode.trim().toLowerCase())
      ? input.languageCode.trim().toLowerCase()
      : null;

  let uploadedAssetPath: string | undefined;
  let uploadedUploadId: string | undefined;
  let uploadedAssetUrl: string | null = null;

  try {
    if (input.assetSourceUri) {
      const uploadResult = await uploadSocialAssetFromUri({
        sourceUri: input.assetSourceUri,
        userId: input.viewerProfile.id,
      });
      uploadedUploadId = uploadResult.uploadId;
      uploadedAssetPath = uploadResult.assetPath;
      uploadedAssetUrl = uploadResult.assetUrl;
    }

    const requestBody: SocialCreatePostRequest = {
      category: input.category,
      ...(normalizedContentText ? { content_text: normalizedContentText } : {}),
      ...(uploadedUploadId ? { upload_id: uploadedUploadId } : {}),
      ...(uploadedAssetPath ? { reserved_asset_path: uploadedAssetPath } : {}),
      ...(input.scanId ? { scan_id: input.scanId } : {}),
      ...(stableSharePayload ? { share_payload_snapshot: stableSharePayload } : {}),
      ...(normalizedLanguageCode ? { language_code: normalizedLanguageCode } : {}),
    };

    const response = await invokeAuthedSocialFunction<SocialCreatePostResponse>(
      'social-create-post',
      requestBody as unknown as Record<string, unknown>,
    );

    return {
      id: response.post_id,
      author_id: input.viewerProfile.id,
      author_username: input.viewerProfile.username,
      author_avatar_url: input.viewerProfile.avatar_url,
      category: input.category,
      content_text: normalizedContentText,
      scan_id: input.scanId ?? null,
      share_payload_snapshot: stableSharePayload,
      asset_path: uploadedAssetPath ?? null,
      asset_url: response.asset_url ?? uploadedAssetUrl,
      image_url: response.asset_url ?? uploadedAssetUrl,
      created_at: new Date().toISOString(),
      like_count: 0,
      dislike_count: 0,
      comment_count: 0,
      viewer_visible_comment_count: 0,
      viewer_reaction: 'neutral',
      viewer_has_liked: false,
      moderation_status: response.moderation_state,
      moderation_state: response.moderation_state,
      moderation_reason: null,
      moderation_provider: null,
      rejection_count: 0,
      last_rejected_at: null,
      deleted_at: null,
      language_code: normalizedLanguageCode,
      country_code: null,
    };
  } catch (error) {
    if (uploadedAssetPath) {
      await removeSocialAsset(uploadedAssetPath);
    }
    throw error;
  }
}

interface CreateSocialCommentInput {
  viewerProfile: Pick<UserProfile, 'id' | 'username' | 'avatar_url'>;
  postId: string;
  contentText: string;
}

export async function createSocialComment(
  input: CreateSocialCommentInput,
): Promise<SocialComment> {
  const normalizedContentText = validateSocialCommentInput(input.contentText);
  const requestBody: SocialCreateCommentRequest = {
    post_id: input.postId,
    content_text: normalizedContentText,
  };

  const response = await invokeAuthedSocialFunction<SocialCreateCommentResponse>(
    'social-create-comment',
    requestBody as unknown as Record<string, unknown>,
  );

  return {
    id: response.comment_id,
    post_id: response.post_id,
    author_id: input.viewerProfile.id,
    author_username: input.viewerProfile.username,
    author_avatar_url: input.viewerProfile.avatar_url,
    content_text: normalizedContentText,
    created_at: new Date().toISOString(),
    like_count: 0,
    viewer_has_liked: false,
    moderation_status: response.moderation_state,
    moderation_state: response.moderation_state,
    moderation_reason: null,
    moderation_provider: null,
    rejection_count: 0,
    last_rejected_at: null,
    deleted_at: null,
  };
}

export async function deleteSocialPost(postId: string) {
  const requestBody: SocialDeletePostRequest = {
    post_id: postId,
  };

  try {
    const response = await invokeAuthedSocialFunction<SocialDeletePostResponse>(
      'social-delete-post',
      requestBody as unknown as Record<string, unknown>,
    );

    return parseRequiredRemovedSocialEntityResponse<SocialDeletePostResponse>(
      response,
      {
        functionName: 'social-delete-post',
        idField: 'post_id',
        expectedId: postId,
        errorCode: 'social_post_delete_schema_mismatch',
        malformedMessage: 'Social post deletion returned malformed data.',
      },
    );
  } catch (error) {
    logOperationalError('[Social] Failed to delete social post', error, {
      post_id: postId,
    });
    throw error;
  }
}

export async function updateSocialComment(commentId: string, contentText: string) {
  const normalizedContentText = validateSocialCommentInput(contentText);
  const requestBody: SocialUpdateCommentRequest = {
    comment_id: commentId,
    content_text: normalizedContentText,
  };

  try {
    const response = await invokeAuthedSocialFunction<SocialUpdateCommentResponse>(
      'social-update-comment',
      requestBody as unknown as Record<string, unknown>,
    );

    if (!isRecord(response) || response.success !== true) {
      throw createSocialMutationSchemaMismatchError(
        'Social comment mutation returned malformed data.',
        {
          code: 'social_comment_schema_mismatch',
          details: response,
          functionName: 'social-update-comment',
        },
      );
    }

    return parseRequiredSocialCommentPayload(response.comment, {
      functionName: 'social-update-comment',
      expectedCommentId: commentId,
    });
  } catch (error) {
    logOperationalError('[Social] Failed to update social comment', error, {
      comment_id: commentId,
    });
    throw error;
  }
}

export async function deleteSocialComment(commentId: string) {
  const requestBody: SocialDeleteCommentRequest = {
    comment_id: commentId,
  };

  try {
    const response = await invokeAuthedSocialFunction<SocialDeleteCommentResponse>(
      'social-delete-comment',
      requestBody as unknown as Record<string, unknown>,
    );

    return parseRequiredRemovedSocialEntityResponse<SocialDeleteCommentResponse>(
      response,
      {
        functionName: 'social-delete-comment',
        idField: 'comment_id',
        expectedId: commentId,
        errorCode: 'social_comment_delete_schema_mismatch',
        malformedMessage: 'Social comment deletion returned malformed data.',
        requirePostId: true,
      },
    );
  } catch (error) {
    logOperationalError('[Social] Failed to delete social comment', error, {
      comment_id: commentId,
    });
    throw error;
  }
}

export async function setReactionOnSocialPost(
  postId: string,
  reaction: SocialReactionState,
) {
  const requestBody: SocialSetReactionRequest = {
    post_id: postId,
    reaction,
  };

  try {
    const response = await invokeAuthedSocialFunction<SocialSetReactionResponse>(
      'social-set-reaction',
      requestBody as unknown as Record<string, unknown>,
    );

    if (
      !isRecord(response) ||
      response.success !== true ||
      typeof response.post_id !== 'string' ||
      response.post_id.trim().length === 0 ||
      response.post_id !== postId ||
      !isValidSocialReactionState(response.viewer_reaction) ||
      !isNonNegativeFiniteNumber(response.like_count) ||
      !isNonNegativeFiniteNumber(response.dislike_count)
    ) {
      throw new SocialServiceError(
        'Social reaction update returned malformed data.',
        {
          code: 'social_reaction_schema_mismatch',
          status: 503,
          details: response,
          functionName: 'social-set-reaction',
        },
      );
    }

    return response;
  } catch (error) {
    logOperationalError('[Social] Failed to update social post reaction', error, {
      post_id: postId,
      reaction,
    });
    throw error;
  }
}

export async function setSocialCommentLike(commentId: string, liked: boolean) {
  const requestBody: SocialSetCommentLikeRequest = {
    comment_id: commentId,
    liked,
  };

  const response = await invokeAuthedSocialFunction<SocialSetCommentLikeResponse>(
    'social-set-comment-like',
    requestBody as unknown as Record<string, unknown>,
  );

  if (
    !isRecord(response) ||
    response.success !== true ||
    typeof response.comment_id !== 'string' ||
    response.comment_id.trim().length === 0 ||
    response.comment_id !== commentId ||
    typeof response.viewer_has_liked !== 'boolean' ||
    !isNonNegativeFiniteNumber(response.like_count)
  ) {
    throw new SocialServiceError(
      'Comment like update returned malformed data.',
      {
        code: 'social_comment_like_schema_mismatch',
        status: 503,
        details: response,
        functionName: 'social-set-comment-like',
      },
    );
  }

  return response;
}

const SOCIAL_DWELL_MS_PER_SAMPLE_CAP = 300_000;

function sanitizeSocialDwellMap(
  dwellMs: Record<string, number> | undefined,
  allowedPostIds: string[],
): Record<string, number> | undefined {
  if (!dwellMs) {
    return undefined;
  }
  const allowed = new Set(allowedPostIds);
  const sanitized: Record<string, number> = {};
  for (const [postId, value] of Object.entries(dwellMs)) {
    if (!allowed.has(postId)) {
      continue;
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      continue;
    }
    sanitized[postId] = Math.min(Math.round(value), SOCIAL_DWELL_MS_PER_SAMPLE_CAP);
  }
  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

export async function recordSocialPostImpressions(
  postIds: string[],
  source: SocialRecordImpressionsRequest['source'] = 'feed',
  dwellMsByPost?: Record<string, number>,
) {
  const normalizedIds = normalizeSocialImpressionPostIds(postIds);

  if (normalizedIds.length === 0) {
    return {
      success: true,
      recorded_count: 0,
    } satisfies SocialRecordImpressionsResponse;
  }

  const sanitizedDwell = sanitizeSocialDwellMap(dwellMsByPost, normalizedIds);

  const requestBody: SocialRecordImpressionsRequest = {
    post_ids: normalizedIds,
    source,
    ...(sanitizedDwell ? { dwell_ms_by_post: sanitizedDwell } : {}),
  };

  return invokeAuthedSocialFunction<SocialRecordImpressionsResponse>(
    'social-record-impressions',
    requestBody as unknown as Record<string, unknown>,
  );
}

export async function recordSocialPostViews(postIds: string[]) {
  const normalizedIds = normalizeSocialImpressionPostIds(postIds);

  if (normalizedIds.length === 0) {
    return {
      success: true,
      recorded_count: 0,
    } satisfies SocialRecordPostViewsResponse;
  }

  const requestBody: SocialRecordPostViewsRequest = {
    post_ids: normalizedIds,
  };

  return invokeAuthedSocialFunction<SocialRecordPostViewsResponse>(
    'social-record-post-views',
    requestBody as unknown as Record<string, unknown>,
  );
}

export async function reportSocialContent(
  requestBody: SocialReportContentRequest,
) {
  return invokeAuthedSocialFunction<SocialReportContentResponse>(
    'social-report-content',
    requestBody as unknown as Record<string, unknown>,
  );
}

export async function followSocialAuthor(
  authorId: string,
  action?: 'follow' | 'unfollow',
) {
  const requestBody: SocialFollowAuthorRequest = {
    author_id: authorId,
    ...(action ? { action } : {}),
  };
  return invokeAuthedSocialFunction<SocialFollowAuthorResponse>(
    'social-follow-author',
    requestBody as unknown as Record<string, unknown>,
  );
}

export async function hideSocialAuthor(
  authorId: string,
  action?: 'hide' | 'unhide',
) {
  const requestBody: SocialHideAuthorRequest = {
    author_id: authorId,
    ...(action ? { action } : {}),
  };
  return invokeAuthedSocialFunction<SocialHideAuthorResponse>(
    'social-hide-author',
    requestBody as unknown as Record<string, unknown>,
  );
}

export async function shareSocialPostAsset(
  assetUrl: string,
  postId: string,
  dialogTitle = 'Share social post',
) {
  const sharingAvailable = await Sharing.isAvailableAsync();
  if (!sharingAvailable) {
    throw new SocialServiceError('Sharing is not available on this device', {
      code: 'sharing_unavailable',
      status: 400,
    });
  }

  const cacheDirectory = FileSystemLegacy.cacheDirectory;
  if (!cacheDirectory) {
    throw new SocialServiceError('Unable to access the device cache directory', {
      code: 'missing_cache_directory',
      status: 500,
    });
  }

  const downloadResult = await FileSystemLegacy.downloadAsync(
    assetUrl,
    `${cacheDirectory}social-post-${postId}.jpg`,
  );

  await Sharing.shareAsync(downloadResult.uri, {
    mimeType: 'image/jpeg',
    dialogTitle,
  });
}

export function createFeedPageWithMergedPost(
  page: SocialFeedPage,
  nextPost: SocialPost,
): SocialFeedPage {
  const items = [nextPost, ...page.items.filter((item) => item.id !== nextPost.id)];
  return {
    ...page,
    items,
  };
}

export function applyOptimisticReactionToSocialPost(
  post: SocialPost,
  nextReaction: SocialReactionState,
) {
  const previousReaction = post.viewer_reaction ?? (post.viewer_has_liked ? 'like' : 'neutral');
  let likeCount = post.like_count;
  let dislikeCount = post.dislike_count;

  // Only 'like' and 'dislike' touch the like/dislike counters. Nuanced reactions
  // (laugh/wow/sad) are tracked in reaction_distribution on the server; on the
  // client we just flip viewer_reaction so the icon updates.
  if (previousReaction === 'like') {
    likeCount = Math.max(0, likeCount - 1);
  } else if (previousReaction === 'dislike') {
    dislikeCount = Math.max(0, dislikeCount - 1);
  }

  if (nextReaction === 'like') {
    likeCount += 1;
  } else if (nextReaction === 'dislike') {
    dislikeCount += 1;
  }

  return {
    ...post,
    viewer_reaction: nextReaction,
    viewer_has_liked: nextReaction === 'like',
    like_count: likeCount,
    dislike_count: dislikeCount,
  };
}

export function getSanitizedSocialCommentCount(
  commentCount: number | null | undefined,
) {
  return typeof commentCount === 'number' && Number.isFinite(commentCount)
    ? Math.max(0, Math.floor(commentCount))
    : 0;
}

export function getDisplayedSocialCommentCount(
  post: Pick<SocialPost, 'comment_count' | 'viewer_visible_comment_count'> | null | undefined,
) {
  if (!post) {
    return 0;
  }

  return getSanitizedSocialCommentCount(
    typeof post.viewer_visible_comment_count === 'number' &&
      Number.isFinite(post.viewer_visible_comment_count)
      ? post.viewer_visible_comment_count
      : post.comment_count,
  );
}

export function applyOptimisticLikeToSocialComment(
  comment: SocialComment,
  liked: boolean,
) {
  const nextLikeCount =
    liked === comment.viewer_has_liked
      ? comment.like_count
      : liked
        ? comment.like_count + 1
        : Math.max(0, comment.like_count - 1);

  return {
    ...comment,
    viewer_has_liked: liked,
    like_count: nextLikeCount,
  };
}

export function updateSocialCommentLikeState(
  comments: SocialComment[] | undefined,
  commentId: string,
  updater: (comment: SocialComment) => SocialComment,
) {
  if (!comments) {
    return comments;
  }

  return comments.map((comment) =>
    comment.id === commentId ? updater(comment) : comment,
  );
}

export function upsertSocialCommentInThread(
  comments: SocialComment[] | undefined,
  nextComment: SocialComment,
) {
  const safeComments = comments ?? [];
  let inserted = false;
  const nextComments: SocialComment[] = [];

  for (const comment of safeComments) {
    if (comment.id !== nextComment.id) {
      nextComments.push(comment);
      continue;
    }

    if (!inserted) {
      nextComments.push(nextComment);
      inserted = true;
    }
  }

  return inserted ? nextComments : [...nextComments, nextComment];
}

export function removeSocialCommentFromThread(
  comments: SocialComment[] | undefined,
  commentId: string,
) {
  if (!comments) {
    return comments;
  }

  return comments.filter((comment) => comment.id !== commentId);
}

export function prioritizeViewerSocialComments(
  comments: SocialComment[] | undefined,
  currentUserId?: string | null,
): SocialComment[] {
  if (!comments || comments.length === 0) {
    return [];
  }

  if (!currentUserId) {
    return comments;
  }

  const ownComments: SocialComment[] = [];
  const otherComments: SocialComment[] = [];

  for (const comment of comments) {
    if (comment.author_id === currentUserId) {
      ownComments.push(comment);
    } else {
      otherComments.push(comment);
    }
  }

  return ownComments.length > 0
    ? [...ownComments, ...otherComments]
    : comments;
}

// Each fetched page is already ordered by the backend. Keep that first-seen
// order stable so local cache patches do not make visible comments jump.
export function flattenSocialCommentsPages(
  pages: SocialCommentsPage[] | undefined,
): SocialComment[] {
  if (!pages || pages.length === 0) {
    return [];
  }

  const seen = new Set<string>();
  const collected: SocialComment[] = [];

  for (const page of pages) {
    for (const comment of page.items) {
      if (seen.has(comment.id)) {
        continue;
      }
      seen.add(comment.id);
      collected.push(comment);
    }
  }

  return collected;
}

export function updateSocialCommentLikeStateInPages(
  pages: SocialCommentsPage[] | undefined,
  commentId: string,
  updater: (comment: SocialComment) => SocialComment,
) {
  if (!pages) {
    return pages;
  }

  return pages.map((page) => ({
    ...page,
    items: page.items.map((comment) =>
      comment.id === commentId ? updater(comment) : comment,
    ),
  }));
}

export function removeSocialCommentFromPages(
  pages: SocialCommentsPage[],
  commentId: string,
): SocialCommentsPage[];
export function removeSocialCommentFromPages(
  pages: SocialCommentsPage[] | undefined,
  commentId: string,
): SocialCommentsPage[] | undefined;
export function removeSocialCommentFromPages(
  pages: SocialCommentsPage[] | undefined,
  commentId: string,
): SocialCommentsPage[] | undefined {
  if (!pages) {
    return pages;
  }

  return pages.map((page) => ({
    ...page,
    items: page.items.filter((comment) => comment.id !== commentId),
  }));
}

// Insert or update a comment inside the infinite pages without changing the
// visible order of already loaded comments.
export function upsertSocialCommentInPages(
  pages: SocialCommentsPage[] | undefined,
  nextComment: SocialComment,
): SocialCommentsPage[] {
  const safePages = pages ?? [];

  if (safePages.length === 0) {
    return [{ items: [nextComment], next_cursor: null }];
  }

  let inserted = false;
  const updatedPages = safePages.map((page) => {
    const nextItems: SocialComment[] = [];

    for (const comment of page.items) {
      if (comment.id !== nextComment.id) {
        nextItems.push(comment);
        continue;
      }

      if (!inserted) {
        nextItems.push(nextComment);
        inserted = true;
      }
    }

    return {
      ...page,
      items: nextItems,
    };
  });

  if (inserted) {
    return updatedPages;
  }

  const lastPageIndex = updatedPages.length - 1;
  return updatedPages.map((page, pageIndex) =>
    pageIndex === lastPageIndex
      ? {
          ...page,
          items: [...page.items, nextComment],
        }
      : page,
  );
}

export function updateSocialPostLikeState(
  pages: SocialFeedPage[] | undefined,
  postId: string,
  updater: (post: SocialPost) => SocialPost,
) {
  if (!pages) {
    return pages;
  }

  return pages.map((page) => ({
    ...page,
    items: page.items.map((item) => (item.id === postId ? updater(item) : item)),
  }));
}

export function removeSocialPostFromFeedPages(
  pages: SocialFeedPage[] | undefined,
  postId: string,
) {
  if (!pages) {
    return pages;
  }

  return pages.map((page) => ({
    ...page,
    items: page.items.filter((item) => item.id !== postId),
  }));
}

export function applyServerReactionStateToSocialPost(
  post: SocialPost,
  response: SocialSetReactionResponse,
) {
  return {
    ...post,
    viewer_reaction: response.viewer_reaction,
    viewer_has_liked: response.viewer_reaction === 'like',
    like_count: response.like_count,
    dislike_count: response.dislike_count,
  };
}

export function applyServerLikeStateToSocialComment(
  comment: SocialComment,
  response: SocialSetCommentLikeResponse,
) {
  return {
    ...comment,
    viewer_has_liked: response.viewer_has_liked,
    like_count: response.like_count,
  };
}

export function normalizeSocialImpressionPostIds(
  postIds: string[],
  maxBatchSize = SOCIAL_IMPRESSION_BATCH_SIZE,
) {
  return Array.from(
    new Set(
      postIds.filter(
        (postId): postId is string =>
          typeof postId === 'string' && postId.trim().length > 0,
      ),
    ),
  ).slice(0, maxBatchSize);
}
