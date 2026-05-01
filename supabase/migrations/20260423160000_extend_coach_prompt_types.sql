-- Extend the allowed coach prompt_type set from 5 → 10 to unlock the full
-- mode catalogue (hydration_focus, sleep_coach, risk_watch, trend_review,
-- recovery_plan). The client-side catalogue is mirrored in
-- shared/coachPromptTypes.ts — keep both in sync when adding new modes.

ALTER TABLE public.coach_entries
  DROP CONSTRAINT IF EXISTS coach_entries_prompt_type_check;

ALTER TABLE public.coach_entries
  ADD CONSTRAINT coach_entries_prompt_type_check CHECK (
    prompt_type IS NULL
    OR prompt_type IN (
      'latest_scan',
      'weekly_plan',
      'recovery_plan',
      'nutrition_focus',
      'body_focus',
      'face_focus',
      'hydration_focus',
      'sleep_coach',
      'risk_watch',
      'trend_review'
    )
  );

SELECT pg_notify('pgrst', 'reload schema');
