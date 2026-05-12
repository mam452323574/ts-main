ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS inferred_persona jsonb DEFAULT '{}'::jsonb;

-- Backfill any existing rows that have NULL (pre-default rows) with the empty
-- object so the JSONB shape is consistent for application code.
UPDATE public.user_profiles
SET inferred_persona = '{}'::jsonb
WHERE inferred_persona IS NULL;

COMMENT ON COLUMN public.user_profiles.inferred_persona IS
  'Accumulated coach-driven profile inferences (detected_diet_signals, detected_strong_focus, suggested_goals, suggested_persona_key, last_updated_at, update_count). Updated server-side via ApiService.applyCoachProfileUpdates each time a coach entry returns content.profile_updates.';

SELECT pg_notify('pgrst', 'reload schema');
