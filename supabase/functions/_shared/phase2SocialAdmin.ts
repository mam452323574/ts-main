import { normalizeModerationState } from './phase2Moderation.ts';
import { readOptionalNumber, readOptionalString } from './phase2Utils.ts';
import type {
  Phase2SocialAdminModerationFilter,
  Phase2SocialCategory,
  SocialAdminModerationItem,
  SocialAdminModerationQueueResponse,
} from './phase2Types.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readSocialCategory(value: unknown): Phase2SocialCategory | null {
  return value === 'before_after' || value === 'food' || value === 'physique'
    ? value
    : null;
}

function parseTimestamp(value: string | null | undefined, fallback = 0) {
  if (!value) {
    return fallback;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : fallback;
}

function isNeedsReviewSocialAdminModerationItem(
  item: SocialAdminModerationItem,
) {
  return (
    item.moderation_state === 'pending' || item.moderation_state === 'flagged'
  );
}

function isReportedSocialAdminModerationItem(
  item: SocialAdminModerationItem,
) {
  return (
    item.open_reports > 0 &&
    item.moderation_state !== 'pending' &&
    item.moderation_state !== 'flagged'
  );
}

function isProcessedSocialAdminModerationItem(
  item: SocialAdminModerationItem,
) {
  return (
    item.moderation_state === 'approved' ||
    item.moderation_state === 'rejected' ||
    item.moderation_state === 'hidden' ||
    item.moderation_state === 'removed'
  );
}

function filterSocialAdminModerationItems(
  items: SocialAdminModerationItem[],
  filter: Phase2SocialAdminModerationFilter,
) {
  switch (filter) {
    case 'reported':
      return items.filter(isReportedSocialAdminModerationItem);
    case 'processed':
      return items.filter(isProcessedSocialAdminModerationItem);
    case 'needs_review':
    default:
      return items.filter(isNeedsReviewSocialAdminModerationItem);
  }
}

function compareNeedsReviewItems(
  left: SocialAdminModerationItem,
  right: SocialAdminModerationItem,
) {
  const leftPriority = left.moderation_state === 'pending' ? 0 : 1;
  const rightPriority = right.moderation_state === 'pending' ? 0 : 1;
  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  if (left.open_reports !== right.open_reports) {
    return right.open_reports - left.open_reports;
  }

  const leftQueueTimestamp = parseTimestamp(
    left.moderation_queued_at,
    parseTimestamp(left.created_at),
  );
  const rightQueueTimestamp = parseTimestamp(
    right.moderation_queued_at,
    parseTimestamp(right.created_at),
  );
  if (leftQueueTimestamp !== rightQueueTimestamp) {
    return leftQueueTimestamp - rightQueueTimestamp;
  }

  const leftCreatedAt = parseTimestamp(left.created_at);
  const rightCreatedAt = parseTimestamp(right.created_at);
  if (leftCreatedAt !== rightCreatedAt) {
    return leftCreatedAt - rightCreatedAt;
  }

  return left.content_id.localeCompare(right.content_id);
}

function compareReportedItems(
  left: SocialAdminModerationItem,
  right: SocialAdminModerationItem,
) {
  if (left.open_reports !== right.open_reports) {
    return right.open_reports - left.open_reports;
  }

  const leftReportedAt = parseTimestamp(left.last_reported_at);
  const rightReportedAt = parseTimestamp(right.last_reported_at);
  if (leftReportedAt !== rightReportedAt) {
    return rightReportedAt - leftReportedAt;
  }

  const leftCreatedAt = parseTimestamp(left.created_at);
  const rightCreatedAt = parseTimestamp(right.created_at);
  if (leftCreatedAt !== rightCreatedAt) {
    return rightCreatedAt - leftCreatedAt;
  }

  return left.content_id.localeCompare(right.content_id);
}

function compareProcessedItems(
  left: SocialAdminModerationItem,
  right: SocialAdminModerationItem,
) {
  const leftCompletedAt = parseTimestamp(left.moderation_completed_at);
  const rightCompletedAt = parseTimestamp(right.moderation_completed_at);
  if (leftCompletedAt !== rightCompletedAt) {
    return rightCompletedAt - leftCompletedAt;
  }

  const leftCreatedAt = parseTimestamp(left.created_at);
  const rightCreatedAt = parseTimestamp(right.created_at);
  if (leftCreatedAt !== rightCreatedAt) {
    return rightCreatedAt - leftCreatedAt;
  }

  return left.content_id.localeCompare(right.content_id);
}

function sortSocialAdminModerationItems(
  items: SocialAdminModerationItem[],
  filter: Phase2SocialAdminModerationFilter,
) {
  const sortableItems = [...items];

  switch (filter) {
    case 'reported':
      return sortableItems.sort(compareReportedItems);
    case 'processed':
      return sortableItems.sort(compareProcessedItems);
    case 'needs_review':
    default:
      return sortableItems.sort(compareNeedsReviewItems);
  }
}

export function normalizeSocialAdminModerationItem(
  row: unknown,
): SocialAdminModerationItem | null {
  if (!isRecord(row)) {
    return null;
  }

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

  const rawReasonCodes = Array.isArray(row.reason_codes) ? row.reason_codes : [];

  return {
    content_type: contentType,
    content_id: contentId,
    author_id: readOptionalString(row.author_id),
    author_username: readOptionalString(row.author_username),
    category: readSocialCategory(row.category),
    content_text: readOptionalString(row.content_text),
    asset_url: readOptionalString(row.asset_url),
    moderation_state: normalizeModerationState(row.moderation_state, 'pending'),
    moderation_reason: readOptionalString(row.moderation_reason),
    moderation_provider: readOptionalString(row.moderation_provider),
    created_at: createdAt,
    open_reports: readOptionalNumber(row.open_reports) ?? 0,
    total_reports_24h: readOptionalNumber(row.total_reports_24h) ?? 0,
    unique_reporters_24h: readOptionalNumber(row.unique_reporters_24h) ?? 0,
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
    raw_like_count: readOptionalNumber(row.raw_like_count) ?? 0,
    raw_dislike_count: readOptionalNumber(row.raw_dislike_count) ?? 0,
    admin_like_adjustment: readOptionalNumber(row.admin_like_adjustment) ?? 0,
    admin_dislike_adjustment: readOptionalNumber(row.admin_dislike_adjustment) ?? 0,
    effective_like_count: readOptionalNumber(row.effective_like_count) ?? 0,
    effective_dislike_count: readOptionalNumber(row.effective_dislike_count) ?? 0,
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
            ): ban is SocialAdminModerationItem['author_active_bans'][number] => ban !== null,
          )
      : [],
  };
}

export function buildSocialAdminModerationQueueResponse(
  items: SocialAdminModerationItem[],
  filter: Phase2SocialAdminModerationFilter = 'needs_review',
  options: Partial<
    Pick<
      SocialAdminModerationQueueResponse,
      | 'pending_count'
      | 'flagged_count'
      | 'reported_count'
      | 'needs_review_count'
      | 'processed_count'
      | 'limit'
      | 'has_more'
      | 'next_cursor'
    >
  > = {},
): SocialAdminModerationQueueResponse {
  const filteredItems = sortSocialAdminModerationItems(
    filterSocialAdminModerationItems(items, filter),
    filter,
  );

  return {
    success: true,
    items: filteredItems,
    pending_count:
      options.pending_count ??
      items.filter((item) => item.moderation_state === 'pending').length,
    flagged_count:
      options.flagged_count ??
      items.filter((item) => item.moderation_state === 'flagged').length,
    reported_count:
      options.reported_count ??
      items.filter(isReportedSocialAdminModerationItem).length,
    needs_review_count:
      options.needs_review_count ??
      items.filter(isNeedsReviewSocialAdminModerationItem).length,
    processed_count:
      options.processed_count ??
      items.filter(isProcessedSocialAdminModerationItem).length,
    limit: options.limit ?? filteredItems.length,
    has_more: options.has_more ?? false,
    next_cursor: options.next_cursor ?? null,
  };
}
