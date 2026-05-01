DROP FUNCTION IF EXISTS public.get_premium_potential_data(text, uuid);

CREATE OR REPLACE FUNCTION public.get_premium_potential_data(
  p_scan_type text,
  p_scan_id uuid DEFAULT NULL
)
RETURNS TABLE (
  scan_type text,
  current_scan jsonb,
  historical_average_30d numeric,
  scan_count_total bigint,
  recent_score_history jsonb
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
  _recent_score_history jsonb := '[]'::jsonb;
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

  WITH score_rows AS (
    SELECT
      scans.analyzed_at::date AS score_date,
      CASE
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
      AND scans.analyzed_at >= (now() - interval '90 days')
      AND (
        scan_metrics.scan_id IS NULL
        OR scan_metrics.scan_type = _metric_scan_type
      )
  ),
  daily_scores AS (
    SELECT
      score_date,
      AVG(score_value) AS average_score
    FROM score_rows
    WHERE score_value IS NOT NULL
    GROUP BY score_date
  )
  SELECT
    AVG(average_score) FILTER (
      WHERE score_date >= ((CURRENT_DATE - 30)::date)
    ),
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'date', to_char(score_date, 'YYYY-MM-DD'),
          'score', ROUND(average_score)::integer
        )
        ORDER BY score_date
      ),
      '[]'::jsonb
    )
  INTO
    _historical_average_30d,
    _recent_score_history
  FROM daily_scores;

  RETURN QUERY
  SELECT
    p_scan_type,
    _current_scan,
    _historical_average_30d,
    _scan_count_total,
    _recent_score_history;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_premium_potential_data(text, uuid) TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
