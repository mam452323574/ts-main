ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS admin_like_adjustment integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS admin_dislike_adjustment integer NOT NULL DEFAULT 0;

ALTER TABLE public.social_moderation_events
  ADD COLUMN IF NOT EXISTS target_user_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL;

ALTER TABLE public.social_moderation_events
  DROP CONSTRAINT IF EXISTS social_moderation_events_target_type_check;

ALTER TABLE public.social_moderation_events
  ADD CONSTRAINT social_moderation_events_target_type_check CHECK (
    target_type IN ('post', 'comment', 'user')
  );

ALTER TABLE public.social_moderation_events
  DROP CONSTRAINT IF EXISTS social_moderation_events_single_target_check;

ALTER TABLE public.social_moderation_events
  ADD CONSTRAINT social_moderation_events_single_target_check CHECK (
    (
      target_type = 'post'
      AND target_post_id IS NOT NULL
      AND target_comment_id IS NULL
      AND target_user_id IS NULL
    )
    OR
    (
      target_type = 'comment'
      AND target_post_id IS NULL
      AND target_comment_id IS NOT NULL
      AND target_user_id IS NULL
    )
    OR
    (
      target_type = 'user'
      AND target_post_id IS NULL
      AND target_comment_id IS NULL
      AND target_user_id IS NOT NULL
    )
  );

ALTER TABLE public.social_moderation_events
  DROP CONSTRAINT IF EXISTS social_moderation_events_action_check;

ALTER TABLE public.social_moderation_events
  ADD CONSTRAINT social_moderation_events_action_check CHECK (
    action IN (
      'approve',
      'flag',
      'hide',
      'remove',
      'restore',
      'reject',
      'dismiss_reports',
      'reclassify_category',
      'eradicate_user_content',
      'ban_user',
      'revoke_ban',
      'remove_avatar',
      'adjust_reactions'
    )
  );

DROP INDEX IF EXISTS idx_social_moderation_events_target_created_at;

CREATE INDEX IF NOT EXISTS idx_social_moderation_events_target_created_at
  ON public.social_moderation_events(
    target_type,
    COALESCE(target_post_id, target_comment_id, target_user_id),
    created_at DESC
  );

CREATE OR REPLACE FUNCTION public.get_effective_social_reaction_count(
  p_raw_count integer,
  p_admin_adjustment integer DEFAULT 0
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT GREATEST(0, COALESCE(p_raw_count, 0) + COALESCE(p_admin_adjustment, 0));
$$;

CREATE OR REPLACE FUNCTION public.calculate_social_post_rank(
  p_created_at timestamptz,
  p_like_count integer,
  p_dislike_count integer,
  p_comment_count integer,
  p_impression_count integer
)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT
    (
      48.0 / (
        GREATEST(EXTRACT(EPOCH FROM (now()::timestamptz - p_created_at)) / 3600.0, 0) + 2.0
      )
    )
    + (
      (GREATEST(COALESCE(p_like_count, 0), 0) * 3.0)
      - (GREATEST(COALESCE(p_dislike_count, 0), 0) * 4.0)
      + (GREATEST(COALESCE(p_comment_count, 0), 0) * 5.0)
    )
    + (LN(1 + GREATEST(COALESCE(p_impression_count, 0), 0)) * 2.0);
$$;

DROP FUNCTION IF EXISTS public.get_social_feed_page(text, integer, integer);

CREATE OR REPLACE FUNCTION public.get_social_feed_page(
  p_category text DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  author_id uuid,
  author_username text,
  author_avatar_url text,
  category text,
  content_text text,
  scan_id uuid,
  share_payload_snapshot jsonb,
  asset_path text,
  asset_url text,
  image_url text,
  created_at timestamptz,
  like_count integer,
  dislike_count integer,
  impression_count integer,
  comment_count integer,
  viewer_reaction text,
  viewer_has_liked boolean,
  moderation_state text,
  moderation_status text,
  moderation_reason text,
  moderation_provider text,
  rejection_count integer,
  last_rejected_at timestamptz,
  deleted_at timestamptz
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, auth
AS $$
DECLARE
  normalized_limit integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
  normalized_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  normalized_category text := NULLIF(btrim(COALESCE(p_category, '')), '');
BEGIN
  IF normalized_category IS NOT NULL
    AND normalized_category NOT IN ('before_after', 'food', 'physique') THEN
    RAISE EXCEPTION 'Unsupported social category: %', normalized_category
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH viewer_private_posts AS (
    SELECT
      post.*,
      public.get_effective_social_reaction_count(
        post.like_count,
        post.admin_like_adjustment
      ) AS effective_like_count,
      public.get_effective_social_reaction_count(
        post.dislike_count,
        post.admin_dislike_adjustment
      ) AS effective_dislike_count,
      COALESCE(reaction_state.reaction_type, 'neutral') AS viewer_reaction,
      ROW_NUMBER() OVER (
        ORDER BY post.created_at DESC
      ) AS private_position
    FROM public.social_posts AS post
    LEFT JOIN public.social_post_likes AS reaction_state
      ON reaction_state.post_id = post.id
     AND reaction_state.user_id = auth.uid()
    WHERE post.deleted_at IS NULL
      AND post.author_id = auth.uid()
      AND post.moderation_state <> 'approved'
      AND (
        normalized_category IS NULL
        OR post.category = normalized_category
      )
  ),
  public_posts AS (
    SELECT
      post.*,
      public.get_effective_social_reaction_count(
        post.like_count,
        post.admin_like_adjustment
      ) AS effective_like_count,
      public.get_effective_social_reaction_count(
        post.dislike_count,
        post.admin_dislike_adjustment
      ) AS effective_dislike_count,
      COALESCE(reaction_state.reaction_type, 'neutral') AS viewer_reaction,
      public.calculate_social_post_rank(
        post.created_at,
        public.get_effective_social_reaction_count(
          post.like_count,
          post.admin_like_adjustment
        ),
        public.get_effective_social_reaction_count(
          post.dislike_count,
          post.admin_dislike_adjustment
        ),
        post.comment_count,
        post.impression_count
      ) AS rank_score
    FROM public.social_posts AS post
    LEFT JOIN public.social_post_likes AS reaction_state
      ON reaction_state.post_id = post.id
     AND reaction_state.user_id = auth.uid()
    WHERE post.deleted_at IS NULL
      AND post.moderation_state = 'approved'
      AND (
        normalized_category IS NULL
        OR post.category = normalized_category
      )
  ),
  ranked_public_posts AS (
    SELECT
      public_posts.*,
      ROW_NUMBER() OVER (
        PARTITION BY CASE
          WHEN normalized_category IS NULL THEN public_posts.category
          ELSE 'filtered'
        END
        ORDER BY
          public_posts.rank_score DESC,
          public_posts.created_at DESC
      ) AS category_position
    FROM public_posts
  ),
  combined_feed AS (
    SELECT
      viewer_private_posts.id,
      viewer_private_posts.author_id,
      viewer_private_posts.author_username,
      viewer_private_posts.author_avatar_url,
      viewer_private_posts.category,
      viewer_private_posts.content_text,
      viewer_private_posts.scan_id,
      viewer_private_posts.share_payload_snapshot,
      viewer_private_posts.asset_path,
      viewer_private_posts.asset_url,
      viewer_private_posts.image_url,
      viewer_private_posts.created_at,
      viewer_private_posts.effective_like_count AS like_count,
      viewer_private_posts.effective_dislike_count AS dislike_count,
      viewer_private_posts.impression_count,
      viewer_private_posts.comment_count,
      viewer_private_posts.viewer_reaction,
      viewer_private_posts.viewer_reaction = 'like' AS viewer_has_liked,
      viewer_private_posts.moderation_state,
      viewer_private_posts.moderation_status,
      viewer_private_posts.moderation_reason,
      viewer_private_posts.moderation_provider,
      viewer_private_posts.rejection_count,
      viewer_private_posts.last_rejected_at,
      viewer_private_posts.deleted_at,
      0 AS sort_group,
      viewer_private_posts.private_position AS tranche_position,
      0::numeric AS rank_score
    FROM viewer_private_posts

    UNION ALL

    SELECT
      ranked_public_posts.id,
      ranked_public_posts.author_id,
      ranked_public_posts.author_username,
      ranked_public_posts.author_avatar_url,
      ranked_public_posts.category,
      ranked_public_posts.content_text,
      ranked_public_posts.scan_id,
      ranked_public_posts.share_payload_snapshot,
      ranked_public_posts.asset_path,
      ranked_public_posts.asset_url,
      ranked_public_posts.image_url,
      ranked_public_posts.created_at,
      ranked_public_posts.effective_like_count AS like_count,
      ranked_public_posts.effective_dislike_count AS dislike_count,
      ranked_public_posts.impression_count,
      ranked_public_posts.comment_count,
      ranked_public_posts.viewer_reaction,
      ranked_public_posts.viewer_reaction = 'like' AS viewer_has_liked,
      ranked_public_posts.moderation_state,
      ranked_public_posts.moderation_status,
      ranked_public_posts.moderation_reason,
      ranked_public_posts.moderation_provider,
      ranked_public_posts.rejection_count,
      ranked_public_posts.last_rejected_at,
      ranked_public_posts.deleted_at,
      1 AS sort_group,
      CASE
        WHEN normalized_category IS NULL THEN ranked_public_posts.category_position
        ELSE 0
      END AS tranche_position,
      ranked_public_posts.rank_score
    FROM ranked_public_posts
  )
  SELECT
    combined_feed.id,
    combined_feed.author_id,
    combined_feed.author_username,
    combined_feed.author_avatar_url,
    combined_feed.category,
    combined_feed.content_text,
    combined_feed.scan_id,
    combined_feed.share_payload_snapshot,
    combined_feed.asset_path,
    combined_feed.asset_url,
    combined_feed.image_url,
    combined_feed.created_at,
    combined_feed.like_count,
    combined_feed.dislike_count,
    combined_feed.impression_count,
    combined_feed.comment_count,
    combined_feed.viewer_reaction,
    combined_feed.viewer_has_liked,
    combined_feed.moderation_state,
    combined_feed.moderation_status,
    combined_feed.moderation_reason,
    combined_feed.moderation_provider,
    combined_feed.rejection_count,
    combined_feed.last_rejected_at,
    combined_feed.deleted_at
  FROM combined_feed
  ORDER BY
    combined_feed.sort_group ASC,
    combined_feed.tranche_position ASC,
    combined_feed.rank_score DESC,
    combined_feed.created_at DESC
  OFFSET normalized_offset
  LIMIT normalized_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_social_post_reaction(
  p_post_id uuid,
  p_user_id uuid,
  p_reaction text
)
RETURNS TABLE (
  post_id uuid,
  viewer_reaction text,
  like_count integer,
  dislike_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  normalized_reaction text := COALESCE(NULLIF(btrim(COALESCE(p_reaction, '')), ''), 'neutral');
  target_post public.social_posts%ROWTYPE;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = 'P0001';
  END IF;

  IF normalized_reaction NOT IN ('like', 'dislike', 'neutral') THEN
    RAISE EXCEPTION 'Unsupported reaction: %', normalized_reaction
      USING ERRCODE = '22023';
  END IF;

  SELECT social_post.*
  INTO target_post
  FROM public.social_posts AS social_post
  WHERE social_post.id = p_post_id
  LIMIT 1;

  IF target_post.id IS NULL OR target_post.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Social post not found'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT (
    target_post.moderation_state = 'approved'
    OR (
      target_post.moderation_state = 'pending'
      AND target_post.author_id = p_user_id
    )
  ) THEN
    RAISE EXCEPTION 'Social post reactions are only allowed on approved posts or your own pending posts'
      USING ERRCODE = 'P0001';
  END IF;

  IF normalized_reaction = 'neutral' THEN
    DELETE FROM public.social_post_likes AS post_like
    WHERE post_like.post_id = p_post_id
      AND post_like.user_id = p_user_id;
  ELSE
    INSERT INTO public.social_post_likes (
      post_id,
      user_id,
      reaction_type
    )
    VALUES (
      p_post_id,
      p_user_id,
      normalized_reaction
    )
    ON CONFLICT ON CONSTRAINT social_post_likes_post_user_unique DO UPDATE
    SET
      reaction_type = EXCLUDED.reaction_type,
      updated_at = now();
  END IF;

  SELECT social_post.*
  INTO target_post
  FROM public.social_posts AS social_post
  WHERE social_post.id = p_post_id
  LIMIT 1;

  RETURN QUERY
  SELECT
    target_post.id AS post_id,
    normalized_reaction AS viewer_reaction,
    public.get_effective_social_reaction_count(
      target_post.like_count,
      target_post.admin_like_adjustment
    ) AS like_count,
    public.get_effective_social_reaction_count(
      target_post.dislike_count,
      target_post.admin_dislike_adjustment
    ) AS dislike_count;
END;
$$;

REVOKE ALL ON FUNCTION public.set_social_post_reaction(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_social_post_reaction(uuid, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.set_social_post_admin_reaction_adjustments(
  p_post_id uuid,
  p_admin_like_adjustment integer,
  p_admin_dislike_adjustment integer
)
RETURNS TABLE (
  post_id uuid,
  raw_like_count integer,
  raw_dislike_count integer,
  admin_like_adjustment integer,
  admin_dislike_adjustment integer,
  effective_like_count integer,
  effective_dislike_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  updated_post public.social_posts%ROWTYPE;
BEGIN
  IF p_post_id IS NULL THEN
    RAISE EXCEPTION 'post_id is required'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.social_posts AS social_post
  SET
    admin_like_adjustment = COALESCE(p_admin_like_adjustment, 0),
    admin_dislike_adjustment = COALESCE(p_admin_dislike_adjustment, 0),
    updated_at = now()
  WHERE social_post.id = p_post_id
  RETURNING social_post.*
  INTO updated_post;

  IF updated_post.id IS NULL THEN
    RAISE EXCEPTION 'Social post not found'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT
    updated_post.id AS post_id,
    COALESCE(updated_post.like_count, 0) AS raw_like_count,
    COALESCE(updated_post.dislike_count, 0) AS raw_dislike_count,
    COALESCE(updated_post.admin_like_adjustment, 0) AS admin_like_adjustment,
    COALESCE(updated_post.admin_dislike_adjustment, 0) AS admin_dislike_adjustment,
    public.get_effective_social_reaction_count(
      updated_post.like_count,
      updated_post.admin_like_adjustment
    ) AS effective_like_count,
    public.get_effective_social_reaction_count(
      updated_post.dislike_count,
      updated_post.admin_dislike_adjustment
    ) AS effective_dislike_count;
END;
$$;

REVOKE ALL ON FUNCTION public.set_social_post_admin_reaction_adjustments(uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_social_post_admin_reaction_adjustments(uuid, integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_eradicate_social_user_content(
  p_target_user_id uuid,
  p_actor_id uuid,
  p_note text DEFAULT NULL
)
RETURNS TABLE (
  operation_id uuid,
  event_id uuid,
  target_user_id uuid,
  post_count integer,
  own_comment_count integer,
  cascaded_comment_count integer,
  resolved_report_count integer,
  ban_created boolean,
  asset_paths text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_now timestamptz := now();
  v_operation_id uuid := gen_random_uuid();
  v_event_id uuid;
  v_post_count integer := 0;
  v_own_comment_count integer := 0;
  v_cascaded_comment_count integer := 0;
  v_resolved_report_count integer := 0;
  v_ban_created boolean := false;
  v_asset_paths text[] := '{}'::text[];
  v_active_ban_id uuid;
BEGIN
  IF p_target_user_id IS NULL THEN
    RAISE EXCEPTION 'target_user_id is required'
      USING ERRCODE = '22023';
  END IF;

  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id is required'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('social_eradicate_user:' || p_target_user_id::text)
  );

  WITH user_posts AS (
    SELECT
      social_post.id,
      social_post.asset_path,
      social_post.moderation_state,
      social_post.moderation_reason,
      social_post.moderation_provider,
      social_post.moderation_summary_json
    FROM public.social_posts AS social_post
    WHERE social_post.author_id = p_target_user_id
  ),
  own_comments AS (
    SELECT
      social_comment.id,
      social_comment.moderation_state,
      social_comment.moderation_reason,
      social_comment.moderation_provider,
      social_comment.moderation_summary_json
    FROM public.social_comments AS social_comment
    WHERE social_comment.author_id = p_target_user_id
  ),
  cascaded_comments AS (
    SELECT
      social_comment.id,
      social_comment.moderation_state,
      social_comment.moderation_reason,
      social_comment.moderation_provider,
      social_comment.moderation_summary_json
    FROM public.social_comments AS social_comment
    WHERE social_comment.post_id IN (
      SELECT user_post.id
      FROM user_posts AS user_post
    )
      AND social_comment.author_id <> p_target_user_id
  ),
  updated_posts AS (
    UPDATE public.social_posts AS social_post
    SET
      moderation_state = 'removed',
      deleted_at = COALESCE(social_post.deleted_at, v_now),
      moderation_reason = 'admin_eradication',
      moderation_provider = 'admin',
      moderation_summary_json =
        COALESCE(social_post.moderation_summary_json, '{}'::jsonb) ||
        jsonb_build_object(
          'operation_id', v_operation_id,
          'source', 'social_admin_eradicate_user',
          'eradicated_by', p_actor_id,
          'eradicated_at', v_now,
          'previous_moderation_state', user_post.moderation_state,
          'previous_moderation_reason', user_post.moderation_reason,
          'previous_moderation_provider', user_post.moderation_provider
        ),
      moderation_queued_at = NULL,
      moderation_claimed_at = NULL,
      moderation_completed_at = v_now,
      moderation_last_error = NULL,
      updated_at = v_now
    FROM user_posts AS user_post
    WHERE social_post.id = user_post.id
      AND (
        social_post.deleted_at IS NULL
        OR social_post.moderation_state <> 'removed'
      )
    RETURNING social_post.id
  ),
  updated_own_comments AS (
    UPDATE public.social_comments AS social_comment
    SET
      moderation_state = 'removed',
      deleted_at = COALESCE(social_comment.deleted_at, v_now),
      moderation_reason = 'admin_eradication',
      moderation_provider = 'admin',
      moderation_summary_json =
        COALESCE(social_comment.moderation_summary_json, '{}'::jsonb) ||
        jsonb_build_object(
          'operation_id', v_operation_id,
          'source', 'social_admin_eradicate_user',
          'eradicated_by', p_actor_id,
          'eradicated_at', v_now,
          'previous_moderation_state', own_comment.moderation_state,
          'previous_moderation_reason', own_comment.moderation_reason,
          'previous_moderation_provider', own_comment.moderation_provider
        ),
      moderation_queued_at = NULL,
      moderation_claimed_at = NULL,
      moderation_completed_at = v_now,
      moderation_last_error = NULL,
      updated_at = v_now
    FROM own_comments AS own_comment
    WHERE social_comment.id = own_comment.id
      AND (
        social_comment.deleted_at IS NULL
        OR social_comment.moderation_state <> 'removed'
      )
    RETURNING social_comment.id
  ),
  updated_cascaded_comments AS (
    UPDATE public.social_comments AS social_comment
    SET
      moderation_state = 'removed',
      deleted_at = COALESCE(social_comment.deleted_at, v_now),
      moderation_reason = 'parent_post_eradicated',
      moderation_provider = 'admin',
      moderation_summary_json =
        COALESCE(social_comment.moderation_summary_json, '{}'::jsonb) ||
        jsonb_build_object(
          'operation_id', v_operation_id,
          'source', 'social_admin_eradicate_user',
          'eradicated_by', p_actor_id,
          'eradicated_at', v_now,
          'previous_moderation_state', cascaded_comment.moderation_state,
          'previous_moderation_reason', cascaded_comment.moderation_reason,
          'previous_moderation_provider', cascaded_comment.moderation_provider
        ),
      moderation_queued_at = NULL,
      moderation_claimed_at = NULL,
      moderation_completed_at = v_now,
      moderation_last_error = NULL,
      updated_at = v_now
    FROM cascaded_comments AS cascaded_comment
    WHERE social_comment.id = cascaded_comment.id
      AND (
        social_comment.deleted_at IS NULL
        OR social_comment.moderation_state <> 'removed'
      )
    RETURNING social_comment.id
  ),
  resolved_reports AS (
    UPDATE public.social_reports AS social_report
    SET
      workflow_status = 'resolved',
      moderation_state = 'removed',
      moderation_reason = 'admin_eradication',
      moderation_provider = 'admin',
      reviewed_at = v_now,
      reviewed_by = p_actor_id,
      resolution_action = 'remove',
      resolution_note = 'Resolved automatically after account eradication',
      updated_at = v_now
    WHERE social_report.workflow_status IN ('submitted', 'reviewing')
      AND (
        (
          social_report.target_type = 'post'
          AND social_report.target_post_id IN (
            SELECT user_post.id
            FROM user_posts AS user_post
          )
        )
        OR
        (
          social_report.target_type = 'comment'
          AND social_report.target_comment_id IN (
            SELECT own_comment.id
            FROM own_comments AS own_comment
            UNION
            SELECT cascaded_comment.id
            FROM cascaded_comments AS cascaded_comment
          )
        )
      )
    RETURNING social_report.id
  )
  SELECT
    COALESCE((
      SELECT COUNT(*)
      FROM user_posts
    ), 0),
    COALESCE((
      SELECT COUNT(*)
      FROM own_comments
    ), 0),
    COALESCE((
      SELECT COUNT(*)
      FROM cascaded_comments
    ), 0),
    COALESCE((
      SELECT COUNT(*)
      FROM resolved_reports
    ), 0),
    COALESCE((
      SELECT ARRAY_AGG(DISTINCT user_post.asset_path)
      FROM user_posts AS user_post
      WHERE user_post.asset_path IS NOT NULL
        AND btrim(user_post.asset_path) <> ''
    ), '{}'::text[])
  INTO
    v_post_count,
    v_own_comment_count,
    v_cascaded_comment_count,
    v_resolved_report_count,
    v_asset_paths;

  SELECT user_ban.id
  INTO v_active_ban_id
  FROM public.user_bans AS user_ban
  WHERE user_ban.user_id = p_target_user_id
    AND user_ban.scope = 'all'
    AND user_ban.starts_at <= v_now
    AND (user_ban.ends_at IS NULL OR user_ban.ends_at > v_now)
    AND user_ban.revoked_at IS NULL
  ORDER BY user_ban.created_at DESC
  LIMIT 1;

  IF v_active_ban_id IS NULL THEN
    INSERT INTO public.user_bans (
      user_id,
      scope,
      reason,
      starts_at,
      ends_at,
      issued_by
    )
    VALUES (
      p_target_user_id,
      'all',
      'admin_eradication',
      v_now,
      NULL,
      p_actor_id
    )
    RETURNING id
    INTO v_active_ban_id;

    v_ban_created := true;
  ELSE
    UPDATE public.user_bans AS user_ban
    SET
      ends_at = NULL,
      reason = COALESCE(NULLIF(user_ban.reason, ''), 'admin_eradication'),
      updated_at = v_now
    WHERE user_ban.id = v_active_ban_id;
  END IF;

  UPDATE public.user_profiles AS user_profile
  SET
    avatar_url = NULL,
    updated_at = v_now
  WHERE user_profile.id = p_target_user_id;

  INSERT INTO public.social_moderation_events (
    target_type,
    target_post_id,
    target_comment_id,
    target_user_id,
    actor_id,
    actor_type,
    actor_label,
    action,
    previous_moderation_state,
    next_moderation_state,
    reason_code,
    note,
    linked_report_ids,
    metadata_json
  )
  VALUES (
    'user',
    NULL,
    NULL,
    p_target_user_id,
    p_actor_id,
    'admin',
    NULL,
    'eradicate_user_content',
    NULL,
    NULL,
    'admin_eradication',
    p_note,
    '{}'::uuid[],
    jsonb_build_object(
      'operation_id', v_operation_id,
      'source', 'social_admin_eradicate_user',
      'eradicated_by', p_actor_id,
      'eradicated_at', v_now,
      'post_count', v_post_count,
      'own_comment_count', v_own_comment_count,
      'cascaded_comment_count', v_cascaded_comment_count,
      'resolved_report_count', v_resolved_report_count,
      'ban_created', v_ban_created,
      'ban_scope', 'all',
      'ban_id', v_active_ban_id,
      'asset_path_count', COALESCE(array_length(v_asset_paths, 1), 0),
      'storage_cleanup_status', 'pending'
    )
  )
  RETURNING id
  INTO v_event_id;

  RETURN QUERY
  SELECT
    v_operation_id AS operation_id,
    v_event_id AS event_id,
    p_target_user_id AS target_user_id,
    v_post_count AS post_count,
    v_own_comment_count AS own_comment_count,
    v_cascaded_comment_count AS cascaded_comment_count,
    v_resolved_report_count AS resolved_report_count,
    v_ban_created AS ban_created,
    v_asset_paths AS asset_paths;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_eradicate_social_user_content(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_eradicate_social_user_content(uuid, uuid, text) TO service_role;

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
    user_ban.user_id,
    jsonb_agg(jsonb_build_object(
      'scope', user_ban.scope,
      'ends_at', user_ban.ends_at,
      'reason', user_ban.reason
    )) AS active_bans
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
  rollups.reason_codes,
  rollups.last_reported_at,
  COALESCE(author_bans.active_bans, '[]'::jsonb) AS author_active_bans
FROM public.social_posts AS social_post
LEFT JOIN rollups
  ON rollups.target_type = 'post'
 AND rollups.target_id = social_post.id
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

SELECT pg_notify('pgrst', 'reload schema');
