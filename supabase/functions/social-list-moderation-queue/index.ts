import {
  handleCorsPreflightRequest,
  jsonResponse,
  validateCorsOrigin,
} from '../_shared/cors.ts';
import {
  createServiceRoleClient,
  requireAdminUserProfile,
  requireAuthenticatedUser,
} from '../_shared/phase2Auth.ts';
import {
  loadPhase2FeatureFlags,
  requireFeatureEnabled,
} from '../_shared/phase2Config.ts';
import {
  createPhase2DatabaseError,
  getPhase2ErrorStatus,
  Phase2HttpError,
  toPhase2ErrorPayload,
} from '../_shared/phase2Errors.ts';
import {
  createRequestId,
  logPhase2Error,
} from '../_shared/phase2Observability.ts';
import {
  buildSocialAdminModerationQueueResponse,
  normalizeSocialAdminModerationItem,
} from '../_shared/phase2SocialAdmin.ts';
import type {
  Phase2SocialAdminModerationFilter,
  SocialAdminModerationItem,
  SocialAdminModerationQueueResponse,
} from '../_shared/phase2Types.ts';

const DEFAULT_MODERATION_QUEUE_LIMIT = 50;
const MAX_MODERATION_QUEUE_LIMIT = 100;

function requireGetMethod(req: Request) {
  if (req.method !== 'GET') {
    throw new Phase2HttpError(405, 'method_not_allowed', 'Method not allowed');
  }
}

function parseModerationFilter(req: Request): Phase2SocialAdminModerationFilter {
  const filter = new URL(req.url).searchParams.get('filter') ?? 'needs_review';

  if (
    filter === 'needs_review' ||
    filter === 'reported' ||
    filter === 'processed'
  ) {
    return filter;
  }

  throw new Phase2HttpError(
    400,
    'invalid_filter',
    'filter must be one of needs_review, reported, or processed',
  );
}

function encodeCursor(offset: number) {
  return btoa(String(offset))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function decodeCursor(cursor: string) {
  const normalizedCursor = cursor.replace(/-/g, '+').replace(/_/g, '/');
  const paddedCursor = normalizedCursor.padEnd(
    normalizedCursor.length + ((4 - (normalizedCursor.length % 4)) % 4),
    '=',
  );
  const parsedOffset = Number(atob(paddedCursor));

  if (!Number.isInteger(parsedOffset) || parsedOffset < 0) {
    throw new Error('Invalid cursor');
  }

  return parsedOffset;
}

function parseModerationPagination(req: Request) {
  const searchParams = new URL(req.url).searchParams;
  const rawLimit = searchParams.get('limit');
  const rawCursor = searchParams.get('cursor');

  const limit = rawLimit === null
    ? DEFAULT_MODERATION_QUEUE_LIMIT
    : Number(rawLimit);

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_MODERATION_QUEUE_LIMIT) {
    throw new Phase2HttpError(
      400,
      'invalid_limit',
      `limit must be an integer between 1 and ${MAX_MODERATION_QUEUE_LIMIT}`,
    );
  }

  if (!rawCursor) {
    return { limit, offset: 0 };
  }

  try {
    return {
      limit,
      offset: decodeCursor(rawCursor),
    };
  } catch {
    throw new Phase2HttpError(400, 'invalid_cursor', 'cursor is invalid');
  }
}

function readNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readBoolean(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function readModerationQueueRpcPayload(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Phase2HttpError(
      500,
      'social_admin_queue_invalid_payload',
      'Social moderation queue returned an invalid payload',
    );
  }

  return value as Record<string, unknown>;
}

function normalizeModerationQueueItems(rows: unknown[]): SocialAdminModerationItem[] {
  return rows.map((row, index) => {
    const normalizedItem = normalizeSocialAdminModerationItem(row);

    if (normalizedItem) {
      return normalizedItem;
    }

    throw new Phase2HttpError(
      500,
      'social_admin_queue_invalid_payload',
      'Social moderation queue returned an invalid item payload',
      {
        item_index: index,
      },
    );
  });
}

async function logModerationQueueAuditEvent(
  supabase: ReturnType<typeof createServiceRoleClient>,
  options: {
    actorId: string;
    filter: Phase2SocialAdminModerationFilter;
    limit: number;
    offset: number;
    requestId: string;
  },
) {
  const { error } = await supabase.from('admin_audit_events').insert({
    actor_id: options.actorId,
    action: 'social_moderation_queue.list',
    request_id: options.requestId,
    metadata: {
      filter: options.filter,
      limit: options.limit,
      offset: options.offset,
    },
  });

  if (error) {
    logPhase2Error(
      '[social-list-moderation-queue] Audit log insert failed',
      error,
      {
        request_id: options.requestId,
        source_code: error.code,
      },
    );
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

  const requestId = createRequestId();

  try {
    requireGetMethod(req);
    const filter = parseModerationFilter(req);
    const pagination = parseModerationPagination(req);

    const supabase = createServiceRoleClient();
    const user = await requireAuthenticatedUser(supabase, req);
    await requireAdminUserProfile(supabase, user.id);

    const featureFlags = await loadPhase2FeatureFlags(supabase);
    requireFeatureEnabled(
      featureFlags.social_enabled,
      'social_disabled',
      'Social moderation is currently disabled',
    );

    const { data, error } = await supabase.rpc(
      'list_social_moderation_queue_page',
      {
        p_filter: filter,
        p_limit: pagination.limit,
        p_offset: pagination.offset,
      },
    );

    if (error) {
      throw createPhase2DatabaseError(error, {
        contextLabel: 'Social moderation queue listing',
        fallbackCode: 'social_moderation_queue_fetch_failed',
        fallbackMessage: 'Failed to load the social moderation queue',
        relationName: 'social_moderation_queue',
        rpcName: 'list_social_moderation_queue_page',
      });
    }

    const queuePayload = readModerationQueueRpcPayload(data);
    const rows = Array.isArray(queuePayload.items) ? queuePayload.items : [];
    const items = normalizeModerationQueueItems(rows);
    const hasMore = readBoolean(queuePayload.has_more);
    const responseBody: SocialAdminModerationQueueResponse =
      buildSocialAdminModerationQueueResponse(items, filter, {
        pending_count: readNumber(queuePayload.pending_count),
        flagged_count: readNumber(queuePayload.flagged_count),
        reported_count: readNumber(queuePayload.reported_count),
        needs_review_count: readNumber(queuePayload.needs_review_count),
        processed_count: readNumber(queuePayload.processed_count),
        limit: readNumber(queuePayload.limit, pagination.limit),
        has_more: hasMore,
        next_cursor: hasMore
          ? encodeCursor(
            pagination.offset + readNumber(queuePayload.limit, pagination.limit),
          )
          : null,
      });

    await logModerationQueueAuditEvent(supabase, {
      actorId: user.id,
      filter,
      limit: responseBody.limit,
      offset: pagination.offset,
      requestId,
    });

    return jsonResponse(req, responseBody);
  } catch (error) {
    logPhase2Error('[social-list-moderation-queue] Request failed', error, {
      request_id: requestId,
    });

    return jsonResponse(req, toPhase2ErrorPayload(error, { requestId }), {
      status: getPhase2ErrorStatus(error),
    });
  }
});
