-- 20260426120000_restore_account_tier_protection.sql
--
-- ============================================================================
-- FIX P0 — Restoration de la protection contre l'auto-promotion en admin
-- ============================================================================
--
-- Audit : SETTINGS_ADMIN_SECURITY_AUDIT.md (finding S-01).
--
-- Regression observee : la migration 20260425220000_disable_mfa_aal2.sql a
-- recree la policy "Users can update own profile" avec un WITH CHECK reduit
-- a (auth.uid() = id), perdant la clause originelle
-- (account_tier = (SELECT account_tier FROM user_profiles WHERE id = auth.uid()))
-- qui empechait un utilisateur de muter son propre tier. Combinee a la
-- contrainte CHECK (account_tier IN ('free','premium','admin')) ajoutee par
-- 20260305161200_add_admin_tier.sql, n'importe quel user authentifie pouvait
-- s'auto-promouvoir en admin via :
--
--   await supabase.from('user_profiles')
--     .update({ account_tier: 'admin' })
--     .eq('id', user.id);
--
-- Le tier 'admin' debloque ensuite toutes les Edge Functions social-admin-*,
-- la policy "Admins can manage user bans" (FOR ALL), un quota de 20 scans/jour
-- et l'UI admin moderation. Impact : compromission complete du systeme admin.
--
-- Cette migration applique une protection a deux niveaux :
--
--   1) RLS WITH CHECK qui compare account_tier OLD vs valeur courante en DB
--      (fail si l'attaquant tente de changer son tier).
--   2) Trigger BEFORE UPDATE qui RAISE EXCEPTION si account_tier change avec
--      auth.uid() = id (les promotions/demotions doivent passer par un client
--      service_role, donc ne declenchent pas auth.uid()).
--
-- Defense en profondeur : si une future migration recasse la policy (cas
-- documente : 4 fois en 6 mois), le trigger continue a bloquer l'attaque.

-- ============================================================================
-- Partie 1 : Recreer la policy UPDATE avec protection account_tier explicite
-- ============================================================================

DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile except tier" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own MFA verified profile" ON public.user_profiles;

CREATE POLICY "Users can update own profile"
  ON public.user_profiles FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = id)
  WITH CHECK (
    (select auth.uid()) = id
    AND account_tier = (
      SELECT account_tier FROM public.user_profiles WHERE id = (select auth.uid())
    )
  );

COMMENT ON POLICY "Users can update own profile" ON public.user_profiles IS
  'Authenticated users can update their own profile EXCEPT account_tier. '
  'Tier changes must go through a service_role client (Edge Functions, RevenueCat '
  'webhook, admin RPC). Voir SETTINGS_ADMIN_SECURITY_AUDIT.md S-01.';

-- ============================================================================
-- Partie 2 : Trigger BEFORE UPDATE comme defense en profondeur
-- ============================================================================

CREATE OR REPLACE FUNCTION public.guard_user_profile_tier_self_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, auth
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  -- Si auth.uid() est NULL on est en contexte service_role / superuser /
  -- migration : on autorise toute mutation (RevenueCat webhook, Edge Function
  -- admin, seed scripts).
  IF v_caller IS NULL THEN
    RETURN NEW;
  END IF;

  -- account_tier inchange : pas d'interet a verifier la suite.
  IF NEW.account_tier IS NOT DISTINCT FROM OLD.account_tier THEN
    RETURN NEW;
  END IF;

  -- L'appelant tente de muter SON PROPRE tier : refuser.
  IF v_caller = OLD.id THEN
    RAISE EXCEPTION
      'Self-promotion of account_tier is not allowed (caller=% old=% new=%)',
      v_caller, OLD.account_tier, NEW.account_tier
      USING ERRCODE = '42501',
            HINT = 'account_tier changes must be performed via a service_role client.';
  END IF;

  -- L'appelant tente de muter le tier d'un AUTRE user : impossible via RLS
  -- (auth.uid() = id), mais on garde le filet au cas ou la RLS UPDATE serait
  -- relachee dans le futur.
  RAISE EXCEPTION
    'Cross-user account_tier mutation is not allowed (caller=% target=%)',
    v_caller, OLD.id
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS guard_user_profile_tier_self_change_trg
  ON public.user_profiles;

CREATE TRIGGER guard_user_profile_tier_self_change_trg
  BEFORE UPDATE OF account_tier ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_user_profile_tier_self_change();

COMMENT ON FUNCTION public.guard_user_profile_tier_self_change() IS
  'Defense en profondeur S-01 : refuse toute mutation account_tier initiee par '
  'un utilisateur authentifie (auth.uid() IS NOT NULL). Les service_role clients '
  'court-circuitent ce trigger car auth.uid() retourne NULL en leur sein. Voir '
  'SETTINGS_ADMIN_SECURITY_AUDIT.md S-01.';

NOTIFY pgrst, 'reload schema';
