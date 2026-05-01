-- Follow-up hardening from remote db lint.

DO $$
DECLARE
  routine record;
BEGIN
  FOR routine IN
    SELECT
      format(
        '%I.%I(%s)',
        namespace.nspname,
        proc.proname,
        pg_get_function_identity_arguments(proc.oid)
      ) AS signature
    FROM pg_proc AS proc
    JOIN pg_namespace AS namespace
      ON namespace.oid = proc.pronamespace
    WHERE namespace.nspname = 'public'
      AND proc.proname IN (
        'cleanup_expired_trusted_devices',
        'is_device_trusted',
        'find_user_by_email',
        'merge_duplicate_email_accounts'
      )
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', routine.signature);
  END LOOP;
END;
$$;

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
    SELECT qi.*
    FROM queue_items AS qi
    ORDER BY
      qi.open_reports DESC,
      COALESCE(qi.moderation_queued_at, qi.created_at) ASC,
      qi.created_at ASC,
      qi.content_id ASC
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
  ),
  claimed AS (
    SELECT * FROM claimed_posts
    UNION ALL
    SELECT * FROM claimed_comments
  )
  SELECT claimed.*
  FROM claimed
  ORDER BY
    claimed.open_reports DESC,
    COALESCE(claimed.moderation_queued_at, claimed.created_at) ASC,
    claimed.created_at ASC,
    claimed.content_id ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_social_moderation_batch(integer, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_social_moderation_batch(integer, text, integer)
  TO service_role;

SELECT pg_notify('pgrst', 'reload schema');
