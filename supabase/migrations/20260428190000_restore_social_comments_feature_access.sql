-- Keep social comments available to all authenticated mobile users.
-- Comments are not premium-only or admin-only; only an explicit global flag
-- should disable them.

INSERT INTO public.app_feature_flags (
  scope,
  social_enabled,
  coach_enabled,
  entry_offer_enabled,
  social_comments_enabled,
  moderation_enabled
)
VALUES (
  'mobile',
  false,
  false,
  false,
  true,
  false
)
ON CONFLICT (scope) DO UPDATE SET
  social_comments_enabled = true,
  updated_at = now();

GRANT SELECT ON public.app_feature_flags TO authenticated;
GRANT SELECT ON public.app_config TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_phase2_feature_flags(text) TO authenticated;

DROP POLICY IF EXISTS "Authenticated users can view app feature flags"
ON public.app_feature_flags;

CREATE POLICY "Authenticated users can view app feature flags"
ON public.app_feature_flags
FOR SELECT
TO authenticated
USING (true);

NOTIFY pgrst, 'reload schema';
