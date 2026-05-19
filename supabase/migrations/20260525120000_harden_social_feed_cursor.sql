-- 20260525120000_harden_social_feed_cursor.sql
--
-- =============================================================================
-- S-16 — Helper de validation du cursor de pagination keyset
-- =============================================================================
--
-- Audit : SOCIAL_SECURITY_AUDIT.md (finding S-16).
--
-- Contexte. Le cursor `<rs>:<id>` est parse via string_to_array + cast numeric/uuid
-- dans un bloc EXCEPTION qui retombe sur first page si malformed (logique
-- existante dans 20260524120000_social_feed_keyset.sql:115-127). Cette protection
-- est correcte : aucun risque de crash ou de leak.
--
-- Defense en profondeur : on expose un helper SQL `is_valid_social_feed_keyset_cursor`
-- qui peut etre appele cote application ou dans de futures versions du feed
-- pour rejeter explicitement les cursors malformes (avec garde de longueur
-- contre les attaques de type "cursor geant"). Pas de modification de la
-- fonction get_social_feed_page elle-meme : la protection actuelle via le bloc
-- EXCEPTION est suffisante et toute reecriture risquerait de regresser sur la
-- logique complexe de scoring/affinite/diversite/follow.

BEGIN;

-- Helper pure pour la validation du format. NULL-safe : retourne false pour NULL/empty.
CREATE OR REPLACE FUNCTION public.is_valid_social_feed_keyset_cursor(
  p_cursor text
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  v_trimmed text;
BEGIN
  IF p_cursor IS NULL THEN
    RETURN false;
  END IF;
  v_trimmed := btrim(p_cursor);
  IF length(v_trimmed) = 0 THEN
    RETURN false;
  END IF;
  -- Garde de longueur : limite raisonnable au-dela de laquelle on est sur
  -- d'avoir un input malformed / hostile. 200 chars >> 64 + 1 + 36 attendus.
  IF length(v_trimmed) > 200 THEN
    RETURN false;
  END IF;
  -- Format : digits (avec optional decimal/negative) ':' uuid v4-like.
  RETURN v_trimmed ~ '^-?\d+(\.\d+)?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
END;
$$;

REVOKE ALL ON FUNCTION public.is_valid_social_feed_keyset_cursor(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_valid_social_feed_keyset_cursor(text) TO PUBLIC;

COMMENT ON FUNCTION public.is_valid_social_feed_keyset_cursor(text) IS
  'S-16 : validation defensive du cursor keyset (longueur max 200, format <num>:<uuid>). '
  'Helper non encore branche dans get_social_feed_page (la protection actuelle via '
  'EXCEPTION block est suffisante). A utiliser dans les futurs callers ou pour des '
  'tests de regression. Voir SOCIAL_SECURITY_AUDIT.md S-16.';

COMMIT;

NOTIFY pgrst, 'reload schema';
