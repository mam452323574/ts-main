-- 20260605120000_activate_weighted_social_report_thresholds.sql
--
-- =============================================================================
-- S-12 — Activation du mode strict : trigger sur compute_weighted_report_count
-- =============================================================================
--
-- Audit : SOCIAL_SECURITY_AUDIT.md (finding S-12).
-- Pre-requis : avoir deploye 20260524131000_social_report_threshold_shadow_logging.sql
-- depuis >= 7 jours et analyse social_report_threshold_shadow.
--
-- ⚠️ NE PAS APPLIQUER cette migration avant d'avoir verifie :
--
--   SELECT
--     COUNT(*) FILTER (WHERE raw_would_hide AND NOT weighted_would_hide) AS prevented_by_weighted,
--     COUNT(*) FILTER (WHERE NOT raw_would_hide AND weighted_would_hide) AS new_via_weighted,
--     COUNT(*) FILTER (WHERE raw_would_hide = weighted_would_hide) AS agreed,
--     COUNT(*) AS total_evaluations,
--     MIN(evaluated_at) AS oldest,
--     MAX(evaluated_at) AS most_recent
--   FROM public.social_report_threshold_shadow
--   WHERE evaluated_at >= now() - interval '7 days';
--
-- Et confirme avec produit que les coefficients (compte <1j=0.25, <7j=0.5,
-- dismissed>=10=0.25) sont les bons. Une fois la migration appliquee :
--   - La trigger utilise weighted_score pour la decision.
--   - Le shadow logging continue (utile pour detecter les regressions).
--   - Le seuil reste 3 mais c'est un score, plus un count : 3 reports "etablis"
--     (poids 1.0 chacun) ou 12 reports de comptes neufs (poids 0.25) declenchent
--     l'auto-hide.

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
  auto_hide_threshold constant numeric := 3.0;
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

    -- S-12 ACTIVATION — la decision passe sur le weighted score.
    weighted_score := public.compute_weighted_report_count('post', NEW.target_post_id, interval '24 hours');

    IF weighted_score >= auto_hide_threshold THEN
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
            'auto_hide_mode', 'weighted',
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

    IF weighted_score >= auto_hide_threshold THEN
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
            'auto_hide_mode', 'weighted',
            'auto_hidden_at', now()
          )
      WHERE id = NEW.target_comment_id
        AND deleted_at IS NULL
        AND moderation_state IN ('approved', 'pending');
    END IF;
  END IF;

  -- Continue le shadow logging meme apres activation : utile pour detecter
  -- une regression (si weighted commence soudainement a beaucoup divergeer
  -- de raw, c'est une alerte produit).
  IF v_target_type IS NOT NULL THEN
    v_raw_would_hide := unique_reporters_24h >= 3;
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
  'S-12 ACTIVE : decision basee sur compute_weighted_report_count(target, 24h). '
  'Coefficients : compte <1j=0.25, <7j=0.5, dismissed>=10=0.25, sinon 1.0. Seuil 3.0. '
  'Shadow logging conserve pour detection de regression.';

COMMIT;

NOTIFY pgrst, 'reload schema';
