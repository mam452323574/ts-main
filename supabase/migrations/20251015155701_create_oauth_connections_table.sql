/*
  # OAuth Connections Table

  ## Overview
  Creates a table to manage multiple authentication methods for a single user account.
  Allows users to link Google, Apple, and email authentication to one profile.

  ## New Tables

  ### oauth_connections
  - `id` (uuid, primary key) - Unique connection identifier
  - `user_id` (uuid, references user_profiles) - Link to user profile
  - `provider` (text) - OAuth provider name ('google', 'apple', 'email')
  - `provider_user_id` (text) - User ID from the OAuth provider
  - `provider_email` (text) - Email from the OAuth provider
  - `linked_at` (timestamptz) - When the connection was created
  - `metadata` (jsonb) - Additional provider-specific data

  ## Features
  - Composite unique constraint on (user_id, provider) - one connection per provider per user
  - Unique constraint on (provider, provider_user_id) - prevent duplicate provider accounts
  - Track when connections were linked for audit purposes
  - Store provider metadata for profile enrichment (avatar, display name, etc.)

  ## Security
  - Enable RLS on oauth_connections table
  - Users can only view and manage their own OAuth connections
  - Prevent direct manipulation of connections for security

  ## Use Cases
  - User signs up with email, later adds Google login
  - User signs up with Google, later adds email/password
  - Detect existing accounts when user tries to sign in with different provider
  - Allow unlinking of OAuth providers (keeping at least one active)
*/

-- Create oauth_connections table
CREATE TABLE IF NOT EXISTS oauth_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google', 'apple', 'email')),
  provider_user_id text NOT NULL,
  provider_email text,
  linked_at timestamptz DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb,
  UNIQUE(user_id, provider),
  UNIQUE(provider, provider_user_id)
);

-- Enable RLS
ALTER TABLE oauth_connections ENABLE ROW LEVEL SECURITY;

-- Users can view their own OAuth connections
CREATE POLICY "Users can view own oauth connections"
  ON oauth_connections FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can insert their own OAuth connections (linking new providers)
CREATE POLICY "Users can link new oauth providers"
  ON oauth_connections FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own OAuth connections (unlinking providers)
-- Note: Application logic should ensure at least one auth method remains
CREATE POLICY "Users can unlink oauth providers"
  ON oauth_connections FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_oauth_connections_user_id 
  ON oauth_connections(user_id);

CREATE INDEX IF NOT EXISTS idx_oauth_connections_provider_user 
  ON oauth_connections(provider, provider_user_id);

CREATE INDEX IF NOT EXISTS idx_oauth_connections_provider_email 
  ON oauth_connections(provider_email);

-- Function to check if user has email auth method
CREATE OR REPLACE FUNCTION user_has_email_auth(p_user_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM oauth_connections 
    WHERE user_id = p_user_id AND provider = 'email'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user has any OAuth method
CREATE OR REPLACE FUNCTION user_has_oauth_method(p_user_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM oauth_connections 
    WHERE user_id = p_user_id AND provider IN ('google', 'apple')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
