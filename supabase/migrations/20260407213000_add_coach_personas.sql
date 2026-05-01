ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS coach_persona_key text;

UPDATE public.user_profiles
SET coach_persona_key = 'gentle_supportive'
WHERE coach_persona_key IS NULL OR btrim(coach_persona_key) = '';

ALTER TABLE public.user_profiles
  ALTER COLUMN coach_persona_key SET DEFAULT 'gentle_supportive';

ALTER TABLE public.user_profiles
  ALTER COLUMN coach_persona_key SET NOT NULL;

ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_coach_persona_key_check;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_coach_persona_key_check CHECK (
    coach_persona_key IN (
      'gentle_supportive',
      'strict_tough',
      'motivational_energetic',
      'patient_calm',
      'analytical_precise',
      'playful_light'
    )
  );

ALTER TABLE public.coach_entries
  ADD COLUMN IF NOT EXISTS persona_key text;

UPDATE public.coach_entries
SET persona_key = 'gentle_supportive'
WHERE persona_key IS NULL OR btrim(persona_key) = '';

ALTER TABLE public.coach_entries
  ALTER COLUMN persona_key SET DEFAULT 'gentle_supportive';

ALTER TABLE public.coach_entries
  ALTER COLUMN persona_key SET NOT NULL;

ALTER TABLE public.coach_entries
  DROP CONSTRAINT IF EXISTS coach_entries_persona_key_check;

ALTER TABLE public.coach_entries
  ADD CONSTRAINT coach_entries_persona_key_check CHECK (
    persona_key IN (
      'gentle_supportive',
      'strict_tough',
      'motivational_energetic',
      'patient_calm',
      'analytical_precise',
      'playful_light'
    )
  );

CREATE INDEX IF NOT EXISTS idx_user_profiles_coach_persona_key
  ON public.user_profiles(coach_persona_key);

CREATE INDEX IF NOT EXISTS idx_coach_entries_user_persona_generated_at
  ON public.coach_entries(user_id, persona_key, generated_at DESC)
  WHERE generated_at IS NOT NULL;

SELECT pg_notify('pgrst', 'reload schema');
