/*
  # Add Notification System

  1. Schema Updates
    - Add `push_token` column to `user_profiles` for storing Expo push notification tokens
    - Add `notification_settings` column to `user_profiles` for user preferences
    - Add `last_scan_date` column to `user_profiles` for tracking inactivity
    
  2. New Tables
    - `user_achievements` - Track user milestones (first scan, 1 month, 6 months, etc.)
      - `id` (uuid, primary key)
      - `user_id` (uuid, references user_profiles)
      - `achievement_type` (text: 'first_scan', 'one_month', 'six_months', etc.)
      - `unlocked_at` (timestamptz)
      - `notified` (boolean) - whether user was notified
      
    - `notification_logs` - Track all notifications sent
      - `id` (uuid, primary key)
      - `user_id` (uuid, references user_profiles)
      - `notification_type` (text: 'reminder', 'achievement', 'new_content')
      - `title` (text)
      - `body` (text)
      - `sent_at` (timestamptz)
      - `read_at` (timestamptz, nullable)
      
    - `content_updates` - Track when new recipes/exercises are added
      - `id` (uuid, primary key)
      - `content_type` (text: 'recipe', 'exercise')
      - `content_id` (uuid)
      - `created_at` (timestamptz)
  
  3. Security
    - Enable RLS on all new tables
    - Users can only access their own achievements and notifications
    - Content updates are viewable by all authenticated users
*/

-- Add columns to user_profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'push_token'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN push_token text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'notification_settings'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN notification_settings jsonb DEFAULT '{"reminders": true, "achievements": true, "newContent": true}'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'last_scan_date'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN last_scan_date timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'account_created_at'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN account_created_at timestamptz DEFAULT now();
  END IF;
END $$;

-- Create user_achievements table
CREATE TABLE IF NOT EXISTS user_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  achievement_type text NOT NULL CHECK (achievement_type IN ('first_scan', 'one_week', 'one_month', 'three_months', 'six_months', 'one_year')),
  unlocked_at timestamptz DEFAULT now(),
  notified boolean DEFAULT false,
  UNIQUE(user_id, achievement_type)
);

ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own achievements"
  ON user_achievements FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own achievements"
  ON user_achievements FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own achievements"
  ON user_achievements FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create notification_logs table
CREATE TABLE IF NOT EXISTS notification_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  notification_type text NOT NULL CHECK (notification_type IN ('reminder', 'achievement', 'new_content')),
  title text NOT NULL,
  body text NOT NULL,
  sent_at timestamptz DEFAULT now(),
  read_at timestamptz
);

ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON notification_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON notification_logs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create content_updates table
CREATE TABLE IF NOT EXISTS content_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type text NOT NULL CHECK (content_type IN ('recipe', 'exercise')),
  content_id uuid NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE content_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Content updates viewable by all authenticated users"
  ON content_updates FOR SELECT
  TO authenticated
  USING (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_user_sent ON notification_logs(user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_updates_type_created ON content_updates(content_type, created_at DESC);

-- Create trigger to update last_scan_date when a scan is created
CREATE OR REPLACE FUNCTION update_last_scan_date()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE user_profiles
  SET last_scan_date = NEW.created_at
  WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_last_scan_date ON scans;
CREATE TRIGGER trigger_update_last_scan_date
  AFTER INSERT ON scans
  FOR EACH ROW
  EXECUTE FUNCTION update_last_scan_date();

-- Create trigger to log content updates
CREATE OR REPLACE FUNCTION log_content_update()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_TABLE_NAME = 'recipes' THEN
    INSERT INTO content_updates (content_type, content_id)
    VALUES ('recipe', NEW.id);
  ELSIF TG_TABLE_NAME = 'exercises' THEN
    INSERT INTO content_updates (content_type, content_id)
    VALUES ('exercise', NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_log_recipe_update ON recipes;
CREATE TRIGGER trigger_log_recipe_update
  AFTER INSERT ON recipes
  FOR EACH ROW
  EXECUTE FUNCTION log_content_update();

DROP TRIGGER IF EXISTS trigger_log_exercise_update ON exercises;
CREATE TRIGGER trigger_log_exercise_update
  AFTER INSERT ON exercises
  FOR EACH ROW
  EXECUTE FUNCTION log_content_update();