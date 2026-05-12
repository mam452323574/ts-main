-- 20260511200000_repair_user_profile_race_safe.sql
--
-- Fix race condition observée lors du signup :
--   1. Le trigger DB on_auth_user_created insère public.user_profiles peu après
--      la creation de auth.users.
--   2. Coté client, hydrateAuthState appelle readUserProfileResult, peut
--      retourner 'missing-profile' si le SELECT précède le commit du trigger.
--   3. repairMissingUserProfile invoque la RPC.
--   4. Dans la version précédente, la RPC faisait :
--        SELECT INTO v_existing ...
--        IF FOUND THEN RETURN v_existing;
--        INSERT INTO user_profiles ...
--      Entre le SELECT et l'INSERT, le trigger commit la ligne, et l'INSERT
--      échoue avec 23505 (duplicate key on user_profiles_pkey).
--
-- Solution : INSERT ... ON CONFLICT (id) DO UPDATE SET id = id RETURNING *.
-- Atomique. Toujours retourne la ligne (existante ou nouvellement créée).
-- Le DO UPDATE SET id = id est un no-op nécessaire pour forcer RETURNING à
-- renvoyer la ligne existante en cas de conflit (DO NOTHING ne renverrait rien).

CREATE OR REPLACE FUNCTION public.repair_missing_user_profile(
  p_avatar_url text DEFAULT NULL
)
RETURNS public.user_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_result public.user_profiles;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '42501';
  END IF;

  SELECT email INTO v_email
  FROM auth.users
  WHERE id = v_user_id;

  INSERT INTO public.user_profiles (id, email, avatar_url)
  VALUES (
    v_user_id,
    COALESCE(v_email, v_user_id::text || '@oauth.temp'),
    NULLIF(btrim(COALESCE(p_avatar_url, '')), '')
  )
  ON CONFLICT (id) DO UPDATE
    SET id = public.user_profiles.id
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.repair_missing_user_profile(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.repair_missing_user_profile(text) TO authenticated;

COMMENT ON FUNCTION public.repair_missing_user_profile(text) IS
  'Idempotent and race-safe repair of missing user_profiles row. '
  'Uses INSERT ... ON CONFLICT to guarantee atomicity against the '
  'on_auth_user_created trigger that may concurrently insert the row '
  'right after signup. Returns the existing or newly-created row. '
  'SECURITY DEFINER to bypass RLS and column-specific GRANT INSERT '
  'restrictions from phase1_hardening.';

SELECT pg_notify('pgrst', 'reload schema');
