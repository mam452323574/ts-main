ALTER TABLE public.coach_entries
  ADD COLUMN IF NOT EXISTS question_key text;

ALTER TABLE public.coach_entries
  ADD COLUMN IF NOT EXISTS question_text text;

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

ALTER TABLE public.coach_entries
  DROP CONSTRAINT IF EXISTS coach_entries_question_text_length_check;

ALTER TABLE public.coach_entries
  ADD CONSTRAINT coach_entries_question_text_length_check CHECK (
    question_text IS NULL OR char_length(question_text) <= 200
  );

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
    COALESCE(
      entry.question_key,
      NULLIF(btrim(entry.request_payload_json->>'question_key'), '')
    ) AS question_key,
    COALESCE(
      entry.question_text,
      NULLIF(btrim(entry.request_payload_json->>'question_text'), '')
    ) AS question_text,
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
