-- Coach conversation feature (track C of the audit): multi-turn chat persisted
-- separately from the existing presets/one-shot Coach entries.
--
-- Three tables are added:
--   * coach_conversations: one row per chat thread, owned by a user, with a
--     persona locked at creation time, lifecycle status, and counters that
--     enable the per-conversation message limit (20 user messages by default).
--   * coach_conversation_messages: append-only message log (user / assistant /
--     system). Idempotency is enforced via UNIQUE (user_id, client_request_id)
--     so the Edge Function can safely retry a send-message call.
--   * coach_free_conversation_state: lifetime free-tier guard. A free user is
--     allowed exactly ONE conversation, capped at 4 user messages. Once
--     consumed, the row stays around forever so the user cannot start another
--     free conversation by deleting the original.
--
-- All tables follow the same isolation rules as the rest of the Coach stack:
-- service_role owns mutations, authenticated users may only SELECT their own
-- rows (RLS), and authenticated INSERT/UPDATE/DELETE are explicitly denied
-- (defense-in-depth, addresses C-06 from COACH_SECURITY_AUDIT).

CREATE TABLE IF NOT EXISTS public.coach_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  title text,
  persona_key text NOT NULL DEFAULT 'gentle_supportive',
  locale text,
  status text NOT NULL DEFAULT 'active',
  message_count integer NOT NULL DEFAULT 0,
  user_message_count integer NOT NULL DEFAULT 0,
  account_tier_at_start text,
  last_user_message_at timestamptz,
  last_assistant_message_at timestamptz,
  ended_at timestamptz,
  ended_reason text,
  archived_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT coach_conversations_persona_key_check CHECK (
    persona_key IN (
      'gentle_supportive',
      'strict_tough',
      'motivational_energetic',
      'patient_calm',
      'analytical_precise',
      'playful_light'
    )
  ),
  CONSTRAINT coach_conversations_status_check CHECK (
    status IN ('active', 'ended', 'quota_reached', 'archived')
  ),
  CONSTRAINT coach_conversations_account_tier_check CHECK (
    account_tier_at_start IS NULL
    OR account_tier_at_start IN ('free', 'premium', 'admin')
  ),
  CONSTRAINT coach_conversations_ended_reason_check CHECK (
    ended_reason IS NULL
    OR ended_reason IN ('user_ended', 'quota_reached', 'admin', 'timeout')
  ),
  CONSTRAINT coach_conversations_title_length_check CHECK (
    title IS NULL OR char_length(title) <= 200
  ),
  CONSTRAINT coach_conversations_message_count_check CHECK (
    message_count >= 0
  ),
  CONSTRAINT coach_conversations_user_message_count_check CHECK (
    user_message_count >= 0
  )
);

CREATE INDEX IF NOT EXISTS idx_coach_conversations_user_updated_at
  ON public.coach_conversations(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_coach_conversations_user_status_updated_at
  ON public.coach_conversations(user_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_coach_conversations_user_active_not_archived
  ON public.coach_conversations(user_id, updated_at DESC)
  WHERE status = 'active';

ALTER TABLE public.coach_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coach_conversations_owner_select" ON public.coach_conversations;
CREATE POLICY "coach_conversations_owner_select"
  ON public.coach_conversations
  FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "coach_conversations_block_insert" ON public.coach_conversations;
CREATE POLICY "coach_conversations_block_insert"
  ON public.coach_conversations
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "coach_conversations_block_update" ON public.coach_conversations;
CREATE POLICY "coach_conversations_block_update"
  ON public.coach_conversations
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "coach_conversations_block_delete" ON public.coach_conversations;
CREATE POLICY "coach_conversations_block_delete"
  ON public.coach_conversations
  FOR DELETE
  TO authenticated
  USING (false);

GRANT SELECT ON public.coach_conversations TO authenticated;

DROP TRIGGER IF EXISTS phase2_set_coach_conversations_updated_at
  ON public.coach_conversations;
CREATE TRIGGER phase2_set_coach_conversations_updated_at
  BEFORE UPDATE ON public.coach_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.phase2_set_updated_at();

-- ---------------------------------------------------------------------------
-- coach_conversation_messages
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.coach_conversation_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL
    REFERENCES public.coach_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  model text,
  provider text,
  prompt_tokens integer,
  completion_tokens integer,
  generation_ms integer,
  client_request_id text,
  status text NOT NULL DEFAULT 'ready',
  error_code text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT coach_conversation_messages_role_check CHECK (
    role IN ('user', 'assistant', 'system')
  ),
  CONSTRAINT coach_conversation_messages_status_check CHECK (
    status IN ('pending', 'streaming', 'ready', 'error')
  ),
  CONSTRAINT coach_conversation_messages_content_length_check CHECK (
    char_length(btrim(content)) >= 1
    AND char_length(content) <= CASE WHEN role = 'user' THEN 2000 ELSE 8000 END
  ),
  CONSTRAINT coach_conversation_messages_tokens_check CHECK (
    (prompt_tokens IS NULL OR prompt_tokens >= 0)
    AND (completion_tokens IS NULL OR completion_tokens >= 0)
    AND (generation_ms IS NULL OR generation_ms >= 0)
  ),
  CONSTRAINT coach_conversation_messages_error_when_status_error CHECK (
    status <> 'error' OR error_code IS NOT NULL
  )
);

-- Idempotency for retry-safe send-message calls. Only enforced when the client
-- actually provides an id (we don't force one on server-generated system msgs).
CREATE UNIQUE INDEX IF NOT EXISTS coach_conversation_messages_client_request_id_unique
  ON public.coach_conversation_messages(user_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_coach_conversation_messages_conv_created
  ON public.coach_conversation_messages(conversation_id, created_at ASC, id ASC);

CREATE INDEX IF NOT EXISTS idx_coach_conversation_messages_user_role_created
  ON public.coach_conversation_messages(user_id, role, created_at DESC)
  WHERE status = 'ready';

CREATE INDEX IF NOT EXISTS idx_coach_conversation_messages_user_user_role_24h
  ON public.coach_conversation_messages(user_id, created_at DESC)
  WHERE role = 'user' AND status IN ('ready', 'streaming');

ALTER TABLE public.coach_conversation_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coach_conversation_messages_owner_select"
  ON public.coach_conversation_messages;
CREATE POLICY "coach_conversation_messages_owner_select"
  ON public.coach_conversation_messages
  FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "coach_conversation_messages_block_insert"
  ON public.coach_conversation_messages;
CREATE POLICY "coach_conversation_messages_block_insert"
  ON public.coach_conversation_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "coach_conversation_messages_block_update"
  ON public.coach_conversation_messages;
CREATE POLICY "coach_conversation_messages_block_update"
  ON public.coach_conversation_messages
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "coach_conversation_messages_block_delete"
  ON public.coach_conversation_messages;
CREATE POLICY "coach_conversation_messages_block_delete"
  ON public.coach_conversation_messages
  FOR DELETE
  TO authenticated
  USING (false);

GRANT SELECT ON public.coach_conversation_messages TO authenticated;

DROP TRIGGER IF EXISTS phase2_set_coach_conversation_messages_updated_at
  ON public.coach_conversation_messages;
CREATE TRIGGER phase2_set_coach_conversation_messages_updated_at
  BEFORE UPDATE ON public.coach_conversation_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.phase2_set_updated_at();

-- ---------------------------------------------------------------------------
-- coach_free_conversation_state (lifetime guard for the free conversation)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.coach_free_conversation_state (
  user_id uuid PRIMARY KEY REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.coach_conversations(id) ON DELETE SET NULL,
  started_at timestamptz,
  consumed boolean NOT NULL DEFAULT false,
  consumed_at timestamptz,
  user_message_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT coach_free_conversation_state_message_count_check CHECK (
    user_message_count >= 0
  )
);

ALTER TABLE public.coach_free_conversation_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coach_free_conversation_state_owner_select"
  ON public.coach_free_conversation_state;
CREATE POLICY "coach_free_conversation_state_owner_select"
  ON public.coach_free_conversation_state
  FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "coach_free_conversation_state_block_insert"
  ON public.coach_free_conversation_state;
CREATE POLICY "coach_free_conversation_state_block_insert"
  ON public.coach_free_conversation_state
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "coach_free_conversation_state_block_update"
  ON public.coach_free_conversation_state;
CREATE POLICY "coach_free_conversation_state_block_update"
  ON public.coach_free_conversation_state
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "coach_free_conversation_state_block_delete"
  ON public.coach_free_conversation_state;
CREATE POLICY "coach_free_conversation_state_block_delete"
  ON public.coach_free_conversation_state
  FOR DELETE
  TO authenticated
  USING (false);

GRANT SELECT ON public.coach_free_conversation_state TO authenticated;

DROP TRIGGER IF EXISTS phase2_set_coach_free_conversation_state_updated_at
  ON public.coach_free_conversation_state;
CREATE TRIGGER phase2_set_coach_free_conversation_state_updated_at
  BEFORE UPDATE ON public.coach_free_conversation_state
  FOR EACH ROW
  EXECUTE FUNCTION public.phase2_set_updated_at();

REVOKE INSERT, UPDATE, DELETE ON TABLE public.coach_conversations FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.coach_conversation_messages FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.coach_free_conversation_state FROM authenticated;

NOTIFY pgrst, 'reload schema';
