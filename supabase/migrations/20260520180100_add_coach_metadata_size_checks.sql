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
