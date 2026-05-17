-- Social Phase B RPCs
-- Two SECURITY INVOKER functions called by the edge functions
-- (social-follow-author, social-hide-author). They are idempotent and accept
-- an optional action: 'follow'|'unfollow' (resp. 'hide'|'unhide') or NULL to
-- toggle. Self-follow / self-hide are rejected with 22023.
--
-- Compatibility: these are additive only. The Phase B schema (tables, triggers,
-- v5 scoring, RPC) is already deployed by 20260518120000.

CREATE OR REPLACE FUNCTION public.set_social_follow(
  p_author_id uuid,
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
  already_following boolean;
  result_following boolean;
BEGIN
  IF viewer_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;
  IF p_author_id IS NULL THEN
    RAISE EXCEPTION 'author_id is required'
      USING ERRCODE = '22023';
  END IF;
  IF viewer_uid = p_author_id THEN
    RAISE EXCEPTION 'Cannot follow yourself'
      USING ERRCODE = '22023';
  END IF;
  IF normalized_action IS NOT NULL
    AND normalized_action NOT IN ('follow', 'unfollow') THEN
    RAISE EXCEPTION 'Unsupported follow action: %', normalized_action
      USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.social_follows
     WHERE follower_id = viewer_uid AND followee_id = p_author_id
  ) INTO already_following;

  -- Resolve effective action: explicit value wins; NULL means toggle.
  IF normalized_action IS NULL THEN
    result_following := NOT already_following;
  ELSIF normalized_action = 'follow' THEN
    result_following := true;
  ELSE
    result_following := false;
  END IF;

  IF result_following AND NOT already_following THEN
    INSERT INTO public.social_follows (follower_id, followee_id)
    VALUES (viewer_uid, p_author_id)
    ON CONFLICT (follower_id, followee_id) DO NOTHING;
  ELSIF NOT result_following AND already_following THEN
    DELETE FROM public.social_follows
     WHERE follower_id = viewer_uid AND followee_id = p_author_id;
  END IF;

  RETURN jsonb_build_object(
    'author_id', p_author_id,
    'following', result_following
  );
END;
$$;

COMMENT ON FUNCTION public.set_social_follow(uuid, text) IS
  'Toggle (or set explicit) follow state for the authenticated viewer on a given author.';

GRANT EXECUTE ON FUNCTION public.set_social_follow(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_social_hidden_author(
  p_author_id uuid,
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
  already_hidden boolean;
  result_hidden boolean;
BEGIN
  IF viewer_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;
  IF p_author_id IS NULL THEN
    RAISE EXCEPTION 'author_id is required'
      USING ERRCODE = '22023';
  END IF;
  IF viewer_uid = p_author_id THEN
    RAISE EXCEPTION 'Cannot hide yourself'
      USING ERRCODE = '22023';
  END IF;
  IF normalized_action IS NOT NULL
    AND normalized_action NOT IN ('hide', 'unhide') THEN
    RAISE EXCEPTION 'Unsupported hide action: %', normalized_action
      USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.social_user_hidden_authors
     WHERE viewer_id = viewer_uid AND author_id = p_author_id
  ) INTO already_hidden;

  IF normalized_action IS NULL THEN
    result_hidden := NOT already_hidden;
  ELSIF normalized_action = 'hide' THEN
    result_hidden := true;
  ELSE
    result_hidden := false;
  END IF;

  IF result_hidden AND NOT already_hidden THEN
    INSERT INTO public.social_user_hidden_authors (viewer_id, author_id)
    VALUES (viewer_uid, p_author_id)
    ON CONFLICT (viewer_id, author_id) DO NOTHING;
  ELSIF NOT result_hidden AND already_hidden THEN
    DELETE FROM public.social_user_hidden_authors
     WHERE viewer_id = viewer_uid AND author_id = p_author_id;
  END IF;

  RETURN jsonb_build_object(
    'author_id', p_author_id,
    'hidden', result_hidden
  );
END;
$$;

COMMENT ON FUNCTION public.set_social_hidden_author(uuid, text) IS
  'Toggle (or set explicit) hidden state for the authenticated viewer on a given author.';

GRANT EXECUTE ON FUNCTION public.set_social_hidden_author(uuid, text) TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
