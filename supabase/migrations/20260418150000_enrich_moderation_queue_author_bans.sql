-- Migration: Enrich social_moderation_queue with author ban status

DROP VIEW IF EXISTS public.social_moderation_queue;

CREATE VIEW public.social_moderation_queue AS
WITH rollups AS (
  SELECT
    target_type,
    target_id,
    total_reports_24h,
    unique_reporters_24h,
    open_reports,
    reason_codes,
    last_reported_at
  FROM public.social_report_rollups
),
author_bans AS (
  SELECT 
    user_id,
    jsonb_agg(jsonb_build_object(
      'scope', scope,
      'ends_at', ends_at,
      'reason', reason
    )) AS active_bans
  FROM public.user_bans
  WHERE starts_at <= now() 
    AND (ends_at IS NULL OR ends_at > now()) 
    AND revoked_at IS NULL
  GROUP BY user_id
)
SELECT
  'post'::text AS content_type,
  post.id AS content_id,
  post.author_id,
  post.author_username,
  post.category,
  post.content_text,
  post.asset_path,
  post.asset_url,
  post.moderation_state,
  post.moderation_reason,
  post.moderation_provider,
  post.like_count,
  post.dislike_count,
  post.impression_count,
  post.comment_count,
  post.rejection_count,
  post.last_rejected_at,
  post.created_at,
  post.moderation_queued_at,
  post.moderation_claimed_at,
  post.moderation_completed_at,
  post.moderation_attempt_count,
  post.moderation_last_error,
  COALESCE(rollups.total_reports_24h, 0) AS total_reports_24h,
  COALESCE(rollups.unique_reporters_24h, 0) AS unique_reporters_24h,
  COALESCE(rollups.open_reports, 0) AS open_reports,
  rollups.reason_codes,
  rollups.last_reported_at,
  COALESCE(author_bans.active_bans, '[]'::jsonb) AS author_active_bans
FROM public.social_posts AS post
LEFT JOIN rollups
  ON rollups.target_type = 'post'
 AND rollups.target_id = post.id
LEFT JOIN author_bans
  ON author_bans.user_id = post.author_id
WHERE post.deleted_at IS NULL

UNION ALL

SELECT
  'comment'::text AS content_type,
  comment.id AS content_id,
  comment.author_id,
  comment.author_username,
  NULL::text AS category,
  comment.content_text,
  NULL::text AS asset_path,
  NULL::text AS asset_url,
  comment.moderation_state,
  comment.moderation_reason,
  comment.moderation_provider,
  comment.like_count,
  0::integer AS dislike_count,
  0::integer AS impression_count,
  0::integer AS comment_count,
  comment.rejection_count,
  comment.last_rejected_at,
  comment.created_at,
  comment.moderation_queued_at,
  comment.moderation_claimed_at,
  comment.moderation_completed_at,
  comment.moderation_attempt_count,
  comment.moderation_last_error,
  COALESCE(rollups.total_reports_24h, 0) AS total_reports_24h,
  COALESCE(rollups.unique_reporters_24h, 0) AS unique_reporters_24h,
  COALESCE(rollups.open_reports, 0) AS open_reports,
  rollups.reason_codes,
  rollups.last_reported_at,
  COALESCE(author_bans.active_bans, '[]'::jsonb) AS author_active_bans
FROM public.social_comments AS comment
LEFT JOIN rollups
  ON rollups.target_type = 'comment'
 AND rollups.target_id = comment.id
LEFT JOIN author_bans
  ON author_bans.user_id = comment.author_id
WHERE comment.deleted_at IS NULL;
