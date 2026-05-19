-- 20260523120000_release_pending_social_upload_reservations.sql
--
-- =============================================================================
-- S-14 — RPC pour purger les reservations pending au logout
-- =============================================================================
--
-- Audit : SOCIAL_SECURITY_AUDIT.md (finding S-14).
--
-- Contexte. Une reservation `social_upload_reservations` a une TTL de 30min.
-- Si un user se deconnecte avant d'avoir consomme sa reservation, celle-ci
-- reste valide jusqu'a expiration TTL. Defense en profondeur : invalider
-- explicitement au logout.
--
-- Cette migration :
--   1) Ajoute 'released' au CHECK constraint sur status.
--   2) Ajoute released_at timestamptz NULLABLE.
--   3) Cree la RPC release_pending_social_upload_reservations(p_user_id) qui
--      passe toutes les reservations 'reserved' non-expirees du caller a
--      status='released'. SECURITY DEFINER avec verification auth.uid() = p_user_id.

BEGIN;

ALTER TABLE public.social_upload_reservations
  ADD COLUMN IF NOT EXISTS released_at timestamptz;

ALTER TABLE public.social_upload_reservations
  DROP CONSTRAINT IF EXISTS social_upload_reservations_status_check;

ALTER TABLE public.social_upload_reservations
  ADD CONSTRAINT social_upload_reservations_status_check
    CHECK (status IN ('reserved', 'consumed', 'expired', 'released'));

CREATE OR REPLACE FUNCTION public.release_pending_social_upload_reservations(
  p_user_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_count integer;
BEGIN
  -- S-14 — N'autorise que le caller a purger SES propres reservations.
  -- Le service_role (auth.uid() IS NULL) peut purger n'importe quel user
  -- (utile pour les jobs de cleanup).
  IF v_caller IS NOT NULL AND v_caller <> p_user_id THEN
    RAISE EXCEPTION 'Only the owner can release their pending reservations'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.social_upload_reservations
    SET status = 'released', released_at = now()
    WHERE user_id = p_user_id
      AND status = 'reserved'
      AND expires_at > now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.release_pending_social_upload_reservations(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_pending_social_upload_reservations(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_pending_social_upload_reservations(uuid) TO service_role;

COMMENT ON FUNCTION public.release_pending_social_upload_reservations(uuid) IS
  'S-14 : purge les reservations social_upload_reservations status=reserved du '
  'caller (verification auth.uid() = p_user_id). Appelee depuis AuthContext.signOut() '
  'pour invalider les uploads pre-reserved avant deconnexion.';

COMMIT;

NOTIFY pgrst, 'reload schema';
