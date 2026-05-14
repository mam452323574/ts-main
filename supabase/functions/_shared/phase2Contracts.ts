import { isCoachPersonaKey } from '../../../shared/coachPersonas.ts';
import {
  COACH_QUESTION_MAX_LENGTH,
  isCoachQuestionForPromptType,
  normalizeCoachQuestionKey,
  resolveCoachQuestionHints,
  resolveCoachQuestionSelection,
  sanitizeCoachQuestionHints,
} from '../../../shared/coachQuestions.ts';
import { normalizeCoachGenerationPromptType } from '../../../shared/coachPromptTypes.ts';
import { Phase2HttpError } from './phase2Errors.ts';
import type {
  CoachGenerateRequest,
  SocialAdminAdjustPostReactionsRequest,
  SocialAdminEradicateUserRequest,
  SocialAdminModerateUserRequest,
  SocialCreateCommentRequest,
  SocialCreatePostRequest,
  SocialDeleteCommentRequest,
  SocialDeletePostRequest,
  SocialModerateContentRequest,
  SocialProcessModerationQueueRequest,
  SocialReclassifyPostRequest,
  SocialRecordImpressionsRequest,
  SocialRecordPostViewsRequest,
  SocialReportContentRequest,
  SocialSetCommentLikeRequest,
  SocialSetReactionRequest,
  SocialUpdateCommentRequest,
} from './phase2Types.ts';
import {
  assertNoUnknownKeys,
  assertNormalizedTextLength,
  assertUuidLike,
  isRecord,
  normalizeOptionalFreeText,
  normalizeSocialImageMimeType,
  readOptionalBoolean,
  readOptionalNumber,
  readOptionalString,
  PHASE2_SOCIAL_COMMENT_MAX_LENGTH,
  PHASE2_SOCIAL_IMPRESSION_BATCH_MAX,
  PHASE2_SOCIAL_MODERATION_NOTE_MAX_LENGTH,
  PHASE2_SOCIAL_POST_MAX_LENGTH,
  PHASE2_SOCIAL_REPORT_DETAILS_MAX_LENGTH,
  validateStableSocialAssetPath,
  validateSocialImpressionSource,
  validatePhase2SocialCategory,
} from './phase2Utils.ts';

const ALLOWED_REPORT_REASON_CODES = new Set([
  'harassment',
  'hate_speech',
  'sexual_content',
  'graphic_gore',
  'spam_repeat',
  'self_harm',
  'illegal_activity',
  'misinformation',
  'other',
]);

const ALLOWED_REACTION_STATES = new Set(['like', 'dislike', 'neutral']);
const ALLOWED_MODERATION_ACTIONS = new Set([
  'approve',
  'flag',
  'hide',
  'remove',
  'restore',
  'reject',
  'dismiss_reports',
]);
const ALLOWED_MODERATION_QUEUE_CONTENT_TYPES = new Set(['all', 'post', 'comment']);
const ALLOWED_SOCIAL_ADMIN_USER_ACTIONS = new Set([
  'ban_user',
  'revoke_ban',
  'remove_avatar',
]);
const ALLOWED_SOCIAL_ADMIN_USER_SCOPES = new Set([
  'all',
  'posts',
  'comments',
  'avatar',
]);

function readRequiredTrimmedString(value: unknown, fieldName: string) {
  const parsedValue = readOptionalString(value);
  if (!parsedValue) {
    throw new Phase2HttpError(400, 'invalid_payload', `${fieldName} is required`);
  }
  return parsedValue;
}

function normalizeReservedAssetPath(value: unknown) {
  const rawAssetPath = readOptionalString(value);
  if (!rawAssetPath) {
    return undefined;
  }

  try {
    return validateStableSocialAssetPath(rawAssetPath);
  } catch (error) {
    if (error instanceof Phase2HttpError) {
      throw new Phase2HttpError(
        400,
        'invalid_upload_reference',
        'The provided social upload reference is invalid',
      );
    }

    throw error;
  }
}

const SOCIAL_CREATE_POST_ALLOWED_KEYS = [
  'category',
  'content_text',
  'upload_id',
  'reserved_asset_path',
  'scan_id',
  'share_payload_snapshot',
  'language_code',
] as const;

const SOCIAL_CREATE_COMMENT_ALLOWED_KEYS = [
  'post_id',
  'content_text',
] as const;

const SOCIAL_DELETE_POST_ALLOWED_KEYS = ['post_id'] as const;

const SOCIAL_UPDATE_COMMENT_ALLOWED_KEYS = ['comment_id', 'content_text'] as const;

const SOCIAL_DELETE_COMMENT_ALLOWED_KEYS = ['comment_id'] as const;

const SOCIAL_SET_COMMENT_LIKE_ALLOWED_KEYS = ['comment_id', 'commentId', 'liked'] as const;

const SOCIAL_SET_REACTION_ALLOWED_KEYS = ['post_id', 'reaction'] as const;

const SOCIAL_RECLASSIFY_POST_ALLOWED_KEYS = ['post_id', 'category'] as const;

const SOCIAL_REPORT_ALLOWED_KEYS = [
  'target_type',
  'target_post_id',
  'target_comment_id',
  'reason_code',
  'details',
] as const;

const SOCIAL_RECORD_IMPRESSIONS_ALLOWED_KEYS = ['post_ids', 'source'] as const;
const SOCIAL_RECORD_POST_VIEWS_ALLOWED_KEYS = ['post_ids'] as const;

const SOCIAL_MODERATE_CONTENT_ALLOWED_KEYS = [
  'target_type',
  'target_post_id',
  'target_comment_id',
  'action',
  'reason_code',
  'note',
  'report_ids',
] as const;

const SOCIAL_ADMIN_MODERATE_USER_ALLOWED_KEYS = [
  'target_user_id',
  'action',
  'scope',
  'reason',
  'duration_hours',
] as const;

const SOCIAL_ADMIN_ERADICATE_USER_ALLOWED_KEYS = [
  'target_user_id',
  'note',
] as const;

const SOCIAL_ADMIN_ADJUST_POST_REACTIONS_ALLOWED_KEYS = [
  'post_id',
  'admin_like_adjustment',
  'admin_dislike_adjustment',
  'note',
] as const;

const COACH_GENERATE_ALLOWED_KEYS = [
  'payload',
  'persona_key',
  'locale',
  'force_refresh',
] as const;

// Whitelist aligned with services/coach.ts buildCoachPayload(). Any key not
// listed here is rejected to avoid prompt injection vectors via custom keys.
const COACH_INNER_PAYLOAD_ALLOWED_KEYS = [
  'payload_version',
  'prompt_type',
  'question_key',
  'question_text',
  'question_hints',
  'generated_at',
  'scan_count_7d',
  'selected_scan_id',
  'scan_intent',
  'selected_scan',
  'recent_scans',
  'latest_scan',
  'prior_scans',
  'latest_by_type',
  'comparison_to_previous',
  'trend_summary',
  'inferred_persona',
  'coach_profile_memory',
  'by_type',
] as const;

const COACH_INNER_PAYLOAD_MAX_DEPTH = 6;
const COACH_INNER_PAYLOAD_MAX_STRING_LENGTH = 4000;
const COACH_INNER_PAYLOAD_MAX_RECENT_SCANS = 32;
const COACH_INNER_PAYLOAD_MAX_PRIOR_SCANS = 16;
const COACH_INNER_PAYLOAD_MAX_ARRAY_LENGTH = 64;
const COACH_INNER_PAYLOAD_MAX_KEYS_PER_OBJECT = 80;
const COACH_SELECTED_SCAN_ID_MAX_LENGTH = 120;

const COACH_SCAN_INTENT_ALLOWED_KEYS = [
  'scan_id',
  'scan_type',
  'has_actionable_issue',
  'priority_metric',
  'priority_label',
  'severity',
  'reason',
  'user_facing_summary',
  'prompt_type',
  'question_key',
  'question_text',
  'fallback_prompt_type',
  'premium_required',
] as const;

const COACH_SCAN_INTENT_REQUIRED_KEYS = [
  'has_actionable_issue',
  'priority_metric',
  'priority_label',
  'severity',
  'question_text',
  'user_facing_summary',
] as const;

function throwInvalidCoachScanIntent(message: string): never {
  throw new Phase2HttpError(400, 'invalid_coach_payload', message);
}

function normalizeCoachScanIntentNullableTextField(
  payload: Record<string, unknown>,
  key: string,
  maxLength: number,
) {
  const value = payload[key];
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throwInvalidCoachScanIntent(`payload.scan_intent.${key} is not supported`);
  }

  return (
    normalizeOptionalFreeText(value, {
      fieldName: `payload.scan_intent.${key}`,
      maxLength,
    }) ?? null
  );
}

function normalizeCoachScanIntentRequiredTextField(
  payload: Record<string, unknown>,
  key: string,
  maxLength: number,
) {
  const value = payload[key];
  if (typeof value !== 'string') {
    throwInvalidCoachScanIntent(`payload.scan_intent.${key} is required`);
  }

  const normalized = normalizeOptionalFreeText(value, {
    fieldName: `payload.scan_intent.${key}`,
    maxLength,
    required: true,
  });
  if (!normalized) {
    throwInvalidCoachScanIntent(`payload.scan_intent.${key} is required`);
  }

  return normalized;
}

function normalizeCoachScanIntent(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (!isRecord(value)) {
    throwInvalidCoachScanIntent('payload.scan_intent must be an object');
  }

  const unknownKeys = Object.keys(value).filter(
    (key) =>
      !(COACH_SCAN_INTENT_ALLOWED_KEYS as readonly string[]).includes(key),
  );
  if (unknownKeys.length > 0) {
    throw new Phase2HttpError(
      400,
      'invalid_coach_payload',
      'payload.scan_intent contains unsupported fields',
      { unknown_keys: unknownKeys },
    );
  }

  const intent = value as Record<string, unknown>;
  const missingKey = (COACH_SCAN_INTENT_REQUIRED_KEYS as readonly string[]).find(
    (key) => !(key in intent),
  );
  if (missingKey) {
    throwInvalidCoachScanIntent(`payload.scan_intent.${missingKey} is required`);
  }

  if (typeof intent.has_actionable_issue !== 'boolean') {
    throwInvalidCoachScanIntent(
      'payload.scan_intent.has_actionable_issue is not supported',
    );
  }

  const severity = intent.severity;
  if (
    severity !== null &&
    severity !== undefined &&
    severity !== 'low' &&
    severity !== 'medium' &&
    severity !== 'high'
  ) {
    throwInvalidCoachScanIntent('payload.scan_intent.severity is not supported');
  }

  return {
    has_actionable_issue: intent.has_actionable_issue,
    priority_metric: normalizeCoachScanIntentNullableTextField(
      intent,
      'priority_metric',
      80,
    ),
    priority_label: normalizeCoachScanIntentNullableTextField(
      intent,
      'priority_label',
      120,
    ),
    severity: severity ?? null,
    user_facing_summary: normalizeCoachScanIntentRequiredTextField(
      intent,
      'user_facing_summary',
      320,
    ),
    question_text: normalizeCoachScanIntentRequiredTextField(
      intent,
      'question_text',
      COACH_QUESTION_MAX_LENGTH,
    ),
  };
}

function normalizeCoachSelectedScanId(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const selectedScanId = readOptionalString(value);
  if (!selectedScanId || selectedScanId.length > COACH_SELECTED_SCAN_ID_MAX_LENGTH) {
    throw new Phase2HttpError(
      400,
      'invalid_coach_payload',
      'payload.selected_scan_id is not supported',
    );
  }

  return selectedScanId;
}

function assertCoachInnerPayloadDepth(
  value: unknown,
  remainingDepth: number,
  path: string,
) {
  if (remainingDepth < 0) {
    throw new Phase2HttpError(
      400,
      'invalid_coach_payload',
      `payload nesting at ${path} exceeds the maximum allowed depth`,
    );
  }

  if (typeof value === 'string') {
    if (value.length > COACH_INNER_PAYLOAD_MAX_STRING_LENGTH) {
      throw new Phase2HttpError(
        400,
        'invalid_coach_payload',
        `payload string at ${path} exceeds the maximum allowed length`,
      );
    }
    return;
  }

  if (Array.isArray(value)) {
    if (value.length > COACH_INNER_PAYLOAD_MAX_ARRAY_LENGTH) {
      throw new Phase2HttpError(
        400,
        'invalid_coach_payload',
        `payload array at ${path} exceeds the maximum allowed length`,
      );
    }
    value.forEach((item, index) => {
      assertCoachInnerPayloadDepth(item, remainingDepth - 1, `${path}[${index}]`);
    });
    return;
  }

  if (isRecord(value)) {
    const keys = Object.keys(value);
    if (keys.length > COACH_INNER_PAYLOAD_MAX_KEYS_PER_OBJECT) {
      throw new Phase2HttpError(
        400,
        'invalid_coach_payload',
        `payload object at ${path} exceeds the maximum allowed key count`,
      );
    }
    for (const key of keys) {
      assertCoachInnerPayloadDepth(
        (value as Record<string, unknown>)[key],
        remainingDepth - 1,
        `${path}.${key}`,
      );
    }
    return;
  }

  // numbers / booleans / null are accepted as-is.
}

export function assertCoachInnerPayload(payload: Record<string, unknown>) {
  const unknownKeys = Object.keys(payload).filter(
    (key) =>
      !(COACH_INNER_PAYLOAD_ALLOWED_KEYS as readonly string[]).includes(key),
  );
  if (unknownKeys.length > 0) {
    throw new Phase2HttpError(
      400,
      'invalid_coach_payload',
      'payload contains unsupported fields',
      { unknown_keys: unknownKeys },
    );
  }

  if (
    payload.prompt_type !== undefined &&
    (typeof payload.prompt_type !== 'string' ||
      normalizeCoachGenerationPromptType(payload.prompt_type) === null)
  ) {
    throw new Phase2HttpError(
      400,
      'invalid_coach_payload',
      'payload.prompt_type is not supported',
    );
  }
  const promptType = normalizeCoachGenerationPromptType(payload.prompt_type);

  normalizeCoachSelectedScanId(payload.selected_scan_id);
  normalizeCoachScanIntent(payload.scan_intent);

  if (payload.question_key !== undefined && payload.question_key !== null) {
    const normalizedQuestionKey = normalizeCoachQuestionKey(payload.question_key);
    if (
      typeof payload.question_key !== 'string' ||
      normalizedQuestionKey === null ||
      (promptType !== null &&
        !isCoachQuestionForPromptType(normalizedQuestionKey, promptType))
    ) {
      throw new Phase2HttpError(
        400,
        'invalid_coach_payload',
        'payload.question_key is not supported',
      );
    }
  }

  if (payload.question_text !== undefined) {
    normalizeOptionalFreeText(payload.question_text, {
      fieldName: 'payload.question_text',
      maxLength: COACH_QUESTION_MAX_LENGTH,
    });
  }

  if (
    payload.question_hints !== undefined &&
    sanitizeCoachQuestionHints(payload.question_hints) === null
  ) {
    throw new Phase2HttpError(
      400,
      'invalid_coach_payload',
      'payload.question_hints is not supported',
    );
  }

  if (
    Array.isArray(payload.recent_scans) &&
    payload.recent_scans.length > COACH_INNER_PAYLOAD_MAX_RECENT_SCANS
  ) {
    throw new Phase2HttpError(
      400,
      'invalid_coach_payload',
      `payload.recent_scans must contain at most ${COACH_INNER_PAYLOAD_MAX_RECENT_SCANS} entries`,
    );
  }

  if (
    Array.isArray(payload.prior_scans) &&
    payload.prior_scans.length > COACH_INNER_PAYLOAD_MAX_PRIOR_SCANS
  ) {
    throw new Phase2HttpError(
      400,
      'invalid_coach_payload',
      `payload.prior_scans must contain at most ${COACH_INNER_PAYLOAD_MAX_PRIOR_SCANS} entries`,
    );
  }

  assertCoachInnerPayloadDepth(payload, COACH_INNER_PAYLOAD_MAX_DEPTH, 'payload');
}

const SHARE_PAYLOAD_ALLOWED_KEYS = [
  'variant',
  'variantLabel',
  'score',
  'scoreLabel',
  'heroImageUri',
  'metrics',
  'accentColor',
  'accentColorSecondary',
  'headline',
  'footerBrand',
  'footerCta',
  'statusBadgeLabel',
  'statusTone',
] as const;

const SHARE_PAYLOAD_METRIC_ALLOWED_KEYS = [
  'label',
  'value',
  'valueVariant',
  'labelMaxLines',
  'valueMaxLines',
] as const;

// B-03 backend audit — bornes de longueur sur les strings de
// share_payload_snapshot pour éviter l'enflure du stockage métadonnées.
const SHARE_PAYLOAD_TEXT_MAX_LENGTH = 200;
const SHARE_PAYLOAD_METRIC_FIELD_MAX_LENGTH = 100;
const SHARE_PAYLOAD_METRICS_MAX_COUNT = 10;
const SHARE_PAYLOAD_ACCENT_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

function clampShareString(
  rawValue: unknown,
  fieldName: string,
  maxLength: number,
) {
  const candidate = readOptionalString(rawValue);
  if (candidate === null) {
    return undefined;
  }
  if (Array.from(candidate).length > maxLength) {
    throw new Phase2HttpError(
      400,
      'invalid_share_payload',
      `${fieldName} must be ${maxLength} characters or fewer`,
    );
  }
  return candidate;
}

function clampShareAccentColor(rawValue: unknown, fieldName: string) {
  const candidate = readOptionalString(rawValue);
  if (candidate === null) {
    return undefined;
  }
  if (!SHARE_PAYLOAD_ACCENT_COLOR_PATTERN.test(candidate)) {
    throw new Phase2HttpError(
      400,
      'invalid_share_payload',
      `${fieldName} must match #RRGGBB`,
    );
  }
  return candidate;
}

function normalizeSharePayloadSnapshot(value: unknown) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Phase2HttpError(
      400,
      'invalid_share_payload',
      'share_payload_snapshot must be an object',
    );
  }

  assertNoUnknownKeys(value, SHARE_PAYLOAD_ALLOWED_KEYS, 'share_payload_snapshot');

  const variant = clampShareString(
    value.variant,
    'share_payload_snapshot.variant',
    SHARE_PAYLOAD_TEXT_MAX_LENGTH,
  );
  const score = readOptionalNumber(value.score);
  if (!variant || score === null) {
    throw new Phase2HttpError(
      400,
      'invalid_share_payload',
      'share_payload_snapshot must contain at least variant and score',
    );
  }

  if (Array.isArray(value.metrics) && value.metrics.length > SHARE_PAYLOAD_METRICS_MAX_COUNT) {
    throw new Phase2HttpError(
      400,
      'invalid_share_payload',
      `share_payload_snapshot.metrics must contain ${SHARE_PAYLOAD_METRICS_MAX_COUNT} entries or fewer`,
    );
  }

  const metrics = Array.isArray(value.metrics)
    ? value.metrics.map((metric, index) => {
        if (!isRecord(metric)) {
          throw new Phase2HttpError(
            400,
            'invalid_share_payload',
            `share_payload_snapshot.metrics[${index}] must be an object`,
          );
        }

        assertNoUnknownKeys(
          metric,
          SHARE_PAYLOAD_METRIC_ALLOWED_KEYS,
          `share_payload_snapshot.metrics[${index}]`,
        );

        const label = readRequiredTrimmedString(
          metric.label,
          `share_payload_snapshot.metrics[${index}].label`,
        );
        const metricValue = readRequiredTrimmedString(
          metric.value,
          `share_payload_snapshot.metrics[${index}].value`,
        );
        const valueVariant = readRequiredTrimmedString(
          metric.valueVariant,
          `share_payload_snapshot.metrics[${index}].valueVariant`,
        );

        if (Array.from(label).length > SHARE_PAYLOAD_METRIC_FIELD_MAX_LENGTH) {
          throw new Phase2HttpError(
            400,
            'invalid_share_payload',
            `share_payload_snapshot.metrics[${index}].label must be ${SHARE_PAYLOAD_METRIC_FIELD_MAX_LENGTH} characters or fewer`,
          );
        }
        if (Array.from(metricValue).length > SHARE_PAYLOAD_METRIC_FIELD_MAX_LENGTH) {
          throw new Phase2HttpError(
            400,
            'invalid_share_payload',
            `share_payload_snapshot.metrics[${index}].value must be ${SHARE_PAYLOAD_METRIC_FIELD_MAX_LENGTH} characters or fewer`,
          );
        }

        if (
          valueVariant !== 'numeric' &&
          valueVariant !== 'fraction' &&
          valueVariant !== 'text'
        ) {
          throw new Phase2HttpError(
            400,
            'invalid_share_payload',
            `share_payload_snapshot.metrics[${index}].valueVariant is not supported`,
          );
        }

        return {
          label,
          value: metricValue,
          valueVariant,
          labelMaxLines: readOptionalNumber(metric.labelMaxLines) ?? 1,
          valueMaxLines: readOptionalNumber(metric.valueMaxLines) ?? 1,
        };
      })
    : [];

  return {
    variant,
    variantLabel:
      clampShareString(
        value.variantLabel,
        'share_payload_snapshot.variantLabel',
        SHARE_PAYLOAD_TEXT_MAX_LENGTH,
      ) ?? variant,
    score,
    scoreLabel:
      clampShareString(
        value.scoreLabel,
        'share_payload_snapshot.scoreLabel',
        SHARE_PAYLOAD_TEXT_MAX_LENGTH,
      ) ?? String(score),
    heroImageUri: null,
    metrics,
    accentColor:
      clampShareAccentColor(value.accentColor, 'share_payload_snapshot.accentColor') ??
      '#000000',
    accentColorSecondary:
      clampShareAccentColor(
        value.accentColorSecondary,
        'share_payload_snapshot.accentColorSecondary',
      ) ?? undefined,
    headline: clampShareString(
      value.headline,
      'share_payload_snapshot.headline',
      SHARE_PAYLOAD_TEXT_MAX_LENGTH,
    ),
    footerBrand:
      clampShareString(
        value.footerBrand,
        'share_payload_snapshot.footerBrand',
        SHARE_PAYLOAD_TEXT_MAX_LENGTH,
      ) ?? 'HEALTH SCAN',
    footerCta:
      clampShareString(
        value.footerCta,
        'share_payload_snapshot.footerCta',
        SHARE_PAYLOAD_TEXT_MAX_LENGTH,
      ) ?? 'Track your progress',
    statusBadgeLabel: clampShareString(
      value.statusBadgeLabel,
      'share_payload_snapshot.statusBadgeLabel',
      SHARE_PAYLOAD_TEXT_MAX_LENGTH,
    ),
    statusTone:
      value.statusTone === 'neutral' || value.statusTone === 'warning'
        ? value.statusTone
        : undefined,
  };
}

function normalizePostLanguageCode(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new Phase2HttpError(
      400,
      'invalid_payload',
      'language_code must be a string',
    );
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const normalized = trimmed.toLowerCase();
  if (!/^[a-z]{2}$/.test(normalized)) {
    throw new Phase2HttpError(
      400,
      'invalid_payload',
      'language_code must be a 2-letter ISO 639-1 code',
    );
  }
  return normalized;
}

export function parseSocialCreatePostRequest(payload: unknown): SocialCreatePostRequest {
  if (!isRecord(payload)) {
    throw new Phase2HttpError(400, 'invalid_payload', 'Request body must be an object');
  }

  assertNoUnknownKeys(payload, SOCIAL_CREATE_POST_ALLOWED_KEYS);

  const normalizedContentText = normalizeOptionalFreeText(payload.content_text, {
    fieldName: 'content_text',
    maxLength: PHASE2_SOCIAL_POST_MAX_LENGTH,
  });
  const uploadId = readOptionalString(payload.upload_id) ?? undefined;
  const reservedAssetPath = normalizeReservedAssetPath(payload.reserved_asset_path);
  const scanId = readOptionalString(payload.scan_id) ?? undefined;
  const sharePayloadSnapshot = normalizeSharePayloadSnapshot(payload.share_payload_snapshot);
  const category = validatePhase2SocialCategory(
    readRequiredTrimmedString(payload.category, 'category'),
  );
  const languageCode = normalizePostLanguageCode(payload.language_code);

  if (uploadId) {
    assertUuidLike(uploadId, 'upload_id');
  }

  if (scanId) {
    assertUuidLike(scanId, 'scan_id');
  }

  if (reservedAssetPath && !uploadId) {
    throw new Phase2HttpError(
      400,
      'invalid_upload_reference',
      'reserved_asset_path requires upload_id',
    );
  }

  if (!normalizedContentText && !uploadId && !sharePayloadSnapshot) {
    throw new Phase2HttpError(
      400,
      'invalid_payload',
      'A post must include text, a stable asset, or a share payload snapshot',
    );
  }

  return {
    category,
    content_text: normalizedContentText ?? undefined,
    upload_id: uploadId,
    reserved_asset_path: reservedAssetPath,
    scan_id: scanId,
    share_payload_snapshot: sharePayloadSnapshot,
    language_code: languageCode,
  };
}

export function parseSocialCreateCommentRequest(payload: unknown): SocialCreateCommentRequest {
  if (!isRecord(payload)) {
    throw new Phase2HttpError(400, 'invalid_payload', 'Request body must be an object');
  }

  assertNoUnknownKeys(payload, SOCIAL_CREATE_COMMENT_ALLOWED_KEYS);

  const postId = readRequiredTrimmedString(payload.post_id, 'post_id');
  assertUuidLike(postId, 'post_id');

  return {
    post_id: postId,
    content_text:
      normalizeOptionalFreeText(payload.content_text, {
        fieldName: 'content_text',
        maxLength: PHASE2_SOCIAL_COMMENT_MAX_LENGTH,
        required: true,
      }) ?? '',
  };
}

export function parseSocialDeletePostRequest(payload: unknown): SocialDeletePostRequest {
  if (!isRecord(payload)) {
    throw new Phase2HttpError(400, 'invalid_payload', 'Request body must be an object');
  }

  assertNoUnknownKeys(payload, SOCIAL_DELETE_POST_ALLOWED_KEYS);

  const postId = readRequiredTrimmedString(payload.post_id, 'post_id');
  assertUuidLike(postId, 'post_id');

  return {
    post_id: postId,
  };
}

export function parseSocialUpdateCommentRequest(
  payload: unknown,
): SocialUpdateCommentRequest {
  if (!isRecord(payload)) {
    throw new Phase2HttpError(400, 'invalid_payload', 'Request body must be an object');
  }

  assertNoUnknownKeys(payload, SOCIAL_UPDATE_COMMENT_ALLOWED_KEYS);

  const commentId = readRequiredTrimmedString(payload.comment_id, 'comment_id');
  assertUuidLike(commentId, 'comment_id');

  return {
    comment_id: commentId,
    content_text:
      normalizeOptionalFreeText(payload.content_text, {
        fieldName: 'content_text',
        maxLength: PHASE2_SOCIAL_COMMENT_MAX_LENGTH,
        required: true,
      }) ?? '',
  };
}

export function parseSocialDeleteCommentRequest(
  payload: unknown,
): SocialDeleteCommentRequest {
  if (!isRecord(payload)) {
    throw new Phase2HttpError(400, 'invalid_payload', 'Request body must be an object');
  }

  assertNoUnknownKeys(payload, SOCIAL_DELETE_COMMENT_ALLOWED_KEYS);

  const commentId = readRequiredTrimmedString(payload.comment_id, 'comment_id');
  assertUuidLike(commentId, 'comment_id');

  return {
    comment_id: commentId,
  };
}

export function parseSocialSetCommentLikeRequest(
  payload: unknown,
): SocialSetCommentLikeRequest {
  if (!isRecord(payload)) {
    throw new Phase2HttpError(400, 'invalid_payload', 'Request body must be an object');
  }

  assertNoUnknownKeys(payload, SOCIAL_SET_COMMENT_LIKE_ALLOWED_KEYS);

  const snakeCaseCommentId = readOptionalString(payload.comment_id);
  const camelCaseCommentId = readOptionalString(payload.commentId);
  if (
    snakeCaseCommentId &&
    camelCaseCommentId &&
    snakeCaseCommentId !== camelCaseCommentId
  ) {
    throw new Phase2HttpError(
      400,
      'invalid_payload',
      'comment_id and commentId must reference the same comment',
    );
  }

  const commentId = readRequiredTrimmedString(
    snakeCaseCommentId ?? camelCaseCommentId,
    'comment_id',
  );
  const liked = readOptionalBoolean(payload.liked);

  assertUuidLike(commentId, 'comment_id');

  if (liked === null) {
    throw new Phase2HttpError(
      400,
      'invalid_payload',
      'liked must be provided as a boolean',
    );
  }

  return {
    comment_id: commentId,
    liked,
  };
}

export function parseSocialSetReactionRequest(
  payload: unknown,
): SocialSetReactionRequest {
  if (!isRecord(payload)) {
    throw new Phase2HttpError(400, 'invalid_payload', 'Request body must be an object');
  }

  assertNoUnknownKeys(payload, SOCIAL_SET_REACTION_ALLOWED_KEYS);

  const postId = readRequiredTrimmedString(payload.post_id, 'post_id');
  const reaction = readRequiredTrimmedString(payload.reaction, 'reaction');

  assertUuidLike(postId, 'post_id');

  if (!ALLOWED_REACTION_STATES.has(reaction)) {
    throw new Phase2HttpError(
      400,
      'invalid_reaction',
      'reaction must be like, dislike, or neutral',
    );
  }

  return {
    post_id: postId,
    reaction: reaction as SocialSetReactionRequest['reaction'],
  };
}

export function parseSocialReportContentRequest(
  payload: unknown,
): SocialReportContentRequest {
  if (!isRecord(payload)) {
    throw new Phase2HttpError(400, 'invalid_payload', 'Request body must be an object');
  }

  assertNoUnknownKeys(payload, SOCIAL_REPORT_ALLOWED_KEYS);

  const targetType = readRequiredTrimmedString(payload.target_type, 'target_type');
  if (targetType !== 'post' && targetType !== 'comment') {
    throw new Phase2HttpError(
      400,
      'invalid_target_type',
      'target_type must be either post or comment',
    );
  }

  const targetPostId = readOptionalString(payload.target_post_id) ?? undefined;
  const targetCommentId = readOptionalString(payload.target_comment_id) ?? undefined;

  if (targetType === 'post') {
    assertUuidLike(targetPostId ?? null, 'target_post_id');
  } else {
    assertUuidLike(targetCommentId ?? null, 'target_comment_id');
  }

  return {
    target_type: targetType,
    target_post_id: targetType === 'post' ? targetPostId : undefined,
    target_comment_id: targetType === 'comment' ? targetCommentId : undefined,
    reason_code: (() => {
      const reasonCode = readRequiredTrimmedString(payload.reason_code, 'reason_code');
      if (!ALLOWED_REPORT_REASON_CODES.has(reasonCode)) {
        throw new Phase2HttpError(
          400,
          'invalid_reason_code',
          'reason_code is not supported',
        );
      }
      return reasonCode as SocialReportContentRequest['reason_code'];
    })(),
    details: (() => {
      const details = normalizeOptionalFreeText(payload.details, {
        fieldName: 'details',
        maxLength: PHASE2_SOCIAL_REPORT_DETAILS_MAX_LENGTH,
      });

      if (payload.reason_code === 'other' && !details) {
        throw new Phase2HttpError(
          400,
          'missing_report_details',
          'details are required when reason_code is other',
        );
      }

      return details;
    })(),
  };
}

export function parseSocialRecordImpressionsRequest(
  payload: unknown,
): SocialRecordImpressionsRequest {
  if (!isRecord(payload)) {
    throw new Phase2HttpError(400, 'invalid_payload', 'Request body must be an object');
  }

  assertNoUnknownKeys(payload, SOCIAL_RECORD_IMPRESSIONS_ALLOWED_KEYS);

  if (!Array.isArray(payload.post_ids) || payload.post_ids.length === 0) {
    throw new Phase2HttpError(
      400,
      'invalid_post_ids',
      'post_ids must be a non-empty array',
    );
  }

  if (payload.post_ids.length > PHASE2_SOCIAL_IMPRESSION_BATCH_MAX) {
    throw new Phase2HttpError(
      400,
      'too_many_post_ids',
      `post_ids must contain at most ${PHASE2_SOCIAL_IMPRESSION_BATCH_MAX} items`,
    );
  }

  const postIds = payload.post_ids.map((postId, index) => {
    const normalizedPostId = readRequiredTrimmedString(postId, `post_ids[${index}]`);
    assertUuidLike(normalizedPostId, `post_ids[${index}]`);
    return normalizedPostId;
  });

  return {
    post_ids: Array.from(new Set(postIds)),
    source: validateSocialImpressionSource(payload.source),
  };
}

export function parseSocialRecordPostViewsRequest(
  payload: unknown,
): SocialRecordPostViewsRequest {
  if (!isRecord(payload)) {
    throw new Phase2HttpError(400, 'invalid_payload', 'Request body must be an object');
  }

  assertNoUnknownKeys(payload, SOCIAL_RECORD_POST_VIEWS_ALLOWED_KEYS);

  if (!Array.isArray(payload.post_ids) || payload.post_ids.length === 0) {
    throw new Phase2HttpError(
      400,
      'invalid_post_ids',
      'post_ids must be a non-empty array',
    );
  }

  if (payload.post_ids.length > PHASE2_SOCIAL_IMPRESSION_BATCH_MAX) {
    throw new Phase2HttpError(
      400,
      'too_many_post_ids',
      `post_ids must contain at most ${PHASE2_SOCIAL_IMPRESSION_BATCH_MAX} items`,
    );
  }

  const postIds = payload.post_ids.map((postId, index) => {
    const normalizedPostId = readRequiredTrimmedString(postId, `post_ids[${index}]`);
    assertUuidLike(normalizedPostId, `post_ids[${index}]`);
    return normalizedPostId;
  });

  return {
    post_ids: Array.from(new Set(postIds)),
  };
}

export function parseSocialModerateContentRequest(
  payload: unknown,
): SocialModerateContentRequest {
  if (!isRecord(payload)) {
    throw new Phase2HttpError(400, 'invalid_payload', 'Request body must be an object');
  }

  assertNoUnknownKeys(payload, SOCIAL_MODERATE_CONTENT_ALLOWED_KEYS);

  const targetType = readRequiredTrimmedString(payload.target_type, 'target_type');
  if (targetType !== 'post' && targetType !== 'comment') {
    throw new Phase2HttpError(
      400,
      'invalid_target_type',
      'target_type must be either post or comment',
    );
  }

  const action = readRequiredTrimmedString(payload.action, 'action');
  if (!ALLOWED_MODERATION_ACTIONS.has(action)) {
    throw new Phase2HttpError(
      400,
      'invalid_moderation_action',
      'action is not supported',
    );
  }

  const targetPostId = readOptionalString(payload.target_post_id) ?? undefined;
  const targetCommentId = readOptionalString(payload.target_comment_id) ?? undefined;

  if (targetType === 'post') {
    assertUuidLike(targetPostId ?? null, 'target_post_id');
  } else {
    assertUuidLike(targetCommentId ?? null, 'target_comment_id');
  }

  const reportIds = Array.isArray(payload.report_ids)
    ? payload.report_ids.map((reportId, index) => {
        const normalizedReportId = readRequiredTrimmedString(
          reportId,
          `report_ids[${index}]`,
        );
        assertUuidLike(normalizedReportId, `report_ids[${index}]`);
        return normalizedReportId;
      })
    : undefined;

  return {
    target_type: targetType,
    target_post_id: targetType === 'post' ? targetPostId : undefined,
    target_comment_id: targetType === 'comment' ? targetCommentId : undefined,
    action: action as SocialModerateContentRequest['action'],
    reason_code: normalizeOptionalFreeText(payload.reason_code, {
      fieldName: 'reason_code',
      maxLength: 100,
    }),
    note: normalizeOptionalFreeText(payload.note, {
      fieldName: 'note',
      maxLength: PHASE2_SOCIAL_MODERATION_NOTE_MAX_LENGTH,
    }),
    report_ids: reportIds && reportIds.length > 0 ? Array.from(new Set(reportIds)) : undefined,
  };
}

export function parseSocialAdminModerateUserRequest(
  payload: unknown,
): SocialAdminModerateUserRequest {
  if (!isRecord(payload)) {
    throw new Phase2HttpError(400, 'invalid_payload', 'Request body must be an object');
  }

  assertNoUnknownKeys(payload, SOCIAL_ADMIN_MODERATE_USER_ALLOWED_KEYS);

  const targetUserId = readRequiredTrimmedString(payload.target_user_id, 'target_user_id');
  const action = readRequiredTrimmedString(payload.action, 'action');
  const scope = readOptionalString(payload.scope) ?? undefined;
  const durationHours = readOptionalNumber(payload.duration_hours);

  assertUuidLike(targetUserId, 'target_user_id');

  if (!ALLOWED_SOCIAL_ADMIN_USER_ACTIONS.has(action)) {
    throw new Phase2HttpError(
      400,
      'invalid_payload',
      'action is invalid or missing',
    );
  }

  if (scope && !ALLOWED_SOCIAL_ADMIN_USER_SCOPES.has(scope)) {
    throw new Phase2HttpError(
      400,
      'invalid_payload',
      'scope must be all, posts, comments, or avatar',
    );
  }

  if (action === 'ban_user' && !scope) {
    throw new Phase2HttpError(
      400,
      'invalid_payload',
      'scope is required and must be valid for ban_user',
    );
  }

  if (
    durationHours !== null &&
    (!Number.isInteger(durationHours) || durationHours < 0)
  ) {
    throw new Phase2HttpError(
      400,
      'invalid_payload',
      'duration_hours must be a non-negative integer',
    );
  }

  return {
    target_user_id: targetUserId,
    action: action as SocialAdminModerateUserRequest['action'],
    scope: scope as SocialAdminModerateUserRequest['scope'],
    reason: normalizeOptionalFreeText(payload.reason, {
      fieldName: 'reason',
      maxLength: PHASE2_SOCIAL_MODERATION_NOTE_MAX_LENGTH,
    }),
    duration_hours: durationHours ?? undefined,
  };
}

export function parseSocialAdminEradicateUserRequest(
  payload: unknown,
): SocialAdminEradicateUserRequest {
  if (!isRecord(payload)) {
    throw new Phase2HttpError(400, 'invalid_payload', 'Request body must be an object');
  }

  assertNoUnknownKeys(payload, SOCIAL_ADMIN_ERADICATE_USER_ALLOWED_KEYS);

  const targetUserId = readRequiredTrimmedString(payload.target_user_id, 'target_user_id');
  assertUuidLike(targetUserId, 'target_user_id');

  return {
    target_user_id: targetUserId,
    note: normalizeOptionalFreeText(payload.note, {
      fieldName: 'note',
      maxLength: PHASE2_SOCIAL_MODERATION_NOTE_MAX_LENGTH,
    }),
  };
}

export function parseSocialAdminAdjustPostReactionsRequest(
  payload: unknown,
): SocialAdminAdjustPostReactionsRequest {
  if (!isRecord(payload)) {
    throw new Phase2HttpError(400, 'invalid_payload', 'Request body must be an object');
  }

  assertNoUnknownKeys(payload, SOCIAL_ADMIN_ADJUST_POST_REACTIONS_ALLOWED_KEYS);

  const postId = readRequiredTrimmedString(payload.post_id, 'post_id');
  const adminLikeAdjustment = readOptionalNumber(payload.admin_like_adjustment);
  const adminDislikeAdjustment = readOptionalNumber(payload.admin_dislike_adjustment);

  assertUuidLike(postId, 'post_id');

  if (adminLikeAdjustment === null || !Number.isInteger(adminLikeAdjustment)) {
    throw new Phase2HttpError(
      400,
      'invalid_payload',
      'admin_like_adjustment must be an integer',
    );
  }

  if (adminDislikeAdjustment === null || !Number.isInteger(adminDislikeAdjustment)) {
    throw new Phase2HttpError(
      400,
      'invalid_payload',
      'admin_dislike_adjustment must be an integer',
    );
  }

  return {
    post_id: postId,
    admin_like_adjustment: adminLikeAdjustment,
    admin_dislike_adjustment: adminDislikeAdjustment,
    note: normalizeOptionalFreeText(payload.note, {
      fieldName: 'note',
      maxLength: PHASE2_SOCIAL_MODERATION_NOTE_MAX_LENGTH,
    }),
  };
}

export function parseSocialReclassifyPostRequest(
  payload: unknown,
): SocialReclassifyPostRequest {
  if (!isRecord(payload)) {
    throw new Phase2HttpError(400, 'invalid_payload', 'Request body must be an object');
  }

  assertNoUnknownKeys(payload, SOCIAL_RECLASSIFY_POST_ALLOWED_KEYS);

  const postId = readRequiredTrimmedString(payload.post_id, 'post_id');
  assertUuidLike(postId, 'post_id');

  return {
    post_id: postId,
    category: validatePhase2SocialCategory(
      readRequiredTrimmedString(payload.category, 'category'),
    ),
  };
}

const SOCIAL_PROCESS_MODERATION_QUEUE_ALLOWED_KEYS = [
  'limit',
  'content_type',
  'stale_after_minutes',
  'dry_run',
] as const;

export function parseSocialProcessModerationQueueRequest(
  payload: unknown,
): Required<SocialProcessModerationQueueRequest> {
  if (!isRecord(payload)) {
    throw new Phase2HttpError(400, 'invalid_payload', 'Request body must be an object');
  }

  assertNoUnknownKeys(payload, SOCIAL_PROCESS_MODERATION_QUEUE_ALLOWED_KEYS);

  const limit = readOptionalNumber(payload.limit) ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new Phase2HttpError(
      400,
      'invalid_limit',
      'limit must be an integer between 1 and 50',
    );
  }

  const contentType = readOptionalString(payload.content_type) ?? 'all';
  if (!ALLOWED_MODERATION_QUEUE_CONTENT_TYPES.has(contentType)) {
    throw new Phase2HttpError(
      400,
      'invalid_content_type',
      'content_type must be all, post, or comment',
    );
  }

  const staleAfterMinutes = readOptionalNumber(payload.stale_after_minutes) ?? 15;
  if (
    !Number.isInteger(staleAfterMinutes) ||
    staleAfterMinutes < 1 ||
    staleAfterMinutes > 24 * 60
  ) {
    throw new Phase2HttpError(
      400,
      'invalid_stale_after_minutes',
      'stale_after_minutes must be an integer between 1 and 1440',
    );
  }

  return {
    limit,
    content_type: contentType as Required<SocialProcessModerationQueueRequest>['content_type'],
    stale_after_minutes: staleAfterMinutes,
    dry_run: readOptionalBoolean(payload.dry_run) ?? false,
  };
}

export function parseCoachGenerateRequest(payload: unknown): CoachGenerateRequest {
  if (!isRecord(payload)) {
    throw new Phase2HttpError(400, 'invalid_payload', 'Request body must be an object');
  }

  assertNoUnknownKeys(payload, COACH_GENERATE_ALLOWED_KEYS);

  if (!isRecord(payload.payload)) {
    throw new Phase2HttpError(
      400,
      'invalid_payload',
      'payload must be a normalized object',
    );
  }

  assertCoachInnerPayload(payload.payload);

  if (!isCoachPersonaKey(payload.persona_key)) {
    throw new Phase2HttpError(
      400,
      'invalid_coach_persona',
      'persona_key is not supported',
    );
  }
  const locale = readOptionalString(payload.locale) ?? undefined;
  const promptType = normalizeCoachGenerationPromptType(
    payload.payload.prompt_type,
  );
  const normalizedPayload = {
    ...payload.payload,
  };
  const normalizedSelectedScanId = normalizeCoachSelectedScanId(
    payload.payload.selected_scan_id,
  );
  const normalizedScanIntent = normalizeCoachScanIntent(
    payload.payload.scan_intent,
  );
  const sanitizedQuestionHints = sanitizeCoachQuestionHints(
    payload.payload.question_hints,
  );

  if (promptType) {
    normalizedPayload.prompt_type = promptType;
    const resolvedQuestionSelection = resolveCoachQuestionSelection({
      promptType,
      questionKey: normalizeCoachQuestionKey(payload.payload.question_key),
      questionText:
        normalizeOptionalFreeText(payload.payload.question_text, {
          fieldName: 'payload.question_text',
          maxLength: COACH_QUESTION_MAX_LENGTH,
        }) ?? null,
      locale,
    });
    normalizedPayload.question_key = resolvedQuestionSelection.questionKey ?? null;
    normalizedPayload.question_text = resolvedQuestionSelection.questionText ?? null;
    normalizedPayload.question_hints = resolveCoachQuestionHints({
      promptType,
      questionKey: resolvedQuestionSelection.questionKey,
      questionText: resolvedQuestionSelection.questionText,
      locale,
    });
  } else if (sanitizedQuestionHints) {
    normalizedPayload.question_hints = sanitizedQuestionHints;
  }

  if (normalizedSelectedScanId !== undefined) {
    normalizedPayload.selected_scan_id = normalizedSelectedScanId;
  }

  if (normalizedScanIntent !== undefined) {
    normalizedPayload.scan_intent = normalizedScanIntent;
  }

  return {
    payload: normalizedPayload,
    persona_key: payload.persona_key,
    locale,
    force_refresh: readOptionalBoolean(payload.force_refresh) ?? undefined,
  };
}

export function parseSocialReserveUploadRequest(payload: unknown) {
  if (!isRecord(payload)) {
    throw new Phase2HttpError(400, 'invalid_payload', 'Request body must be an object');
  }

  assertNoUnknownKeys(payload, ['mime_type']);

  return {
    mime_type: normalizeSocialImageMimeType(payload.mime_type),
  };
}
