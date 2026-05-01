-- Expose coach prompt_type as a first-class column so history, filtering and
-- analytics no longer need to dig into request_payload_json.

ALTER TABLE public.coach_entries
  ADD COLUMN IF NOT EXISTS prompt_type text;

-- Backfill from the legacy location inside request_payload_json so pre-existing
-- entries surface their mode to the app without a rewrite of the webhook
-- producer. Only touch rows that still have a NULL column so re-running the
-- migration is safe.
UPDATE public.coach_entries
SET prompt_type = request_payload_json->>'prompt_type'
WHERE prompt_type IS NULL
  AND request_payload_json ? 'prompt_type'
  AND request_payload_json->>'prompt_type' IN (
    'latest_scan',
    'weekly_plan',
    'nutrition_focus',
    'body_focus',
    'face_focus'
  );

-- Keep the set open-ended-ish: any future mode added to the app must also be
-- added here. Values outside the set are rejected so the column can be trusted.
ALTER TABLE public.coach_entries
  DROP CONSTRAINT IF EXISTS coach_entries_prompt_type_check;

ALTER TABLE public.coach_entries
  ADD CONSTRAINT coach_entries_prompt_type_check CHECK (
    prompt_type IS NULL
    OR prompt_type IN (
      'latest_scan',
      'weekly_plan',
      'nutrition_focus',
      'body_focus',
      'face_focus'
    )
  );

-- Partial index tuned for the most frequent read path: fetching the latest
-- ready entry for a given (user, persona, prompt_type) tuple.
CREATE INDEX IF NOT EXISTS idx_coach_entries_user_persona_prompt_ready_sort
  ON public.coach_entries(
    user_id,
    persona_key,
    prompt_type,
    (COALESCE(generated_at, created_at)) DESC
  )
  WHERE status = 'ready'
    AND title IS NOT NULL
    AND btrim(title) <> ''
    AND body IS NOT NULL
    AND btrim(body) <> '';

-- Update the history RPC so paginated results expose prompt_type alongside the
-- other persisted fields. Recreating with the same signature preserves the
-- existing grants and clients.
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
