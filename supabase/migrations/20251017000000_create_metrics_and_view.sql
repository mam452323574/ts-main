-- Create scan_metrics table for efficient history querying
CREATE TABLE IF NOT EXISTS scan_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  scan_id uuid REFERENCES scans(id) ON DELETE CASCADE,
  scan_type text NOT NULL, -- 'face', 'body', 'nutrition', 'super'
  
  -- Common metrics
  recorded_at timestamptz DEFAULT now(),
  
  -- Body Metrics
  body_score integer,
  body_fat_percentage decimal(5,2),
  waist_estimation_cm decimal(5,2),
  
  -- Face Metrics
  face_score integer,
  skin_quality_score integer,
  fatigue_level integer,
  
  -- Nutrition Metrics
  plate_health_score integer,
  calories_estimate integer,
  protein_grams integer,
  
  -- Super Scan Metrics
  global_risk_score integer
);

-- Enable RLS
ALTER TABLE scan_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own metrics"
  ON scan_metrics FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own metrics"
  ON scan_metrics FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_scan_metrics_user_date ON scan_metrics(user_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_metrics_type ON scan_metrics(scan_type);

-- Create View for Current Global Score
-- Logic: Average of latest Face Score and latest Body Score.
-- If one is missing, use the other. If both missing, 0.
CREATE OR REPLACE VIEW user_current_global_score AS
WITH latest_face AS (
  SELECT DISTINCT ON (user_id) 
    user_id, 
    face_score, 
    recorded_at
  FROM scan_metrics
  WHERE scan_type = 'face' AND face_score IS NOT NULL
  ORDER BY user_id, recorded_at DESC
),
latest_body AS (
  SELECT DISTINCT ON (user_id) 
    user_id, 
    body_score, 
    recorded_at
  FROM scan_metrics
  WHERE scan_type = 'body' AND body_score IS NOT NULL
  ORDER BY user_id, recorded_at DESC
)
SELECT 
  u.id as user_id,
  COALESCE(
    CASE 
      WHEN f.face_score IS NOT NULL AND b.body_score IS NOT NULL THEN (f.face_score + b.body_score) / 2
      WHEN f.face_score IS NOT NULL THEN f.face_score
      WHEN b.body_score IS NOT NULL THEN b.body_score
      ELSE 0
    END, 
    0
  ) as global_score,
  GREATEST(f.recorded_at, b.recorded_at) as last_updated_at
FROM user_profiles u
LEFT JOIN latest_face f ON u.id = f.user_id
LEFT JOIN latest_body b ON u.id = b.user_id;

-- Grant access to the view
GRANT SELECT ON user_current_global_score TO authenticated;
