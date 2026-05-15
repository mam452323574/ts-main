-- Add the hidden Coach generation prompt used for user-authored free questions.
-- Preset-backed modes keep their historical 200 character question limit;
-- free_question stores the full normalized user question up to 800 characters.

ALTER TABLE public.coach_entries
  DROP CONSTRAINT IF EXISTS coach_entries_prompt_type_check;

ALTER TABLE public.coach_entries
  ADD CONSTRAINT coach_entries_prompt_type_check CHECK (
    prompt_type IS NULL
    OR prompt_type IN (
      'latest_scan',
      'latest_scan_issue_resolution',
      'free_question',
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

ALTER TABLE public.coach_entries
  DROP CONSTRAINT IF EXISTS coach_entries_question_text_length_check;

ALTER TABLE public.coach_entries
  ADD CONSTRAINT coach_entries_question_text_length_check CHECK (
    (
      prompt_type = 'free_question'
      AND question_text IS NOT NULL
      AND char_length(btrim(question_text)) BETWEEN 1 AND 800
    )
    OR (
      prompt_type IS DISTINCT FROM 'free_question'
      AND (
        question_text IS NULL
        OR char_length(question_text) <= 200
      )
    )
  );

SELECT pg_notify('pgrst', 'reload schema');
