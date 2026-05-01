/*
  # Subscription Status and Expiration Support

  ## Overview
  Adds support for tracking subscription expiration and detailed status.

  ## Schema Changes

  ### 1. user_profiles Table Updates
  - Add `subscription_status` (text, DEFAULT 'inactive') - 'active', 'inactive', 'canceled', 'past_due'
  - Add `subscription_expiry_date` (timestamptz, NULLABLE) - When the current period ends
  - Add `subscription_platform` (text, NULLABLE) - 'ios', 'android', 'stripe', 'web'

  ## Indexes
  - Index on subscription_expiry_date for cron jobs or queries
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'subscription_status'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN subscription_status text DEFAULT 'inactive';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'subscription_expiry_date'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN subscription_expiry_date timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'subscription_platform'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN subscription_platform text;
  END IF;
END $$;

-- Index for expiration queries
CREATE INDEX IF NOT EXISTS idx_user_profiles_subscription_expiry 
  ON user_profiles(subscription_expiry_date);
