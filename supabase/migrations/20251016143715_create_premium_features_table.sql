/*
  # Premium Features Configuration Table

  ## Overview
  Creates a table to dynamically manage which features require premium subscription.

  ## New Tables

  ### premium_features
  - `id` (uuid, primary key) - Unique identifier
  - `feature_key` (text, UNIQUE, NOT NULL) - Programmatic identifier
  - `feature_name` (text, NOT NULL) - Human-readable name
  - `feature_description` (text) - Description for UI display
  - `requires_premium` (boolean, DEFAULT true) - Whether this feature needs premium
  - `category` (text) - Feature category
  - `created_at` (timestamptz) - When feature was added
  - `updated_at` (timestamptz) - Last modification time
  - `enabled` (boolean, DEFAULT true) - Whether feature is active at all

  ## Security
  - Enable RLS on premium_features table
  - All authenticated users can read features for client-side gating
*/

-- Create premium_features table
CREATE TABLE IF NOT EXISTS premium_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key text UNIQUE NOT NULL,
  feature_name text NOT NULL,
  feature_description text,
  requires_premium boolean DEFAULT true,
  category text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  enabled boolean DEFAULT true
);

-- Enable RLS
ALTER TABLE premium_features ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read enabled features
CREATE POLICY "Authenticated users can view enabled features"
  ON premium_features FOR SELECT
  TO authenticated
  USING (enabled = true);

-- Create index for fast feature key lookups
CREATE INDEX IF NOT EXISTS idx_premium_features_key 
  ON premium_features(feature_key) WHERE enabled = true;

CREATE INDEX IF NOT EXISTS idx_premium_features_category 
  ON premium_features(category) WHERE enabled = true;

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_premium_features_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_premium_features_updated_at ON premium_features;
CREATE TRIGGER trigger_update_premium_features_updated_at
  BEFORE UPDATE ON premium_features
  FOR EACH ROW
  EXECUTE FUNCTION update_premium_features_updated_at();

-- Seed initial premium features
INSERT INTO premium_features (
  feature_key, 
  feature_name, 
  feature_description, 
  requires_premium, 
  category,
  enabled
) VALUES
  ('advanced_recipes', 'Recettes Avancées', 'Accès aux recettes premium avec plans nutritionnels détaillés et vidéos', true, 'content', true),
  ('detailed_analytics', 'Analyses Détaillées', 'Graphiques avancés, historique complet et prédictions de santé', true, 'analytics', true),
  ('unlimited_scans', 'Scans Illimités', 'Nombre illimité de scans corporels, santé et nutrition par jour', true, 'scans', true),
  ('premium_exercises', 'Exercices Premium', 'Programmes d''exercices personnalisés et vidéos HD', true, 'content', true),
  ('export_data', 'Export de Données', 'Export de vos données de santé en PDF ou CSV', true, 'analytics', true),
  ('priority_support', 'Support Prioritaire', 'Réponses rapides de notre équipe support', true, 'support', true),
  ('custom_goals', 'Objectifs Personnalisés', 'Définissez des objectifs de santé sur mesure avec suivi avancé', true, 'features', true),
  ('meal_planner', 'Planificateur de Repas', 'Planification automatique des repas selon vos objectifs', true, 'content', true)
ON CONFLICT (feature_key) DO NOTHING;

-- Function to check if a feature requires premium
CREATE OR REPLACE FUNCTION feature_requires_premium(p_feature_key text)
RETURNS boolean AS $$
DECLARE
  v_requires_premium boolean;
BEGIN
  SELECT requires_premium INTO v_requires_premium
  FROM premium_features
  WHERE feature_key = p_feature_key AND enabled = true;
  
  RETURN COALESCE(v_requires_premium, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user has access to a feature
CREATE OR REPLACE FUNCTION user_has_feature_access(
  p_user_id uuid,
  p_feature_key text
)
RETURNS boolean AS $$
DECLARE
  v_account_tier text;
  v_requires_premium boolean;
BEGIN
  SELECT account_tier INTO v_account_tier
  FROM user_profiles
  WHERE id = p_user_id;
  
  SELECT requires_premium INTO v_requires_premium
  FROM premium_features
  WHERE feature_key = p_feature_key AND enabled = true;
  
  IF v_requires_premium IS NULL OR v_requires_premium = false THEN
    RETURN true;
  END IF;
  
  RETURN v_account_tier = 'premium';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;