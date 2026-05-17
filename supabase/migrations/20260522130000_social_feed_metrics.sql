-- Social feed Phase D — observability (D6 + D7)
--
--   D6. social_feed_arm_metrics: per-(arm, day) counters bumped by triggers
--       on impressions / reactions / comments / saves. arm is derived from
--       hash(viewer_id || 'social_rank_v7') % 100 — 'control' (<50) vs
--       'log_sat' (>=50). Today the RPC uses log_sat for everyone, so the
--       arms only differ in telemetry: this is the scaffolding to support
--       split-tests later without re-creating the table.
--
--   D7. social_feed_health_v1: materialized view aggregating impressions,
--       unique viewers, likes, comments per (day, language_code, category).
--       Refreshed by the SECURITY DEFINER function refresh_social_feed_health(),
--       callable by service_role only (intended for a scheduled job or admin).

-- ---------------------------------------------------------------------------
-- 1. D6 — social_feed_arm_metrics + helper to compute arm
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.social_feed_arm_metrics (
  arm text NOT NULL,
  metric_day date NOT NULL,
  impressions bigint NOT NULL DEFAULT 0,
  reactions bigint NOT NULL DEFAULT 0,
  comments bigint NOT NULL DEFAULT 0,
  saves bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (arm, metric_day),
  CHECK (arm IN ('control', 'log_sat'))
);

ALTER TABLE public.social_feed_arm_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read arm metrics" ON public.social_feed_arm_metrics;
CREATE POLICY "admins read arm metrics"
  ON public.social_feed_arm_metrics
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles AS profile
       WHERE profile.id = auth.uid()
         AND profile.account_tier = 'admin'
    )
  );
-- No INSERT/UPDATE/DELETE policy: writes only via SECURITY DEFINER trigger
-- functions below.

CREATE OR REPLACE FUNCTION public.compute_social_feed_arm(p_viewer_id uuid)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, auth
AS $$
DECLARE
  hash_value integer;
BEGIN
  IF p_viewer_id IS NULL THEN
    RETURN 'control';
  END IF;
  hash_value := ('x' || substr(md5(p_viewer_id::text || 'social_rank_v7'), 1, 2))::bit(8)::int;
  RETURN CASE WHEN (hash_value % 100) < 50 THEN 'control' ELSE 'log_sat' END;
END;
$$;

COMMENT ON FUNCTION public.compute_social_feed_arm(uuid) IS
  'Deterministic arm assignment for a viewer (hash-based, stable across sessions).';

-- Generic incrementer: upsert (arm, today) and add a count to one metric.
CREATE OR REPLACE FUNCTION public.bump_social_feed_arm_metric(
  p_arm text,
  p_metric text,
  p_delta bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF p_delta = 0 THEN RETURN; END IF;
  IF p_arm IS NULL OR p_arm NOT IN ('control', 'log_sat') THEN RETURN; END IF;
  IF p_metric NOT IN ('impressions', 'reactions', 'comments', 'saves') THEN RETURN; END IF;

  EXECUTE format(
    $sql$
      INSERT INTO public.social_feed_arm_metrics (arm, metric_day, %1$I, updated_at)
      VALUES ($1, CURRENT_DATE, $2, now())
      ON CONFLICT (arm, metric_day) DO UPDATE
        SET %1$I = social_feed_arm_metrics.%1$I + EXCLUDED.%1$I,
            updated_at = now()
    $sql$,
    p_metric
  ) USING p_arm, p_delta;
END;
$$;

-- Trigger: count impressions per arm
CREATE OR REPLACE FUNCTION public.handle_social_arm_impression_metric()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  arm_value text := public.compute_social_feed_arm(NEW.viewer_id);
BEGIN
  PERFORM public.bump_social_feed_arm_metric(arm_value, 'impressions', 1);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_social_post_impressions_arm_metric
  ON public.social_post_impressions;
CREATE TRIGGER tg_social_post_impressions_arm_metric
  AFTER INSERT ON public.social_post_impressions
  FOR EACH ROW EXECUTE FUNCTION public.handle_social_arm_impression_metric();

-- Trigger: count reactions per arm
CREATE OR REPLACE FUNCTION public.handle_social_arm_reaction_metric()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  arm_value text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    arm_value := public.compute_social_feed_arm(NEW.user_id);
    PERFORM public.bump_social_feed_arm_metric(arm_value, 'reactions', 1);
  ELSIF TG_OP = 'DELETE' THEN
    arm_value := public.compute_social_feed_arm(OLD.user_id);
    PERFORM public.bump_social_feed_arm_metric(arm_value, 'reactions', -1);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS tg_social_post_likes_arm_metric
  ON public.social_post_likes;
CREATE TRIGGER tg_social_post_likes_arm_metric
  AFTER INSERT OR DELETE ON public.social_post_likes
  FOR EACH ROW EXECUTE FUNCTION public.handle_social_arm_reaction_metric();

-- Trigger: count visible comments per arm
CREATE OR REPLACE FUNCTION public.handle_social_arm_comment_metric()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  arm_value text := public.compute_social_feed_arm(COALESCE(NEW.author_id, OLD.author_id));
  was_visible boolean := false;
  is_visible boolean := false;
  delta int := 0;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    was_visible := OLD.deleted_at IS NULL AND OLD.moderation_state = 'approved';
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    is_visible := NEW.deleted_at IS NULL AND NEW.moderation_state = 'approved';
  END IF;
  delta := (CASE WHEN is_visible THEN 1 ELSE 0 END)
         - (CASE WHEN was_visible THEN 1 ELSE 0 END);
  IF delta <> 0 THEN
    PERFORM public.bump_social_feed_arm_metric(arm_value, 'comments', delta);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS tg_social_comments_arm_metric
  ON public.social_comments;
CREATE TRIGGER tg_social_comments_arm_metric
  AFTER INSERT OR UPDATE OR DELETE ON public.social_comments
  FOR EACH ROW EXECUTE FUNCTION public.handle_social_arm_comment_metric();

-- Trigger: count saves per arm
CREATE OR REPLACE FUNCTION public.handle_social_arm_save_metric()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  arm_value text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    arm_value := public.compute_social_feed_arm(NEW.viewer_id);
    PERFORM public.bump_social_feed_arm_metric(arm_value, 'saves', 1);
  ELSIF TG_OP = 'DELETE' THEN
    arm_value := public.compute_social_feed_arm(OLD.viewer_id);
    PERFORM public.bump_social_feed_arm_metric(arm_value, 'saves', -1);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS tg_social_post_saves_arm_metric
  ON public.social_post_saves;
CREATE TRIGGER tg_social_post_saves_arm_metric
  AFTER INSERT OR DELETE ON public.social_post_saves
  FOR EACH ROW EXECUTE FUNCTION public.handle_social_arm_save_metric();

-- ---------------------------------------------------------------------------
-- 2. D7 — materialized view social_feed_health_v1 + refresh function
-- ---------------------------------------------------------------------------

DROP MATERIALIZED VIEW IF EXISTS public.social_feed_health_v1;

CREATE MATERIALIZED VIEW public.social_feed_health_v1 AS
SELECT
  date_trunc('day', impression.impression_window)::date AS metric_day,
  COALESCE(post.language_code, 'unknown') AS language_code,
  COALESCE(post.category, 'unknown') AS category,
  COUNT(*)::bigint AS impressions,
  COUNT(DISTINCT impression.viewer_id)::bigint AS unique_viewers,
  COALESCE(SUM(post.like_count), 0)::bigint AS likes_total,
  COALESCE(SUM(post.dislike_count), 0)::bigint AS dislikes_total,
  COALESCE(SUM(post.comment_count), 0)::bigint AS comments_total,
  COALESCE(SUM(post.save_count), 0)::bigint AS saves_total,
  CASE
    WHEN COUNT(*) > 0
      THEN ROUND(SUM(post.like_count)::numeric / COUNT(*), 4)
    ELSE 0
  END AS likes_per_impression
FROM public.social_post_impressions AS impression
JOIN public.social_posts AS post
  ON post.id = impression.post_id
WHERE post.deleted_at IS NULL
GROUP BY 1, 2, 3;

CREATE UNIQUE INDEX IF NOT EXISTS idx_social_feed_health_v1_unique
  ON public.social_feed_health_v1 (metric_day, language_code, category);

CREATE INDEX IF NOT EXISTS idx_social_feed_health_v1_day
  ON public.social_feed_health_v1 (metric_day DESC);

-- Refresh function (callable by service_role from a cron/edge function)
CREATE OR REPLACE FUNCTION public.refresh_social_feed_health()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.social_feed_health_v1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.refresh_social_feed_health() FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_social_feed_health() TO service_role;

COMMENT ON FUNCTION public.refresh_social_feed_health() IS
  'Refresh the social_feed_health_v1 materialized view. Intended for a scheduled job or admin call.';

SELECT pg_notify('pgrst', 'reload schema');
