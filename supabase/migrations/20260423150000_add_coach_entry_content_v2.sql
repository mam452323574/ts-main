-- Coach v2: structured output contract.
-- Adds response_version + content_json to coach_entries so the client can
-- render structured sections (context_notes, priorities, action_steps,
-- warnings, primary_metric_delta, ...) while keeping legacy {title, body}
-- entries readable.

ALTER TABLE public.coach_entries
  ADD COLUMN IF NOT EXISTS response_version smallint NOT NULL DEFAULT 1;

ALTER TABLE public.coach_entries
  ADD COLUMN IF NOT EXISTS content_json jsonb;

ALTER TABLE public.coach_entries
  DROP CONSTRAINT IF EXISTS coach_entries_response_version_check;

ALTER TABLE public.coach_entries
  ADD CONSTRAINT coach_entries_response_version_check CHECK (
    response_version IN (1, 2)
  );

-- Idempotent backfill: existing rows stay on v1.
UPDATE public.coach_entries
SET response_version = 1
WHERE response_version IS NULL;

DROP FUNCTION IF EXISTS public.get_coach_history_page(integer, timestamptz, timestamptz, uuid, uuid);

CREATE FUNCTION public.get_coach_history_page(
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
  response_version smallint,
  content_json jsonb,
  cta_label text,
  cta_route text,
  created_at timestamptz,
  source text,
  locale text,
  status text,
  error_code text,
  cache_key text,
  input_hash text,
  request_payload_json jsonb,
  response_payload_json jsonb,
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
    COALESCE(
      entry.prompt_type,
      entry.request_payload_json->>'prompt_type'
    ) AS prompt_type,
    entry.response_version,
    entry.content_json,
    entry.cta_label,
    entry.cta_route,
    entry.created_at,
    entry.source,
    entry.locale,
    entry.status,
    entry.error_code,
    entry.cache_key,
    entry.input_hash,
    entry.request_payload_json,
    entry.response_payload_json,
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

GRANT EXECUTE ON FUNCTION public.get_coach_history_page(integer, timestamptz, timestamptz, uuid, uuid)
  TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
