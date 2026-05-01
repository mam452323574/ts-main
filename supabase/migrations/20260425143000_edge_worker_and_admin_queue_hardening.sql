CREATE TABLE IF NOT EXISTS public.edge_request_nonces (
  purpose text NOT NULL,
  nonce_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (purpose, nonce_hash)
);

ALTER TABLE public.edge_request_nonces ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_edge_request_nonces_expires_at
  ON public.edge_request_nonces (expires_at);

REVOKE ALL ON public.edge_request_nonces FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.edge_request_nonces TO service_role;

DROP POLICY IF EXISTS "Service role manages edge request nonces"
  ON public.edge_request_nonces;
CREATE POLICY "Service role manages edge request nonces"
  ON public.edge_request_nonces
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.admin_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  request_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_audit_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_admin_audit_events_actor_created_at
  ON public.admin_audit_events (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_events_action_created_at
  ON public.admin_audit_events (action, created_at DESC);

REVOKE ALL ON public.admin_audit_events FROM anon, authenticated;
GRANT SELECT, INSERT ON public.admin_audit_events TO service_role;

DROP POLICY IF EXISTS "Service role manages admin audit events"
  ON public.admin_audit_events;
CREATE POLICY "Service role manages admin audit events"
  ON public.admin_audit_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.list_social_moderation_queue_page(
  p_filter text DEFAULT 'needs_review',
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_filter text :=
    lower(COALESCE(NULLIF(btrim(COALESCE(p_filter, '')), ''), 'needs_review'));
  normalized_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
  normalized_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  IF normalized_filter NOT IN ('needs_review', 'reported', 'processed') THEN
    RAISE EXCEPTION 'Unsupported moderation queue filter: %', normalized_filter
      USING ERRCODE = '22023';
  END IF;

  RETURN (
    WITH queue AS (
      SELECT
        content_type,
        content_id,
        author_id,
        author_username,
        category,
        content_text,
        asset_url,
        moderation_state,
        moderation_reason,
        moderation_provider,
        created_at,
        open_reports,
        total_reports_24h,
        unique_reporters_24h,
        unique_viewer_count,
        reason_codes,
        last_reported_at,
        moderation_queued_at,
        moderation_claimed_at,
        moderation_completed_at,
        moderation_attempt_count,
        moderation_last_error,
        raw_like_count,
        raw_dislike_count,
        admin_like_adjustment,
        admin_dislike_adjustment,
        effective_like_count,
        effective_dislike_count,
        author_active_bans
      FROM public.social_moderation_queue
    ),
    classified AS (
      SELECT
        queue.*,
        queue.moderation_state IN ('pending', 'flagged') AS needs_review_match,
        (
          queue.open_reports > 0
          AND queue.moderation_state NOT IN ('pending', 'flagged')
        ) AS reported_match,
        queue.moderation_state IN ('approved', 'rejected', 'hidden', 'removed')
          AS processed_match
      FROM queue
    ),
    counts AS (
      SELECT
        COUNT(*) FILTER (WHERE moderation_state = 'pending')::integer AS pending_count,
        COUNT(*) FILTER (WHERE moderation_state = 'flagged')::integer AS flagged_count,
        COUNT(*) FILTER (WHERE reported_match)::integer AS reported_count,
        COUNT(*) FILTER (WHERE needs_review_match)::integer AS needs_review_count,
        COUNT(*) FILTER (WHERE processed_match)::integer AS processed_count
      FROM classified
    ),
    filtered AS (
      SELECT *
      FROM classified
      WHERE
        CASE normalized_filter
          WHEN 'reported' THEN reported_match
          WHEN 'processed' THEN processed_match
          ELSE needs_review_match
        END
    ),
    filtered_count AS (
      SELECT COUNT(*)::integer AS total_count
      FROM filtered
    ),
    page AS (
      SELECT ordered.*, ROW_NUMBER() OVER () AS page_rank
      FROM (
        SELECT *
        FROM filtered
        ORDER BY
          CASE
            WHEN normalized_filter = 'needs_review'
            THEN CASE WHEN moderation_state = 'pending' THEN 0 ELSE 1 END
          END ASC NULLS LAST,
          CASE WHEN normalized_filter = 'needs_review' THEN open_reports END DESC NULLS LAST,
          CASE
            WHEN normalized_filter = 'needs_review'
            THEN COALESCE(moderation_queued_at, created_at)
          END ASC NULLS LAST,
          CASE WHEN normalized_filter = 'reported' THEN open_reports END DESC NULLS LAST,
          CASE WHEN normalized_filter = 'reported' THEN last_reported_at END DESC NULLS LAST,
          CASE WHEN normalized_filter = 'processed' THEN moderation_completed_at END DESC NULLS LAST,
          CASE WHEN normalized_filter IN ('reported', 'processed') THEN created_at END DESC NULLS LAST,
          content_id ASC
        LIMIT normalized_limit
        OFFSET normalized_offset
      ) AS ordered
    )
    SELECT jsonb_build_object(
      'items',
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'content_type', page.content_type,
            'content_id', page.content_id,
            'author_id', page.author_id,
            'author_username', page.author_username,
            'category', page.category,
            'content_text', page.content_text,
            'asset_url', page.asset_url,
            'moderation_state', page.moderation_state,
            'moderation_reason', page.moderation_reason,
            'moderation_provider', page.moderation_provider,
            'created_at', page.created_at,
            'open_reports', page.open_reports,
            'total_reports_24h', page.total_reports_24h,
            'unique_reporters_24h', page.unique_reporters_24h,
            'unique_viewer_count', page.unique_viewer_count,
            'reason_codes', page.reason_codes,
            'last_reported_at', page.last_reported_at,
            'moderation_queued_at', page.moderation_queued_at,
            'moderation_claimed_at', page.moderation_claimed_at,
            'moderation_completed_at', page.moderation_completed_at,
            'moderation_attempt_count', page.moderation_attempt_count,
            'moderation_last_error', page.moderation_last_error,
            'raw_like_count', page.raw_like_count,
            'raw_dislike_count', page.raw_dislike_count,
            'admin_like_adjustment', page.admin_like_adjustment,
            'admin_dislike_adjustment', page.admin_dislike_adjustment,
            'effective_like_count', page.effective_like_count,
            'effective_dislike_count', page.effective_dislike_count,
            'author_active_bans', COALESCE(page.author_active_bans, '[]'::jsonb)
          )
          ORDER BY page.page_rank
        ) FILTER (WHERE page.content_id IS NOT NULL),
        '[]'::jsonb
      ),
      'pending_count', counts.pending_count,
      'flagged_count', counts.flagged_count,
      'reported_count', counts.reported_count,
      'needs_review_count', counts.needs_review_count,
      'processed_count', counts.processed_count,
      'total_count', filtered_count.total_count,
      'limit', normalized_limit,
      'offset', normalized_offset,
      'has_more', normalized_offset + normalized_limit < filtered_count.total_count
    )
    FROM counts
    CROSS JOIN filtered_count
    LEFT JOIN page ON true
    GROUP BY
      counts.pending_count,
      counts.flagged_count,
      counts.reported_count,
      counts.needs_review_count,
      counts.processed_count,
      filtered_count.total_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_social_moderation_queue_page(text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_social_moderation_queue_page(text, integer, integer)
  TO service_role;

NOTIFY pgrst, 'reload schema';
