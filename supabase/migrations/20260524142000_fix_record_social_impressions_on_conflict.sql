-- Fix `record_social_impressions` ON CONFLICT spec to match the actual
-- unique constraint on social_post_impressions.
--
-- The table's unique constraint is:
--   UNIQUE (post_id, viewer_id, source, impression_window)
-- (originally defined in 20260407183000_social_phase2_hardening.sql).
--
-- The phase_c rewrite in 20260520130000_social_phase_c_rpcs.sql regressed
-- by omitting `source` from the ON CONFLICT spec:
--   ON CONFLICT (post_id, viewer_id, impression_window) DO NOTHING
-- which Postgres rejects with 42P10 ("no unique or exclusion constraint
-- matching the ON CONFLICT specification") on every call.
--
-- The Edge Function social-record-impressions swallows the underlying
-- error and returns 500 / social_impression_record_failed; nothing is
-- ever recorded.
--
-- This migration re-runs the exact phase_c definition with `source` added
-- back into the ON CONFLICT spec — no other change.

CREATE OR REPLACE FUNCTION public.record_social_impressions(
  p_post_ids uuid[],
  p_viewer_id uuid,
  p_source text DEFAULT 'feed',
  p_dwell_ms_by_post jsonb DEFAULT NULL
)
RETURNS TABLE (
  recorded_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  normalized_source text := COALESCE(NULLIF(btrim(COALESCE(p_source, '')), ''), 'feed');
  invoker_uid uuid := auth.uid();
  inserted_count integer := 0;
  dwell_post uuid;
  dwell_ms_value bigint;
BEGIN
  IF p_viewer_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = 'P0001';
  END IF;

  IF invoker_uid IS NOT NULL AND invoker_uid <> p_viewer_id THEN
    RAISE EXCEPTION 'p_viewer_id must match auth.uid()'
      USING ERRCODE = 'P0001';
  END IF;

  IF normalized_source NOT IN ('feed', 'detail', 'comments') THEN
    RAISE EXCEPTION 'Unsupported impression source: %', normalized_source
      USING ERRCODE = '22023';
  END IF;

  -- 1. Insert impressions (idempotent via ON CONFLICT). Conflict columns
  -- MUST match the unique constraint (post_id, viewer_id, source,
  -- impression_window) on social_post_impressions.
  WITH inserted_rows AS (
    INSERT INTO public.social_post_impressions (
      post_id,
      viewer_id,
      impression_window,
      source
    )
    SELECT
      post_id,
      p_viewer_id,
      date_trunc('hour', now()),
      normalized_source
    FROM unnest(p_post_ids) AS post_id
    ON CONFLICT (post_id, viewer_id, source, impression_window) DO NOTHING
    RETURNING post_id
  ),
  bumped_counts AS (
    UPDATE public.social_posts AS post
       SET impression_count = impression_count + 1
      FROM inserted_rows
     WHERE post.id = inserted_rows.post_id
    RETURNING post.id
  )
  SELECT count(*)::integer INTO inserted_count FROM bumped_counts;

  -- 2. Apply optional dwell_ms aggregation. Each post in the map contributes
  -- one sample with the provided dwell_ms (clamped non-negative, capped at
  -- 5 minutes per sample to avoid pathological values).
  IF p_dwell_ms_by_post IS NOT NULL AND jsonb_typeof(p_dwell_ms_by_post) = 'object' THEN
    FOR dwell_post, dwell_ms_value IN
      SELECT
        (key)::uuid,
        LEAST(GREATEST(COALESCE((value)::bigint, 0), 0), 300000)
      FROM jsonb_each_text(p_dwell_ms_by_post)
    LOOP
      IF dwell_ms_value > 0 THEN
        UPDATE public.social_posts
           SET total_dwell_ms = total_dwell_ms + dwell_ms_value,
               dwell_samples = dwell_samples + 1
         WHERE id = dwell_post
           AND deleted_at IS NULL;
      END IF;
    END LOOP;
  END IF;

  RETURN QUERY SELECT inserted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_social_impressions(uuid[], uuid, text, jsonb) TO authenticated, service_role;

SELECT pg_notify('pgrst', 'reload schema');
