-- Observability for failed coach_entries owned by auth.uid().
--
-- Context: COACH_ENTRY_PUBLIC_COLUMNS_SELECT (services/coach.ts) intentionally
-- omits error_code and response_payload_json from the client-side projection.
-- That keeps the n8n provider topology out of the wire (cf. C-05 of
-- COACH_SECURITY_AUDIT_2026_05) but it also leaves the UI blind to the actual
-- failure mode — every error renders as `{code: null, details: null}`.
--
-- This RPC exposes a minimal, hand-curated slice of the failure metadata
-- (error_code + parsed webhook_status + provider_failure_kind) to the entry
-- owner only. It is SECURITY DEFINER so it can read internal columns even if
-- the table-level GRANT to authenticated is later narrowed (F-01). The user
-- scoping is enforced inside the SQL body via `auth.uid()`.
--
-- The projection deliberately excludes:
--   - response_payload_json (raw)         — would leak provider node names
--   - provider_node_name / provider_node_type — n8n topology
--   - request_payload_json                 — would leak recent_scans digest
--   - cache_key / input_hash               — internal idempotency keys

CREATE OR REPLACE FUNCTION public.get_coach_entry_error_summary(
  p_entry_id uuid
)
RETURNS TABLE (
  id uuid,
  status text,
  error_code text,
  webhook_status int,
  provider_failure_kind text,
  source text,
  locale text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    entry.id,
    entry.status,
    entry.error_code,
    NULLIF((entry.response_payload_json->>'webhook_status'), '')::int
      AS webhook_status,
    NULLIF(entry.response_payload_json->>'provider_failure_kind', '')
      AS provider_failure_kind,
    entry.source,
    entry.locale,
    entry.created_at,
    entry.updated_at
  FROM public.coach_entries AS entry
  WHERE entry.id = p_entry_id
    AND entry.user_id = auth.uid()
    AND entry.status = 'error'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_coach_entry_error_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_coach_entry_error_summary(uuid)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
