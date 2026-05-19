-- Social feed hotfix — resolve "social_feed_policy_denied" 403 in prod.
--
-- Two root causes addressed:
--   1) get_social_feed_page was overloaded (offset + cursor signatures).
--      PostgREST does not support function overloading and was failing
--      to route the call. We drop the cursor overload until the new
--      client (which calls it) is actually shipped.
--   2) The D6 metrics triggers (handle_social_arm_*_metric) insert into
--      social_feed_arm_metrics while running as SECURITY DEFINER. If the
--      table has FORCE ROW LEVEL SECURITY or the owner lacks bypass,
--      these inserts fail and bubble up into record_social_impressions →
--      every feed render fails with 42501.

-- ---------------------------------------------------------------------------
-- 1. Remove the overloaded (cursor) signature of get_social_feed_page
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_social_feed_page(
  text, integer, text, text, text
);

-- ---------------------------------------------------------------------------
-- 2. Allow SECURITY DEFINER triggers to write to social_feed_arm_metrics
-- ---------------------------------------------------------------------------

-- Ensure FORCE RLS is OFF so the table owner (postgres) can write.
ALTER TABLE public.social_feed_arm_metrics NO FORCE ROW LEVEL SECURITY;

-- Belt-and-suspenders: grant explicit ALL to postgres and service_role.
GRANT ALL ON public.social_feed_arm_metrics TO postgres, service_role;

-- Add a permissive policy gated only on the writer role, so the SECURITY
-- DEFINER bump_social_feed_arm_metric() can INSERT/UPDATE under any
-- circumstance. Authenticated users keep their SELECT-only policy.
DROP POLICY IF EXISTS "service writes arm metrics"
  ON public.social_feed_arm_metrics;
CREATE POLICY "service writes arm metrics"
  ON public.social_feed_arm_metrics
  FOR ALL
  TO postgres, service_role
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 3. Re-grant EXECUTE defensively on the still-active surfaces
-- ---------------------------------------------------------------------------

GRANT EXECUTE ON FUNCTION public.get_social_feed_page(
  text, integer, integer, text, text
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.record_social_impressions(
  uuid[], uuid, text, jsonb
) TO authenticated, service_role;

SELECT pg_notify('pgrst', 'reload schema');
