/*
  # Create Purchases Table for In-App Purchase Tracking

  1. New Tables
    - `purchases`
      - `id` (uuid, primary key) - Unique purchase record ID
      - `user_id` (uuid, foreign key) - Reference to user_profiles
      - `order_id` (text, unique) - Google Play or App Store order ID
      - `purchase_token` (text) - Purchase token from the store
      - `platform` (text) - Platform: 'android' or 'ios'
      - `product_id` (text) - Product identifier
      - `purchase_date` (timestamptz) - When the purchase was made
      - `verified_at` (timestamptz) - When the purchase was verified by our backend
      - `status` (text) - Purchase status: 'pending', 'verified', 'failed', 'refunded'
      - `verification_data` (jsonb) - Additional data from verification process
      - `created_at` (timestamptz) - Record creation timestamp
      - `updated_at` (timestamptz) - Record update timestamp

  2. Security
    - Enable RLS on `purchases` table
    - Add policy for users to view only their own purchases
    - Add policy preventing users from modifying purchases
    - Only authenticated users can access their purchase history

  3. Indexes
    - Unique index on order_id to prevent duplicate processing
    - Index on user_id for fast lookups
    - Index on status for filtering

  4. Important Notes
    - This table tracks all purchase attempts and their verification status
    - The order_id uniqueness prevents processing the same purchase twice
    - All verification data is stored for audit purposes
    - Status transitions: pending → verified/failed/refunded
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
CREATE INDEX IF NOT EXISTS purchases_status_idx ON purchases(status);
CREATE INDEX IF NOT EXISTS purchases_order_id_idx ON purchases(order_id);

ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own purchases"
  ON purchases
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users cannot insert purchases"
  ON purchases
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "Users cannot update purchases"
  ON purchases
  FOR UPDATE
  TO authenticated
  USING (false);

CREATE POLICY "Users cannot delete purchases"
  ON purchases
  FOR DELETE
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
