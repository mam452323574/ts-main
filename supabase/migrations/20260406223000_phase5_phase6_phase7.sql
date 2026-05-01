ALTER TABLE public.coach_entries
  ADD COLUMN IF NOT EXISTS disclaimer text;

UPDATE public.coach_entries
SET disclaimer = COALESCE(
  NULLIF(btrim(disclaimer), ''),
  NULLIF(btrim(response_payload_json ->> 'disclaimer'), ''),
  'Wellness guidance only. This is not a diagnosis or medical advice.'
)
WHERE disclaimer IS NULL OR btrim(disclaimer) = '';

UPDATE public.user_growth_experiences AS growth
SET
  entry_offer_eligible = true,
  growth_state = CASE
    WHEN growth.entry_offer_claimed_at IS NOT NULL THEN 'entry_offer_claimed'
    WHEN growth.entry_offer_dismissed_at IS NOT NULL THEN 'entry_offer_dismissed'
    WHEN growth.growth_state = 'baseline' THEN 'entry_offer_ready'
    ELSE growth.growth_state
  END,
  growth_state_updated_at = now(),
  updated_at = now()
FROM public.user_profiles AS profiles
WHERE
  profiles.id = growth.user_id
  AND profiles.account_tier = 'free'
  AND growth.entry_offer_eligible = false;

CREATE OR REPLACE FUNCTION public.ensure_user_growth_experience(
  p_offering_id text DEFAULT null
)
RETURNS public.user_growth_experiences
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_account_tier text;
  v_row public.user_growth_experiences%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT account_tier
  INTO v_account_tier
  FROM public.user_profiles
  WHERE id = v_user_id;

  IF v_account_tier IS NULL THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  INSERT INTO public.user_growth_experiences (
    user_id,
    growth_state,
    entry_offer_eligible,
    entry_offer_offering_id,
    growth_state_updated_at
  )
  VALUES (
    v_user_id,
    CASE
      WHEN v_account_tier = 'free' THEN 'entry_offer_ready'
      ELSE 'baseline'
    END,
    v_account_tier = 'free',
    p_offering_id,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    entry_offer_eligible = EXCLUDED.entry_offer_eligible,
    entry_offer_offering_id = COALESCE(
      EXCLUDED.entry_offer_offering_id,
      public.user_growth_experiences.entry_offer_offering_id
    ),
    growth_state = CASE
      WHEN public.user_growth_experiences.entry_offer_claimed_at IS NOT NULL THEN
        'entry_offer_claimed'
      WHEN public.user_growth_experiences.entry_offer_dismissed_at IS NOT NULL THEN
        'entry_offer_dismissed'
      WHEN EXCLUDED.entry_offer_eligible
        AND public.user_growth_experiences.growth_state IN ('baseline', 'entry_offer_ready') THEN
        'entry_offer_ready'
      WHEN NOT EXCLUDED.entry_offer_eligible
        AND public.user_growth_experiences.growth_state = 'entry_offer_ready' THEN
        'baseline'
      ELSE public.user_growth_experiences.growth_state
    END,
    growth_state_updated_at = now(),
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_coach_seen()
RETURNS public.user_growth_experiences
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_row public.user_growth_experiences%ROWTYPE;
BEGIN
  PERFORM public.ensure_user_growth_experience();

  UPDATE public.user_growth_experiences
  SET
    coach_seen_at = COALESCE(coach_seen_at, now()),
    growth_state = CASE
      WHEN growth_state IN ('entry_offer_claimed', 'entry_offer_dismissed') THEN growth_state
      ELSE 'coach_ready'
    END,
    growth_state_updated_at = now(),
    updated_at = now()
  WHERE user_id = v_user_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_entry_offer_shown(
  p_offering_id text DEFAULT null
)
RETURNS public.user_growth_experiences
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_row public.user_growth_experiences%ROWTYPE;
BEGIN
  PERFORM public.ensure_user_growth_experience(p_offering_id);

  UPDATE public.user_growth_experiences
  SET
    entry_offer_shown_at = COALESCE(entry_offer_shown_at, now()),
    entry_offer_offering_id = COALESCE(p_offering_id, entry_offer_offering_id),
    growth_state = CASE
      WHEN entry_offer_claimed_at IS NOT NULL THEN 'entry_offer_claimed'
      WHEN entry_offer_dismissed_at IS NOT NULL THEN 'entry_offer_dismissed'
      WHEN entry_offer_eligible THEN 'entry_offer_ready'
      ELSE growth_state
    END,
    growth_state_updated_at = now(),
    updated_at = now()
  WHERE user_id = v_user_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_entry_offer_dismissed(
  p_offering_id text DEFAULT null
)
RETURNS public.user_growth_experiences
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_row public.user_growth_experiences%ROWTYPE;
BEGIN
  PERFORM public.ensure_user_growth_experience(p_offering_id);

  UPDATE public.user_growth_experiences
  SET
    entry_offer_shown_at = COALESCE(entry_offer_shown_at, now()),
    entry_offer_dismissed_at = COALESCE(entry_offer_dismissed_at, now()),
    entry_offer_offering_id = COALESCE(p_offering_id, entry_offer_offering_id),
    growth_state = 'entry_offer_dismissed',
    growth_state_updated_at = now(),
    updated_at = now()
  WHERE user_id = v_user_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_entry_offer_claimed(
  p_offering_id text DEFAULT null
)
RETURNS public.user_growth_experiences
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_row public.user_growth_experiences%ROWTYPE;
BEGIN
  PERFORM public.ensure_user_growth_experience(p_offering_id);

  UPDATE public.user_growth_experiences
  SET
    entry_offer_shown_at = COALESCE(entry_offer_shown_at, now()),
    entry_offer_claimed_at = COALESCE(entry_offer_claimed_at, now()),
    entry_offer_offering_id = COALESCE(p_offering_id, entry_offer_offering_id),
    growth_state = 'entry_offer_claimed',
    growth_state_updated_at = now(),
    updated_at = now()
  WHERE user_id = v_user_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_user_growth_experience(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_coach_seen() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_entry_offer_shown(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_entry_offer_dismissed(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_entry_offer_claimed(text) TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
