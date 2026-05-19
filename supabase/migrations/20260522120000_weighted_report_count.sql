-- 20260522120000_weighted_report_count.sql
--
-- =============================================================================
-- S-12 — Pondération anti-brigading des reports sociaux (shadow mode)
-- =============================================================================
--
-- Audit : SOCIAL_SECURITY_AUDIT.md (finding S-12).
--
-- Contexte. Le seuil d'auto-hide actuel = 3 reports uniques en 24h. Trois
-- comptes coordonnes ou trois comptes neufs sock-puppet suffisent a cacher
-- n'importe quel post.
--
-- Cette migration introduit `compute_weighted_report_count` qui pondere chaque
-- reporter par :
--   - Age du compte : < 1j = 0.25, < 7j = 0.5, sinon 1.0
--   - Historique de dismissed : ≥ 10 reports historiquement dismissed = 0.25
--
-- IMPORTANT : la fonction est livree en SHADOW MODE. Elle est ajoutee a la
-- base, mais la trigger `apply_social_report_thresholds` continue d'utiliser
-- le count brut. L'idee est de comparer pendant 7 jours en prod (shadow
-- logging) avant de basculer la trigger. La transition vers le mode actif
-- se fera dans une migration ulterieure (20260605_activate_weighted_reports.sql)
-- apres validation produit des coefficients.
--
-- Voir SOCIAL_FIX_PLAN.md S-12 pour le plan de rollout.

BEGIN;

CREATE OR REPLACE FUNCTION public.compute_weighted_report_count(
  p_target_type text,
  p_target_id uuid,
  p_window interval DEFAULT '24 hours'::interval
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  WITH weighted_reports AS (
    SELECT
      social_report.reporter_id,
      CASE
        -- Compte tout neuf : faible poids (sock-puppet probable).
        WHEN profile.created_at > now() - INTERVAL '1 day' THEN 0.25
        WHEN profile.created_at > now() - INTERVAL '7 days' THEN 0.5
        -- Historique de reports dismissed eleve : reporter "spammeur" connu.
        WHEN (
          SELECT COUNT(*)
          FROM public.social_reports prior_report
          WHERE prior_report.reporter_id = social_report.reporter_id
            AND prior_report.workflow_status = 'dismissed'
        ) >= 10 THEN 0.25
        -- Compte etabli avec historique sain : poids plein.
        ELSE 1.0
      END AS weight
    FROM public.social_reports social_report
    JOIN public.user_profiles profile
      ON profile.id = social_report.reporter_id
    WHERE social_report.created_at > now() - p_window
      AND (
        (p_target_type = 'post' AND social_report.target_post_id = p_target_id)
        OR
        (p_target_type = 'comment' AND social_report.target_comment_id = p_target_id)
      )
      -- Une seule contribution par reporter par target (deja garanti par
      -- contrainte UNIQUE sur social_reports mais defensif).
    GROUP BY social_report.reporter_id, profile.created_at
  )
  SELECT COALESCE(SUM(weight), 0)::numeric FROM weighted_reports;
$$;

REVOKE ALL ON FUNCTION public.compute_weighted_report_count(text, uuid, interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_weighted_report_count(text, uuid, interval) TO service_role;

COMMENT ON FUNCTION public.compute_weighted_report_count(text, uuid, interval) IS
  'S-12 : score pondere des reports anti-brigading. SHADOW MODE — pas encore '
  'branche dans apply_social_report_thresholds. Coefficients : compte <1j=0.25, '
  '<7j=0.5, historique dismissed >=10=0.25, sinon 1.0. Voir SOCIAL_SECURITY_AUDIT.md S-12.';

-- =============================================================================
-- Table de comparaison shadow vs raw (utilisee par le monitoring)
-- =============================================================================
--
-- Pendant la periode d'observation (7 jours minimum), on stocke pour chaque
-- evaluation de la trigger le score raw ET le score weighted. Les analystes
-- peuvent comparer la divergence (taux de faux positifs/negatifs si on
-- basculait sur weighted) avant d'activer le mode strict.

CREATE TABLE IF NOT EXISTS public.social_report_threshold_shadow (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type text NOT NULL CHECK (target_type IN ('post', 'comment')),
  target_id uuid NOT NULL,
  raw_count integer NOT NULL,
  weighted_score numeric NOT NULL,
  raw_would_hide boolean NOT NULL,
  weighted_would_hide boolean NOT NULL,
  evaluated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_report_threshold_shadow_evaluated_at
  ON public.social_report_threshold_shadow (evaluated_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_report_threshold_shadow_target
  ON public.social_report_threshold_shadow (target_type, target_id, evaluated_at DESC);

ALTER TABLE public.social_report_threshold_shadow ENABLE ROW LEVEL SECURITY;

-- Pas de policy SELECT : la table n'est pas exposee aux clients. Seul le
-- service_role peut lire pour analyse.
REVOKE ALL ON TABLE public.social_report_threshold_shadow FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.social_report_threshold_shadow IS
  'S-12 : trace les decisions raw vs weighted pendant la periode d''observation '
  'avant activation du mode strict. Analyse manuelle par les ops pour valider '
  'les coefficients.';

COMMIT;

NOTIFY pgrst, 'reload schema';
