-- Add coach_chat_enabled feature flag so the new Coach conversation tunnel can
-- be rolled out independently of the existing one-shot Coach (coach_enabled).
-- The flag defaults to false in production; staging/dev can flip it via
-- UPDATE on app_feature_flags.

ALTER TABLE public.app_feature_flags
  ADD COLUMN IF NOT EXISTS coach_chat_enabled boolean NOT NULL DEFAULT false;

UPDATE public.app_feature_flags
SET coach_chat_enabled = COALESCE(coach_chat_enabled, false);

-- Refresh the canonical RPC so the Edge Functions can read the new flag.
DROP FUNCTION IF EXISTS public.get_phase2_feature_flags(text);
CREATE OR REPLACE FUNCTION public.get_phase2_feature_flags(p_scope text DEFAULT 'mobile')
RETURNS TABLE (
  scope text,
  social_enabled boolean,
  coach_enabled boolean,
  coach_chat_enabled boolean,
  entry_offer_enabled boolean,
  social_comments_enabled boolean,
  moderation_enabled boolean,
  entry_offer_offering_id text,
  rollout_percentage integer,
  post_rate_limit_per_day integer,
  comment_rate_limit_per_hour integer,
  report_rate_limit_per_day integer,
  repeated_rejection_threshold integer,
  rejected_content_cooldown_hours integer,
  coach_cache_ttl_minutes integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    feature_flags.scope,
    feature_flags.social_enabled,
    feature_flags.coach_enabled,
    feature_flags.coach_chat_enabled,
    feature_flags.entry_offer_enabled,
    feature_flags.social_comments_enabled,
    feature_flags.moderation_enabled,
    feature_flags.entry_offer_offering_id,
    feature_flags.rollout_percentage,
    feature_flags.post_rate_limit_per_day,
    feature_flags.comment_rate_limit_per_hour,
    feature_flags.report_rate_limit_per_day,
    feature_flags.repeated_rejection_threshold,
    feature_flags.rejected_content_cooldown_hours,
    feature_flags.coach_cache_ttl_minutes
  FROM public.app_feature_flags AS feature_flags
  WHERE feature_flags.scope = COALESCE(NULLIF(btrim(p_scope), ''), 'mobile')
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_phase2_feature_flags(text) TO authenticated;

-- Refresh the convenience view consumed by the mobile client.
DROP VIEW IF EXISTS public.app_config;
CREATE VIEW public.app_config
WITH (security_invoker = true)
AS
SELECT
  scope AS key,
  jsonb_build_object(
    'social_enabled', social_enabled,
    'coach_enabled', coach_enabled,
    'coach_chat_enabled', coach_chat_enabled,
    'entry_offer_enabled', entry_offer_enabled,
    'social_comments_enabled', social_comments_enabled,
    'entry_offer_offering_id', entry_offer_offering_id,
    'post_rate_limit_per_day', post_rate_limit_per_day,
    'comment_rate_limit_per_hour', comment_rate_limit_per_hour,
    'rollout_percentage', rollout_percentage,
    'moderation_enabled', moderation_enabled
  ) AS value
FROM public.app_feature_flags;

GRANT SELECT ON public.app_config TO authenticated;

NOTIFY pgrst, 'reload schema';
