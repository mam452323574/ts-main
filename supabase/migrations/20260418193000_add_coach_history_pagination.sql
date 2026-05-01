CREATE INDEX IF NOT EXISTS idx_coach_entries_history_ready_sort
  ON public.coach_entries(
    user_id,
    (COALESCE(generated_at, created_at)) DESC,
    created_at DESC,
    id DESC
  )
  WHERE status = 'ready'
    AND title IS NOT NULL
    AND btrim(title) <> ''
    AND body IS NOT NULL
    AND btrim(body) <> '';

CREATE OR REPLACE FUNCTION public.get_coach_history_page(
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

CREATE OR REPLACE FUNCTION public.get_coach_history_summary(
  p_exclude_entry_id uuid DEFAULT NULL
)
RETURNS TABLE (
  total_count bigint,
  latest_entry_at timestamptz
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, auth
AS $$
  SELECT
    COUNT(*)::bigint AS total_count,
    MAX(COALESCE(entry.generated_at, entry.created_at)) AS latest_entry_at
  FROM public.coach_entries AS entry
  WHERE entry.user_id = auth.uid()
    AND entry.status = 'ready'
    AND entry.title IS NOT NULL
    AND btrim(entry.title) <> ''
    AND entry.body IS NOT NULL
    AND btrim(entry.body) <> ''
    AND (p_exclude_entry_id IS NULL OR entry.id <> p_exclude_entry_id);
$$;

GRANT EXECUTE ON FUNCTION public.get_coach_history_page(integer, timestamptz, timestamptz, uuid, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_coach_history_summary(uuid)
  TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
