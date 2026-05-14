CREATE TABLE IF NOT EXISTS public.coach_profile_update_applications (
  coach_entry_id uuid PRIMARY KEY
    REFERENCES public.coach_entries(id) ON DELETE CASCADE,
  user_id uuid NOT NULL
    REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  applied_at timestamptz NOT NULL DEFAULT now(),
  payload_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT coach_profile_update_applications_payload_snapshot_object_check
    CHECK (jsonb_typeof(payload_snapshot) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_coach_profile_update_applications_user_id_applied_at
  ON public.coach_profile_update_applications (user_id, applied_at DESC);

ALTER TABLE public.coach_profile_update_applications ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.coach_profile_update_applications FROM PUBLIC;
REVOKE ALL ON public.coach_profile_update_applications FROM anon;
REVOKE ALL ON public.coach_profile_update_applications FROM authenticated;

COMMENT ON TABLE public.coach_profile_update_applications IS
  'Exactly-once ledger for applying coach content.profile_updates into user_profiles.inferred_persona.';

COMMENT ON COLUMN public.coach_profile_update_applications.payload_snapshot IS
  'Structured snapshot of the applied content.profile_updates payload for replay/debug.';

COMMENT ON COLUMN public.user_profiles.inferred_persona IS
  'Accumulated coach-driven profile memory (detected_diet_signals, detected_strong_focus, suggested_goals, suggested_persona_key, last_updated_at, update_count). Updated server-side through coach_profile_update_applications replay.';

SELECT pg_notify('pgrst', 'reload schema');
