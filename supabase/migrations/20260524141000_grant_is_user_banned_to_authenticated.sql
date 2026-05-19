-- Follow-up to 20260524140000_social_feed_hotfix.sql.
--
-- The hotfix dropped the overloaded RPC and freed the arm-metrics writes,
-- but the social feed still 403'd. Root cause: `get_social_feed_page`
-- (added in phase_d, 20260522120000) runs as SECURITY INVOKER and calls
-- `public.is_user_banned(uuid, text)` per post. `is_user_banned` was
-- introduced in 20260418141300_add_user_bans.sql for use inside storage
-- RLS policies (evaluated as storage_admin, which has broad EXECUTE),
-- and never had EXECUTE granted to `authenticated`. End-users calling
-- the feed RPC therefore hit `permission denied for function
-- is_user_banned` (PostgreSQL 42501) → PostgREST returns 403 →
-- the client maps it to `social_feed_policy_denied`.
--
-- The function is SECURITY DEFINER, so granting EXECUTE to authenticated
-- doesn't expose `user_bans` directly — the function body only returns a
-- boolean.

GRANT EXECUTE ON FUNCTION public.is_user_banned(uuid, text) TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
