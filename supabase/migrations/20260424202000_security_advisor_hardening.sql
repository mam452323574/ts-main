-- Security advisor follow-up:
-- - avoid SECURITY DEFINER views on exposed public schema
-- - enable RLS on webhook event storage
-- - freeze function search_path for existing public routines
-- - remove broad listing policy from a public asset bucket

ALTER VIEW IF EXISTS public.social_moderation_queue
  SET (security_invoker = true);
ALTER VIEW IF EXISTS public.social_report_rollups
  SET (security_invoker = true);
ALTER VIEW IF EXISTS public.user_current_global_score
  SET (security_invoker = true);

ALTER TABLE IF EXISTS public.revenuecat_webhook_events
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages revenuecat webhook events"
  ON public.revenuecat_webhook_events;
CREATE POLICY "Service role manages revenuecat webhook events"
  ON public.revenuecat_webhook_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can view gamification assets"
  ON storage.objects;

DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT proc.oid
    FROM pg_proc AS proc
    JOIN pg_namespace AS ns
      ON ns.oid = proc.pronamespace
    WHERE ns.nspname = 'public'
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %s SET search_path = public, auth',
      fn.oid::regprocedure
    );
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
