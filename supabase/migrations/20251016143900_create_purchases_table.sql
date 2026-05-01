/*
  # Create Purchases Table for In-App Purchase Tracking

  1. New Tables
    - `purchases` - Track in-app purchases with verification status

  2. Security
    - Enable RLS on `purchases` table
    - Users can only view their own purchases
*/

CREATE TABLE IF NOT EXISTS purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  order_id text NOT NULL UNIQUE,
  purchase_token text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('android', 'ios')),
  product_id text NOT NULL,
  purchase_date timestamptz DEFAULT now(),
  verified_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'failed', 'refunded')),
  verification_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS purchases_user_id_idx ON purchases(user_id);

ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own purchases"
  ON purchases FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users cannot insert purchases"
  ON purchases FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "Users cannot update purchases"
  ON purchases FOR UPDATE
  TO authenticated
  USING (false);

CREATE POLICY "Users cannot delete purchases"
  ON purchases FOR DELETE
  TO authenticated
  USING (false);

CREATE OR REPLACE FUNCTION update_purchases_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_purchases_updated_at_trigger
  BEFORE UPDATE ON purchases
  FOR EACH ROW
  EXECUTE FUNCTION update_purchases_updated_at();