-- Hotfix 2026-05-27 — coach_entry_upsert_failed (42P10).
--
-- The companion migration 20260527120000_add_coach_history_soft_delete_columns
-- replaced the strict UNIQUE (user_id, cache_key) constraint with a PARTIAL
-- unique index:
--
--   CREATE UNIQUE INDEX coach_entries_user_cache_key_active_unique
--     ON public.coach_entries (user_id, cache_key)
--     WHERE deleted_at IS NULL;
--
-- supabase-js .upsert({ onConflict: 'user_id,cache_key' }) cannot pass the
-- partial-index WHERE predicate to PostgREST, so PostgreSQL refuses to infer
-- the index and returns 42P10 (invalid_column_reference). This crashes every
-- Coach generation request.
--
-- Fix: expose a SECURITY DEFINER RPC that runs the upsert with the explicit
-- ON CONFLICT (...) WHERE deleted_at IS NULL clause. Soft-deleted rows are
-- NEVER resurrected — if the active row was soft-deleted, the INSERT branch
-- runs and a brand new active row is created with the same cache_key, which
-- is the documented behaviour of the unified history feature.
--
-- The RPC mirrors the SECURITY DEFINER + service_role grant pattern of the
-- sibling delete_coach_entry / restore_coach_entry RPCs added by
-- 20260527120100_add_coach_history_soft_delete_rpcs.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public.upsert_coach_pending_entry(
  p_user_id uuid,
  p_cache_key text,
  p_values jsonb
)
RETURNS public.coach_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_row public.coach_entries;
BEGIN
  IF p_user_id IS NULL OR p_cache_key IS NULL OR p_values IS NULL THEN
    RAISE EXCEPTION 'upsert_coach_pending_entry_invalid_arguments'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.coach_entries (
    user_id,
    cache_key,
    input_hash,
    request_payload_json,
    response_payload_json,
    status,
    error_code,
    source,
    persona_key,
    prompt_type,
    question_key,
    question_text,
    response_version,
    content_json,
    locale,
    title,
    body,
    disclaimer,
    cta_label,
    cta_route,
    generated_at,
    expires_at
  )
  VALUES (
    p_user_id,
    p_cache_key,
    p_values->>'input_hash',
    COALESCE(p_values->'request_payload_json', '{}'::jsonb),
    COALESCE(p_values->'response_payload_json', '{}'::jsonb),
    COALESCE(p_values->>'status', 'pending'),
    p_values->>'error_code',
    p_values->>'source',
    p_values->>'persona_key',
    p_values->>'prompt_type',
    p_values->>'question_key',
    p_values->>'question_text',
    COALESCE((p_values->>'response_version')::smallint, 1::smallint),
    p_values->'content_json',
    p_values->>'locale',
    p_values->>'title',
    p_values->>'body',
    p_values->>'disclaimer',
    p_values->>'cta_label',
    p_values->>'cta_route',
    NULLIF(p_values->>'generated_at', '')::timestamptz,
    NULLIF(p_values->>'expires_at', '')::timestamptz
  )
  ON CONFLICT (user_id, cache_key) WHERE deleted_at IS NULL
  DO UPDATE SET
    input_hash            = EXCLUDED.input_hash,
    request_payload_json  = EXCLUDED.request_payload_json,
    response_payload_json = EXCLUDED.response_payload_json,
    status                = EXCLUDED.status,
    error_code            = EXCLUDED.error_code,
    source                = EXCLUDED.source,
    persona_key           = EXCLUDED.persona_key,
    prompt_type           = EXCLUDED.prompt_type,
    question_key          = EXCLUDED.question_key,
    question_text         = EXCLUDED.question_text,
    response_version      = EXCLUDED.response_version,
    content_json          = EXCLUDED.content_json,
    locale                = EXCLUDED.locale,
    title                 = EXCLUDED.title,
    body                  = EXCLUDED.body,
    disclaimer            = EXCLUDED.disclaimer,
    cta_label             = EXCLUDED.cta_label,
    cta_route             = EXCLUDED.cta_route,
    generated_at          = EXCLUDED.generated_at,
    expires_at            = EXCLUDED.expires_at,
    updated_at            = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_coach_pending_entry(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_coach_pending_entry(uuid, text, jsonb) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
