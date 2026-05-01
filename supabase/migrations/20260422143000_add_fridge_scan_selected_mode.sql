ALTER TABLE public.fridge_scans
ADD COLUMN IF NOT EXISTS selected_mode text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fridge_scans_selected_mode_check'
  ) THEN
    ALTER TABLE public.fridge_scans
    ADD CONSTRAINT fridge_scans_selected_mode_check
    CHECK (
      selected_mode IS NULL
      OR selected_mode IN ('diet', 'muscle_gain', 'gourmand')
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_fridge_scans_user_status_created_at
  ON public.fridge_scans(user_id, status, created_at DESC);

SELECT pg_notify('pgrst', 'reload schema');
