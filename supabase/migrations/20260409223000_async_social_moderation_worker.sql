-- Async social moderation worker
-- - queue bookkeeping for pending-first social moderation
-- - internal claim RPC for worker batch processing
-- - system-authored moderation audit support

ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS moderation_queued_at timestamptz,
  ADD COLUMN IF NOT EXISTS moderation_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS moderation_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS moderation_attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS moderation_last_error text;

ALTER TABLE public.social_posts
  DROP CONSTRAINT IF EXISTS social_posts_moderation_attempt_count_check;

ALTER TABLE public.social_posts
  ADD CONSTRAINT social_posts_moderation_attempt_count_check CHECK (
    moderation_attempt_count >= 0
  );

ALTER TABLE public.social_comments
  ADD COLUMN IF NOT EXISTS moderation_queued_at timestamptz,
  ADD COLUMN IF NOT EXISTS moderation_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS moderation_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS moderation_attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS moderation_last_error text;

ALTER TABLE public.social_comments
  DROP CONSTRAINT IF EXISTS social_comments_moderation_attempt_count_check;

ALTER TABLE public.social_comments
  ADD CONSTRAINT social_comments_moderation_attempt_count_check CHECK (
    moderation_attempt_count >= 0
  );

UPDATE public.social_posts
SET moderation_queued_at = created_at
WHERE moderation_queued_at IS NULL;

UPDATE public.social_comments
SET moderation_queued_at = created_at
WHERE moderation_queued_at IS NULL;

ALTER TABLE public.social_moderation_events
  ALTER COLUMN actor_id DROP NOT NULL;

ALTER TABLE public.social_moderation_events
  ADD COLUMN IF NOT EXISTS actor_type text NOT NULL DEFAULT 'admin',
  ADD COLUMN IF NOT EXISTS actor_label text;

UPDATE public.social_moderation_events
SET actor_type = 'admin'
WHERE actor_type IS NULL;

ALTER TABLE public.social_moderation_events
  DROP CONSTRAINT IF EXISTS social_moderation_events_actor_type_check;

ALTER TABLE public.social_moderation_events
  ADD CONSTRAINT social_moderation_events_actor_type_check CHECK (
    actor_type IN ('admin', 'system')
  );

ALTER TABLE public.social_moderation_events
  DROP CONSTRAINT IF EXISTS social_moderation_events_actor_identity_check;

ALTER TABLE public.social_moderation_events
  ADD CONSTRAINT social_moderation_events_actor_identity_check CHECK (
    (actor_type = 'admin' AND actor_id IS NOT NULL)
    OR
    (
      actor_type = 'system'
      AND actor_id IS NULL
      AND nullif(btrim(COALESCE(actor_label, '')), '') IS NOT NULL
    )
  );

CREATE INDEX IF NOT EXISTS idx_social_posts_pending_moderation_queue
ON public.social_posts(moderation_claimed_at, moderation_queued_at, created_at)
WHERE deleted_at IS NULL AND moderation_state = 'pending';

CREATE INDEX IF NOT EXISTS idx_social_comments_pending_moderation_queue
ON public.social_comments(moderation_claimed_at, moderation_queued_at, created_at)
WHERE deleted_at IS NULL AND moderation_state = 'pending';

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
  rollups.last_reported_at
FROM public.social_posts AS post
LEFT JOIN rollups
  ON rollups.target_type = 'post'
 AND rollups.target_id = post.id
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
  0::integer AS like_count,
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
  rollups.last_reported_at
FROM public.social_comments AS comment
LEFT JOIN rollups
  ON rollups.target_type = 'comment'
 AND rollups.target_id = comment.id
WHERE comment.deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.claim_social_moderation_batch(
  p_limit integer DEFAULT 20,
  p_content_type text DEFAULT 'all',
  p_stale_after_minutes integer DEFAULT 15
)
RETURNS TABLE (
  content_type text,
  content_id uuid,
  author_id uuid,
  author_username text,
  category text,
  content_text text,
  asset_path text,
  asset_url text,
  moderation_state text,
  moderation_reason text,
  moderation_provider text,
  created_at timestamptz,
  total_reports_24h integer,
  unique_reporters_24h integer,
  open_reports integer,
  reason_codes text[],
  last_reported_at timestamptz,
  moderation_queued_at timestamptz,
  moderation_claimed_at timestamptz,
  moderation_completed_at timestamptz,
  moderation_attempt_count integer,
  moderation_last_error text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  normalized_limit integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
  normalized_content_type text := lower(COALESCE(NULLIF(btrim(COALESCE(p_content_type, '')), ''), 'all'));
  normalized_stale_after_minutes integer := LEAST(GREATEST(COALESCE(p_stale_after_minutes, 15), 1), 1440);
  claimed_at timestamptz := now();
  stale_before timestamptz := claimed_at - make_interval(mins => normalized_stale_after_minutes);
BEGIN
  IF normalized_content_type NOT IN ('all', 'post', 'comment') THEN
    RAISE EXCEPTION 'Unsupported moderation queue content type: %', normalized_content_type
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH queue_items AS (
    SELECT
      queue.content_type,
      queue.content_id,
      queue.author_id,
      queue.author_username,
      queue.category,
      queue.content_text,
      queue.asset_path,
      queue.asset_url,
      queue.moderation_state,
      queue.moderation_reason,
      queue.moderation_provider,
      queue.created_at,
      queue.total_reports_24h,
      queue.unique_reporters_24h,
      queue.open_reports,
      queue.reason_codes,
      queue.last_reported_at,
      queue.moderation_queued_at,
      queue.moderation_claimed_at,
      queue.moderation_completed_at,
      queue.moderation_attempt_count,
      queue.moderation_last_error
    FROM public.social_moderation_queue AS queue
    WHERE queue.moderation_state = 'pending'
      AND (
        normalized_content_type = 'all'
        OR queue.content_type = normalized_content_type
      )
      AND (
        queue.moderation_claimed_at IS NULL
        OR queue.moderation_claimed_at <= stale_before
      )
  ),
  ranked AS (
    SELECT *
    FROM queue_items
    ORDER BY
      open_reports DESC,
      COALESCE(moderation_queued_at, created_at) ASC,
      created_at ASC,
      content_id ASC
    LIMIT normalized_limit
  ),
  claimed_posts AS (
    UPDATE public.social_posts AS post
    SET
      moderation_claimed_at = claimed_at,
      moderation_attempt_count = COALESCE(post.moderation_attempt_count, 0) + 1,
      moderation_last_error = NULL,
      updated_at = now()
    FROM ranked
    WHERE ranked.content_type = 'post'
      AND post.id = ranked.content_id
      AND post.deleted_at IS NULL
      AND post.moderation_state = 'pending'
      AND (
        post.moderation_claimed_at IS NULL
        OR post.moderation_claimed_at <= stale_before
      )
    RETURNING
      ranked.content_type,
      ranked.content_id,
      ranked.author_id,
      ranked.author_username,
      ranked.category,
      ranked.content_text,
      ranked.asset_path,
      ranked.asset_url,
      ranked.moderation_state,
      ranked.moderation_reason,
      ranked.moderation_provider,
      ranked.created_at,
      ranked.total_reports_24h,
      ranked.unique_reporters_24h,
      ranked.open_reports,
      ranked.reason_codes,
      ranked.last_reported_at,
      ranked.moderation_queued_at,
      claimed_at AS moderation_claimed_at,
      ranked.moderation_completed_at,
      post.moderation_attempt_count AS moderation_attempt_count,
      NULL::text AS moderation_last_error
  ),
  claimed_comments AS (
    UPDATE public.social_comments AS comment
    SET
      moderation_claimed_at = claimed_at,
      moderation_attempt_count = COALESCE(comment.moderation_attempt_count, 0) + 1,
      moderation_last_error = NULL,
      updated_at = now()
    FROM ranked
    WHERE ranked.content_type = 'comment'
      AND comment.id = ranked.content_id
      AND comment.deleted_at IS NULL
      AND comment.moderation_state = 'pending'
      AND (
        comment.moderation_claimed_at IS NULL
        OR comment.moderation_claimed_at <= stale_before
      )
    RETURNING
      ranked.content_type,
      ranked.content_id,
      ranked.author_id,
      ranked.author_username,
      ranked.category,
      ranked.content_text,
      ranked.asset_path,
      ranked.asset_url,
      ranked.moderation_state,
      ranked.moderation_reason,
      ranked.moderation_provider,
      ranked.created_at,
      ranked.total_reports_24h,
      ranked.unique_reporters_24h,
      ranked.open_reports,
      ranked.reason_codes,
      ranked.last_reported_at,
      ranked.moderation_queued_at,
      claimed_at AS moderation_claimed_at,
      ranked.moderation_completed_at,
      comment.moderation_attempt_count AS moderation_attempt_count,
      NULL::text AS moderation_last_error
  )
  SELECT *
  FROM claimed_posts

  UNION ALL

  SELECT *
  FROM claimed_comments

  ORDER BY
    open_reports DESC,
    COALESCE(moderation_queued_at, created_at) ASC,
    created_at ASC,
    content_id ASC;
END;
$$;

SELECT pg_notify('pgrst', 'reload schema');
