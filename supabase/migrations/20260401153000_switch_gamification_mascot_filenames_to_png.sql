CREATE OR REPLACE FUNCTION public.get_user_gamification_state()
RETURNS TABLE (
  scan_count integer,
  mascot_stage integer,
  mascot_filename text,
  mascot_image_url text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  WITH current_profile AS (
    SELECT COALESCE(
      (
        SELECT up.scan_count
        FROM public.user_profiles AS up
        WHERE up.id = auth.uid()
      ),
      0
    )::integer AS scan_count
  ),
  resolved_state AS (
    SELECT
      scan_count,
      CASE
        WHEN scan_count <= 0 THEN 0
        WHEN scan_count BETWEEN 1 AND 2 THEN 1
        WHEN scan_count BETWEEN 3 AND 4 THEN 2
        WHEN scan_count BETWEEN 5 AND 9 THEN 3
        WHEN scan_count BETWEEN 10 AND 19 THEN 4
        WHEN scan_count BETWEEN 20 AND 29 THEN 5
        WHEN scan_count BETWEEN 30 AND 49 THEN 6
        WHEN scan_count BETWEEN 50 AND 99 THEN 7
        WHEN scan_count BETWEEN 100 AND 149 THEN 8
        WHEN scan_count BETWEEN 150 AND 199 THEN 9
        ELSE 10
      END AS mascot_stage,
      CASE
        WHEN scan_count <= 0 THEN 'image_vide.png'
        WHEN scan_count BETWEEN 1 AND 2 THEN 'stade_1.png'
        WHEN scan_count BETWEEN 3 AND 4 THEN 'stade_2.png'
        WHEN scan_count BETWEEN 5 AND 9 THEN 'stade_3.png'
        WHEN scan_count BETWEEN 10 AND 19 THEN 'stade_4.png'
        WHEN scan_count BETWEEN 20 AND 29 THEN 'stade_5.png'
        WHEN scan_count BETWEEN 30 AND 49 THEN 'stade_6.png'
        WHEN scan_count BETWEEN 50 AND 99 THEN 'stade_7.png'
        WHEN scan_count BETWEEN 100 AND 149 THEN 'stade_8.png'
        WHEN scan_count BETWEEN 150 AND 199 THEN 'stade_9.png'
        ELSE 'stade_10.png'
      END AS mascot_filename
    FROM current_profile
  )
  SELECT
    scan_count,
    mascot_stage,
    mascot_filename,
    public.construct_gamification_asset_url(mascot_filename) AS mascot_image_url
  FROM resolved_state;
$$;
