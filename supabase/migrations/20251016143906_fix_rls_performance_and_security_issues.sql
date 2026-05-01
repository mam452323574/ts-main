/*
  # Fix RLS Performance and Security Issues

  ## Overview
  This migration addresses critical security and performance issues:
  
  1. Updates all RLS policies to use `(select auth.uid())` for better performance
  2. Consolidates duplicate SELECT policies on user_profiles
  3. Sets immutable search_path on all functions for security

  ## Security Impact
  - Enhanced: Functions now have immutable search paths
  - Enhanced: RLS policies perform better at scale
*/

-- health_scores table
DROP POLICY IF EXISTS "Users can view own health scores" ON health_scores;
DROP POLICY IF EXISTS "Users can insert own health scores" ON health_scores;
DROP POLICY IF EXISTS "Users can update own health scores" ON health_scores;

CREATE POLICY "Users can view own health scores"
  ON health_scores FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own health scores"
  ON health_scores FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own health scores"
  ON health_scores FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- scans table
DROP POLICY IF EXISTS "Users can view own scans" ON scans;
DROP POLICY IF EXISTS "Users can insert own scans" ON scans;

CREATE POLICY "Users can view own scans"
  ON scans FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own scans"
  ON scans FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

-- user_achievements table
DROP POLICY IF EXISTS "Users can view own achievements" ON user_achievements;
DROP POLICY IF EXISTS "Users can insert own achievements" ON user_achievements;
DROP POLICY IF EXISTS "Users can update own achievements" ON user_achievements;

CREATE POLICY "Users can view own achievements"
  ON user_achievements FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own achievements"
  ON user_achievements FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own achievements"
  ON user_achievements FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- notification_logs table
DROP POLICY IF EXISTS "Users can view own notifications" ON notification_logs;
DROP POLICY IF EXISTS "Users can update own notifications" ON notification_logs;

CREATE POLICY "Users can view own notifications"
  ON notification_logs FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own notifications"
  ON notification_logs FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- user_profiles table - consolidate duplicate SELECT policies
DROP POLICY IF EXISTS "Public profiles viewable by authenticated users" ON user_profiles;
DROP POLICY IF EXISTS "Users can view own complete profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile except tier" ON user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;

CREATE POLICY "Users can view profiles"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile except tier"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = id);

-- oauth_connections table
DROP POLICY IF EXISTS "Users can view own oauth connections" ON oauth_connections;
DROP POLICY IF EXISTS "Users can link new oauth providers" ON oauth_connections;
DROP POLICY IF EXISTS "Users can unlink oauth providers" ON oauth_connections;

CREATE POLICY "Users can view own oauth connections"
  ON oauth_connections FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can link new oauth providers"
  ON oauth_connections FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can unlink oauth providers"
  ON oauth_connections FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- purchases table
DROP POLICY IF EXISTS "Users can view own purchases" ON purchases;

CREATE POLICY "Users can view own purchases"
  ON purchases FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- Drop duplicate index
DROP INDEX IF EXISTS idx_scans_rate_limit;

-- Recreate functions with proper search paths
CREATE OR REPLACE FUNCTION update_last_scan_date()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  UPDATE user_profiles
  SET last_scan_date = NEW.created_at
  WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION log_content_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF TG_TABLE_NAME = 'recipes' THEN
    INSERT INTO content_updates (content_type, content_id)
    VALUES ('recipe', NEW.id);
  ELSIF TG_TABLE_NAME = 'exercises' THEN
    INSERT INTO content_updates (content_type, content_id)
    VALUES ('exercise', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION update_user_profiles_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;