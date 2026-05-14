import { SOCIAL_CATEGORIES } from '@/constants/social';
import type {
  SocialAdminModerationFilter,
  SocialAdminModerationItem,
  SocialAdminModerationQueueResponse,
  SocialModerateContentRequest,
  SocialModerationAction,
} from '@/types';

const ACTION_REASON_CODES: Partial<Record<SocialModerationAction, string>> = {
  reject: 'admin_reject',
  hide: 'admin_hide',
  remove: 'admin_remove',
};

export type AdminActionTone = 'primary' | 'danger' | 'neutral';
export type AdminModerationSortMode = 'urgent' | 'recent' | 'oldest';
export type AdminOverflowActionKey =
  | SocialModerationAction
  | 'change_category'
  | 'adjust_reactions'
  | 'moderate_author';

export interface AdminPrimaryActionDefinition {
  action: SocialModerationAction;
  labelKey: string;
  tone: AdminActionTone;
}

export interface AdminOverflowActionDefinition {
  key: AdminOverflowActionKey;
  labelKey: string;
  tone: AdminActionTone;
  action?: SocialModerationAction;
}

export function resolveDefaultSortMode(
  filter: SocialAdminModerationFilter,
): AdminModerationSortMode {
  return filter === 'processed' ? 'recent' : 'urgent';
}

export function getSectionCopy(filter: SocialAdminModerationFilter) {
  switch (filter) {
    case 'reported':
      return {
        titleKey: 'social.admin.sections.reported_title',
        bodyKey: 'social.admin.sections.reported_body',
        emptyTitleKey: 'social.admin.empty.reported_title',
        emptyBodyKey: 'social.admin.empty.reported_body',
      };
    case 'processed':
      return {
        titleKey: 'social.admin.sections.processed_title',
        bodyKey: 'social.admin.sections.processed_body',
        emptyTitleKey: 'social.admin.empty.processed_title',
        emptyBodyKey: 'social.admin.empty.processed_body',
      };
    case 'needs_review':
    default:
      return {
        titleKey: 'social.admin.sections.review_title',
        bodyKey: 'social.admin.sections.review_body',
        emptyTitleKey: 'social.admin.empty.review_title',
        emptyBodyKey: 'social.admin.empty.review_body',
      };
  }
}

export function getFilterCount(
  queueData: SocialAdminModerationQueueResponse | undefined,
  filter: SocialAdminModerationFilter,
) {
  if (!queueData) {
    return 0;
  }

  switch (filter) {
    case 'reported':
      return queueData.reported_count;
    case 'processed':
      return queueData.processed_count;
    case 'needs_review':
    default:
      return queueData.needs_review_count;
  }
}

function getSortableTimestamp(value: string | null | undefined) {
  const timestamp = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function compareUrgency(
  left: SocialAdminModerationItem,
  right: SocialAdminModerationItem,
) {
  if (right.open_reports !== left.open_reports) {
    return right.open_reports - left.open_reports;
  }

  if (right.unique_reporters_24h !== left.unique_reporters_24h) {
    return right.unique_reporters_24h - left.unique_reporters_24h;
  }

  const reportDelta =
    getSortableTimestamp(right.last_reported_at) -
    getSortableTimestamp(left.last_reported_at);
  if (reportDelta !== 0) {
    return reportDelta;
  }

  return (
    getSortableTimestamp(left.created_at) - getSortableTimestamp(right.created_at)
  );
}

function compareRecent(
  left: SocialAdminModerationItem,
  right: SocialAdminModerationItem,
) {
  return getSortableTimestamp(right.created_at) - getSortableTimestamp(left.created_at);
}

function compareOldest(
  left: SocialAdminModerationItem,
  right: SocialAdminModerationItem,
) {
  return getSortableTimestamp(left.created_at) - getSortableTimestamp(right.created_at);
}

export function sortModerationItems(
  items: SocialAdminModerationItem[],
  sortMode: AdminModerationSortMode,
) {
  const clonedItems = [...items];

  clonedItems.sort((left, right) => {
    if (sortMode === 'oldest') {
      return compareOldest(left, right);
    }

    if (sortMode === 'recent') {
      return compareRecent(left, right);
    }

    return compareUrgency(left, right);
  });

  return clonedItems;
}

export function searchModerationItems(
  items: SocialAdminModerationItem[],
  query: string,
) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return items;
  }

  return items.filter((item) => {
    const haystacks = [
      item.author_username ?? '',
      item.content_text ?? '',
    ];

    return haystacks.some((candidate) =>
      candidate.toLowerCase().includes(normalizedQuery),
    );
  });
}

export function formatAdminTimestamp(
  value: string | null | undefined,
  options?: Intl.DateTimeFormatOptions,
) {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, options ?? {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

export function parseSignedIntegerInput(value: string) {
  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return 0;
  }

  if (!/^-?\d+$/.test(normalizedValue)) {
    return null;
  }

  return Number.parseInt(normalizedValue, 10);
}

export function computeEffectiveReactionCount(
  rawCount: number,
  adminAdjustment: number,
) {
  return Math.max(0, rawCount + adminAdjustment);
}

export function buildModerationRequest(
  item: SocialAdminModerationItem,
  action: SocialModerationAction,
): SocialModerateContentRequest {
  const baseRequest: SocialModerateContentRequest = {
    target_type: item.content_type,
    action,
  };

  if (item.content_type === 'post') {
    baseRequest.target_post_id = item.content_id;
  } else {
    baseRequest.target_comment_id = item.content_id;
  }

  const reasonCode = ACTION_REASON_CODES[action];
  if (reasonCode) {
    baseRequest.reason_code = reasonCode;
  }

  return baseRequest;
}

export function isModerationItemApprovable(item: SocialAdminModerationItem) {
  return getPrimaryActionDefinitions(item).some(
    (actionDefinition) => actionDefinition.action === 'approve',
  );
}

export function getAvailableCategoryOptions(item: SocialAdminModerationItem) {
  if (item.content_type !== 'post' || !item.category) {
    return [];
  }

  return SOCIAL_CATEGORIES.filter((category) => category !== item.category);
}

export function getPrimaryActionDefinitions(
  item: SocialAdminModerationItem,
): AdminPrimaryActionDefinition[] {
  if (item.moderation_state === 'pending' || item.moderation_state === 'flagged') {
    return [
      {
        action: 'approve',
        labelKey: 'social.admin.actions.approve',
        tone: 'primary',
      },
      {
        action: 'reject',
        labelKey: 'social.admin.actions.reject',
        tone: 'danger',
      },
    ];
  }

  if (item.moderation_state === 'approved') {
    return [
      {
        action: 'hide',
        labelKey: 'social.admin.actions.hide',
        tone: 'neutral',
      },
    ];
  }

  return [
    {
      action: 'restore',
      labelKey: 'social.admin.actions.restore',
      tone: 'primary',
    },
  ];
}

export function getOverflowActionDefinitions(
  item: SocialAdminModerationItem,
): AdminOverflowActionDefinition[] {
  const actions: AdminOverflowActionDefinition[] = [];

  if (item.moderation_state === 'pending' || item.moderation_state === 'flagged') {
    actions.push(
      {
        key: 'hide',
        action: 'hide',
        labelKey: 'social.admin.actions.hide',
        tone: 'neutral',
      },
      {
        key: 'remove',
        action: 'remove',
        labelKey: 'social.admin.actions.remove',
        tone: 'danger',
      },
    );
  } else if (item.moderation_state === 'approved') {
    actions.push(
      {
        key: 'reject',
        action: 'reject',
        labelKey: 'social.admin.actions.reject',
        tone: 'danger',
      },
      {
        key: 'remove',
        action: 'remove',
        labelKey: 'social.admin.actions.remove',
        tone: 'danger',
      },
    );
  }

  if (getAvailableCategoryOptions(item).length > 0) {
    actions.push({
      key: 'change_category',
      labelKey: 'social.admin.actions.change_category',
      tone: 'neutral',
    });
  }

  if (item.content_type === 'post') {
    actions.push({
      key: 'adjust_reactions',
      labelKey: 'social.admin.actions.adjust_reactions',
      tone: 'neutral',
    });
  }

  if (item.author_id) {
    actions.push({
      key: 'moderate_author',
      labelKey: 'social.admin.actions.moderate_author',
      tone: 'danger',
    });
  }

  return actions;
}
