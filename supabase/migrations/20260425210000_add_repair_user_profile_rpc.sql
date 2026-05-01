-- 20260425210000_add_repair_user_profile_rpc.sql
--
-- RPC SECURITY DEFINER pour reparer un profil utilisateur manquant de facon
-- atomique et idempotente.
--
-- Probleme observe : INSERT direct cote client depuis AuthContext.repairMissingUserProfile
-- echoue avec PostgreSQL 42501 (insufficient_privilege) pour certains comptes.
-- Causes possibles non mutuellement exclusives :
--   1) Le trigger BEFORE INSERT phase1_normalize_user_profile (cf. migration
--      20260407120000_phase1_hardening) mute des colonnes (email_verified,
--      scan_usage, welcome_credits, subscription_status) qui ne figurent pas
--      dans le GRANT INSERT colonne-specifique de la meme migration. Selon
--      le mode de propagation des privileges entre trigger SECURITY DEFINER
--      et commande appelante, l'INSERT peut etre rejete.
--   2) Coexistence des policies "Users can view own MFA verified profile"
--      (USING aal=aal2) et "Users can view own profile" (USING auth.uid())
--      apres la migration 20260425200000 : le RETURNING SELECT chained sur
--      certaines colonnes (account_tier) peut etre filtre.
--   3) Mismatch transitoire entre le JWT cote client et le auth.uid() cote
--      Postgres pendant l'hydratation initiale.
--
-- Solution : RPC unique, idempotente, qui bypass RLS et GRANT colonne-specifique
-- via SECURITY DEFINER. Si la ligne existe deja, on la retourne sans modification.
-- Sinon, on insert le minimum (id, email, avatar_url) et le trigger
-- phase1_normalize_user_profile remplit le reste.

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
  v_existing public.user_profiles;
  v_result public.user_profiles;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '42501';
  END IF;

  -- Idempotence : si la ligne existe deja, on la retourne telle quelle.
  SELECT * INTO v_existing
  FROM public.user_profiles
  WHERE id = v_user_id;

  IF FOUND THEN
    RETURN v_existing;
  END IF;

  -- Recupere l'email canonique depuis auth.users (le trigger
  -- phase1_normalize_user_profile fait deja ce fallback mais on le double
  -- ici pour fournir une valeur explicite a l'INSERT).
  SELECT email INTO v_email
  FROM auth.users
  WHERE id = v_user_id;

  INSERT INTO public.user_profiles (id, email, avatar_url)
  VALUES (
    v_user_id,
    COALESCE(v_email, v_user_id::text || '@oauth.temp'),
    NULLIF(btrim(COALESCE(p_avatar_url, '')), '')
  )
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.repair_missing_user_profile(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.repair_missing_user_profile(text) TO authenticated;

COMMENT ON FUNCTION public.repair_missing_user_profile(text) IS
  'Idempotent repair of missing user_profiles row. SECURITY DEFINER bypass RLS '
  'and column-specific GRANT INSERT restrictions imposed by phase1_hardening. '
  'Called by AuthContext.repairMissingUserProfile when readUserProfileResult '
  'returns source = ''missing-profile''. Returns existing row if already present. '
  'Required to break the chicken-and-egg state where authenticated user has no '
  'profile row and the direct INSERT path fails with 42501.';

SELECT pg_notify('pgrst', 'reload schema');
