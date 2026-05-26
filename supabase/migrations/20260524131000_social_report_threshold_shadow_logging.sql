-- 20260524131000_social_report_threshold_shadow_logging.sql
--
-- =============================================================================
-- S-12 — Shadow logging pour l'observation pre-activation
-- =============================================================================
--
-- Audit : SOCIAL_SECURITY_AUDIT.md (finding S-12).
--
-- Contexte. La migration 20260522120000_weighted_report_count.sql a livre la
-- fonction `compute_weighted_report_count` + la table
-- `social_report_threshold_shadow` en SHADOW MODE. Mais la trigger
-- `apply_social_report_thresholds` n'ecrit RIEN dans cette table — on ne
-- collecte donc aucune donnee d'observation.
--
-- Cette migration modifie la trigger pour :
--   1) Continuer a utiliser le `COUNT(DISTINCT reporter_id)` brut pour la
--      decision (comportement inchange en mode shadow).
--   2) Calculer EN PLUS le `weighted_score` via compute_weighted_report_count.
--   3) Logger la comparaison dans social_report_threshold_shadow.
--
-- Apres 7+ jours, analyser social_report_threshold_shadow (voir
-- SOCIAL_FIX_PLAN.md §"Activation S-12") puis appliquer la migration
-- 20260605120000_activate_weighted_social_report_thresholds.sql qui bascule
-- la decision sur le score weighted.

BEGIN;

CREATE OR REPLACE FUNCTION public.apply_social_report_thresholds()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  unique_reporters_24h integer := 0;
  weighted_score numeric := 0;
  auto_hide_threshold constant integer := 3;
  v_target_id uuid;
  v_target_type text;
  v_raw_would_hide boolean;
  v_weighted_would_hide boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  IF NEW.target_type = 'post' AND NEW.target_post_id IS NOT NULL THEN
    v_target_type := 'post';
    v_target_id := NEW.target_post_id;

    SELECT COUNT(DISTINCT reporter_id)::integer
    INTO unique_reporters_24h
    FROM public.social_reports
    WHERE target_type = 'post'
      AND target_post_id = NEW.target_post_id
      AND created_at >= (now() - interval '24 hours');

    -- S-12 — Calcul weighted score en parallele (SHADOW, ne change pas la decision).
    weighted_score := public.compute_weighted_report_count('post', NEW.target_post_id, interval '24 hours');

    IF unique_reporters_24h >= auto_hide_threshold THEN
      UPDATE public.social_posts
      SET
        moderation_state = 'flagged',
        moderation_reason = 'report_threshold',
        moderation_provider = COALESCE(NULLIF(moderation_provider, ''), 'report_threshold'),
        moderation_summary_json =
          COALESCE(moderation_summary_json, '{}'::jsonb) ||
          jsonb_build_object(
            'report_threshold_24h', unique_reporters_24h,
            'weighted_score_24h', weighted_score,
            'auto_hidden_at', now()
          )
      WHERE id = NEW.target_post_id
        AND deleted_at IS NULL
        AND moderation_state IN ('approved', 'pending');
    END IF;
  ELSIF NEW.target_type = 'comment' AND NEW.target_comment_id IS NOT NULL THEN
    v_target_type := 'comment';
    v_target_id := NEW.target_comment_id;

    SELECT COUNT(DISTINCT reporter_id)::integer
    INTO unique_reporters_24h
    FROM public.social_reports
    WHERE target_type = 'comment'
      AND target_comment_id = NEW.target_comment_id
      AND created_at >= (now() - interval '24 hours');

    weighted_score := public.compute_weighted_report_count('comment', NEW.target_comment_id, interval '24 hours');

    IF unique_reporters_24h >= auto_hide_threshold THEN
      UPDATE public.social_comments
      SET
        moderation_state = 'flagged',
        moderation_reason = 'report_threshold',
        moderation_provider = COALESCE(NULLIF(moderation_provider, ''), 'report_threshold'),
        moderation_summary_json =
          COALESCE(moderation_summary_json, '{}'::jsonb) ||
          jsonb_build_object(
            'report_threshold_24h', unique_reporters_24h,
            'weighted_score_24h', weighted_score,
            'auto_hidden_at', now()
          )
      WHERE id = NEW.target_comment_id
        AND deleted_at IS NULL
        AND moderation_state IN ('approved', 'pending');
    END IF;
  END IF;

  -- S-12 — Log shadow : decisions raw vs weighted, meme si aucune des deux
  -- ne declenche l'auto-hide (interessant pour comprendre la base normale).
  IF v_target_type IS NOT NULL THEN
    v_raw_would_hide := unique_reporters_24h >= auto_hide_threshold;
    v_weighted_would_hide := weighted_score >= auto_hide_threshold;

    INSERT INTO public.social_report_threshold_shadow (
      target_type,
      target_id,
      raw_count,
      weighted_score,
      raw_would_hide,
      weighted_would_hide
    ) VALUES (
      v_target_type,
      v_target_id,
      unique_reporters_24h,
      weighted_score,
      v_raw_would_hide,
      v_weighted_would_hide
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.apply_social_report_thresholds() IS
  'S-12 SHADOW MODE : utilise le raw count pour la decision, log raw+weighted '
  'dans social_report_threshold_shadow pour observation. Activer le weighted via '
  '20260605120000_activate_weighted_social_report_thresholds.sql apres 7+ jours.';

COMMIT;

NOTIFY pgrst, 'reload schema';
