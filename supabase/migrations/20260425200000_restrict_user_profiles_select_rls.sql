-- 20260425200000_restrict_user_profiles_select_rls.sql
--
-- Phase 2 — durcissement RLS user_profiles (B-01 dans BACKEND_SECURITY_AUDIT.md).
--
-- Régression: la migration 20251016135828 avait remplacé la policy SELECT
-- d'origine (auth.uid() = id) par USING (true), exposant email,
-- subscription_status, subscription_expiry_date, account_tier, scan_usage,
-- last_scan_date à tous les utilisateurs authentifiés. Cette migration
-- restreint l'accès direct à la table à son propre profil et expose les
-- colonnes réellement publiques (username, avatar_url, scan_count, dates de
-- création) via la vue dédiée user_profiles_public, déjà consommée par le
-- feed social et la recherche par username.

-- 1. Restreindre la policy SELECT de user_profiles au propre profil de l'utilisateur.
DROP POLICY IF EXISTS "Users can view profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;

CREATE POLICY "Users can view own profile"
  ON public.user_profiles FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = id);

-- 2. Vue publique exposant uniquement les colonnes safe pour le feed social.
--    security_invoker = false (mode DEFINER) afin de bypass la RLS stricte
--    de user_profiles tout en limitant strictement les colonnes lisibles.
DROP VIEW IF EXISTS public.user_profiles_public CASCADE;

CREATE VIEW public.user_profiles_public
WITH (security_invoker = false)
AS
SELECT
  id,
  username,
  avatar_url,
  account_created_at,
  created_at,
  scan_count
FROM public.user_profiles;

-- 3. Permissions: tous les utilisateurs authentifiés peuvent lire la vue
--    publique. La vue n'expose pas email/subscription/scan_usage/account_tier.
REVOKE ALL ON public.user_profiles_public FROM PUBLIC;
REVOKE ALL ON public.user_profiles_public FROM anon;
GRANT SELECT ON public.user_profiles_public TO authenticated;

COMMENT ON VIEW public.user_profiles_public IS
  'Vue publique de user_profiles exposant uniquement les colonnes consultables '
  'par n''importe quel utilisateur authentifié (feed social, recherche username). '
  'Toute nouvelle colonne sensible doit rester hors de cette vue. Voir '
  'BACKEND_SECURITY_AUDIT.md (B-01).';
