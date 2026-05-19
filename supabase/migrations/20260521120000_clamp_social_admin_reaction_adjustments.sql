-- 20260521120000_clamp_social_admin_reaction_adjustments.sql
--
-- =============================================================================
-- S-15 — Bornes sur admin_*_adjustment + clamp defensif dans la RPC
-- =============================================================================
--
-- Audit : SOCIAL_SECURITY_AUDIT.md (finding S-15).
--
-- Contexte. La RPC public.set_social_post_admin_reaction_adjustments(p_post_id,
-- p_admin_like_adjustment, p_admin_dislike_adjustment) stockait directement les
-- entiers fournis par l'Edge Function. Le type integer PostgreSQL accepte
-- -2_147_483_648..+2_147_483_647 mais la formule
--   public.get_effective_social_reaction_count(raw, adjustment) =
--     GREATEST(0, COALESCE(raw, 0) + COALESCE(adjustment, 0))
-- peut overflower si raw + adjustment > +2.1B, declenchant une exception sur les
-- lectures du feed (get_social_feed_page).
--
-- Cette migration :
--   1) Verifie qu'aucune valeur existante n'est hors borne (sinon abort).
--   2) Ajoute CHECK CONSTRAINT sur social_posts.admin_*_adjustment ∈ [-10000, +10000].
--   3) Clamp defensif dans la RPC pour eviter la propagation d'une 23514 cote
--      Edge Function legitime (defense en profondeur, le contract bloque deja
--      hors borne cote phase2Contracts.ts).
--
-- Bornes [-10000, +10000] = compromise produit : suffisant pour booster ou
-- enterrer un post legitimement (l'echelle est en milliers), tout en empechant
-- des manipulations massives (par exemple +1M likes pour falsifier la viralite).

BEGIN;

-- =============================================================================
-- Partie 1 : Verification pre-migration. On refuse de poser le CHECK si des
-- rows existantes violent la borne (toute violation existante est anormale et
-- doit etre investiguee manuellement).
-- =============================================================================

DO $$
DECLARE
  v_violations integer;
BEGIN
  SELECT COUNT(*) INTO v_violations
    FROM public.social_posts
    WHERE COALESCE(admin_like_adjustment, 0) NOT BETWEEN -10000 AND 10000
       OR COALESCE(admin_dislike_adjustment, 0) NOT BETWEEN -10000 AND 10000;

  IF v_violations > 0 THEN
    RAISE EXCEPTION
      'S-15 pre-migration check failed: % social_posts rows have admin_*_adjustment outside [-10000, +10000]. Investigate manually before applying this migration.',
      v_violations
      USING ERRCODE = 'P0001';
  END IF;
END $$;

-- =============================================================================
-- Partie 2 : CHECK constraints sur social_posts.admin_*_adjustment
-- =============================================================================

ALTER TABLE public.social_posts
  DROP CONSTRAINT IF EXISTS social_posts_admin_like_adjustment_range;
ALTER TABLE public.social_posts
  DROP CONSTRAINT IF EXISTS social_posts_admin_dislike_adjustment_range;

ALTER TABLE public.social_posts
  ADD CONSTRAINT social_posts_admin_like_adjustment_range
    CHECK (admin_like_adjustment BETWEEN -10000 AND 10000);

ALTER TABLE public.social_posts
  ADD CONSTRAINT social_posts_admin_dislike_adjustment_range
    CHECK (admin_dislike_adjustment BETWEEN -10000 AND 10000);

-- =============================================================================
-- Partie 3 : Clamp defensif dans la RPC + signature inchangee
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_social_post_admin_reaction_adjustments(
  p_post_id uuid,
  p_admin_like_adjustment integer,
  p_admin_dislike_adjustment integer
)
RETURNS TABLE (
  post_id uuid,
  raw_like_count integer,
  raw_dislike_count integer,
  admin_like_adjustment integer,
  admin_dislike_adjustment integer,
  effective_like_count integer,
  effective_dislike_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  updated_post public.social_posts%ROWTYPE;
BEGIN
  IF p_post_id IS NULL THEN
    RAISE EXCEPTION 'post_id is required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.social_posts AS social_post
  SET
    -- S-15 — Clamp defensif : meme si l'Edge Function ou un futur caller passe
    -- une valeur hors borne, on saturate plutot que de propager une 23514.
    -- La CHECK constraint reste l'autorite finale : si jamais le clamp est
    -- contourne, l'INSERT/UPDATE leve.
    admin_like_adjustment =
      LEAST(10000, GREATEST(-10000, COALESCE(p_admin_like_adjustment, 0))),
    admin_dislike_adjustment =
      LEAST(10000, GREATEST(-10000, COALESCE(p_admin_dislike_adjustment, 0))),
    updated_at = now()
  WHERE social_post.id = p_post_id
  RETURNING social_post.*
  INTO updated_post;

  IF updated_post.id IS NULL THEN
    RAISE EXCEPTION 'Social post not found' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT
    updated_post.id AS post_id,
    COALESCE(updated_post.like_count, 0) AS raw_like_count,
    COALESCE(updated_post.dislike_count, 0) AS raw_dislike_count,
    COALESCE(updated_post.admin_like_adjustment, 0) AS admin_like_adjustment,
    COALESCE(updated_post.admin_dislike_adjustment, 0) AS admin_dislike_adjustment,
    public.get_effective_social_reaction_count(
      updated_post.like_count,
      updated_post.admin_like_adjustment
    ) AS effective_like_count,
    public.get_effective_social_reaction_count(
      updated_post.dislike_count,
      updated_post.admin_dislike_adjustment
    ) AS effective_dislike_count;
END;
$$;

REVOKE ALL ON FUNCTION public.set_social_post_admin_reaction_adjustments(
  uuid, integer, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_social_post_admin_reaction_adjustments(
  uuid, integer, integer
) TO service_role;

COMMENT ON CONSTRAINT social_posts_admin_like_adjustment_range
  ON public.social_posts IS
  'S-15 : admin_like_adjustment borne [-10000, +10000] pour bloquer manipulation '
  'massive du feed et eviter overflow integer sur raw + adjustment. Voir '
  'SOCIAL_SECURITY_AUDIT.md finding S-15.';

COMMENT ON CONSTRAINT social_posts_admin_dislike_adjustment_range
  ON public.social_posts IS
  'S-15 : admin_dislike_adjustment borne [-10000, +10000]. Voir SOCIAL_SECURITY_AUDIT.md S-15.';

COMMIT;

NOTIFY pgrst, 'reload schema';
