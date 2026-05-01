-- Backfill legacy scan image paths for scans that still have NULL image_path.
-- This only updates rows when a legacy storage object is the unique best match
-- for the scan and the scan is also the unique best match for that object.

WITH legacy_candidates AS (
  SELECT
    s.id AS scan_id,
    s.user_id,
    s.created_at AS scan_created_at,
    o.name AS object_name,
    o.created_at AS object_created_at,
    abs(extract(epoch FROM (o.created_at - s.created_at))) AS seconds_apart,
    row_number() OVER (
      PARTITION BY s.id
      ORDER BY
        abs(extract(epoch FROM (o.created_at - s.created_at))) ASC,
        o.created_at ASC,
        o.name ASC
    ) AS scan_rank,
    lead(abs(extract(epoch FROM (o.created_at - s.created_at)))) OVER (
      PARTITION BY s.id
      ORDER BY
        abs(extract(epoch FROM (o.created_at - s.created_at))) ASC,
        o.created_at ASC,
        o.name ASC
    ) AS next_scan_distance,
    row_number() OVER (
      PARTITION BY o.name
      ORDER BY
        abs(extract(epoch FROM (o.created_at - s.created_at))) ASC,
        s.created_at ASC,
        s.id ASC
    ) AS object_rank,
    lead(abs(extract(epoch FROM (o.created_at - s.created_at)))) OVER (
      PARTITION BY o.name
      ORDER BY
        abs(extract(epoch FROM (o.created_at - s.created_at))) ASC,
        s.created_at ASC,
        s.id ASC
    ) AS next_object_distance
  FROM public.scans AS s
  JOIN storage.objects AS o
    ON o.bucket_id = 'scan-images'
   AND o.owner = s.user_id
   AND o.created_at >= s.created_at - interval '5 seconds'
   AND o.created_at <= coalesce(s.analyzed_at, s.created_at + interval '2 minutes')
  WHERE s.image_path IS NULL
    AND o.name LIKE s.user_id::text || '/%'
    AND o.name NOT LIKE s.user_id::text || '/scans/%'
    AND array_length(regexp_split_to_array(o.name, '/'), 1) = 2
    AND split_part(o.name, '/', 2) ~* '^[0-9]+\.(jpg|jpeg)$'
),
safe_legacy_matches AS (
  SELECT
    scan_id,
    object_name
  FROM legacy_candidates
  WHERE scan_rank = 1
    AND object_rank = 1
    AND (next_scan_distance IS NULL OR seconds_apart < next_scan_distance)
    AND (next_object_distance IS NULL OR seconds_apart < next_object_distance)
)
UPDATE public.scans AS scans
SET image_path = matches.object_name
FROM safe_legacy_matches AS matches
WHERE scans.id = matches.scan_id
  AND scans.image_path IS NULL;
