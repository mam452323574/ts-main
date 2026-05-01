-- Premium potential backend support:
-- - ensure scans has analysis payload/timestamp columns used by the app
-- - extend scan_metrics with 3-month premium potential fields
-- - make scan_metrics writes idempotent by scan_id
-- - expose premium potential RPC for the authenticated user

ALTER TABLE public.scans
  ADD COLUMN IF NOT EXISTS analysis_result jsonb,
  ADD COLUMN IF NOT EXISTS analyzed_at timestamptz;

ALTER TABLE public.scan_metrics
  ADD COLUMN IF NOT EXISTS face_symmetry_percentage integer,
  ADD COLUMN IF NOT EXISTS face_energy_score integer,
  ADD COLUMN IF NOT EXISTS body_metabolic_age integer,
  ADD COLUMN IF NOT EXISTS body_strength_index integer,
  ADD COLUMN IF NOT EXISTS nutrition_satiety_index integer;

WITH ranked_metrics AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY scan_id
      ORDER BY recorded_at DESC NULLS LAST, id DESC
    ) AS row_number
  FROM public.scan_metrics
  WHERE scan_id IS NOT NULL
)
DELETE FROM public.scan_metrics metrics
USING ranked_metrics duplicates
WHERE metrics.id = duplicates.id
  AND duplicates.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_scan_metrics_scan_id_unique
  ON public.scan_metrics(scan_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'scan_metrics'
      AND policyname = 'Users can update own metrics'
  ) THEN
    CREATE POLICY "Users can update own metrics"
      ON public.scan_metrics
      FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.get_premium_potential_data(text, uuid);

CREATE OR REPLACE FUNCTION public.get_premium_potential_data(
  p_scan_type text,
  p_scan_id uuid DEFAULT NULL
)
RETURNS TABLE (
  scan_type text,
  current_scan jsonb,
  historical_average_30d numeric,
  scan_count_total bigint
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _current_scan_id uuid;
  _current_scan jsonb;
  _historical_average_30d numeric;
  _scan_count_total bigint := 0;
  _metric_scan_type text;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_scan_type NOT IN ('health', 'body', 'nutrition', 'super') THEN
    RAISE EXCEPTION 'Unsupported scan type: %', p_scan_type
      USING ERRCODE = '22023';
  END IF;

  _metric_scan_type := CASE
    WHEN p_scan_type = 'health' THEN 'face'
    ELSE p_scan_type
  END;

  IF p_scan_id IS NOT NULL THEN
    SELECT
      scans.id,
      to_jsonb(scans)
    INTO
      _current_scan_id,
      _current_scan
    FROM public.scans
    WHERE scans.id = p_scan_id
      AND scans.user_id = _user_id
      AND scans.scan_type = p_scan_type
      AND scans.analysis_result IS NOT NULL
      AND scans.analyzed_at IS NOT NULL
    LIMIT 1;

    IF _current_scan_id IS NULL THEN
      RAISE EXCEPTION 'Requested scan was not found or is not analyzed for this user and type'
        USING ERRCODE = 'P0001';
    END IF;
  ELSE
    SELECT
      scans.id,
      to_jsonb(scans)
    INTO
      _current_scan_id,
      _current_scan
    FROM public.scans
    WHERE scans.user_id = _user_id
      AND scans.scan_type = p_scan_type
      AND scans.analysis_result IS NOT NULL
      AND scans.analyzed_at IS NOT NULL
    ORDER BY scans.analyzed_at DESC NULLS LAST, scans.created_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  SELECT COUNT(*)
  INTO _scan_count_total
  FROM public.scans
  WHERE scans.user_id = _user_id
    AND scans.scan_type = p_scan_type
    AND scans.analysis_result IS NOT NULL
    AND scans.analyzed_at IS NOT NULL;

  SELECT AVG(scores.score_value)
  INTO _historical_average_30d
  FROM (
    SELECT CASE
      WHEN p_scan_type = 'health' THEN scan_metrics.face_score::numeric
      WHEN p_scan_type = 'body' THEN scan_metrics.body_score::numeric
      WHEN p_scan_type = 'nutrition' THEN scan_metrics.plate_health_score::numeric
      WHEN p_scan_type = 'super' THEN scan_metrics.global_risk_score::numeric
      ELSE NULL::numeric
    END AS score_value
    FROM public.scans
    LEFT JOIN public.scan_metrics
      ON scan_metrics.scan_id = scans.id
    WHERE scans.user_id = _user_id
      AND scans.scan_type = p_scan_type
      AND scans.analysis_result IS NOT NULL
      AND scans.analyzed_at IS NOT NULL
      AND scans.analyzed_at >= (now() - interval '30 days')
      AND (
        scan_metrics.scan_id IS NULL
        OR scan_metrics.scan_type = _metric_scan_type
      )
  ) AS scores
  WHERE scores.score_value IS NOT NULL;

  RETURN QUERY
  SELECT
    p_scan_type,
    _current_scan,
    _historical_average_30d,
    _scan_count_total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_premium_potential_data(text, uuid) TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
