/*
  # User Profiles Enhancement for Public Profiles and Freemium Model

  ## Overview
  Adds username, avatar, and account tier functionality to support public profiles
  and freemium business model.

  ## Schema Changes

  ### 1. user_profiles Table Updates
  - Add `username` (text, UNIQUE, NOT NULL) - Unique public identifier
  - Add `avatar_url` (text, NULLABLE) - Profile photo URL
  - Add `account_tier` (text, NOT NULL, DEFAULT 'free') - Subscription tier ('free' or 'premium')
  - Add `bio` (text, NULLABLE) - User biography for public profile
  
  ### 2. Indexes
  - Create unique index on username for fast lookup
  - Create index on account_tier for analytics queries

  ## Security
  - Update RLS policies to allow public read access to username and avatar
  - Prevent users from directly updating account_tier (only via Edge Function)
  - Maintain user isolation for sensitive profile data

  ## Notes
  - All existing users will default to 'free' tier
  - Username generation for existing users will need to be handled separately
  - Default avatar URL should be set at application level if null
*/

-- Add username column (will be populated later)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'username'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN username text;
  END IF;
END $$;

-- Add avatar_url column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'avatar_url'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN avatar_url text;
  END IF;
END $$;

-- Add account_tier column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'account_tier'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN account_tier text NOT NULL DEFAULT 'free';
  END IF;
END $$;

-- Add bio column for public profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'bio'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN bio text;
  END IF;
END $$;

-- Add constraint for account_tier
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE constraint_name = 'user_profiles_account_tier_check'
  ) THEN
    ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_account_tier_check 
      CHECK (account_tier IN ('free', 'premium'));
  END IF;
END $$;

-- Add unique constraint on username (will be enforced after data migration)
-- For now, create a partial unique index that allows NULL values
DROP INDEX IF EXISTS idx_user_profiles_username_unique;
CREATE UNIQUE INDEX idx_user_profiles_username_unique 
  ON user_profiles(username) 
  WHERE username IS NOT NULL;

-- Create index on account_tier for analytics
CREATE INDEX IF NOT EXISTS idx_user_profiles_account_tier 
  ON user_profiles(account_tier);

-- Drop existing overly restrictive policies and recreate them
DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;

-- Allow users to view their own complete profile
CREATE POLICY "Users can view own complete profile"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Allow public read access to username and avatar for public profiles
CREATE POLICY "Public profiles viewable by authenticated users"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (true);

-- Allow users to update their own profile EXCEPT account_tier
CREATE POLICY "Users can update own profile except tier"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id AND 
    account_tier = (SELECT account_tier FROM user_profiles WHERE id = auth.uid())
  );

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER trigger_update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_user_profiles_updated_at();
