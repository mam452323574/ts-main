-- Fix: re-apply missing parts of migration 20260520120000
-- (column + index already applied manually, only RPCs missing)

COMMENT ON COLUMN public.admin_audit_events.idempotency_key IS
  'S-09 : cle UUID generee cote Edge Function (header Idempotency-Key) pour '
  'detecter les retries reseau et eviter la double-execution des operations '
  'destructrices (eradicate, ban, adjust_reactions). UNIQUE WHERE NOT NULL '
  'pour conserver la compatibilite avec les anciennes lignes (les NULL ne '
  'declenchent pas la contrainte).';

-- Partie 2 : Helper RPC pour le replay
CREATE OR REPLACE FUNCTION public.find_admin_audit_event_by_idempotency_key(
  p_idempotency_key uuid
)
RETURNS TABLE (
  id uuid,
  action text,
  actor_id uuid,
  metadata jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF p_idempotency_key IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    audit_event.id,
    audit_event.action,
    audit_event.actor_id,
    audit_event.metadata,
    audit_event.created_at
  FROM public.admin_audit_events AS audit_event
  WHERE audit_event.idempotency_key = p_idempotency_key
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.find_admin_audit_event_by_idempotency_key(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_admin_audit_event_by_idempotency_key(uuid) TO service_role;
