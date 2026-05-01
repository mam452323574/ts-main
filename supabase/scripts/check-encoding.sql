SHOW server_encoding;

SELECT
  current_database() AS database_name,
  pg_encoding_to_char(encoding) AS encoding,
  datcollate,
  datctype
FROM pg_database
WHERE datname = current_database();

SELECT id, title, body
FROM notification_logs
WHERE concat_ws(' ', title, body) ~ '(Ã.|Â.|ðŸ|â€¢|âœ|ï¸)';

SELECT
  id,
  feature_key,
  feature_name,
  feature_description,
  free_tier_description,
  premium_tier_description
FROM premium_features
WHERE concat_ws(
  ' ',
  feature_name,
  feature_description,
  free_tier_description,
  premium_tier_description
) ~ '(Ã.|Â.|ðŸ|â€¢|âœ|ï¸)';

SELECT id, scan_type, analysis_result::text
FROM scans
WHERE analysis_result::text ~ '(Ã.|Â.|ðŸ|â€¢|âœ|ï¸)';
