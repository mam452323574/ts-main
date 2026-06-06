-- PROMPT 6 — Coach unified history + visual delete (RPCs).
--
-- Companion to 20260527120000_add_coach_history_soft_delete_columns.sql.
--
-- This migration:
--   * Updates get_coach_history_page_v2 to filter out soft-deleted entries.
--   * Updates get_coach_conversations_page to filter out hidden conversations
--     (new p_include_hidden param, preserves the legacy p_include_archived
--     behaviour for the rare callers that still want archived rows separately).
--   * Updates archive_coach_conversation so the legacy "Archive" path also
--     sets hidden_at (so the new unified history hides it consistently).
--   * Adds delete/restore RPCs for both entries and conversations.
--   * Adds get_coach_unified_history_page_v1 — keyset-paginated history that
--     interleaves coach_entries (kind='entry') and coach_conversations
--     (kind='conversation') in a single feed sorted by activity timestamp.
--
-- All mutating RPCs are SECURITY DEFINER, owner-checked, and never reset
-- coach_free_conversation_state.consumed (the lifetime guard).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. get_coach_history_page_v2: exclude soft-deleted entries.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_coach_history_page_v2(
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
    entry.prompt_type,
    entry.question_key,
    entry.question_text,
    entry.response_version,
    entry.content_json,
    entry.cta_label,
    entry.cta_route,
    entry.created_at,
    entry.source,
    entry.locale,
    entry.status,
    entry.expires_at,
    entry.generated_at
  FROM public.coach_entries AS entry
  WHERE entry.user_id = auth.uid()
    AND entry.deleted_at IS NULL
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

-- ---------------------------------------------------------------------------
-- 2. get_coach_conversations_page: hidden_at filter + include_hidden option.
-- ---------------------------------------------------------------------------
--
-- The legacy p_include_archived parameter is kept for backwards compat with
-- the existing coach-conversations-list Edge Function. The new p_include_hidden
-- parameter is what the unified history surface uses to opt into restorable
-- rows. By default both archived and hidden rows are excluded so the regular
-- "conversations" tab is unaffected for users mid-rollout.

CREATE OR REPLACE FUNCTION public.get_coach_conversations_page(
  p_limit integer DEFAULT 20,
  p_cursor_updated_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL,
  p_include_archived boolean DEFAULT false,
  p_include_hidden boolean DEFAULT false
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

-- Drop the previous 4-arg signature so PostgREST routes the new 5-arg one.
DROP FUNCTION IF EXISTS public.get_coach_conversations_page(integer, timestamptz, uuid, boolean);

GRANT EXECUTE ON FUNCTION public.get_coach_conversations_page(
  integer, timestamptz, uuid, boolean, boolean
) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. archive_coach_conversation: also set hidden_at for unified history parity.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.archive_coach_conversation(
  p_conversation_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_now timestamptz := now();
  v_updated integer := 0;
BEGIN
  UPDATE public.coach_conversations
  SET status = 'archived',
      archived_at = v_now,
      hidden_at = COALESCE(hidden_at, v_now),
      updated_at = v_now
  WHERE id = p_conversation_id
    AND user_id = p_user_id
    AND status <> 'archived';

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'updated', v_updated > 0
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. delete_coach_entry / restore_coach_entry.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.delete_coach_entry(
  p_entry_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_now timestamptz := now();
  v_updated integer := 0;
BEGIN
  IF p_entry_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'coach_entry_delete_invalid_arguments'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.coach_entries
  SET deleted_at = v_now,
      updated_at = v_now
  WHERE id = p_entry_id
    AND user_id = p_user_id
    AND deleted_at IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'updated', v_updated > 0
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_coach_entry(
  p_entry_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_now timestamptz := now();
  v_updated integer := 0;
  v_blocked uuid;
BEGIN
  IF p_entry_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'coach_entry_restore_invalid_arguments'
      USING ERRCODE = '22023';
  END IF;

  -- Detect cache_key collision: if the user has already regenerated an
  -- identical request after the soft-delete, restoring would violate the
  -- partial unique index. Surface a structured error so the caller can warn
  -- the user rather than crashing on the constraint.
  SELECT existing.id INTO v_blocked
  FROM public.coach_entries AS existing
  WHERE existing.user_id = p_user_id
    AND existing.deleted_at IS NULL
    AND existing.cache_key = (
      SELECT cache_key
      FROM public.coach_entries
      WHERE id = p_entry_id AND user_id = p_user_id
    )
  LIMIT 1;

  IF v_blocked IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'updated', false,
      'code', 'coach_entry_restore_cache_key_conflict',
      'blocked_by', v_blocked
    );
  END IF;

  UPDATE public.coach_entries
  SET deleted_at = NULL,
      updated_at = v_now
  WHERE id = p_entry_id
    AND user_id = p_user_id
    AND deleted_at IS NOT NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'updated', v_updated > 0
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. delete_coach_conversation / restore_coach_conversation.
-- ---------------------------------------------------------------------------
--
-- Delete = hide from the user's history. It MUST NOT:
--   * Reset coach_free_conversation_state.consumed (free-tier lifetime gate).
--   * Touch coach_conversation_messages (kept so a future restore can replay).
--   * Touch the conversation's status field (a 'quota_reached' conversation
--     stays 'quota_reached' so re-opening it still disables the input).

CREATE OR REPLACE FUNCTION public.delete_coach_conversation(
  p_conversation_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_now timestamptz := now();
  v_updated integer := 0;
BEGIN
  IF p_conversation_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'coach_conversation_delete_invalid_arguments'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.coach_conversations
  SET hidden_at = v_now,
      updated_at = v_now
  WHERE id = p_conversation_id
    AND user_id = p_user_id
    AND hidden_at IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  -- Defensive assert: we never touch coach_free_conversation_state here, so
  -- a free-tier user cannot regenerate a fresh free conversation by deleting
  -- the previous one. The row stays consumed = true forever.

  RETURN jsonb_build_object(
    'success', true,
    'updated', v_updated > 0
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_coach_conversation(
  p_conversation_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_now timestamptz := now();
  v_updated integer := 0;
BEGIN
  IF p_conversation_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'coach_conversation_restore_invalid_arguments'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.coach_conversations
  SET hidden_at = NULL,
      -- If the legacy archive path was used, also un-archive so the
      -- conversation can return to active listings.
      status = CASE
        WHEN status = 'archived' THEN 'ended'
        ELSE status
      END,
      archived_at = CASE
        WHEN status = 'archived' THEN NULL
        ELSE archived_at
      END,
      updated_at = v_now
  WHERE id = p_conversation_id
    AND user_id = p_user_id
    AND hidden_at IS NOT NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'updated', v_updated > 0
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. get_coach_unified_history_page_v1.
-- ---------------------------------------------------------------------------
--
-- Returns a single keyset-paginated feed that interleaves coach_entries
-- (kind='entry') and coach_conversations (kind='conversation') sorted by a
-- single sort_at timestamp:
--   * entry.sort_at      = COALESCE(generated_at, created_at)
--   * conversation.sort_at = COALESCE(last_user_message_at, updated_at)
--
-- Keyset cursor = (sort_at, kind, id) so two rows landing on the same
-- millisecond stay deterministic. kind is sorted DESC alphabetically so
-- 'entry' < 'conversation' tiebreak is stable.
--
-- The payload purposely carries just enough to render the existing cards
-- without an extra round trip: title, body, persona_key, status, dates plus
-- the structured content JSON for entries and the message counters for
-- conversations. Anything heavier (full content_json sections, message log)
-- is still fetched on demand by the dedicated RPCs.

CREATE OR REPLACE FUNCTION public.get_coach_unified_history_page_v1(
  p_limit integer DEFAULT 20,
  p_cursor_sort_at timestamptz DEFAULT NULL,
  p_cursor_kind text DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL,
  p_include_hidden boolean DEFAULT false
)
RETURNS TABLE (
  kind text,
  id uuid,
  user_id uuid,
  sort_at timestamptz,
  title text,
  body text,
  disclaimer text,
  persona_key text,
  locale text,
  status text,
  source text,
  created_at timestamptz,
  generated_at timestamptz,
  updated_at timestamptz,
  prompt_type text,
  question_key text,
  question_text text,
  response_version smallint,
  content_json jsonb,
  cta_label text,
  cta_route text,
  expires_at timestamptz,
  message_count integer,
  user_message_count integer,
  account_tier_at_start text,
  last_user_message_at timestamptz,
  last_assistant_message_at timestamptz,
  ended_at timestamptz,
  ended_reason text,
  archived_at timestamptz,
  hidden_at timestamptz,
  deleted_at timestamptz,
  metadata jsonb
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, auth
AS $$
  WITH combined AS (
    SELECT
      'entry'::text                                   AS kind,
      entry.id                                        AS id,
      entry.user_id                                   AS user_id,
      COALESCE(entry.generated_at, entry.created_at)  AS sort_at,
      entry.title                                     AS title,
      entry.body                                      AS body,
      entry.disclaimer                                AS disclaimer,
      entry.persona_key                               AS persona_key,
      entry.locale                                    AS locale,
      entry.status                                    AS status,
      entry.source                                    AS source,
      entry.created_at                                AS created_at,
      entry.generated_at                              AS generated_at,
      entry.updated_at                                AS updated_at,
      entry.prompt_type                               AS prompt_type,
      entry.question_key                              AS question_key,
      entry.question_text                             AS question_text,
      entry.response_version                          AS response_version,
      entry.content_json                              AS content_json,
      entry.cta_label                                 AS cta_label,
      entry.cta_route                                 AS cta_route,
      entry.expires_at                                AS expires_at,
      NULL::integer                                   AS message_count,
      NULL::integer                                   AS user_message_count,
      NULL::text                                      AS account_tier_at_start,
      NULL::timestamptz                               AS last_user_message_at,
      NULL::timestamptz                               AS last_assistant_message_at,
      NULL::timestamptz                               AS ended_at,
      NULL::text                                      AS ended_reason,
      NULL::timestamptz                               AS archived_at,
      NULL::timestamptz                               AS hidden_at,
      entry.deleted_at                                AS deleted_at,
      NULL::jsonb                                     AS metadata
    FROM public.coach_entries AS entry
    WHERE entry.user_id = auth.uid()
      AND entry.status = 'ready'
      AND entry.title IS NOT NULL
      AND btrim(entry.title) <> ''
      AND entry.body IS NOT NULL
      AND btrim(entry.body) <> ''
      AND (p_include_hidden OR entry.deleted_at IS NULL)

    UNION ALL

    SELECT
      'conversation'::text                                              AS kind,
      conv.id                                                            AS id,
      conv.user_id                                                       AS user_id,
      COALESCE(conv.last_user_message_at, conv.updated_at, conv.created_at) AS sort_at,
      conv.title                                                         AS title,
      NULL::text                                                         AS body,
      NULL::text                                                         AS disclaimer,
      conv.persona_key                                                   AS persona_key,
      conv.locale                                                        AS locale,
      conv.status                                                        AS status,
      NULL::text                                                         AS source,
      conv.created_at                                                    AS created_at,
      NULL::timestamptz                                                  AS generated_at,
      conv.updated_at                                                    AS updated_at,
      NULL::text                                                         AS prompt_type,
      NULL::text                                                         AS question_key,
      NULL::text                                                         AS question_text,
      NULL::smallint                                                     AS response_version,
      NULL::jsonb                                                        AS content_json,
      NULL::text                                                         AS cta_label,
      NULL::text                                                         AS cta_route,
      NULL::timestamptz                                                  AS expires_at,
      conv.message_count                                                 AS message_count,
      conv.user_message_count                                            AS user_message_count,
      conv.account_tier_at_start                                         AS account_tier_at_start,
      conv.last_user_message_at                                          AS last_user_message_at,
      conv.last_assistant_message_at                                     AS last_assistant_message_at,
      conv.ended_at                                                      AS ended_at,
      conv.ended_reason                                                  AS ended_reason,
      conv.archived_at                                                   AS archived_at,
      conv.hidden_at                                                     AS hidden_at,
      NULL::timestamptz                                                  AS deleted_at,
      conv.metadata                                                      AS metadata
    FROM public.coach_conversations AS conv
    WHERE conv.user_id = auth.uid()
      AND (p_include_hidden OR conv.hidden_at IS NULL)
  )
  SELECT *
  FROM combined
  WHERE (
    p_cursor_sort_at IS NULL
    OR combined.sort_at < p_cursor_sort_at
    OR (
      combined.sort_at = p_cursor_sort_at
      AND (
        combined.kind < p_cursor_kind
        OR (
          combined.kind = p_cursor_kind
          AND combined.id < p_cursor_id
        )
      )
    )
  )
  ORDER BY combined.sort_at DESC, combined.kind DESC, combined.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 101);
$$;

-- ---------------------------------------------------------------------------
-- 7. Grants.
-- ---------------------------------------------------------------------------

-- Soft-delete RPCs are SECURITY DEFINER and only callable by service_role
-- (matches the pattern of archive_coach_conversation: the Edge Function uses
-- the service-role client to invoke them after validating the JWT).
REVOKE EXECUTE ON FUNCTION public.delete_coach_entry(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.restore_coach_entry(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_coach_conversation(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.restore_coach_conversation(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.delete_coach_entry(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.restore_coach_entry(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_coach_conversation(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.restore_coach_conversation(uuid, uuid) TO service_role;

-- Unified history RPC is SECURITY INVOKER so authenticated users can call
-- it directly via supabase-js, mirroring get_coach_history_page_v2.
GRANT EXECUTE ON FUNCTION public.get_coach_unified_history_page_v1(
  integer, timestamptz, text, uuid, boolean
) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
