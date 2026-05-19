-- CO-03 (cf. SCANNER_COACH_AUDIT_2026_05.md §6) — RGPD art. 17 effective.
--
-- Quand un utilisateur supprime un scan via `delete-scan` (ou via cascade
-- `DELETE FROM auth.users`), le scan disparait de `scans` + Storage mais les
-- `coach_entries` qui le referencent conservent une copie complete des metriques
-- et du resume dans `request_payload_json.latest_scan` / `recent_scans` /
-- `prior_scans` / `selected_scan` / `latest_by_type`. La suppression scan etait
-- donc partielle : non-conformite RGPD art. 17 (droit a l'effacement effectif).
--
-- Ce trigger purge ces references AFTER DELETE ON scans :
-- - `latest_scan` -> null si scan_id match
-- - `recent_scans[]` -> filtre les elements dont scan_id match
-- - `prior_scans[]` -> idem
-- - `selected_scan` -> null si scan_id match
-- - `latest_by_type` -> retire la cle correspondante si scan_id match
--
-- Idempotent : si plusieurs scans sont supprimes consecutivement, chaque
-- trigger nettoie seulement les references a ce scan precis.

CREATE OR REPLACE FUNCTION public.purge_scan_from_coach_entries()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scan_id text := OLD.id::text;
BEGIN
  IF v_scan_id IS NULL THEN
    RETURN OLD;
  END IF;

  UPDATE public.coach_entries AS ce
  SET request_payload_json = (
    -- Step 1: clear latest_scan if it matches
    CASE
      WHEN request_payload_json->'latest_scan'->>'scan_id' = v_scan_id
        THEN request_payload_json || jsonb_build_object('latest_scan', NULL)
      ELSE request_payload_json
    END
  )
  WHERE ce.user_id = OLD.user_id
    AND ce.request_payload_json IS NOT NULL
    AND ce.request_payload_json->'latest_scan'->>'scan_id' = v_scan_id;

  UPDATE public.coach_entries AS ce
  SET request_payload_json = (
    -- Step 2: clear selected_scan if it matches
    request_payload_json || jsonb_build_object('selected_scan', NULL)
  )
  WHERE ce.user_id = OLD.user_id
    AND ce.request_payload_json IS NOT NULL
    AND ce.request_payload_json->'selected_scan'->>'scan_id' = v_scan_id;

  UPDATE public.coach_entries AS ce
  SET request_payload_json = jsonb_set(
    request_payload_json,
    '{recent_scans}',
    COALESCE(
      (
        SELECT jsonb_agg(elem)
        FROM jsonb_array_elements(request_payload_json->'recent_scans') AS elem
        WHERE elem->>'scan_id' IS DISTINCT FROM v_scan_id
      ),
      '[]'::jsonb
    )
  )
  WHERE ce.user_id = OLD.user_id
    AND ce.request_payload_json IS NOT NULL
    AND jsonb_typeof(ce.request_payload_json->'recent_scans') = 'array'
    AND ce.request_payload_json->'recent_scans' @> jsonb_build_array(
      jsonb_build_object('scan_id', v_scan_id)
    );

  UPDATE public.coach_entries AS ce
  SET request_payload_json = jsonb_set(
    request_payload_json,
    '{prior_scans}',
    COALESCE(
      (
        SELECT jsonb_agg(elem)
        FROM jsonb_array_elements(request_payload_json->'prior_scans') AS elem
        WHERE elem->>'scan_id' IS DISTINCT FROM v_scan_id
      ),
      '[]'::jsonb
    )
  )
  WHERE ce.user_id = OLD.user_id
    AND ce.request_payload_json IS NOT NULL
    AND jsonb_typeof(ce.request_payload_json->'prior_scans') = 'array'
    AND ce.request_payload_json->'prior_scans' @> jsonb_build_array(
      jsonb_build_object('scan_id', v_scan_id)
    );

  -- `latest_by_type` est un record {scan_type_key: {scan_id, ...}}. On retire
  -- chaque entree dont scan_id match. Plus complexe : itere sur les cles.
  UPDATE public.coach_entries AS ce
  SET request_payload_json = jsonb_set(
    request_payload_json,
    '{latest_by_type}',
    COALESCE(
      (
        SELECT jsonb_object_agg(key, value)
        FROM jsonb_each(request_payload_json->'latest_by_type')
        WHERE value->>'scan_id' IS DISTINCT FROM v_scan_id
      ),
      '{}'::jsonb
    )
  )
  WHERE ce.user_id = OLD.user_id
    AND ce.request_payload_json IS NOT NULL
    AND jsonb_typeof(ce.request_payload_json->'latest_by_type') = 'object'
    AND EXISTS (
      SELECT 1
      FROM jsonb_each(ce.request_payload_json->'latest_by_type')
      WHERE value->>'scan_id' = v_scan_id
    );

  RETURN OLD;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.purge_scan_from_coach_entries() FROM PUBLIC;
-- Trigger functions are called by the database engine, not by clients.
-- No GRANT is needed; the trigger inherits SECURITY DEFINER privileges.

DROP TRIGGER IF EXISTS trg_purge_scan_from_coach_entries ON public.scans;

CREATE TRIGGER trg_purge_scan_from_coach_entries
  AFTER DELETE ON public.scans
  FOR EACH ROW
  EXECUTE FUNCTION public.purge_scan_from_coach_entries();

COMMENT ON FUNCTION public.purge_scan_from_coach_entries() IS
  'CO-03: purges references to a deleted scan from coach_entries.request_payload_json (RGPD art. 17 effective).';

COMMENT ON TRIGGER trg_purge_scan_from_coach_entries ON public.scans IS
  'CO-03: AFTER DELETE — purges scan references from coach_entries (RGPD art. 17).';
