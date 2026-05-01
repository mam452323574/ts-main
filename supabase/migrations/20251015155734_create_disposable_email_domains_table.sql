/*
  # Disposable Email Domains Table

  ## Overview
  Creates a table to store and manage blacklisted disposable email domains.
  This prevents users from registering with temporary email services.

  ## New Tables

  ### disposable_email_domains
  - `id` (uuid, primary key) - Unique identifier
  - `domain` (text, UNIQUE, NOT NULL) - The blacklisted domain (e.g., 'temp-mail.org')
  - `added_at` (timestamptz) - When the domain was added to blacklist
  - `added_by` (uuid, NULLABLE) - Admin user who added the domain
  - `active` (boolean) - Whether this domain is currently blocked
  - `notes` (text) - Optional notes about why this domain was blocked

  ## Features
  - Dynamic management of disposable email providers
  - Can be updated without application redeployment
  - Support for enabling/disabling domains without deletion
  - Audit trail of who added domains and when
  - Fast lookup via unique index on domain

  ## Security
  - Enable RLS on disposable_email_domains table
  - Public read access for validation during signup
  - Only admins can insert/update/delete (future admin panel)
  - All authenticated users can read for client-side validation

  ## Initial Data
  - Seeds common disposable email providers
  - Can be expanded over time via admin interface
*/

-- Create disposable_email_domains table
CREATE TABLE IF NOT EXISTS disposable_email_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text UNIQUE NOT NULL,
  added_at timestamptz DEFAULT now(),
  added_by uuid,
  active boolean DEFAULT true,
  notes text
);

-- Enable RLS
ALTER TABLE disposable_email_domains ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read active disposable domains for validation
CREATE POLICY "Authenticated users can view active disposable domains"
  ON disposable_email_domains FOR SELECT
  TO authenticated
  USING (active = true);

-- Create index for fast domain lookups
CREATE INDEX IF NOT EXISTS idx_disposable_email_domains_domain 
  ON disposable_email_domains(domain) WHERE active = true;

-- Seed initial list of common disposable email providers
INSERT INTO disposable_email_domains (domain, notes, active) VALUES
  ('10minutemail.com', 'Popular temporary email service', true),
  ('guerrillamail.com', 'Temporary email service', true),
  ('temp-mail.org', 'Temporary email service', true),
  ('tempmail.com', 'Temporary email service', true),
  ('throwaway.email', 'Temporary email service', true),
  ('mailinator.com', 'Public temporary email service', true),
  ('maildrop.cc', 'Disposable email service', true),
  ('getnada.com', 'Temporary email service', true),
  ('trashmail.com', 'Disposable email service', true),
  ('yopmail.com', 'Temporary email service', true),
  ('fakeinbox.com', 'Fake inbox service', true),
  ('spamgourmet.com', 'Disposable email forwarding', true),
  ('mailcatch.com', 'Temporary email service', true),
  ('sharklasers.com', 'Guerrilla Mail domain', true),
  ('grr.la', 'Guerrilla Mail domain', true),
  ('guerrillamail.biz', 'Guerrilla Mail domain', true),
  ('guerrillamail.de', 'Guerrilla Mail domain', true),
  ('spam4.me', 'Temporary email service', true),
  ('mail.tm', 'Temporary email service', true),
  ('mohmal.com', 'Temporary email service', true),
  ('emailondeck.com', 'Temporary email service', true),
  ('mintemail.com', 'Temporary email service', true),
  ('mytemp.email', 'Temporary email service', true),
  ('tempmail.net', 'Temporary email service', true),
  ('getairmail.com', 'Temporary email service', true),
  ('dispostable.com', 'Temporary email service', true),
  ('burnermail.io', 'Disposable email forwarding', true),
  ('33mail.com', 'Disposable email forwarding', true),
  ('emailfake.com', 'Fake email generator', true),
  ('temp-mail.io', 'Temporary email service', true)
ON CONFLICT (domain) DO NOTHING;

-- Function to check if an email domain is disposable
CREATE OR REPLACE FUNCTION is_disposable_email_domain(email_address text)
RETURNS boolean AS $$
DECLARE
  email_domain text;
BEGIN
  -- Extract domain from email
  email_domain := LOWER(SPLIT_PART(email_address, '@', 2));
  
  -- Check if domain exists in blacklist
  RETURN EXISTS (
    SELECT 1 FROM disposable_email_domains 
    WHERE domain = email_domain AND active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to add a new disposable domain (for future admin use)
CREATE OR REPLACE FUNCTION add_disposable_domain(
  p_domain text,
  p_notes text DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_domain_id uuid;
BEGIN
  INSERT INTO disposable_email_domains (domain, notes, added_by)
  VALUES (LOWER(p_domain), p_notes, auth.uid())
  RETURNING id INTO v_domain_id;
  
  RETURN v_domain_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
