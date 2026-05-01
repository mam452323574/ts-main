-- 20260426220100_restore_get_user_gamification_state_grant.sql
--
-- ============================================================================
-- FIX RUNTIME — permission denied for function get_user_gamification_state
-- ============================================================================
--
-- Symptôme observé en runtime (logs client) :
--   [API] Failed to fetch gamification state
--   { code: '42501',
--     message: 'permission denied for function get_user_gamification_state' }
--
-- Cause probable : la migration 20260424190000_security_rpc_grants_and_legacy_cleanup.sql
-- effectue un REVOKE ALL massif sur toutes les fonctions du schéma public,
-- puis re-grant EXECUTE à `authenticated` une whitelist incluant
-- get_user_gamification_state. Si cette migration n'a pas été appliquée sur
-- l'environnement où l'erreur 42501 est observée (ou si une régression l'a
-- révoquée depuis), la fonction n'est plus exécutable côté client.
--
-- Cette migration est idempotente : elle re-grant EXECUTE et garantit que
-- l'app peut appeler la RPC. La fonction reste SECURITY DEFINER (définie
-- dans 20260331183000_add_scan_count_gamification.sql et mise à jour par
-- 20260401153000 / 20260401183000), donc elle bypass RLS sur user_profiles
-- pour lire scan_count via auth.uid().

GRANT EXECUTE ON FUNCTION public.get_user_gamification_state() TO authenticated;
GRANT EXECUTE ON FUNCTION public.construct_gamification_asset_url(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
