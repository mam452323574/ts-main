/*
  # Fix Remaining Function Search Path Issues

  ## Overview
  This migration fixes the remaining two functions that still have mutable search paths:
  - `add_disposable_domain` 
  - `construct_avatar_storage_url`

  It also removes duplicate function definitions that were causing issues.

  ## Changes Made
  
  1. Drop all versions of the problematic functions
  2. Recreate them with immutable search_path set to 'public, auth'
  3. Ensure proper security with SECURITY DEFINER
  
  ## Security Impact
  - Enhanced: Functions now have immutable search paths preventing injection attacks
  - No changes to function behavior or access control
*/

-- =====================================================
-- Drop all versions of the problematic functions
-- =====================================================

-- Drop all versions of add_disposable_domain
DROP FUNCTION IF EXISTS public.add_disposable_domain(text) CASCADE;
DROP FUNCTION IF EXISTS public.add_disposable_domain(text, text) CASCADE;

-- Drop all versions of construct_avatar_storage_url  
DROP FUNCTION IF EXISTS public.construct_avatar_storage_url(text) CASCADE;
DROP FUNCTION IF EXISTS public.construct_avatar_storage_url(uuid, text) CASCADE;

-- =====================================================
-- Recreate functions with immutable search_path
-- =====================================================

-- add_disposable_domain - Simple version for adding domains
CREATE OR REPLACE FUNCTION public.add_disposable_domain(p_domain text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, auth
AS $$
BEGIN
  INSERT INTO disposable_email_domains (domain, active)
  VALUES (lower(p_domain), true)
  ON CONFLICT (domain) DO UPDATE SET active = true;
END;
$$;

-- construct_avatar_storage_url - Build full URL for avatar
CREATE OR REPLACE FUNCTION public.construct_avatar_storage_url(p_storage_path text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, auth
AS $$
BEGIN
  IF p_storage_path IS NULL THEN
    RETURN NULL;
  END IF;
  
  RETURN format('%s/storage/v1/object/public/avatars/%s',
    current_setting('app.settings.supabase_url', true),
    p_storage_path
  );
END;
$$;

-- Add comments for documentation
COMMENT ON FUNCTION public.add_disposable_domain(text) IS 
  'Adds a domain to the disposable email domains list. Domain is automatically lowercased.';

COMMENT ON FUNCTION public.construct_avatar_storage_url(text) IS 
  'Constructs a full public URL for an avatar given its storage path.';
