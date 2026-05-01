/*
  # Add scan_type column to scans table

  ## Overview
  Updates the scans table to support three types of scans:
  - bodyfat: Body composition analysis
  - health: General health score analysis  
  - nutrition: Food and calorie scanning

  ## Changes
  1. Add scan_type column to scans table
    - Type: text with CHECK constraint
    - Allows: 'bodyfat', 'health', 'nutrition'
    - Default: 'bodyfat' for backwards compatibility

  2. Update type column
    - Keep existing 'muscle' and 'fat' types
    - These map to the bodyfat scan_type

  ## Migration Notes
  - Existing records will have scan_type set to 'bodyfat' by default
  - No data loss occurs during migration
*/

-- Add scan_type column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scans' AND column_name = 'scan_type'
  ) THEN
    ALTER TABLE scans ADD COLUMN scan_type text DEFAULT 'bodyfat' CHECK (scan_type IN ('bodyfat', 'health', 'nutrition'));
  END IF;
END $$;

-- Update existing records to have the correct scan_type
UPDATE scans SET scan_type = 'bodyfat' WHERE scan_type IS NULL;
