/*
  # Create Health Scan Database Schema

  ## Overview
  Creates the complete database structure for the Health Scan application including user profiles,
  health metrics, scans, recipes, and exercises.

  ## New Tables

  1. `user_profiles`
    - `id` (uuid, primary key, references auth.users)
    - `email` (text)
    - `created_at` (timestamptz)
    - `updated_at` (timestamptz)

  2. `health_scores`
    - `id` (uuid, primary key)
    - `user_id` (uuid, references user_profiles)
    - `score` (integer)
    - `calories_current` (integer)
    - `calories_goal` (integer)
    - `bodyfat` (decimal)
    - `muscle` (decimal)
    - `date` (date)
    - `created_at` (timestamptz)

  3. `scans`
    - `id` (uuid, primary key)
    - `user_id` (uuid, references user_profiles)
    - `type` (text: 'muscle' or 'fat')
    - `percentage` (decimal)
    - `image_url` (text)
    - `created_at` (timestamptz)

  4. `recipes`
    - `id` (uuid, primary key)
    - `name` (text)
    - `image_url` (text)
    - `preparation_time` (integer in minutes)
    - `difficulty` (text: 'easy', 'medium', 'hard')
    - `ingredients` (jsonb)
    - `instructions` (text)
    - `created_at` (timestamptz)

  5. `exercises`
    - `id` (uuid, primary key)
    - `name` (text)
    - `image_url` (text)
    - `duration` (integer in minutes)
    - `difficulty` (text: 'easy', 'medium', 'hard')
    - `description` (text)
    - `created_at` (timestamptz)

  6. `recommended_products`
    - `id` (uuid, primary key)
    - `name` (text)
    - `image_url` (text)
    - `benefits` (jsonb array)
    - `shop_url` (text)
    - `active` (boolean)
    - `created_at` (timestamptz)

  ## Security
  - Enable RLS on all tables
  - Users can only access their own data
  - Recipes and exercises are publicly readable
  - Products are publicly readable
*/

-- Create user_profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Create health_scores table
CREATE TABLE IF NOT EXISTS health_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  score integer NOT NULL DEFAULT 0,
  calories_current integer NOT NULL DEFAULT 0,
  calories_goal integer NOT NULL DEFAULT 2000,
  bodyfat decimal(5,2) NOT NULL DEFAULT 0,
  muscle decimal(5,2) NOT NULL DEFAULT 0,
  date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, date)
);

ALTER TABLE health_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own health scores"
  ON health_scores FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own health scores"
  ON health_scores FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own health scores"
  ON health_scores FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create scans table
CREATE TABLE IF NOT EXISTS scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('muscle', 'fat')),
  percentage decimal(5,2) NOT NULL,
  image_url text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own scans"
  ON scans FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own scans"
  ON scans FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Create recipes table
CREATE TABLE IF NOT EXISTS recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  image_url text NOT NULL,
  preparation_time integer NOT NULL DEFAULT 30,
  difficulty text NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  ingredients jsonb DEFAULT '[]'::jsonb,
  instructions text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Recipes are viewable by everyone"
  ON recipes FOR SELECT
  TO authenticated
  USING (true);

-- Create exercises table
CREATE TABLE IF NOT EXISTS exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  image_url text NOT NULL,
  duration integer NOT NULL DEFAULT 30,
  difficulty text NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  description text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Exercises are viewable by everyone"
  ON exercises FOR SELECT
  TO authenticated
  USING (true);

-- Create recommended_products table
CREATE TABLE IF NOT EXISTS recommended_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  image_url text NOT NULL,
  benefits jsonb DEFAULT '[]'::jsonb,
  shop_url text NOT NULL,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE recommended_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Products are viewable by everyone"
  ON recommended_products FOR SELECT
  TO authenticated
  USING (active = true);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_health_scores_user_date ON health_scores(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_scans_user_created ON scans(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recipes_difficulty ON recipes(difficulty);
CREATE INDEX IF NOT EXISTS idx_exercises_difficulty ON exercises(difficulty);
