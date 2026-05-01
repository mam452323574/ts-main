export const SOCIAL_CATEGORIES = [
  'before_after',
  'food',
  'physique',
] as const;

export type SocialCategoryValue = (typeof SOCIAL_CATEGORIES)[number];

export const SOCIAL_CATEGORY_FILTERS = ['all', ...SOCIAL_CATEGORIES] as const;

export type SocialCategoryFilterValue =
  (typeof SOCIAL_CATEGORY_FILTERS)[number];

export const SOCIAL_ADMIN_MODERATION_FILTERS = [
  'needs_review',
  'reported',
  'processed',
] as const;

export type SocialAdminModerationFilterValue =
  (typeof SOCIAL_ADMIN_MODERATION_FILTERS)[number];

export const SOCIAL_REPORT_REASON_CODES = [
  'harassment',
  'hate_speech',
  'sexual_content',
  'graphic_gore',
  'spam_repeat',
  'self_harm',
  'illegal_activity',
  'misinformation',
  'other',
] as const;

export type SocialReportReasonCodeValue =
  (typeof SOCIAL_REPORT_REASON_CODES)[number];

export const SOCIAL_REPORT_REASON_CODES_REQUIRING_DETAILS = [
  'other',
] as const;

export const SOCIAL_REACTION_STATES = [
  'like',
  'dislike',
  'neutral',
] as const;

export type SocialReactionStateValue =
  (typeof SOCIAL_REACTION_STATES)[number];

export const SOCIAL_POST_MAX_LENGTH = 500;
export const SOCIAL_COMMENT_MAX_LENGTH = 280;
export const SOCIAL_FEED_PAGE_SIZE = 12;
export const SOCIAL_COMMENTS_PAGE_SIZE = 10;
export const SOCIAL_STORAGE_BUCKET = 'social-posts';
export const SOCIAL_IMPRESSION_BATCH_SIZE = 12;

export function isSocialCategoryValue(
  value: unknown,
): value is SocialCategoryValue {
  return (
    typeof value === 'string' &&
    (SOCIAL_CATEGORIES as readonly string[]).includes(value)
  );
}

export function normalizeSocialCategoryValue(
  value: unknown,
  fallback: SocialCategoryValue = 'physique',
) {
  return isSocialCategoryValue(value) ? value : fallback;
}

export function parseSocialCategoryValue(
  value: unknown,
): SocialCategoryValue | null {
  return isSocialCategoryValue(value) ? value : null;
}

export function isSocialCategoryFilterValue(
  value: unknown,
): value is SocialCategoryFilterValue {
  return (
    typeof value === 'string' &&
    (SOCIAL_CATEGORY_FILTERS as readonly string[]).includes(value)
  );
}

export function normalizeSocialCategoryFilterValue(
  value: unknown,
  fallback: SocialCategoryFilterValue = 'all',
) {
  return isSocialCategoryFilterValue(value) ? value : fallback;
}

export function isSocialAdminModerationFilterValue(
  value: unknown,
): value is SocialAdminModerationFilterValue {
  return (
    typeof value === 'string' &&
    (SOCIAL_ADMIN_MODERATION_FILTERS as readonly string[]).includes(value)
  );
}
