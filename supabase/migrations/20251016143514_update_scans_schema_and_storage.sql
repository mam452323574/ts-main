/*
  # Update Scans Schema for Storage-Only Workflow

  ## Overview
  Updates the scans table to support the new simplified workflow where the app only stores 
  images without analyzing them. Storage bucket creation will be handled separately via Supabase Dashboard.

  ## Changes

  ### 1. Scans Table Updates
  - Updates scan_type constraint to accept 'body', 'health', 'nutrition' values
  - Makes percentage column nullable (no longer required for storage-only workflow)
  - Makes type column nullable (legacy column)
  - Adds composite index for efficient rate limit queries

  ### 2. Data Migration
  - Updates existing 'bodyfat' scan_type values to 'body' for consistency
  - Preserves all existing scan data

  ## Note
  Storage bucket 'scan-images' must be created manually in Supabase Dashboard with:
  - Public: false
  - File size limit: 10MB
  - Allowed MIME types: image/jpeg, image/jpg, image/png, image/webp
  - RLS policies for user isolation
*/

-- Update scans table: make percentage nullable
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scans' AND column_name = 'percentage'
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE scans ALTER COLUMN percentage DROP NOT NULL;
  END IF;
END $$;

-- Update scans table: make type nullable
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scans' AND column_name = 'type'
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE scans ALTER COLUMN type DROP NOT NULL;
  END IF;
END $$;

-- Update scan_type constraint to temporarily accept both old and new values
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scans' AND column_name = 'scan_type'
  ) THEN
    ALTER TABLE scans DROP CONSTRAINT IF EXISTS scans_scan_type_check;
    ALTER TABLE scans ADD CONSTRAINT scans_scan_type_check 
      CHECK (scan_type IN ('body', 'health', 'nutrition', 'bodyfat'));
  END IF;
END $$;

-- Create composite index for efficient rate limit queries
CREATE INDEX IF NOT EXISTS idx_scans_rate_limit 
ON scans(user_id, scan_type, created_at DESC);

-- Update existing 'bodyfat' scan_type to 'body' for consistency
UPDATE scans SET scan_type = 'body' WHERE scan_type = 'bodyfat';

-- Update constraint to only allow new values
DO $$
BEGIN
  ALTER TABLE scans DROP CONSTRAINT IF EXISTS scans_scan_type_check;
  ALTER TABLE scans ADD CONSTRAINT scans_scan_type_check 
    CHECK (scan_type IN ('body', 'health', 'nutrition'));
END $$;