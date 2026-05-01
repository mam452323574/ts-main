-- Restore unique post view counts on the social moderation queue.

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
post_view_rollups AS (
  SELECT
    post_id,
    COUNT(*)::integer AS unique_viewer_count
  FROM public.social_post_views
  GROUP BY post_id
),
author_bans AS (
  SELECT
    user_ban.user_id,
    jsonb_agg(
      jsonb_build_object(
        'scope', user_ban.scope,
        'ends_at', user_ban.ends_at,
        'reason', user_ban.reason
      )
    ) AS active_bans
  FROM public.user_bans AS user_ban
  WHERE user_ban.starts_at <= now()
    AND (user_ban.ends_at IS NULL OR user_ban.ends_at > now())
    AND user_ban.revoked_at IS NULL
  GROUP BY user_ban.user_id
)
SELECT
  'post'::text AS content_type,
  social_post.id AS content_id,
  social_post.author_id,
  social_post.author_username,
  social_post.category,
  social_post.content_text,
  social_post.asset_path,
  social_post.asset_url,
  social_post.moderation_state,
  social_post.moderation_reason,
  social_post.moderation_provider,
  public.get_effective_social_reaction_count(
    social_post.like_count,
    social_post.admin_like_adjustment
  ) AS like_count,
  public.get_effective_social_reaction_count(
    social_post.dislike_count,
    social_post.admin_dislike_adjustment
  ) AS dislike_count,
  social_post.like_count AS raw_like_count,
  social_post.dislike_count AS raw_dislike_count,
  social_post.admin_like_adjustment,
  social_post.admin_dislike_adjustment,
  public.get_effective_social_reaction_count(
    social_post.like_count,
    social_post.admin_like_adjustment
  ) AS effective_like_count,
  public.get_effective_social_reaction_count(
    social_post.dislike_count,
    social_post.admin_dislike_adjustment
  ) AS effective_dislike_count,
  social_post.impression_count,
  social_post.comment_count,
  social_post.rejection_count,
  social_post.last_rejected_at,
  social_post.created_at,
  social_post.moderation_queued_at,
  social_post.moderation_claimed_at,
  social_post.moderation_completed_at,
  social_post.moderation_attempt_count,
  social_post.moderation_last_error,
  COALESCE(rollups.total_reports_24h, 0) AS total_reports_24h,
  COALESCE(rollups.unique_reporters_24h, 0) AS unique_reporters_24h,
  COALESCE(rollups.open_reports, 0) AS open_reports,
  COALESCE(post_view_rollups.unique_viewer_count, 0) AS unique_viewer_count,
  rollups.reason_codes,
  rollups.last_reported_at,
  COALESCE(author_bans.active_bans, '[]'::jsonb) AS author_active_bans
FROM public.social_posts AS social_post
LEFT JOIN rollups
  ON rollups.target_type = 'post'
 AND rollups.target_id = social_post.id
LEFT JOIN post_view_rollups
  ON post_view_rollups.post_id = social_post.id
LEFT JOIN author_bans
  ON author_bans.user_id = social_post.author_id
WHERE social_post.deleted_at IS NULL

UNION ALL

SELECT
  'comment'::text AS content_type,
  social_comment.id AS content_id,
  social_comment.author_id,
  social_comment.author_username,
  NULL::text AS category,
  social_comment.content_text,
  NULL::text AS asset_path,
  NULL::text AS asset_url,
  social_comment.moderation_state,
  social_comment.moderation_reason,
  social_comment.moderation_provider,
  COALESCE(social_comment.like_count, 0) AS like_count,
  0::integer AS dislike_count,
  COALESCE(social_comment.like_count, 0) AS raw_like_count,
  0::integer AS raw_dislike_count,
  0::integer AS admin_like_adjustment,
  0::integer AS admin_dislike_adjustment,
  COALESCE(social_comment.like_count, 0) AS effective_like_count,
  0::integer AS effective_dislike_count,
  0::integer AS impression_count,
  0::integer AS comment_count,
  social_comment.rejection_count,
  social_comment.last_rejected_at,
  social_comment.created_at,
  social_comment.moderation_queued_at,
  social_comment.moderation_claimed_at,
  social_comment.moderation_completed_at,
  social_comment.moderation_attempt_count,
  social_comment.moderation_last_error,
  COALESCE(rollups.total_reports_24h, 0) AS total_reports_24h,
  COALESCE(rollups.unique_reporters_24h, 0) AS unique_reporters_24h,
  COALESCE(rollups.open_reports, 0) AS open_reports,
  0::integer AS unique_viewer_count,
  rollups.reason_codes,
  rollups.last_reported_at,
  COALESCE(author_bans.active_bans, '[]'::jsonb) AS author_active_bans
FROM public.social_comments AS social_comment
LEFT JOIN rollups
  ON rollups.target_type = 'comment'
 AND rollups.target_id = social_comment.id
LEFT JOIN author_bans
  ON author_bans.user_id = social_comment.author_id
WHERE social_comment.deleted_at IS NULL;
