-- Align premium_features copy with the free 1-scan-per-24h rule.

UPDATE premium_features
SET
  feature_name = 'Scans quotidiens',
  feature_description = '1 scan gratuit par type toutes les 24h, puis jusqu''a 3 scans par type par jour en Premium',
  free_tier_description = '1 scan de chaque type toutes les 24h',
  premium_tier_description = '3 scans de chaque type par jour'
WHERE feature_key = 'unlimited_scans';
