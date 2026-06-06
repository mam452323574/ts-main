-- PROMPT 4 — Filtered conversations list by persona_key.
--
-- Adds an optional p_persona_key filter to get_coach_conversations_page so the
-- "Voir les N conversations" link from the coach hero card can land on a
-- per-coach feed (Leo, Milo, Axel…). The legacy 5-arg signature is dropped
-- because PostgREST cannot route a new default-value argument added via
-- CREATE OR REPLACE.
--
-- Also adds a partial composite index on (user_id, persona_key, updated_at,
-- id) for visible rows so the filtered keyset stays index-only.

BEGIN;

-- Drop the previous 5-arg signature so PostgREST routes the new 6-arg one.
DROP FUNCTION IF EXISTS public.get_coach_conversations_page(
  integer, timestamptz, uuid, boolean, boolean
);

CREATE FUNCTION public.get_coach_conversations_page(
  p_limit integer DEFAULT 20,
  p_cursor_updated_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL,
  p_include_archived boolean DEFAULT false,
  p_include_hidden boolean DEFAULT false,
  p_persona_key text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  title text,
  persona_key text,
  locale text,
  status text,
  message_count integer,
  user_message_count integer,
  account_tier_at_start text,
  last_user_message_at timestamptz,
  last_assistant_message_at timestamptz,
  ended_at timestamptz,
  ended_reason text,
  archived_at timestamptz,
  hidden_at timestamptz,
  metadata jsonb
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, auth
AS $$
  SELECT
    conv.id,
    conv.user_id,
    conv.created_at,
    conv.updated_at,
    conv.title,
    conv.persona_key,
    conv.locale,
    conv.status,
    conv.message_count,
    conv.user_message_count,
    conv.account_tier_at_start,
    conv.last_user_message_at,
    conv.last_assistant_message_at,
    conv.ended_at,
    conv.ended_reason,
    conv.archived_at,
    conv.hidden_at,
    conv.metadata
  FROM public.coach_conversations AS conv
  WHERE conv.user_id = auth.uid()
    AND (p_include_archived OR conv.status <> 'archived')
    AND (p_include_hidden OR conv.hidden_at IS NULL)
    AND (p_persona_key IS NULL OR conv.persona_key = p_persona_key)
    AND (
      p_cursor_updated_at IS NULL
      OR conv.updated_at < p_cursor_updated_at
      OR (
        conv.updated_at = p_cursor_updated_at
        AND conv.id < p_cursor_id
      )
    )
  ORDER BY conv.updated_at DESC, conv.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 101);
$$;

GRANT EXECUTE ON FUNCTION public.get_coach_conversations_page(
  integer, timestamptz, uuid, boolean, boolean, text
) TO authenticated;

-- Partial composite index for the per-persona filtered keyset. Restricted to
-- the rows the default call returns (visible + non-archived) so the index
-- stays small even with many archived/hidden rows.
CREATE INDEX IF NOT EXISTS idx_coach_conversations_user_persona_updated_at
  ON public.coach_conversations (user_id, persona_key, updated_at DESC, id DESC)
  WHERE hidden_at IS NULL AND status <> 'archived';

COMMIT;

NOTIFY pgrst, 'reload schema';
