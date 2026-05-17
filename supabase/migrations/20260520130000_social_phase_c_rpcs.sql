-- Social Phase C RPCs
--
-- 1. set_social_post_save(post_id, action?) — toggle/set save state for the
--    authenticated viewer. Mirrors set_social_follow / set_social_hidden_author.
-- 2. Re-create record_social_impressions to accept an optional dwell_ms map
--    (jsonb { post_id => avg_dwell_ms }). When provided, it aggregates dwell
--    samples into social_posts.total_dwell_ms / dwell_samples — server-side
--    counters used by calculate_social_post_rank_v6.
--
-- Compatibility:
--   - Old client (no p_dwell_ms_by_post arg) still works thanks to DEFAULT NULL.
--   - When the map is NULL or empty, behaviour is identical to the prior RPC.

-- ---------------------------------------------------------------------------
-- 1. set_social_post_save
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_social_post_save(
  p_post_id uuid,
  p_action text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, auth
AS $$
DECLARE
  viewer_uid uuid := auth.uid();
  normalized_action text := NULLIF(btrim(COALESCE(p_action, '')), '');
  post_author uuid;
  already_saved boolean;
  result_saved boolean;
BEGIN
  IF viewer_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;
  IF p_post_id IS NULL THEN
    RAISE EXCEPTION 'post_id is required'
      USING ERRCODE = '22023';
  END IF;
  IF normalized_action IS NOT NULL
    AND normalized_action NOT IN ('save', 'unsave') THEN
    RAISE EXCEPTION 'Unsupported save action: %', normalized_action
      USING ERRCODE = '22023';
  END IF;

  -- Resolve post to validate visibility and reject self-saves.
  SELECT post.author_id INTO post_author
    FROM public.social_posts AS post
   WHERE post.id = p_post_id
     AND post.deleted_at IS NULL
     AND post.moderation_state = 'approved';
  IF post_author IS NULL THEN
    RAISE EXCEPTION 'Post not found or not visible'
      USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.social_post_saves
     WHERE viewer_id = viewer_uid AND post_id = p_post_id
  ) INTO already_saved;

  IF normalized_action IS NULL THEN
    result_saved := NOT already_saved;
  ELSIF normalized_action = 'save' THEN
    result_saved := true;
  ELSE
    result_saved := false;
  END IF;

  IF result_saved AND NOT already_saved THEN
    INSERT INTO public.social_post_saves (viewer_id, post_id)
    VALUES (viewer_uid, p_post_id)
    ON CONFLICT (viewer_id, post_id) DO NOTHING;
  ELSIF NOT result_saved AND already_saved THEN
    DELETE FROM public.social_post_saves
     WHERE viewer_id = viewer_uid AND post_id = p_post_id;
  END IF;

  RETURN jsonb_build_object(
    'post_id', p_post_id,
    'saved', result_saved
  );
END;
$$;

COMMENT ON FUNCTION public.set_social_post_save(uuid, text) IS
  'Toggle (or set explicit) save state for the authenticated viewer on a given post.';

GRANT EXECUTE ON FUNCTION public.set_social_post_save(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. record_social_impressions — add optional dwell_ms_by_post jsonb
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.record_social_impressions(uuid[], uuid, text);

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

  -- 1. Insert impressions (idempotent via ON CONFLICT). Mirrors the v3 semantics
  -- but expressed inline to keep this migration self-contained.
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
    ON CONFLICT (post_id, viewer_id, impression_window) DO NOTHING
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

COMMENT ON FUNCTION public.record_social_impressions(uuid[], uuid, text, jsonb) IS
  'Record social post impressions (idempotent) and optionally aggregate dwell_ms samples on social_posts.';

GRANT EXECUTE ON FUNCTION public.record_social_impressions(uuid[], uuid, text, jsonb) TO authenticated, service_role;

SELECT pg_notify('pgrst', 'reload schema');
