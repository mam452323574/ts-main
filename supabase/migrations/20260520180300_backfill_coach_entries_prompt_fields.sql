-- Backfill coach_entries.prompt_type / question_key / question_text from
-- request_payload_json for legacy rows. Prerequisite for migration
-- 20260520140100_add_get_coach_history_page_v2 — the new RPC drops the
-- request_payload_json column from its output so the dedicated columns must
-- be populated everywhere they have data.
--
-- History of partial backfills:
--   * 20260423120000 backfilled 5 prompt_type values (latest_scan, weekly_plan,
--     nutrition_focus, body_focus, face_focus).
--   * 20260423160000 extended the CHECK to 10 values but did NOT re-backfill.
--   * 20260514130000 extended the CHECK to 12 values but did NOT re-backfill.
--   * 20260512103000 backfilled question_key / question_text.
--
-- This migration closes the gap by:
--   1. Backfilling the 7 remaining prompt_type values.
--   2. Mapping the legacy `trend_comparison` alias to `trend_review`
--      (cf. COACH_PROMPT_TYPE_ALIASES in shared/coachPromptTypes.ts).
--   3. Re-running the question_key / question_text backfill defensively
--      (idempotent — only touches NULL columns).
--
-- All UPDATE statements are idempotent (filter on the destination column
-- being NULL) so re-running this migration has no effect.

-- 1. Backfill remaining prompt_type values where the row has a NULL column
--    and request_payload_json holds an accepted value.
UPDATE public.coach_entries
SET prompt_type = request_payload_json->>'prompt_type'
WHERE prompt_type IS NULL
  AND request_payload_json ? 'prompt_type'
  AND request_payload_json->>'prompt_type' IN (
    'recovery_plan',
    'hydration_focus',
    'sleep_coach',
    'risk_watch',
    'trend_review',
    'latest_scan_issue_resolution',
    'free_question'
  );

-- 2. Map the legacy `trend_comparison` alias to its canonical value.
--    The CHECK constraint does NOT accept `trend_comparison`, so any row that
--    stored it raw in request_payload_json must be normalised here.
UPDATE public.coach_entries
SET prompt_type = 'trend_review'
WHERE prompt_type IS NULL
  AND request_payload_json ? 'prompt_type'
  AND request_payload_json->>'prompt_type' = 'trend_comparison';

-- 3. Defensive re-backfill for question_key / question_text. The earlier
--    migration (20260512103000) already does this; running it again is a
--    no-op unless new legacy rows have been added in the meantime.
UPDATE public.coach_entries
SET
  question_key = COALESCE(
    question_key,
    NULLIF(btrim(request_payload_json->>'question_key'), '')
  ),
  question_text = COALESCE(
    question_text,
    NULLIF(
      left(
        regexp_replace(
          btrim(COALESCE(request_payload_json->>'question_text', '')),
          '\s+',
          ' ',
          'g'
        ),
        200
      ),
      ''
    )
  )
WHERE question_key IS NULL OR question_text IS NULL;

NOTIFY pgrst, 'reload schema';
