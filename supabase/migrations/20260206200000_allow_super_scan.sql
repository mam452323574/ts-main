-- Update scan_type constraint to allow 'super' scan type
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scans' AND column_name = 'scan_type'
  ) THEN
    ALTER TABLE scans DROP CONSTRAINT IF EXISTS scans_scan_type_check;
    ALTER TABLE scans ADD CONSTRAINT scans_scan_type_check 
      CHECK (scan_type IN ('body', 'health', 'nutrition', 'super'));
  END IF;
END $$;
