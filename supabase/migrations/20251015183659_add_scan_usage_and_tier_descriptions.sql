/*
  # Add Scan Usage Tracking and Premium Feature Descriptions

  ## Overview
  This migration adds sophisticated scan tracking capabilities and enhances the premium
  features table with tier-specific descriptions for better user communication.

  ## Schema Changes

  ### 1. user_profiles Table Updates
  - Add `scan_usage` (jsonb) - Stores scan history per type with timestamps
    Structure: 
    {
      "health": { "last_scan_date": "ISO timestamp", "scan_timestamps": [timestamps] },
      "body": { "last_scan_date": "ISO timestamp", "scan_timestamps": [timestamps] },
      "nutrition": { "last_scan_date": "ISO timestamp", "scan_timestamps": [timestamps] }
    }

  ### 2. premium_features Table Updates
  - Add `free_tier_description` (text) - Description of free tier limitations
  - Add `premium_tier_description` (text) - Description of premium tier benefits

  ### 3. scans Table Updates
  - Modify `scan_type` to use ('body', 'health', 'nutrition') instead of ('muscle', 'fat')
  - This aligns with the new scan categorization system

  ## New Features Data
  - Add scan-specific premium features with detailed descriptions
  - health_scans: 1 per week (free) vs 3 per day (premium)
  - body_scans: 1 per month (free) vs 3 per day (premium)
  - nutrition_scans: 1 per 3 days (free) vs 3 per day (premium)

  ## Indexes
  - Create GIN index on scan_usage for fast JSONB queries
  - Create index on scans.scan_type for filtering

  ## Security
  - Maintain existing RLS policies
  - scan_usage is only accessible by the user themselves
*/

-- Add scan_usage column to user_profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'scan_usage'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN scan_usage jsonb DEFAULT '{
      "health": {"last_scan_date": null, "scan_timestamps": []},
      "body": {"last_scan_date": null, "scan_timestamps": []},
      "nutrition": {"last_scan_date": null, "scan_timestamps": []}
    }'::jsonb;
  END IF;
END $$;

-- Create GIN index on scan_usage for fast JSONB queries
CREATE INDEX IF NOT EXISTS idx_user_profiles_scan_usage 
  ON user_profiles USING GIN (scan_usage);

-- Add tier description columns to premium_features
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'premium_features' AND column_name = 'free_tier_description'
  ) THEN
    ALTER TABLE premium_features ADD COLUMN free_tier_description text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'premium_features' AND column_name = 'premium_tier_description'
  ) THEN
    ALTER TABLE premium_features ADD COLUMN premium_tier_description text;
  END IF;
END $$;

-- Update scans table to use new scan_type values
-- First, drop the old constraint if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'scans' AND constraint_name = 'scans_type_check'
  ) THEN
    ALTER TABLE scans DROP CONSTRAINT scans_type_check;
  END IF;
END $$;

-- Drop existing scan_type constraint if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'scans' AND constraint_name = 'scans_scan_type_check'
  ) THEN
    ALTER TABLE scans DROP CONSTRAINT scans_scan_type_check;
  END IF;
END $$;

-- Add new scan_type column if it doesn't exist, otherwise modify existing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scans' AND column_name = 'scan_type'
  ) THEN
    ALTER TABLE scans ADD COLUMN scan_type text;
  END IF;
END $$;

-- Add constraint for new scan_type values
ALTER TABLE scans ADD CONSTRAINT scans_scan_type_check 
  CHECK (scan_type IN ('body', 'health', 'nutrition'));

-- Create index on scan_type for fast filtering
CREATE INDEX IF NOT EXISTS idx_scans_scan_type 
  ON scans(scan_type);

-- Create composite index for user_id + scan_type + created_at for sliding window queries
CREATE INDEX IF NOT EXISTS idx_scans_user_type_created 
  ON scans(user_id, scan_type, created_at DESC);

-- Insert or update scan-specific premium features with descriptions
INSERT INTO premium_features (
  feature_key, 
  feature_name, 
  feature_description, 
  free_tier_description,
  premium_tier_description,
  requires_premium, 
  category,
  enabled
) VALUES
  (
    'health_scans',
    'Scans Santé',
    'Analysez votre santé faciale pour détecter les signes de fatigue et de stress',
    '1 scan santé par semaine',
    '3 scans santé par jour',
    false,
    'scans',
    true
  ),
  (
    'body_scans',
    'Scans Corps',
    'Suivez l''évolution de votre composition corporelle',
    '1 scan corps par mois',
    '3 scans corps par jour',
    false,
    'scans',
    true
  ),
  (
    'nutrition_scans',
    'Scans Nutrition',
    'Analysez vos repas pour un suivi nutritionnel précis',
    '1 scan nutrition tous les 3 jours',
    '3 scans nutrition par jour',
    false,
    'scans',
    true
  )
ON CONFLICT (feature_key) 
DO UPDATE SET
  free_tier_description = EXCLUDED.free_tier_description,
  premium_tier_description = EXCLUDED.premium_tier_description,
  feature_description = EXCLUDED.feature_description,
  updated_at = now();

-- Update existing premium features with tier descriptions
UPDATE premium_features
SET 
  free_tier_description = 'Accès aux recettes de base',
  premium_tier_description = 'Accès complet aux recettes premium avec plans nutritionnels et vidéos'
WHERE feature_key = 'advanced_recipes';

UPDATE premium_features
SET 
  free_tier_description = 'Graphiques basiques sur 7 jours',
  premium_tier_description = 'Analyses détaillées illimitées avec historique complet et prédictions'
WHERE feature_key = 'detailed_analytics';

UPDATE premium_features
SET 
  free_tier_description = 'Limité selon le type de scan',
  premium_tier_description = '3 scans de chaque type par jour'
WHERE feature_key = 'unlimited_scans';

UPDATE premium_features
SET 
  free_tier_description = 'Exercices de base',
  premium_tier_description = 'Programmes personnalisés avec vidéos HD et coaching'
WHERE feature_key = 'premium_exercises';

UPDATE premium_features
SET 
  free_tier_description = 'Non disponible',
  premium_tier_description = 'Export illimité en PDF ou CSV'
WHERE feature_key = 'export_data';

UPDATE premium_features
SET 
  free_tier_description = 'Support standard (48-72h)',
  premium_tier_description = 'Réponses prioritaires sous 24h'
WHERE feature_key = 'priority_support';

UPDATE premium_features
SET 
  free_tier_description = 'Objectifs prédéfinis',
  premium_tier_description = 'Objectifs personnalisés avec suivi avancé'
WHERE feature_key = 'custom_goals';

UPDATE premium_features
SET 
  free_tier_description = 'Non disponible',
  premium_tier_description = 'Planification automatique selon vos objectifs'
WHERE feature_key = 'meal_planner';
