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
