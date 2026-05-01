import { createPhase2DatabaseError, Phase2HttpError } from './phase2Errors.ts';
import { normalizeModerationState } from './phase2Moderation.ts';
import type {
  Phase2ModerationState,
  Phase2ModerationSubject,
  Phase2RateLimitResult,
  Phase2RejectionCooldownResult,
  SocialCommentSnapshot,
  Phase2SocialModerationQueueContentType,
  Phase2SocialRateLimitAction,
  Phase2UserProfileSnapshot,
} from './phase2Types.ts';
import {
  PHASE2_SOCIAL_BUCKET,
  isSocialAssetOwnedByUser,
  normalizeSocialImageMimeType,
  readOptionalNumber,
  readOptionalString,
} from './phase2Utils.ts';

interface SocialStorageObjectRow {
  bucket_id?: string | null;
  name?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface SocialModerationQueueRow {
  content_type?: string | null;
  content_id?: string | null;
  author_id?: string | null;
  author_username?: string | null;
  category?: string | null;
  content_text?: string | null;
  asset_path?: string | null;
  asset_url?: string | null;
  moderation_state?: string | null;
  moderation_reason?: string | null;
  moderation_provider?: string | null;
  created_at?: string | null;
  total_reports_24h?: number | null;
  unique_reporters_24h?: number | null;
  open_reports?: number | null;
  reason_codes?: unknown;
  last_reported_at?: string | null;
  moderation_queued_at?: string | null;
  moderation_claimed_at?: string | null;
  moderation_completed_at?: string | null;
  moderation_attempt_count?: number | null;
  moderation_last_error?: string | null;
  unique_viewer_count?: number | null;
  author_active_bans?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function createSocialUploadLookupFailedError() {
  return new Phase2HttpError(
    503,
    'social_upload_lookup_failed',
    'The reserved social upload could not be resolved because storage lookup failed',
  );
}

function createReservedUploadNotFoundError() {
  return new Phase2HttpError(
    404,
    'reserved_upload_not_found',
    'The reserved social upload does not exist',
  );
}

function createInvalidUploadReferenceError() {
  return new Phase2HttpError(
    400,
    'invalid_upload_reference',
    'The provided social upload reference is invalid',
  );
}

function splitSocialStoragePath(assetPath: string) {
  const separatorIndex = assetPath.lastIndexOf('/');
  if (separatorIndex < 0) {
    return {
      folderPath: '',
      fileName: assetPath,
    };
  }

  return {
    folderPath: assetPath.slice(0, separatorIndex),
    fileName: assetPath.slice(separatorIndex + 1),
  };
}

function buildSocialStorageAssetPath(folderPath: string, fileName: string) {
  return folderPath ? `${folderPath}/${fileName}` : fileName;
}

async function listSocialStorageObjects(
  client: any,
  folderPath: string,
  options: {
    limit: number;
    search?: string;
  },
): Promise<SocialStorageObjectRow[]> {
  // Hosted PostgREST only exposes public/graphql_public, so use the Storage API.
  const { data, error } = await client.storage.from(PHASE2_SOCIAL_BUCKET).list(
    folderPath,
    {
      limit: options.limit,
      ...(options.search ? { search: options.search } : {}),
    },
  );

  if (error) {
    throw createSocialUploadLookupFailedError();
  }

  const rows = Array.isArray(data) ? data : [];
  return rows.map((row) => ({
    bucket_id: PHASE2_SOCIAL_BUCKET,
    name:
      typeof row?.name === 'string'
        ? buildSocialStorageAssetPath(folderPath, row.name)
        : null,
    metadata:
      row && typeof row === 'object' && 'metadata' in row
        ? (row.metadata as Record<string, unknown> | null)
        : null,
  }));
}

function parseResolvedSocialUploadRow(
  userId: string,
  row: SocialStorageObjectRow,
  options: {
    uploadPrefix: string;
    expectedAssetPath?: string;
  },
) {
  const assetPath = typeof row.name === 'string' ? row.name : null;

  if (
    !assetPath ||
    !isSocialAssetOwnedByUser(userId, assetPath) ||
    !assetPath.startsWith(options.uploadPrefix) ||
    (options.expectedAssetPath && assetPath !== options.expectedAssetPath)
  ) {
    throw createInvalidUploadReferenceError();
  }

  const metadata = row.metadata as Record<string, unknown> | null;
  const rawMetadataMimeType =
    typeof metadata?.mimetype === 'string'
      ? metadata.mimetype
      : typeof metadata?.contentType === 'string'
        ? metadata.contentType
        : null;

  let metadataMimeType: string | null = null;
  if (rawMetadataMimeType) {
    try {
      metadataMimeType = normalizeSocialImageMimeType(rawMetadataMimeType);
    } catch {
      throw createInvalidUploadReferenceError();
    }
  }

  return {
    asset_path: assetPath,
    mime_type: metadataMimeType,
  };
}

async function resolveReservedSocialUploadByExactPath(
  client: any,
  userId: string,
  uploadPrefix: string,
  reservedAssetPath: string,
) {
  const { folderPath, fileName } = splitSocialStoragePath(reservedAssetPath);
  const rows = await listSocialStorageObjects(client, folderPath, {
    limit: 10,
    search: fileName,
  });
  const exactMatches = rows.filter((row) => row.name === reservedAssetPath);

  if (exactMatches.length === 0) {
    throw createReservedUploadNotFoundError();
  }

  if (exactMatches.length !== 1) {
    throw createInvalidUploadReferenceError();
  }

  return parseResolvedSocialUploadRow(userId, exactMatches[0], {
    uploadPrefix,
    expectedAssetPath: reservedAssetPath,
  });
}

async function resolveReservedSocialUploadByPrefix(
  client: any,
  userId: string,
  uploadPrefix: string,
) {
  const { folderPath, fileName } = splitSocialStoragePath(uploadPrefix);
  const rows = await listSocialStorageObjects(client, folderPath, {
    limit: 10,
    search: fileName,
  });
  const prefixMatches = rows.filter(
    (row) => typeof row.name === 'string' && row.name.startsWith(uploadPrefix),
  );

  if (prefixMatches.length === 0) {
    throw createReservedUploadNotFoundError();
  }

  if (prefixMatches.length !== 1) {
    throw createInvalidUploadReferenceError();
  }

  return parseResolvedSocialUploadRow(userId, prefixMatches[0], {
    uploadPrefix,
  });
}

export async function fetchViewerProfileSnapshot(
  client: any,
  userId: string,
): Promise<Phase2UserProfileSnapshot> {
  const { data, error } = await client
    .from('user_profiles')
    .select('username, avatar_url, account_tier, country_code')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) {
    return {
      username: null,
      avatar_url: null,
      account_tier: null,
      country_code: null,
    };
  }

  return {
    username: typeof data.username === 'string' ? data.username : null,
    avatar_url: typeof data.avatar_url === 'string' ? data.avatar_url : null,
    account_tier:
      typeof data.account_tier === 'string' ? data.account_tier : null,
    country_code:
      typeof data.country_code === 'string' && /^[A-Z]{2}$/.test(data.country_code)
        ? data.country_code
        : null,
  };
}

export async function isAdminUser(client: any, userId: string) {
  const { data } = await client
    .from('user_profiles')
    .select('account_tier')
    .eq('id', userId)
    .maybeSingle();

  return data?.account_tier === 'admin';
}

export async function assertOwnedScan(
  client: any,
  userId: string,
  scanId: string,
) {
  const { data, error } = await client
    .from('scans')
    .select('id')
    .eq('id', scanId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) {
    throw new Phase2HttpError(403, 'scan_not_owned', 'The provided scan does not belong to the user');
  }
}

export async function assertOwnedSocialAsset(
  client: any,
  userId: string,
  assetPath: string,
) {
  if (!isSocialAssetOwnedByUser(userId, assetPath)) {
    throw new Phase2HttpError(
      403,
      'asset_not_owned',
      'Asset path must point to the authenticated user folder',
    );
  }

  const { data, error } = await client
    .schema('storage')
    .from('objects')
    .select('name')
    .eq('bucket_id', PHASE2_SOCIAL_BUCKET)
    .eq('name', assetPath)
    .maybeSingle();

  if (error || !data) {
    throw new Phase2HttpError(400, 'asset_not_found', 'The provided social asset does not exist');
  }
}

export async function resolveReservedSocialUpload(
  client: any,
  options: {
    userId: string;
    uploadId: string;
    reservedAssetPath?: string;
  },
) {
  const uploadPrefix = `${options.userId}/posts/${options.uploadId}.`;

  if (options.reservedAssetPath) {
    if (
      !isSocialAssetOwnedByUser(options.userId, options.reservedAssetPath) ||
      !options.reservedAssetPath.startsWith(uploadPrefix)
    ) {
      throw createInvalidUploadReferenceError();
    }

    return resolveReservedSocialUploadByExactPath(
      client,
      options.userId,
      uploadPrefix,
      options.reservedAssetPath,
    );
  }

  return resolveReservedSocialUploadByPrefix(client, options.userId, uploadPrefix);
}

export async function getSocialRateLimit(
  client: any,
  action: Phase2SocialRateLimitAction,
  userId: string,
): Promise<Phase2RateLimitResult> {
  const { data, error } = await client.rpc('check_social_rate_limit', {
    p_action: action,
    p_user_id: userId,
  });

  if (error) {
    throw new Phase2HttpError(
      500,
      'social_rate_limit_failed',
      'Failed to evaluate social rate limits',
      { action },
    );
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Phase2HttpError(
      500,
      'social_rate_limit_failed',
      'Missing social rate limit result',
      { action },
    );
  }

  return {
    allowed: row.allowed === true,
    limit_count: Number(row.limit_count ?? 0),
    window_seconds: Number(row.window_seconds ?? 0),
    recent_count: Number(row.recent_count ?? 0),
    retry_after_seconds: Number(row.retry_after_seconds ?? 0),
  };
}

export async function getSocialRejectionCooldown(
  client: any,
  userId: string,
): Promise<Phase2RejectionCooldownResult> {
  const { data, error } = await client.rpc('get_social_rejection_cooldown', {
    p_user_id: userId,
  });

  if (error) {
    throw new Phase2HttpError(
      500,
      'social_rejection_cooldown_failed',
      'Failed to evaluate social rejection cooldown',
    );
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return {
      active: false,
      cooldown_until: null,
      recent_rejection_count: 0,
      rejection_threshold: 0,
      cooldown_hours: 0,
    };
  }

  return {
    active: row.active === true,
    cooldown_until:
      typeof row.cooldown_until === 'string' ? row.cooldown_until : null,
    recent_rejection_count: Number(row.recent_rejection_count ?? 0),
    rejection_threshold: Number(row.rejection_threshold ?? 0),
    cooldown_hours: Number(row.cooldown_hours ?? 0),
  };
}

export async function getVisibleSocialPost(client: any, userId: string, postId: string) {
  const viewerIsAdmin = await isAdminUser(client, userId);
  const { data, error } = await client
    .from('social_posts')
    .select(
      'id, author_id, author_username, category, content_text, asset_url, moderation_state, deleted_at, like_count, dislike_count, impression_count, comment_count, created_at',
    )
    .eq('id', postId)
    .maybeSingle();

  if (error || !data) {
    throw new Phase2HttpError(404, 'post_not_found', 'Social post not found');
  }

  const isVisibleToUser =
    viewerIsAdmin ||
    data.author_id === userId ||
    (data.deleted_at === null && data.moderation_state === 'approved');

  if (!isVisibleToUser) {
    throw new Phase2HttpError(404, 'post_not_found', 'Social post not found');
  }

  return data;
}

async function getSocialCommentRecord(client: any, commentId: string) {
  const { data, error } = await client
    .from('social_comments')
    .select(
      'id, post_id, author_id, author_username, author_avatar_url, content_text, content_hash, created_at, like_count, moderation_state, moderation_reason, moderation_provider, moderation_summary_json, rejection_count, last_rejected_at, deleted_at',
    )
    .eq('id', commentId)
    .maybeSingle();

  if (error || !data) {
    throw new Phase2HttpError(404, 'comment_not_found', 'Social comment not found');
  }

  return data;
}

export async function assertDeletableSocialPost(
  client: any,
  userId: string,
  postId: string,
) {
  const { data, error } = await client
    .from('social_posts')
    .select(
      'id, author_id, deleted_at, moderation_state, moderation_reason, moderation_provider, moderation_summary_json',
    )
    .eq('id', postId)
    .maybeSingle();

  if (error || !data) {
    throw new Phase2HttpError(404, 'post_not_found', 'Social post not found');
  }

  if (data.author_id !== userId) {
    throw new Phase2HttpError(
      403,
      'post_delete_forbidden',
      'Only the author can delete this social post',
    );
  }

  if (data.deleted_at != null) {
    throw new Phase2HttpError(
      409,
      'post_already_deleted',
      'Social post already deleted',
    );
  }

  return data;
}

export function assertReportableTargetNotOwnedByUser(
  target: {
    author_id?: string | null;
  },
  userId: string,
) {
  if (target.author_id === userId) {
    throw new Phase2HttpError(
      403,
      'cannot_report_own_content',
      'You cannot report your own content',
    );
  }
}

export function isSocialPostInteractiveForUser(
  post: {
    author_id?: string | null;
    moderation_state?: string | null;
    deleted_at?: string | null;
  },
  userId: string,
) {
  if (post.deleted_at != null) {
    return false;
  }

  return (
    post.moderation_state === 'approved' ||
    (post.moderation_state === 'pending' && post.author_id === userId)
  );
}

export function isSocialCommentInteractiveForUser(
  comment: {
    author_id?: string | null;
    moderation_state?: string | null;
    deleted_at?: string | null;
  },
  userId: string,
) {
  if (comment.deleted_at != null) {
    return false;
  }

  return (
    comment.moderation_state === 'approved' ||
    (comment.moderation_state === 'pending' && comment.author_id === userId)
  );
}

export function isSocialCommentEditableForUser(
  comment: {
    author_id?: string | null;
    moderation_state?: string | null;
    deleted_at?: string | null;
  },
  userId: string,
) {
  if (comment.deleted_at != null) {
    return false;
  }

  return (
    comment.author_id === userId &&
    (comment.moderation_state === 'approved' ||
      comment.moderation_state === 'pending')
  );
}

export async function assertCommentableSocialPost(
  client: any,
  userId: string,
  postId: string,
) {
  const data = await getVisibleSocialPost(client, userId, postId);

  if (!isSocialPostInteractiveForUser(data, userId)) {
    throw new Phase2HttpError(
      403,
      'post_not_commentable',
      'Comments are only allowed on approved posts or your own pending posts',
    );
  }

  return data;
}

export async function assertReactableSocialPost(
  client: any,
  userId: string,
  postId: string,
) {
  const data = await getVisibleSocialPost(client, userId, postId);

  if (!isSocialPostInteractiveForUser(data, userId)) {
    throw new Phase2HttpError(
      403,
      'post_not_reactable',
      'Reactions are only allowed on approved posts or your own pending posts',
    );
  }

  return data;
}

export async function getVisibleSocialComment(
  client: any,
  userId: string,
  commentId: string,
) {
  const comment = await getSocialCommentRecord(client, commentId);
  await getVisibleSocialPost(client, userId, comment.post_id);

  const viewerIsAdmin = await isAdminUser(client, userId);
  const isVisibleToUser =
    viewerIsAdmin ||
    comment.author_id === userId ||
    (comment.deleted_at === null && comment.moderation_state === 'approved');

  if (!isVisibleToUser) {
    throw new Phase2HttpError(404, 'comment_not_found', 'Social comment not found');
  }

  return comment;
}

export async function assertLikeableSocialComment(
  client: any,
  userId: string,
  commentId: string,
) {
  const comment = await getVisibleSocialComment(client, userId, commentId);
  const post = await getVisibleSocialPost(client, userId, comment.post_id);

  if (!isSocialPostInteractiveForUser(post, userId)) {
    throw new Phase2HttpError(
      403,
      'comment_not_likeable',
      'Comment likes are only allowed when the parent post is interactive',
    );
  }

  if (!isSocialCommentInteractiveForUser(comment, userId)) {
    throw new Phase2HttpError(
      403,
      'comment_not_likeable',
      'Comment likes are only allowed on approved comments or your own pending comments',
    );
  }

  return {
    comment,
    post,
  };
}

export async function assertEditableSocialComment(
  client: any,
  userId: string,
  commentId: string,
) {
  const comment = await getSocialCommentRecord(client, commentId);

  if (comment.author_id !== userId) {
    throw new Phase2HttpError(
      403,
      'comment_edit_forbidden',
      'Only the author can edit this social comment',
    );
  }

  if (comment.deleted_at != null) {
    throw new Phase2HttpError(
      409,
      'comment_already_deleted',
      'Social comment already deleted',
    );
  }

  if (!isSocialCommentEditableForUser(comment, userId)) {
    throw new Phase2HttpError(
      403,
      'comment_edit_forbidden',
      'Only approved or pending comments can be edited by their author',
    );
  }

  return comment;
}

export async function assertDeletableSocialComment(
  client: any,
  userId: string,
  commentId: string,
) {
  const comment = await getSocialCommentRecord(client, commentId);

  if (comment.author_id !== userId) {
    throw new Phase2HttpError(
      403,
      'comment_delete_forbidden',
      'Only the author can delete this social comment',
    );
  }

  if (comment.deleted_at != null) {
    throw new Phase2HttpError(
      409,
      'comment_already_deleted',
      'Social comment already deleted',
    );
  }

  return comment;
}

export async function assertNoRecentDuplicateCommentExcluding(
  client: any,
  userId: string,
  contentHash: string,
  excludedCommentId: string,
) {
  const { data } = await client
    .from('social_comments')
    .select('id')
    .eq('author_id', userId)
    .eq('content_hash', contentHash)
    .neq('id', excludedCommentId)
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .limit(1)
    .maybeSingle();

  if (data?.id) {
    throw new Phase2HttpError(
      409,
      'duplicate_content',
      'A similar comment was already submitted recently',
    );
  }
}

export async function getSocialCommentSnapshotForUser(
  client: any,
  userId: string,
  commentId: string,
): Promise<SocialCommentSnapshot> {
  const { data: comment, error: commentError } = await client
    .from('social_comments')
    .select(
      'id, post_id, author_id, author_username, author_avatar_url, content_text, created_at, like_count, moderation_state, moderation_reason, moderation_provider, rejection_count, last_rejected_at, deleted_at',
    )
    .eq('id', commentId)
    .maybeSingle();

  if (commentError) {
    throw createPhase2DatabaseError(commentError, {
      contextLabel: 'Social comment snapshot lookup',
      fallbackCode: 'social_comment_snapshot_failed',
      fallbackMessage: 'Failed to load the updated social comment',
      relationName: 'social_comments',
    });
  }

  if (!comment) {
    throw new Phase2HttpError(404, 'comment_not_found', 'Social comment not found');
  }

  const { data: viewerLike, error: viewerLikeError } = await client
    .from('social_comment_likes')
    .select('comment_id')
    .eq('comment_id', commentId)
    .eq('user_id', userId)
    .maybeSingle();

  if (viewerLikeError) {
    throw createPhase2DatabaseError(viewerLikeError, {
      contextLabel: 'Social comment like state lookup',
      fallbackCode: 'social_comment_snapshot_failed',
      fallbackMessage: 'Failed to load the updated social comment',
      relationName: 'social_comment_likes',
    });
  }

  const moderationState = normalizeModerationState(
    comment.moderation_state,
    'pending',
  );

  return {
    id: comment.id,
    post_id: comment.post_id,
    author_id: comment.author_id,
    author_username:
      typeof comment.author_username === 'string' ? comment.author_username : null,
    author_avatar_url:
      typeof comment.author_avatar_url === 'string'
        ? comment.author_avatar_url
        : null,
    content_text: typeof comment.content_text === 'string' ? comment.content_text : '',
    created_at: comment.created_at,
    like_count: Number(comment.like_count ?? 0),
    viewer_has_liked: !!viewerLike?.comment_id,
    moderation_state: moderationState,
    moderation_status: moderationState,
    moderation_reason:
      typeof comment.moderation_reason === 'string'
        ? comment.moderation_reason
        : null,
    moderation_provider:
      typeof comment.moderation_provider === 'string'
        ? comment.moderation_provider
        : null,
    rejection_count: Number(comment.rejection_count ?? 0),
    last_rejected_at:
      typeof comment.last_rejected_at === 'string'
        ? comment.last_rejected_at
        : null,
    deleted_at:
      typeof comment.deleted_at === 'string' ? comment.deleted_at : null,
  };
}

export async function getReportableTarget(
  client: any,
  userId: string,
  targetType: 'post' | 'comment',
  targetId: string,
) {
  if (targetType === 'post') {
    return getVisibleSocialPost(client, userId, targetId);
  }

  return getVisibleSocialComment(client, userId, targetId);
}

export async function assertNoRecentDuplicatePost(
  client: any,
  userId: string,
  options: {
    contentHash?: string | null;
    assetHash?: string | null;
  },
) {
  const duplicateChecks = [];

  if (options.contentHash) {
    duplicateChecks.push(
      client
        .from('social_posts')
        .select('id')
        .eq('author_id', userId)
        .eq('content_hash', options.contentHash)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .limit(1)
        .maybeSingle(),
    );
  }

  if (options.assetHash) {
    duplicateChecks.push(
      client
        .from('social_posts')
        .select('id')
        .eq('author_id', userId)
        .eq('asset_hash', options.assetHash)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .limit(1)
        .maybeSingle(),
    );
  }

  if (duplicateChecks.length === 0) {
    return;
  }

  const results = await Promise.all(duplicateChecks);
  if (results.some((result) => !!result.data?.id)) {
    throw new Phase2HttpError(
      409,
      'duplicate_content',
      'Similar content was already submitted recently',
    );
  }
}

export async function assertNoRecentDuplicateComment(
  client: any,
  userId: string,
  postId: string,
  contentHash: string,
) {
  const { data } = await client
    .from('social_comments')
    .select('id')
    .eq('author_id', userId)
    .eq('post_id', postId)
    .eq('content_hash', contentHash)
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .limit(1)
    .maybeSingle();

  if (data?.id) {
    throw new Phase2HttpError(
      409,
      'duplicate_content',
      'A similar comment was already submitted recently',
    );
  }
}

export async function getRecentReportCount24h(
  client: any,
  targetType: 'post' | 'comment',
  targetId: string,
) {
  const query = client
    .from('social_reports')
    .select('reporter_id', { count: 'exact', head: false })
    .eq('target_type', targetType)
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  const scopedQuery =
    targetType === 'post'
      ? query.eq('target_post_id', targetId)
      : query.eq('target_comment_id', targetId);

  const { data, error } = await scopedQuery;
  if (error) {
    return 0;
  }

  return new Set(
    (Array.isArray(data) ? data : [])
      .map((item) => item.reporter_id)
      .filter((value): value is string => typeof value === 'string' && value.length > 0),
  ).size;
}

function normalizeSocialModerationSubject(
  row: SocialModerationQueueRow,
): Phase2ModerationSubject | null {
  const contentType = readOptionalString(row.content_type);
  const contentId = readOptionalString(row.content_id);
  const createdAt = readOptionalString(row.created_at);

  if (
    (contentType !== 'post' && contentType !== 'comment') ||
    !contentId ||
    !createdAt
  ) {
    return null;
  }

  const rawReasonCodes = Array.isArray(row.reason_codes)
    ? row.reason_codes
    : [];

  const category = readOptionalString(row.category);

  return {
    content_type: contentType,
    content_id: contentId,
    author_id: readOptionalString(row.author_id),
    author_username: readOptionalString(row.author_username),
    category:
      category === 'before_after' || category === 'food' || category === 'physique'
        ? category
        : null,
    content_text: readOptionalString(row.content_text),
    asset_path: readOptionalString(row.asset_path),
    asset_url: readOptionalString(row.asset_url),
    moderation_state: normalizeModerationState(
      row.moderation_state,
      'pending',
    ),
    moderation_reason: readOptionalString(row.moderation_reason),
    moderation_provider: readOptionalString(row.moderation_provider),
    created_at: createdAt,
    total_reports_24h: readOptionalNumber(row.total_reports_24h) ?? 0,
    unique_reporters_24h: readOptionalNumber(row.unique_reporters_24h) ?? 0,
    open_reports: readOptionalNumber(row.open_reports) ?? 0,
    unique_viewer_count: readOptionalNumber(row.unique_viewer_count) ?? 0,
    reason_codes: rawReasonCodes.filter(
      (reasonCode): reasonCode is string =>
        typeof reasonCode === 'string' && reasonCode.trim().length > 0,
    ),
    last_reported_at: readOptionalString(row.last_reported_at),
    moderation_queued_at: readOptionalString(row.moderation_queued_at),
    moderation_claimed_at: readOptionalString(row.moderation_claimed_at),
    moderation_completed_at: readOptionalString(row.moderation_completed_at),
    moderation_attempt_count: readOptionalNumber(row.moderation_attempt_count) ?? 0,
    moderation_last_error: readOptionalString(row.moderation_last_error),
    author_active_bans: Array.isArray(row.author_active_bans)
      ? row.author_active_bans
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
            ): ban is Phase2ModerationSubject['author_active_bans'][number] => ban !== null,
          )
      : [],
  };
}

function getModerationQueuePriorityTimestamp(subject: Phase2ModerationSubject) {
  return Date.parse(subject.moderation_queued_at ?? subject.created_at);
}

export function isSocialModerationSubjectClaimable(
  subject: Phase2ModerationSubject,
  options: {
    nowIso?: string;
    staleAfterMinutes?: number;
  } = {},
) {
  if (subject.moderation_state !== 'pending') {
    return false;
  }

  if (!subject.moderation_claimed_at) {
    return true;
  }

  const nowMs = Date.parse(options.nowIso ?? new Date().toISOString());
  const claimedAtMs = Date.parse(subject.moderation_claimed_at);
  if (!Number.isFinite(nowMs) || !Number.isFinite(claimedAtMs)) {
    return false;
  }

  const staleAfterMinutes = options.staleAfterMinutes ?? 15;
  return claimedAtMs <= nowMs - (staleAfterMinutes * 60 * 1000);
}

export function compareSocialModerationSubjectsForClaim(
  left: Phase2ModerationSubject,
  right: Phase2ModerationSubject,
) {
  if (left.open_reports !== right.open_reports) {
    return right.open_reports - left.open_reports;
  }

  const leftPriorityMs = getModerationQueuePriorityTimestamp(left);
  const rightPriorityMs = getModerationQueuePriorityTimestamp(right);
  if (leftPriorityMs !== rightPriorityMs) {
    return leftPriorityMs - rightPriorityMs;
  }

  const leftCreatedAtMs = Date.parse(left.created_at);
  const rightCreatedAtMs = Date.parse(right.created_at);
  if (leftCreatedAtMs !== rightCreatedAtMs) {
    return leftCreatedAtMs - rightCreatedAtMs;
  }

  return left.content_id.localeCompare(right.content_id);
}

export function selectClaimableSocialModerationSubjects(
  subjects: Phase2ModerationSubject[],
  options: {
    limit: number;
    nowIso?: string;
    staleAfterMinutes?: number;
  },
) {
  return [...subjects]
    .filter((subject) =>
      isSocialModerationSubjectClaimable(subject, {
        nowIso: options.nowIso,
        staleAfterMinutes: options.staleAfterMinutes,
      }))
    .sort(compareSocialModerationSubjectsForClaim)
    .slice(0, options.limit);
}

export async function fetchSocialModerationQueueForDryRun(
  client: any,
  options: {
    contentType: Phase2SocialModerationQueueContentType;
    limit: number;
    staleAfterMinutes: number;
  },
) {
  const fetchLimit = Math.min(Math.max(options.limit * 10, 100), 500);
  let query = client
    .from('social_moderation_queue')
    .select(
      'content_type, content_id, author_id, author_username, category, content_text, asset_path, asset_url, moderation_state, moderation_reason, moderation_provider, created_at, total_reports_24h, unique_reporters_24h, open_reports, reason_codes, last_reported_at, moderation_queued_at, moderation_claimed_at, moderation_completed_at, moderation_attempt_count, moderation_last_error',
    )
    .eq('moderation_state', 'pending')
    .limit(fetchLimit);

  if (options.contentType !== 'all') {
    query = query.eq('content_type', options.contentType);
  }

  const { data, error } = await query;

  if (error) {
    throw createPhase2DatabaseError(error, {
      contextLabel: 'Social moderation queue dry run',
      fallbackCode: 'social_moderation_queue_fetch_failed',
      fallbackMessage: 'Failed to inspect the moderation queue',
      relationName: 'social_moderation_queue',
    });
  }

  const normalizedSubjects = (Array.isArray(data) ? data : [])
    .map((row) => normalizeSocialModerationSubject(row as SocialModerationQueueRow))
    .filter((row): row is Phase2ModerationSubject => row !== null);

  return selectClaimableSocialModerationSubjects(normalizedSubjects, {
    limit: options.limit,
    staleAfterMinutes: options.staleAfterMinutes,
  });
}

export async function claimSocialModerationBatch(
  client: any,
  options: {
    contentType: Phase2SocialModerationQueueContentType;
    limit: number;
    staleAfterMinutes: number;
  },
) {
  const { data, error } = await client.rpc('claim_social_moderation_batch', {
    p_limit: options.limit,
    p_content_type: options.contentType,
    p_stale_after_minutes: options.staleAfterMinutes,
  });

  if (error) {
    throw createPhase2DatabaseError(error, {
      contextLabel: 'Social moderation queue claim',
      fallbackCode: 'social_moderation_claim_failed',
      fallbackMessage: 'Failed to claim moderation queue items',
      rpcName: 'claim_social_moderation_batch',
    });
  }

  return (Array.isArray(data) ? data : [])
    .map((row) => normalizeSocialModerationSubject(row as SocialModerationQueueRow))
    .filter((row): row is Phase2ModerationSubject => row !== null);
}
