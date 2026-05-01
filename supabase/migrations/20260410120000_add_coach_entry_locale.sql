ALTER TABLE public.coach_entries
  ADD COLUMN IF NOT EXISTS locale text;

CREATE INDEX IF NOT EXISTS idx_coach_entries_user_persona_locale_generated_at
  ON public.coach_entries(user_id, persona_key, locale, generated_at DESC)
  WHERE status = 'ready' AND generated_at IS NOT NULL;

SELECT pg_notify('pgrst', 'reload schema');
