-- ============================================================================
-- S-06 — Machine d'état explicite sur public.scans
-- ============================================================================
-- Évite la race entre `analyze-scan` (qui consomme un crédit IA via le webhook
-- n8n) et `cancel-scan-reservation` (qui rembourse le quota et supprime la
-- ligne). Sans état atomique, un client malveillant peut empiler N analyses
-- pour 1 quota effectivement consommé.
--
-- États :
--   reserved  : créé par reserve_scan_quota, image en cours d'upload
--   analyzing : claim atomique par analyze-scan avant l'appel webhook
--   analyzed  : succès — analysis_result + analyzed_at remplis
--   failed   : échec analyse (rollback effectif côté quota)
--   cancelled : annulé par l'utilisateur via cancel-scan-reservation
--
-- Transitions autorisées :
--   reserved  → analyzing  (claim atomique, exclusif par scan_id)
--   reserved  → cancelled  (cancel-scan-reservation tant que pas analyzing)
--   analyzing → analyzed   (succès analyse)
--   analyzing → failed     (échec analyse, rollback)
--   analyzing → analyzing  : interdit (claim échoue → 409 côté HTTP)
-- ============================================================================

ALTER TABLE public.scans
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'reserved';

-- Backfill : tous les scans avec analysis_result + analyzed_at sont déjà
-- terminés ; les autres sont considérés `reserved` (le défaut).
UPDATE public.scans
SET status = 'analyzed'
WHERE status = 'reserved'
  AND analysis_result IS NOT NULL
  AND analyzed_at IS NOT NULL;

-- Contrainte CHECK : valeurs autorisées seulement.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'scans_status_check'
      AND conrelid = 'public.scans'::regclass
  ) THEN
    ALTER TABLE public.scans
      ADD CONSTRAINT scans_status_check
      CHECK (status IN ('reserved', 'analyzing', 'analyzed', 'failed', 'cancelled'));
  END IF;
END $$;

-- Index pour le cron de réconciliation `analyzing` → `failed` (cf. S-13).
CREATE INDEX IF NOT EXISTS idx_scans_status_created_at
  ON public.scans (status, created_at)
  WHERE status IN ('reserved', 'analyzing');

-- ============================================================================
-- RPC : claim atomique (reserved → analyzing)
-- ============================================================================
-- Renvoie un jsonb { ok: bool, status: text } qui permet à analyze-scan de
-- décider entre poursuivre l'analyse (ok=true) ou retourner 409 (ok=false).
-- Utilise un UPDATE conditionnel : si une autre invocation a déjà fait la
-- transition, l'UPDATE n'affecte 0 ligne et on lit le statut courant.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.claim_scan_for_analysis(
  p_scan_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_updated_id uuid;
  v_current_status text;
BEGIN
  UPDATE public.scans
  SET status = 'analyzing'
  WHERE id = p_scan_id
    AND user_id = p_user_id
    AND status = 'reserved'
  RETURNING id INTO v_updated_id;

  IF v_updated_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'status', 'analyzing');
  END IF;

  SELECT status INTO v_current_status
  FROM public.scans
  WHERE id = p_scan_id AND user_id = p_user_id;

  IF v_current_status IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'not_found');
  END IF;

  RETURN jsonb_build_object('ok', false, 'status', v_current_status);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_scan_for_analysis(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_scan_for_analysis(uuid, uuid) TO service_role;

-- ============================================================================
-- RPC : transition de fin d'analyse (analyzing → analyzed | failed)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.finalize_scan_analysis(
  p_scan_id uuid,
  p_user_id uuid,
  p_status text,
  p_image_path text,
  p_analysis_result jsonb,
  p_analyzed_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_updated_id uuid;
BEGIN
  IF p_status NOT IN ('analyzed', 'failed') THEN
    RAISE EXCEPTION 'invalid finalize status %', p_status;
  END IF;

  UPDATE public.scans
  SET
    status = p_status,
    image_path = COALESCE(p_image_path, image_path),
    image_url = NULL,
    analysis_result = CASE WHEN p_status = 'analyzed' THEN p_analysis_result ELSE analysis_result END,
    analyzed_at = CASE WHEN p_status = 'analyzed' THEN COALESCE(p_analyzed_at, now()) ELSE analyzed_at END
  WHERE id = p_scan_id
    AND user_id = p_user_id
    AND status = 'analyzing'
  RETURNING id INTO v_updated_id;

  IF v_updated_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'not_analyzing');
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', p_status);
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_scan_analysis(uuid, uuid, text, text, jsonb, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_scan_analysis(uuid, uuid, text, text, jsonb, timestamptz) TO service_role;

-- ============================================================================
-- RPC : cancel atomique (reserved → cancelled), refuse si analyzing/analyzed
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cancel_reserved_scan(
  p_scan_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_updated_id uuid;
  v_current_status text;
BEGIN
  UPDATE public.scans
  SET status = 'cancelled'
  WHERE id = p_scan_id
    AND user_id = p_user_id
    AND status = 'reserved'
  RETURNING id INTO v_updated_id;

  IF v_updated_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'status', 'cancelled');
  END IF;

  SELECT status INTO v_current_status
  FROM public.scans
  WHERE id = p_scan_id AND user_id = p_user_id;

  IF v_current_status IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'not_found');
  END IF;

  RETURN jsonb_build_object('ok', false, 'status', v_current_status);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_reserved_scan(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_reserved_scan(uuid, uuid) TO service_role;
