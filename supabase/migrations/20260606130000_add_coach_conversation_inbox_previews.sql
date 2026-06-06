-- Add lightweight message previews for the per-coach conversation inbox.
-- The existing keyset and persona/visibility filters are preserved.

BEGIN;

DROP FUNCTION IF EXISTS public.get_coach_conversations_page(
  integer, timestamptz, uuid, boolean, boolean, text
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
  metadata jsonb,
  first_user_message_preview text,
  last_message_preview text,
  last_message_at timestamptz
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
    conv.metadata,
    first_user.preview,
    latest_message.preview,
    latest_message.created_at
  FROM public.coach_conversations AS conv
  LEFT JOIN LATERAL (
    SELECT
      LEFT(regexp_replace(btrim(msg.content), '\s+', ' ', 'g'), 120) AS preview
    FROM public.coach_conversation_messages AS msg
    WHERE msg.conversation_id = conv.id
      AND msg.user_id = conv.user_id
      AND msg.role = 'user'
      AND msg.status <> 'error'
      AND btrim(msg.content) <> ''
    ORDER BY msg.created_at ASC, msg.id ASC
    LIMIT 1
  ) AS first_user ON true
  LEFT JOIN LATERAL (
    SELECT
      LEFT(regexp_replace(btrim(msg.content), '\s+', ' ', 'g'), 140) AS preview,
      msg.created_at
    FROM public.coach_conversation_messages AS msg
    WHERE msg.conversation_id = conv.id
      AND msg.user_id = conv.user_id
      AND msg.role IN ('user', 'assistant', 'system')
      AND msg.status <> 'error'
      AND btrim(msg.content) <> ''
    ORDER BY msg.created_at DESC, msg.id DESC
    LIMIT 1
  ) AS latest_message ON true
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

COMMIT;

NOTIFY pgrst, 'reload schema';
