-- Phase A.1 of COACH_SECURITY_AUDIT_2026_05 — preflight read-only audit.
--
-- Run this against staging (and ideally prod read-replica) BEFORE applying
-- the migrations 20260520180000 → 20260520180600. Every query is read-only
-- and returns the volumetric data the security fixes need to clear:
--
--   * If row counts are zero or small, the CHECK constraints (C-09, N-F) and
--     the backfill (C-05) will pass without surprises.
--   * If any row would violate a planned CHECK, the corresponding ALTER will
--     fail — adjust the seuils in the migration BEFORE running it on prod.
--
-- Suggested invocation (Supabase CLI):
--
--   supabase db remote sql --linked --file scripts/coach_audit_phase_a_preflight.sql
--
-- Or via psql:
--
--   psql "$DATABASE_URL" -f scripts/coach_audit_phase_a_preflight.sql

\echo '== C-05 backfill volumetry (20260520180300_backfill_coach_entries_prompt_fields) =='
\echo 'How many legacy entries need a prompt_type / question_* backfill?'

SELECT
  COUNT(*) FILTER (
    WHERE prompt_type IS NULL
      AND request_payload_json ? 'prompt_type'
  ) AS rows_with_prompt_type_to_backfill,
  COUNT(*) FILTER (
    WHERE question_key IS NULL
      AND request_payload_json ? 'question_key'
  ) AS rows_with_question_key_to_backfill,
  COUNT(*) FILTER (
    WHERE question_text IS NULL
      AND request_payload_json ? 'question_text'
  ) AS rows_with_question_text_to_backfill,
  COUNT(*) FILTER (
    WHERE prompt_type IS NULL
      AND request_payload_json ->> 'prompt_type' = 'trend_comparison'
  ) AS rows_needing_trend_comparison_alias_remap,
  COUNT(*) AS total_coach_entries
FROM public.coach_entries;

\echo ''
\echo '== C-09 disclaimer length cap (20260520180000) =='
\echo 'Any disclaimer longer than 1000 chars would fail the CHECK. The default'
\echo "value written by 20260406223000 is ~60 chars, so we expect 0."

SELECT
  COUNT(*) FILTER (WHERE char_length(disclaimer) > 1000)
    AS rows_over_1000_chars,
  COUNT(*) FILTER (WHERE char_length(disclaimer) > 500)
    AS rows_over_500_chars,
  MAX(char_length(disclaimer)) AS max_disclaimer_length,
  COUNT(*) FILTER (WHERE disclaimer IS NOT NULL) AS rows_with_disclaimer,
  COUNT(*) AS total_coach_entries
FROM public.coach_entries;

\echo ''
\echo '== N-F metadata size caps (20260520180100) =='
\echo 'Conversation metadata caps: 4096 / 4096 / 2048 bytes. Expect 0 rows over.'

SELECT
  'coach_conversations.metadata' AS table_column,
  COUNT(*) FILTER (WHERE length(metadata::text) > 4096) AS rows_over_cap,
  MAX(length(metadata::text)) AS max_size_bytes,
  COUNT(*) AS total_rows
FROM public.coach_conversations
UNION ALL
SELECT
  'coach_conversation_messages.metadata',
  COUNT(*) FILTER (WHERE length(metadata::text) > 4096),
  MAX(length(metadata::text)),
  COUNT(*)
FROM public.coach_conversation_messages
UNION ALL
SELECT
  'coach_free_conversation_state.metadata',
  COUNT(*) FILTER (WHERE length(metadata::text) > 2048),
  MAX(length(metadata::text)),
  COUNT(*)
FROM public.coach_free_conversation_state;

\echo ''
\echo '== C-06 retroport (20260520180200) — BLOCK policies on coach_entries =='
\echo 'Confirm authenticated has NO direct INSERT/UPDATE/DELETE grant today'
\echo '(should already be the case — migration is purely defense-in-depth).'

SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'coach_entries'
  AND grantee IN ('authenticated', 'anon')
ORDER BY grantee, privilege_type;

\echo ''
\echo '== C-07 (informational, OUT of scope for this PR) =='
\echo 'How many users have coach_persona_key set (deciding factor for trigger size).'

SELECT
  COUNT(*) FILTER (WHERE coach_persona_key IS NOT NULL) AS users_with_persona_set,
  COUNT(*) AS total_users
FROM public.user_profiles;

\echo ''
\echo '== END Phase A preflight. =='
\echo 'Pass conditions:'
\echo '  * rows_over_1000_chars = 0 (C-09 safe to apply)'
\echo '  * all three metadata rows_over_cap = 0 (N-F safe to apply)'
\echo '  * authenticated has NO INSERT/UPDATE/DELETE on coach_entries (C-06 no-op)'
\echo '  * rows_with_prompt_type_to_backfill > 0 means the backfill will actually update legacy rows'
\echo 'If any threshold is exceeded: adjust the corresponding migration BEFORE applying.'
