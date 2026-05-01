-- F-07 — Add explicit RLS INSERT policy on notification_logs
--
-- The original notification_system migration (20251016143537) and the perf
-- rewrite (20251016143906) both created SELECT and UPDATE policies on
-- notification_logs but never an INSERT policy. With RLS enabled and no
-- matching INSERT policy, every client-side insert silently fails.
--
-- The home screen path NotificationContext.checkForAchievements() relies on
-- inserting into notification_logs with the user's own user_id. Without an
-- explicit WITH CHECK policy gating that user_id to auth.uid(), a client
-- could otherwise (if the table were ever opened up) insert notifications
-- into another user's inbox — phishing/social-engineering vector.
--
-- This migration adds the INSERT policy with the explicit
-- WITH CHECK ((select auth.uid()) = user_id) guard, matching the perf
-- pattern used in 20251016143906 for the SELECT/UPDATE policies.

DROP POLICY IF EXISTS "Users can insert own notifications" ON public.notification_logs;

CREATE POLICY "Users can insert own notifications"
  ON public.notification_logs FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);
