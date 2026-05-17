import type { CoachPersonaKey } from '../../../shared/coachPersonas.ts';

export type Phase2ModerationState =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'flagged'
  | 'hidden'
  | 'removed';

export type Phase2SocialRateLimitAction = 'post' | 'comment' | 'report' | 'impression';

export type Phase2SocialReportTargetType = 'post' | 'comment';

export type Phase2SocialCategory = 'before_after' | 'food' | 'physique';

export type Phase2SocialReactionState =
  | 'like'
  | 'dislike'
  | 'neutral'
  | 'laugh'
  | 'wow'
  | 'sad';

export type Phase2SocialReportReasonCode =
  | 'harassment'
  | 'hate_speech'
  | 'sexual_content'
  | 'graphic_gore'
  | 'spam_repeat'
  | 'self_harm'
  | 'illegal_activity'
  | 'misinformation'
  | 'other';

export type Phase2SocialReportWorkflowStatus =
  | 'submitted'
  | 'reviewing'
  | 'resolved'
  | 'dismissed';

export type Phase2SocialModerationAction =
  | 'approve'
  | 'flag'
  | 'hide'
  | 'remove'
  | 'restore'
  | 'reject'
  | 'dismiss_reports';

export type Phase2SocialModerationEventTargetType =
  | Phase2SocialReportTargetType
  | 'user';

export type Phase2SocialModerationQueueContentType =
  | Phase2SocialReportTargetType
  | 'all';

export type Phase2SocialAdminModerationFilter =
  | 'needs_review'
  | 'reported'
  | 'processed';

export type Phase2ModerationActorType = 'admin' | 'system';

export type Phase2CoachEntryStatus = 'pending' | 'ready' | 'error';

export type Phase2GrowthState =
  | 'baseline'
  | 'entry_offer_ready'
  | 'entry_offer_claimed'
  | 'entry_offer_dismissed'
  | 'coach_ready'
  | 'cooldown';

export interface Phase2FeatureFlags {
  scope: string;
  social_enabled: boolean;
  coach_enabled: boolean;
  entry_offer_enabled: boolean;
  social_comments_enabled: boolean;
  moderation_enabled: boolean;
  entry_offer_offering_id: string | null;
  rollout_percentage: number | null;
  post_rate_limit_per_day: number;
  comment_rate_limit_per_hour: number;
  report_rate_limit_per_day: number;
  repeated_rejection_threshold: number;
  rejected_content_cooldown_hours: number;
  coach_cache_ttl_minutes: number;
}

export interface SocialCreatePostRequest {
  category: Phase2SocialCategory;
  content_text?: string;
  upload_id?: string;
  reserved_asset_path?: string;
  scan_id?: string;
  share_payload_snapshot?: Record<string, unknown>;
  language_code?: string;
}

export interface SocialCreatePostResponse {
  success: true;
  post_id: string;
  moderation_state: Phase2ModerationState;
  published: boolean;
  asset_url: string | null;
  rate_limit: Phase2RateLimitResult;
  cooldown: Phase2RejectionCooldownResult;
}

export interface SocialCreateCommentRequest {
  post_id: string;
  content_text: string;
}

export interface SocialCreateCommentResponse {
  success: true;
  comment_id: string;
  post_id: string;
  moderation_state: Phase2ModerationState;
  published: boolean;
  rate_limit: Phase2RateLimitResult;
  cooldown: Phase2RejectionCooldownResult;
}

export interface SocialUpdateCommentRequest {
  comment_id: string;
  content_text: string;
}

export interface SocialCommentSnapshot {
  id: string;
  post_id: string;
  author_id: string;
  author_username: string | null;
  author_avatar_url: string | null;
  content_text: string;
  created_at: string;
  like_count: number;
  viewer_has_liked: boolean;
  moderation_state: Phase2ModerationState;
  moderation_status: Phase2ModerationState;
  moderation_reason: string | null;
  moderation_provider: string | null;
  rejection_count: number;
  last_rejected_at: string | null;
  deleted_at: string | null;
}

export interface SocialUpdateCommentResponse {
  success: true;
  comment: SocialCommentSnapshot;
}

export interface SocialDeleteCommentRequest {
  comment_id: string;
}

export interface SocialDeleteCommentResponse {
  success: true;
  comment_id: string;
  post_id: string;
  deleted_at: string;
  moderation_state: Extract<Phase2ModerationState, 'removed'>;
}

export interface SocialDeletePostRequest {
  post_id: string;
}

export interface SocialDeletePostResponse {
  success: true;
  post_id: string;
  moderation_state: Extract<Phase2ModerationState, 'removed'>;
  deleted_at: string;
}

export interface SocialSetCommentLikeRequest {
  comment_id: string;
  liked: boolean;
}

export interface SocialSetCommentLikeResponse {
  success: true;
  comment_id: string;
  viewer_has_liked: boolean;
  like_count: number;
  request_id?: string;
}

export interface SocialReportContentRequest {
  target_type: Phase2SocialReportTargetType;
  target_post_id?: string;
  target_comment_id?: string;
  reason_code: Phase2SocialReportReasonCode;
  details?: string;
}

export interface SocialReportContentResponse {
  success: true;
  report_id: string;
  workflow_status: Phase2SocialReportWorkflowStatus;
}

export interface SocialSetReactionRequest {
  post_id: string;
  reaction: Phase2SocialReactionState;
}

export interface SocialSetReactionResponse {
  success: true;
  post_id: string;
  viewer_reaction: Phase2SocialReactionState;
  like_count: number;
  dislike_count: number;
}

export interface SocialRecordImpressionsRequest {
  post_ids: string[];
  source?: 'feed' | 'detail' | 'comments';
  dwell_ms_by_post?: Record<string, number>;
}

export interface SocialRecordImpressionsResponse {
  success: true;
  recorded_count: number;
}

export interface SocialRecordPostViewsRequest {
  post_ids: string[];
}

export interface SocialRecordPostViewsResponse {
  success: true;
  recorded_count: number;
}

export interface SocialModerateContentRequest {
  target_type: Phase2SocialReportTargetType;
  target_post_id?: string;
  target_comment_id?: string;
  action: Phase2SocialModerationAction;
  reason_code?: string;
  note?: string;
  report_ids?: string[];
}

export interface SocialModerateContentResponse {
  success: true;
  target_type: Phase2SocialReportTargetType;
  target_id: string;
  action: Phase2SocialModerationAction;
  moderation_state: Phase2ModerationState | null;
  affected_reports: number;
  event_id: string;
}

export interface SocialReclassifyPostRequest {
  post_id: string;
  category: Phase2SocialCategory;
}

export interface SocialReclassifyPostResponse {
  success: true;
  post_id: string;
  previous_category: Phase2SocialCategory;
  category: Phase2SocialCategory;
  event_id: string;
}

export interface SocialAdminModerationItem {
  content_type: Phase2SocialReportTargetType;
  content_id: string;
  author_id: string | null;
  author_username: string | null;
  category: Phase2SocialCategory | null;
  content_text: string | null;
  asset_url: string | null;
  moderation_state: Phase2ModerationState;
  moderation_reason: string | null;
  moderation_provider: string | null;
  created_at: string;
  open_reports: number;
  total_reports_24h: number;
  unique_reporters_24h: number;
  unique_viewer_count: number;
  reason_codes: string[];
  last_reported_at: string | null;
  moderation_queued_at: string | null;
  moderation_claimed_at: string | null;
  moderation_completed_at: string | null;
  moderation_attempt_count: number;
  moderation_last_error: string | null;
  raw_like_count: number;
  raw_dislike_count: number;
  admin_like_adjustment: number;
  admin_dislike_adjustment: number;
  effective_like_count: number;
  effective_dislike_count: number;
  author_active_bans: {
    scope: string;
    ends_at: string | null;
    reason: string | null;
  }[];
}

export interface SocialAdminModerationQueueResponse {
  success: true;
  items: SocialAdminModerationItem[];
  pending_count: number;
  flagged_count: number;
  reported_count: number;
  needs_review_count: number;
  processed_count: number;
  limit: number;
  has_more: boolean;
  next_cursor: string | null;
}

export interface Phase2ModerationSubject {
  content_type: Phase2SocialReportTargetType;
  content_id: string;
  author_id: string | null;
  author_username: string | null;
  category: Phase2SocialCategory | null;
  content_text: string | null;
  asset_path: string | null;
  asset_url: string | null;
  moderation_state: Phase2ModerationState;
  moderation_reason: string | null;
  moderation_provider: string | null;
  created_at: string;
  total_reports_24h: number;
  unique_reporters_24h: number;
  open_reports: number;
  unique_viewer_count: number;
  reason_codes: string[];
  last_reported_at: string | null;
  moderation_queued_at: string | null;
  moderation_claimed_at: string | null;
  moderation_completed_at: string | null;
  moderation_attempt_count: number;
  moderation_last_error: string | null;
  author_active_bans: {
    scope: string;
    ends_at: string | null;
    reason: string | null;
  }[];
}

export interface Phase2ModerationDecision {
  action: Phase2SocialModerationAction;
  next_state: Phase2ModerationState;
  reason_code: string;
  provider: string;
  summary: Record<string, unknown>;
  labels?: string[];
  confidence?: number | null;
}

export interface Phase2ModerationActor {
  actor_type: Phase2ModerationActorType;
  actor_id: string | null;
  actor_label: string | null;
}

export type Phase2SocialModerationEventAction =
  | Phase2SocialModerationAction
  | 'reclassify_category'
  | 'eradicate_user_content'
  | 'ban_user'
  | 'revoke_ban'
  | 'remove_avatar'
  | 'adjust_reactions';

export interface SocialAdminModerateUserRequest {
  target_user_id: string;
  action: 'ban_user' | 'revoke_ban' | 'remove_avatar';
  scope?: 'all' | 'posts' | 'comments' | 'avatar';
  reason?: string;
  duration_hours?: number;
}

export interface SocialAdminModerateUserResponse {
  success: true;
  action: SocialAdminModerateUserRequest['action'];
  target_user_id: string;
  event_id: string | null;
}

export interface SocialAdminEradicateUserRequest {
  target_user_id: string;
  note?: string;
}

export interface SocialAdminEradicateUserResponse {
  success: true;
  target_user_id: string;
  operation_id: string;
  event_id: string;
  post_count: number;
  own_comment_count: number;
  cascaded_comment_count: number;
  resolved_report_count: number;
  ban_created: boolean;
  storage_cleanup_status: 'completed' | 'partial' | 'failed';
  deleted_asset_paths: string[];
  failed_asset_paths: string[];
  deleted_avatar_paths: string[];
  failed_avatar_paths: string[];
}

export interface SocialAdminAdjustPostReactionsRequest {
  post_id: string;
  admin_like_adjustment: number;
  admin_dislike_adjustment: number;
  note?: string;
}

export interface SocialAdminAdjustPostReactionsResponse {
  success: true;
  post_id: string;
  raw_like_count: number;
  raw_dislike_count: number;
  admin_like_adjustment: number;
  admin_dislike_adjustment: number;
  effective_like_count: number;
  effective_dislike_count: number;
  event_id: string;
}

export interface SocialProcessModerationQueueRequest {
  limit?: number;
  content_type?: Phase2SocialModerationQueueContentType;
  stale_after_minutes?: number;
  dry_run?: boolean;
}

export interface SocialProcessModerationQueueResultItem {
  content_type: Phase2SocialReportTargetType;
  content_id: string;
  previous_moderation_state: Phase2ModerationState;
  moderation_state: Phase2ModerationState | null;
  action: Phase2SocialModerationAction | null;
  provider: string | null;
  status: 'selected' | 'processed' | 'failed';
  reason_code: string | null;
  event_id: string | null;
  affected_reports: number;
  error_code: string | null;
  error_message: string | null;
  dry_run: boolean;
}

export interface SocialProcessModerationQueueResponse {
  success: true;
  dry_run: boolean;
  selected_count: number;
  claimed_count: number;
  processed_count: number;
  failed_count: number;
  results: SocialProcessModerationQueueResultItem[];
}

export interface SocialReserveUploadRequest {
  mime_type: string;
}

export interface SocialReserveUploadResponse {
  success: true;
  upload_id: string;
  asset_path: string;
  bucket: string;
  mime_type: string;
}

export interface CoachGenerateRequest {
  payload: Record<string, unknown>;
  persona_key: CoachPersonaKey;
  locale?: string;
  force_refresh?: boolean;
}

export interface CoachQuotaStatus {
  account_tier: 'free' | 'premium' | 'admin';
  limit: number | null;
  used_count: number;
  available: number | null;
  next_recharge_at: string | null;
  unlimited: boolean;
  window_seconds: number;
  as_of: string;
}

export interface CoachGenerateResponse {
  success: true;
  cached: boolean;
  entry_id: string;
  persona_key: CoachPersonaKey;
  prompt_type: string | null;
  question_key?: string | null;
  question_text?: string | null;
  response_version: 1 | 2;
  status: Phase2CoachEntryStatus;
  title: string | null;
  body: string | null;
  disclaimer: string;
  cta_label: string | null;
  cta_route: string | null;
  content: Record<string, unknown> | null;
  source: string | null;
  expires_at: string | null;
  response_payload_json: Record<string, unknown>;
  quota?: CoachQuotaStatus | null;
}

export interface Phase2RateLimitResult {
  allowed: boolean;
  limit_count: number;
  window_seconds: number;
  recent_count: number;
  retry_after_seconds: number;
}

export interface Phase2RejectionCooldownResult {
  active: boolean;
  cooldown_until: string | null;
  recent_rejection_count: number;
  rejection_threshold: number;
  cooldown_hours: number;
}

export interface Phase2UserProfileSnapshot {
  username: string | null;
  avatar_url: string | null;
  account_tier: string | null;
  country_code: string | null;
}

export interface SocialFollowAuthorRequest {
  author_id: string;
  action?: 'follow' | 'unfollow';
}

export interface SocialFollowAuthorResponse {
  success: true;
  author_id: string;
  following: boolean;
}

export interface SocialHideAuthorRequest {
  author_id: string;
  action?: 'hide' | 'unhide';
}

export interface SocialHideAuthorResponse {
  success: true;
  author_id: string;
  hidden: boolean;
}

export interface SocialSetSaveRequest {
  post_id: string;
  action?: 'save' | 'unsave';
}

export interface SocialSetSaveResponse {
  success: true;
  post_id: string;
  saved: boolean;
}
