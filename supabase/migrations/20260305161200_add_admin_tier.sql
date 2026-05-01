-- Add 'admin' to the allowed values for account_tier
ALTER TABLE user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_account_tier_check;

ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_account_tier_check 
  CHECK (account_tier IN ('free', 'premium', 'admin'));
