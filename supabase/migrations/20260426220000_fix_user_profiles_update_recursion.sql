-- 20260426220000_fix_user_profiles_update_recursion.sql
--
-- ============================================================================
-- FIX RUNTIME — Récursion infinie RLS sur user_profiles (PG 42P17)
-- ============================================================================
--
-- Symptôme observé en runtime (logs client) :
--   [userProfile.syncDeviceLocale] failed
--   { code: '42P17',
--     message: 'infinite recursion detected in policy for relation "user_profiles"' }
--
-- Cause : la migration 20260426120000_restore_account_tier_protection.sql a
-- recréé la policy "Users can update own profile" avec un WITH CHECK qui
-- contient une sous-requête sur user_profiles elle-même :
--
--   WITH CHECK (
--     (select auth.uid()) = id
--     AND account_tier = (
--       SELECT account_tier FROM public.user_profiles WHERE id = (select auth.uid())
--     )
--   )
--
-- Postgres détecte la référence circulaire dans la policy et refuse toute
-- mutation sur user_profiles, cassant : sync locale, push token, has_seen_tutorial,
-- changement username/avatar, etc.
--
-- Protection métier S-01 (auto-promotion account_tier) : conservée par le
-- trigger guard_user_profile_tier_self_change_trg défini dans la même
-- migration (BEFORE UPDATE OF account_tier, RAISE EXCEPTION 42501 si
-- auth.uid() = id et NEW.account_tier <> OLD.account_tier). Le trigger
-- court-circuite les service_role clients (auth.uid() IS NULL), donc les
-- promotions légitimes via Edge Function / RevenueCat webhook continuent
-- de fonctionner.
--
-- Le WITH CHECK est donc redondant et causait la régression : on le
-- simplifie à la stricte ownership check.

DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;

CREATE POLICY "Users can update own profile"
  ON public.user_profiles FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

COMMENT ON POLICY "Users can update own profile" ON public.user_profiles IS
  'Self-update du profil. La protection account_tier (audit S-01) est '
  'appliquée par le trigger guard_user_profile_tier_self_change_trg défini '
  'dans 20260426120000_restore_account_tier_protection.sql. La sous-requête '
  'auto-référente précédente (account_tier = SELECT FROM user_profiles) '
  'causait une récursion RLS (PG 42P17) à chaque UPDATE.';

NOTIFY pgrst, 'reload schema';
