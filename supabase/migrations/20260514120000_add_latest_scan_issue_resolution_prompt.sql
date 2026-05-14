-- Allow the hidden coach generation prompt used when a result screen asks
-- about one exact scan. This prompt type is persisted for cache/history
-- correctness but remains absent from the visible client mode catalogue.

ALTER TABLE public.coach_entries
  DROP CONSTRAINT IF EXISTS coach_entries_prompt_type_check;

ALTER TABLE public.coach_entries
  ADD CONSTRAINT coach_entries_prompt_type_check CHECK (
    prompt_type IS NULL
    OR prompt_type IN (
      'latest_scan',
      'latest_scan_issue_resolution',
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
