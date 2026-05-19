-- Defense-in-depth (C-09 of COACH_SECURITY_AUDIT_2026_05).
-- Cap coach_entries.disclaimer at 1000 chars so a misbehaving provider or a
-- buggy backfill cannot store an arbitrarily long disclaimer that would bloat
-- the row and degrade pagination perf.
--
-- The default disclaimer string written by 20260406223000_phase5_phase6_phase7
-- is ~60 chars. The provider-derived disclaimer is bounded by the LLM contract
-- but is not enforced server-side until this migration. 1000 chars gives a
-- generous margin over any realistic UI display surface.
--
-- Idempotent via DROP CONSTRAINT IF EXISTS, the standard pattern in this repo.

ALTER TABLE public.coach_entries
  DROP CONSTRAINT IF EXISTS coach_entries_disclaimer_length_check;

ALTER TABLE public.coach_entries
  ADD CONSTRAINT coach_entries_disclaimer_length_check
  CHECK (disclaimer IS NULL OR char_length(disclaimer) <= 1000);

NOTIFY pgrst, 'reload schema';
-- Defense-in-depth (N-F of COACH_SECURITY_AUDIT_2026_05).
-- The three coach conversation tables expose `metadata jsonb` columns that are
-- currently bounded only by the service-role contract (Edge Functions are the
-- sole writers). Add soft size CHECKs so a future drift (bug or new code path)
-- cannot write arbitrarily large JSONB blobs that would bloat the row and
-- degrade pagination perf.
--
-- Sizes are generous on purpose:
--   * 4 KB for conversations / messages — typical writes are <100 bytes
--     ({"auto_generated": true, "kind": "welcome"}). 4 KB lets us extend the
--     contract later without bumping the constraint.
--   * 2 KB for coach_free_conversation_state — never expected to grow.
--
-- The CHECK also enforces that metadata is a JSON object, not an array/null,
-- aligning with the NOT NULL DEFAULT '{}'::jsonb declaration in the parent
-- table definition.

ALTER TABLE public.coach_conversations
  DROP CONSTRAINT IF EXISTS coach_conversations_metadata_size_check;

ALTER TABLE public.coach_conversations
  ADD CONSTRAINT coach_conversations_metadata_size_check
  CHECK (jsonb_typeof(metadata) = 'object' AND length(metadata::text) <= 4096);

ALTER TABLE public.coach_conversation_messages
  DROP CONSTRAINT IF EXISTS coach_conversation_messages_metadata_size_check;

ALTER TABLE public.coach_conversation_messages
  ADD CONSTRAINT coach_conversation_messages_metadata_size_check
  CHECK (jsonb_typeof(metadata) = 'object' AND length(metadata::text) <= 4096);

ALTER TABLE public.coach_free_conversation_state
  DROP CONSTRAINT IF EXISTS coach_free_conversation_state_metadata_size_check;

ALTER TABLE public.coach_free_conversation_state
  ADD CONSTRAINT coach_free_conversation_state_metadata_size_check
  CHECK (jsonb_typeof(metadata) = 'object' AND length(metadata::text) <= 2048);

NOTIFY pgrst, 'reload schema';
-- Defense-in-depth (C-06 of COACH_SECURITY_AUDIT). The conversation tables
-- created in 20260524150000 ship with explicit INSERT/UPDATE/DELETE BLOCK
-- policies for the `authenticated` role so an accidental future GRANT to
-- authenticated cannot bypass the service-role-only mutation contract.
--
-- Back-port the same pattern to the original coach_entries table. Today only
-- SELECT is granted to authenticated (see 20260406120000:357), and no policy
-- explicitly denies the other operations — adding the BLOCK policies plus a
-- redundant REVOKE keeps the table on the same hardening level as the new
-- ones.
--
-- This migration is purely additive: no existing client can write to
-- coach_entries today (the Edge Functions use service_role which bypasses
-- RLS), so no behaviour change is expected.

DROP POLICY IF EXISTS "coach_entries_block_insert" ON public.coach_entries;
CREATE POLICY "coach_entries_block_insert"
  ON public.coach_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "coach_entries_block_update" ON public.coach_entries;
CREATE POLICY "coach_entries_block_update"
  ON public.coach_entries
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "coach_entries_block_delete" ON public.coach_entries;
CREATE POLICY "coach_entries_block_delete"
  ON public.coach_entries
  FOR DELETE
  TO authenticated
  USING (false);

REVOKE INSERT, UPDATE, DELETE ON TABLE public.coach_entries FROM authenticated;

NOTIFY pgrst, 'reload schema';
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
-- C-05 of COACH_SECURITY_AUDIT_2026_05: new `get_coach_history_page_v2` RPC
-- that omits the five internal columns (request_payload_json,
-- response_payload_json, cache_key, input_hash, error_code).
--
-- The original v1 RPC stays in place so the frontend can roll out v2 at its
-- own pace and roll back without a DB change. v1 will be dropped in a later
-- migration once the frontend no longer references it.
--
-- Prerequisite: migration 20260520180300_backfill_coach_entries_prompt_fields
-- has already populated prompt_type / question_key / question_text on legacy
-- rows so v2 no longer needs to fall back to request_payload_json.

CREATE OR REPLACE FUNCTION public.get_coach_history_page_v2(
  p_limit integer DEFAULT 10,
  p_cursor_sort_at timestamptz DEFAULT NULL,
  p_cursor_created_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL,
  p_exclude_entry_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  title text,
  body text,
  disclaimer text,
  persona_key text,
  prompt_type text,
  question_key text,
  question_text text,
  response_version smallint,
  content_json jsonb,
  cta_label text,
  cta_route text,
  created_at timestamptz,
  source text,
  locale text,
  status text,
  expires_at timestamptz,
  generated_at timestamptz
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, auth
AS $$
  SELECT
    entry.id,
    entry.user_id,
    entry.title,
    entry.body,
    entry.disclaimer,
    entry.persona_key,
    entry.prompt_type,
    entry.question_key,
    entry.question_text,
    entry.response_version,
    entry.content_json,
    entry.cta_label,
    entry.cta_route,
    entry.created_at,
    entry.source,
    entry.locale,
    entry.status,
    entry.expires_at,
    entry.generated_at
  FROM public.coach_entries AS entry
  WHERE entry.user_id = auth.uid()
    AND entry.status = 'ready'
    AND entry.title IS NOT NULL
    AND btrim(entry.title) <> ''
    AND entry.body IS NOT NULL
    AND btrim(entry.body) <> ''
    AND (p_exclude_entry_id IS NULL OR entry.id <> p_exclude_entry_id)
    AND (
      p_cursor_sort_at IS NULL
      OR COALESCE(entry.generated_at, entry.created_at) < p_cursor_sort_at
      OR (
        COALESCE(entry.generated_at, entry.created_at) = p_cursor_sort_at
        AND (
          entry.created_at < p_cursor_created_at
          OR (
            entry.created_at = p_cursor_created_at
            AND entry.id < p_cursor_id
          )
        )
      )
    )
  ORDER BY
    COALESCE(entry.generated_at, entry.created_at) DESC,
    entry.created_at DESC,
    entry.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 101);
$$;

GRANT EXECUTE ON FUNCTION public.get_coach_history_page_v2(integer, timestamptz, timestamptz, uuid, uuid)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
-- N-D of COACH_SECURITY_AUDIT_2026_05: rate limit the `coach-screen-snapshot`
-- Edge Function. The UI calls it ~1× per Coach screen open, so we pick a
-- generous default (30/min, 600/h, 2000/day). Same shape and pattern as
-- `record_coach_generation_attempt` (migration 20260426190000) so the calling
-- code can reuse the existing 429 handling.
--
-- A dedicated attempts table keeps the snapshot counter separate from the
-- generation counter — a user opening Coach 20× / minute (UX glitch, fast
-- swiping) should not consume their LLM rate budget.

CREATE TABLE IF NOT EXISTS public.coach_snapshot_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coach_snapshot_attempts_user_attempted_at
  ON public.coach_snapshot_attempts(user_id, attempted_at DESC);

ALTER TABLE public.coach_snapshot_attempts ENABLE ROW LEVEL SECURITY;

-- No policies for authenticated/anon: only service_role (which bypasses RLS)
-- may read/write. Keeps the attempt log out of reach of client code.

CREATE OR REPLACE FUNCTION public.record_coach_snapshot_attempt(
  p_user_id uuid,
  p_per_minute integer DEFAULT 30,
  p_per_hour integer DEFAULT 600,
  p_per_day integer DEFAULT 2000
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_minute_count integer;
  v_hour_count integer;
  v_day_count integer;
  v_window_exceeded text;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  IF COALESCE(p_per_minute, 0) < 1
     OR COALESCE(p_per_hour, 0) < 1
     OR COALESCE(p_per_day, 0) < 1 THEN
    RAISE EXCEPTION 'rate limit windows must be positive integers';
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE attempted_at > v_now - interval '1 minute'),
    COUNT(*) FILTER (WHERE attempted_at > v_now - interval '1 hour'),
    COUNT(*) FILTER (WHERE attempted_at > v_now - interval '1 day')
  INTO v_minute_count, v_hour_count, v_day_count
  FROM public.coach_snapshot_attempts
  WHERE user_id = p_user_id
    AND attempted_at > v_now - interval '1 day';

  IF v_minute_count >= p_per_minute THEN
    v_window_exceeded := 'minute';
  ELSIF v_hour_count >= p_per_hour THEN
    v_window_exceeded := 'hour';
  ELSIF v_day_count >= p_per_day THEN
    v_window_exceeded := 'day';
  END IF;

  IF v_window_exceeded IS NOT NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'window_exceeded', v_window_exceeded,
      'attempts_minute', v_minute_count,
      'attempts_hour', v_hour_count,
      'attempts_day', v_day_count
    );
  END IF;

  INSERT INTO public.coach_snapshot_attempts(user_id, attempted_at)
  VALUES (p_user_id, v_now);

  -- Garbage-collect rows older than 25h for this user to keep the table
  -- bounded (the longest sliding window is 24h; 25h gives a safety margin).
  DELETE FROM public.coach_snapshot_attempts
  WHERE user_id = p_user_id
    AND attempted_at < v_now - interval '25 hours';

  RETURN jsonb_build_object(
    'allowed', true,
    'attempts_minute', v_minute_count + 1,
    'attempts_hour', v_hour_count + 1,
    'attempts_day', v_day_count + 1
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_coach_snapshot_attempt(uuid, integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_coach_snapshot_attempt(uuid, integer, integer, integer) TO service_role;

SELECT pg_notify('pgrst', 'reload schema');
-- N-C of COACH_SECURITY_AUDIT_2026_05: rate limit the
-- `coach-sync-profile-memory` Edge Function. Profile-memory sync is an
-- expensive operation (per-row read + merge + write) so the defaults are
-- restrictive (2/min, 10/h, 30/day). Same shape as
-- `record_coach_generation_attempt` and `record_coach_snapshot_attempt`.

CREATE TABLE IF NOT EXISTS public.coach_profile_sync_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coach_profile_sync_attempts_user_attempted_at
  ON public.coach_profile_sync_attempts(user_id, attempted_at DESC);

ALTER TABLE public.coach_profile_sync_attempts ENABLE ROW LEVEL SECURITY;

-- No policies for authenticated/anon: only service_role (which bypasses RLS)
-- may read/write. Keeps the attempt log out of reach of client code.

CREATE OR REPLACE FUNCTION public.record_coach_profile_sync_attempt(
  p_user_id uuid,
  p_per_minute integer DEFAULT 2,
  p_per_hour integer DEFAULT 10,
  p_per_day integer DEFAULT 30
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_minute_count integer;
  v_hour_count integer;
  v_day_count integer;
  v_window_exceeded text;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  IF COALESCE(p_per_minute, 0) < 1
     OR COALESCE(p_per_hour, 0) < 1
     OR COALESCE(p_per_day, 0) < 1 THEN
    RAISE EXCEPTION 'rate limit windows must be positive integers';
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE attempted_at > v_now - interval '1 minute'),
    COUNT(*) FILTER (WHERE attempted_at > v_now - interval '1 hour'),
    COUNT(*) FILTER (WHERE attempted_at > v_now - interval '1 day')
  INTO v_minute_count, v_hour_count, v_day_count
  FROM public.coach_profile_sync_attempts
  WHERE user_id = p_user_id
    AND attempted_at > v_now - interval '1 day';

  IF v_minute_count >= p_per_minute THEN
    v_window_exceeded := 'minute';
  ELSIF v_hour_count >= p_per_hour THEN
    v_window_exceeded := 'hour';
  ELSIF v_day_count >= p_per_day THEN
    v_window_exceeded := 'day';
  END IF;

  IF v_window_exceeded IS NOT NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'window_exceeded', v_window_exceeded,
      'attempts_minute', v_minute_count,
      'attempts_hour', v_hour_count,
      'attempts_day', v_day_count
    );
  END IF;

  INSERT INTO public.coach_profile_sync_attempts(user_id, attempted_at)
  VALUES (p_user_id, v_now);

  -- Garbage-collect rows older than 25 hours for this user to keep the table
  -- bounded (the longest sliding window is 24 hours; 25h gives a safety margin).
  DELETE FROM public.coach_profile_sync_attempts
  WHERE user_id = p_user_id
    AND attempted_at < v_now - interval '25 hours';

  RETURN jsonb_build_object(
    'allowed', true,
    'attempts_minute', v_minute_count + 1,
    'attempts_hour', v_hour_count + 1,
    'attempts_day', v_day_count + 1
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_coach_profile_sync_attempt(uuid, integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_coach_profile_sync_attempt(uuid, integer, integer, integer) TO service_role;

SELECT pg_notify('pgrst', 'reload schema');
