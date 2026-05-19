-- CO-04 (cf. SCANNER_COACH_AUDIT_2026_05.md §6) — quota tokens par utilisateur.
--
-- Le rate limit appels (C-01: 5/min, 30/h, 120/jour) + le cap payload outbound
-- (CO-07: 50KB) bornent indirectement la consommation tokens, mais ne
-- protegent pas contre l'utilisateur qui fait 30 appels/h avec un payload
-- proche du cap (donc 30 * 50KB = 1.5MB envoye au LLM par heure). Ce quota
-- token additionnel mesure le COUT REEL en tokens estimes et bloque les
-- patterns de spam token-intensive.
--
-- Estimation tokens : `length(payload_json) / 4` (1 token ~= 4 caracteres en
-- moyenne pour l'anglais/francais). Approximation grossiere mais suffisante
-- pour distinguer un usage normal (~ 1-5K tokens/req) d'un abuse (50K+/req).
--
-- Limites par defaut: 200 000 tokens/heure, 1 000 000 tokens/jour. Confortable
-- pour 30 generations/h de payload typique (3-7K tokens), restrictif pour
-- l'attaquant qui spamme avec payload proche du cap.

CREATE TABLE IF NOT EXISTS public.coach_token_consumption (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  consumed_at timestamptz NOT NULL DEFAULT now(),
  estimated_tokens integer NOT NULL CHECK (estimated_tokens >= 0)
);

CREATE INDEX IF NOT EXISTS idx_coach_token_consumption_user_consumed_at
  ON public.coach_token_consumption(user_id, consumed_at DESC);

ALTER TABLE public.coach_token_consumption ENABLE ROW LEVEL SECURITY;

-- Pas de policy : seul service_role lit/ecrit.

CREATE OR REPLACE FUNCTION public.record_coach_token_consumption(
  p_user_id uuid,
  p_estimated_tokens integer,
  p_per_hour_limit integer DEFAULT 200000,
  p_per_day_limit integer DEFAULT 1000000
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_hour_total integer;
  v_day_total integer;
  v_window_exceeded text;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  IF COALESCE(p_estimated_tokens, -1) < 0 THEN
    RAISE EXCEPTION 'p_estimated_tokens must be a non-negative integer';
  END IF;

  IF COALESCE(p_per_hour_limit, 0) < 1
     OR COALESCE(p_per_day_limit, 0) < 1 THEN
    RAISE EXCEPTION 'token quota limits must be positive integers';
  END IF;

  SELECT
    COALESCE(SUM(estimated_tokens) FILTER (WHERE consumed_at > v_now - interval '1 hour'), 0),
    COALESCE(SUM(estimated_tokens) FILTER (WHERE consumed_at > v_now - interval '1 day'), 0)
  INTO v_hour_total, v_day_total
  FROM public.coach_token_consumption
  WHERE user_id = p_user_id
    AND consumed_at > v_now - interval '1 day';

  IF v_hour_total + p_estimated_tokens > p_per_hour_limit THEN
    v_window_exceeded := 'hour';
  ELSIF v_day_total + p_estimated_tokens > p_per_day_limit THEN
    v_window_exceeded := 'day';
  END IF;

  IF v_window_exceeded IS NOT NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'window_exceeded', v_window_exceeded,
      'tokens_hour', v_hour_total,
      'tokens_day', v_day_total,
      'requested_tokens', p_estimated_tokens
    );
  END IF;

  INSERT INTO public.coach_token_consumption(user_id, consumed_at, estimated_tokens)
  VALUES (p_user_id, v_now, p_estimated_tokens);

  -- GC > 25h pour cet utilisateur
  DELETE FROM public.coach_token_consumption
  WHERE user_id = p_user_id
    AND consumed_at < v_now - interval '25 hours';

  RETURN jsonb_build_object(
    'allowed', true,
    'tokens_hour', v_hour_total + p_estimated_tokens,
    'tokens_day', v_day_total + p_estimated_tokens
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_coach_token_consumption(uuid, integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_coach_token_consumption(uuid, integer, integer, integer) TO service_role;

COMMENT ON FUNCTION public.record_coach_token_consumption(uuid, integer, integer, integer) IS
  'CO-04: token quota check + record (rolling hour + day). Returns {allowed, ...}.';

SELECT pg_notify('pgrst', 'reload schema');
