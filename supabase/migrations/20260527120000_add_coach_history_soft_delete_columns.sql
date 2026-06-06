-- PROMPT 6 — Coach unified history + visual delete (schema only).
--
-- Goals:
--   (1) Give coach_entries a soft-delete column so the user can remove a
--       Coach "request" card from history without losing the underlying row
--       (and without freeing the cache_key for an identical regeneration).
--   (2) Give coach_conversations a separate `hidden_at` column so the new
--       UX action ("Supprimer", not "Archive") hides the conversation from
--       the default history without touching the existing archive lifecycle.
--   (3) Backfill `hidden_at` from the legacy `archived_at` value so already
--       archived conversations stay invisible by default after the unified
--       history rollout.
--
-- The cache_key uniqueness rules are tightened to a PARTIAL UNIQUE INDEX so
-- a soft-deleted entry no longer blocks an identical regeneration:
--   * UNIQUE (user_id, cache_key) WHERE deleted_at IS NULL
--
-- This file ONLY changes the schema. The RPCs and grants are updated in the
-- companion migration 20260527120100_add_coach_history_soft_delete_rpcs.sql.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. coach_entries: add deleted_at + partial unique cache_key index.
-- ---------------------------------------------------------------------------

ALTER TABLE public.coach_entries
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

COMMENT ON COLUMN public.coach_entries.deleted_at IS
  'Soft-delete timestamp set by delete_coach_entry. Rows with a non-NULL value '
  'are hidden from get_coach_history_page_v2 and from the unified history but '
  'are preserved so the user can restore them and so the original cache_key '
  'can be re-issued for an identical regeneration.';

-- Replace the strict UNIQUE constraint with a partial unique index so that
-- a soft-deleted row does NOT block a new identical generation. Postgres
-- requires dropping the constraint before adding the index (a constraint and
-- a partial index would otherwise conflict on lookups).
ALTER TABLE public.coach_entries
  DROP CONSTRAINT IF EXISTS coach_entries_user_cache_key_unique;

CREATE UNIQUE INDEX IF NOT EXISTS coach_entries_user_cache_key_active_unique
  ON public.coach_entries (user_id, cache_key)
  WHERE deleted_at IS NULL;

-- Lookup index for the default (non-deleted) history page. Mirrors the
-- existing idx_coach_entries_history_ready_sort but adds the deleted_at
-- predicate so the planner can avoid a heap fetch on rows that are filtered
-- out before scoring.
CREATE INDEX IF NOT EXISTS idx_coach_entries_history_active_sort
  ON public.coach_entries (user_id, COALESCE(generated_at, created_at) DESC)
  WHERE deleted_at IS NULL
    AND status = 'ready'
    AND title IS NOT NULL
    AND body IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. coach_conversations: add hidden_at + backfill from legacy archived_at.
-- ---------------------------------------------------------------------------

ALTER TABLE public.coach_conversations
  ADD COLUMN IF NOT EXISTS hidden_at timestamptz;

COMMENT ON COLUMN public.coach_conversations.hidden_at IS
  'Soft-hide timestamp set by delete_coach_conversation (UX "Supprimer"). '
  'Independent from archived_at/status=archived which represents the legacy '
  'archive lifecycle. A conversation is hidden from the default history when '
  'hidden_at IS NOT NULL. coach_free_conversation_state.consumed is never '
  'reset by the delete path so a free-tier user cannot regenerate a fresh '
  'free conversation by deleting the previous one.';

-- Backfill: every conversation that the user previously archived should
-- remain invisible by default once the new unified history filter switches
-- from "status <> archived" to "hidden_at IS NULL".
UPDATE public.coach_conversations
SET hidden_at = COALESCE(archived_at, updated_at)
WHERE status = 'archived'
  AND hidden_at IS NULL;

-- Index supporting the unified history default filter.
CREATE INDEX IF NOT EXISTS idx_coach_conversations_user_visible_updated_at
  ON public.coach_conversations (user_id, updated_at DESC)
  WHERE hidden_at IS NULL;

-- Mirror index for last_user_message_at, used by the unified history sort
-- so the planner can keyset-paginate on the newest activity per row.
CREATE INDEX IF NOT EXISTS idx_coach_conversations_user_visible_activity
  ON public.coach_conversations (
    user_id,
    COALESCE(last_user_message_at, updated_at) DESC,
    id DESC
  )
  WHERE hidden_at IS NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
