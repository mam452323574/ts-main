-- Coach conversational context (CO-* du COACH_CONVERSATIONNEL_DATA_AUDIT
-- 2026-05-20). RPC consommee par buildCoachUserContext pour fournir au coach
-- conversationnel un resume des scans de l'utilisateur (total cumulatif,
-- fenetres 7j/30j, premier scan, dernier scan, breakdown par scan_type).
-- Cela permet au coach de repondre precisement a "combien j'ai fait de
-- scans", "depuis quand j'utilise l'app", "combien de scans visage", etc.
--
-- SECURITY DEFINER : la fonction est appelee par service_role depuis
-- l'Edge Function, mais on epingle search_path et on n'accepte que le
-- p_user_id pour eviter toute escalade. GRANT EXECUTE explicite a
-- service_role uniquement. authenticated ne doit pas pouvoir requeter
-- pour un autre user_id.

CREATE OR REPLACE FUNCTION public.get_user_scan_summary(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH counts AS (
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (
        WHERE created_at > now() - interval '7 days'
      )::int AS last_7d,
      COUNT(*) FILTER (
        WHERE created_at > now() - interval '30 days'
      )::int AS last_30d,
      MIN(created_at) AS first_at,
      MAX(created_at) AS last_at
    FROM public.scans
    WHERE user_id = p_user_id
  ),
  by_type AS (
    SELECT
      jsonb_object_agg(scan_type, scan_count) AS counts
    FROM (
      SELECT scan_type, COUNT(*)::int AS scan_count
      FROM public.scans
      WHERE user_id = p_user_id
      GROUP BY scan_type
    ) grouped
  )
  SELECT jsonb_build_object(
    'total', COALESCE(counts.total, 0),
    'last_7d', COALESCE(counts.last_7d, 0),
    'last_30d', COALESCE(counts.last_30d, 0),
    'first_at', counts.first_at,
    'last_at', counts.last_at,
    'by_type', COALESCE(by_type.counts, '{}'::jsonb)
  )
  FROM counts
  LEFT JOIN by_type ON true;
$$;

REVOKE ALL ON FUNCTION public.get_user_scan_summary(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_scan_summary(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.get_user_scan_summary(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_scan_summary(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
