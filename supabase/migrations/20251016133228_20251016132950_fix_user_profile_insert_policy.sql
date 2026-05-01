/*
  # Fix User Profile Creation - Resolve INSERT Policy Issue

  ## Problem
  Users were unable to complete profile setup because the INSERT policy on user_profiles
  was not correctly applied or was missing. This caused a silent failure where:
  1. User authenticates successfully via OAuth (Google/Apple) or email
  2. Navigation guard redirects to username-setup screen
  3. User enters username and submits
  4. UPDATE operation fails because profile doesn't exist yet
  5. User gets stuck in infinite redirect loop

  ## Root Cause
  The migration 20251011190837 created an INSERT policy, but the migration 20251015155634
  dropped and recreated SELECT and UPDATE policies without preserving the INSERT policy.
  This left user_profiles without an INSERT policy, blocking profile creation.

  ## Solution
  This migration ensures the INSERT policy exists and is correctly configured to allow
  authenticated users to create their own profile record.

  ## Changes
  1. Drop any existing INSERT policy to avoid conflicts
  2. Recreate INSERT policy with correct permissions
  3. Verify policy allows: auth.uid() = id (users can only insert their own profile)

  ## Security
  - Users can ONLY insert a profile where the id matches their auth.uid()
  - This prevents users from creating profiles for other users
  - INSERT is restricted to authenticated users only
*/

-- Drop existing INSERT policy if it exists (cleanup from previous migrations)
DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;

-- Create INSERT policy for user_profiles with correct authentication check
CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);