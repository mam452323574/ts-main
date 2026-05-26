-- Coach conversation user_context cache (CO-* du COACH_CONVERSATIONNEL_DATA_AUDIT
-- 2026-05-20). buildCoachUserContext est rebati a chaque message envoye sur la
-- conversation : c'est 3-4 round-trips DB par message, et la fenetre 30 min
-- pendant laquelle un user discute reste largement stable. On cache donc le
-- snapshot user_context dans la conversation elle-meme, invalide soit par TTL
-- (30 min cote applicatif), soit par l'apparition d'un nouveau scan
-- (`built_for_scan_id` differe du `id` du dernier scan utilisateur).
--
-- Colonnes ajoutees :
--   * user_context_snapshot_json : JSON serialise du dernier CoachUserContext
--     calcule pour cette conversation (capped a 32 KB pour eviter qu'un payload
--     enrichi non borne ne fasse exploser la ligne).
--   * user_context_built_at : timestamp du dernier build (utilise pour le TTL).
--   * user_context_built_for_scan_id : id du dernier scan utilisateur au
--     moment du build (utilise pour l'invalidation par-scan).
--
-- Migration purement additive. RLS inchange (les conversations restent
-- read-only-owner / write-service-role). Aucun impact frontend.

ALTER TABLE public.coach_conversations
  ADD COLUMN IF NOT EXISTS user_context_snapshot_json jsonb,
  ADD COLUMN IF NOT EXISTS user_context_built_at timestamptz,
  ADD COLUMN IF NOT EXISTS user_context_built_for_scan_id uuid;

ALTER TABLE public.coach_conversations
  DROP CONSTRAINT IF EXISTS coach_conversations_user_context_size_check;

ALTER TABLE public.coach_conversations
  ADD CONSTRAINT coach_conversations_user_context_size_check
  CHECK (
    user_context_snapshot_json IS NULL
    OR octet_length(user_context_snapshot_json::text) <= 32768
  );

CREATE INDEX IF NOT EXISTS idx_coach_conversations_user_ctx_built_at
  ON public.coach_conversations(user_context_built_at)
  WHERE user_context_built_at IS NOT NULL;

NOTIFY pgrst, 'reload schema';
