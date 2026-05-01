/*
  # Update RLS Policies for Authentication

  ## Overview
  Updates RLS policies to properly handle authentication with Supabase Auth.
  Adds INSERT policy for user_profiles to allow new user registration.

  ## Changes
  1. Add INSERT policy for user_profiles table
    - Allows authenticated users to create their own profile
    - Ensures users can only create profile with their own user ID

  ## Security
  - Users can only insert their own profile data
  - Profile creation is restricted to authenticated users
*/

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;

-- Create INSERT policy for user_profiles
CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);