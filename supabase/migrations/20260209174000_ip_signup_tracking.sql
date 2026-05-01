-- Create table to track signups by IP
CREATE TABLE IF NOT EXISTS public.ip_signup_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address INET NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_ip_signup_ip ON public.ip_signup_tracking(ip_address);
CREATE INDEX IF NOT EXISTS idx_ip_signup_created ON public.ip_signup_tracking(created_at);

-- RLS policies (optional, but good practice if exposed)
ALTER TABLE public.ip_signup_tracking ENABLE ROW LEVEL SECURITY;

-- Allow service role (Edge Functions) full access
CREATE POLICY "Service role full access" ON public.ip_signup_tracking
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Function to check if an IP is allowed to sign up
CREATE OR REPLACE FUNCTION public.check_ip_signup_allowed(client_ip INET)
RETURNS TABLE(allowed BOOLEAN, reason TEXT) 
LANGUAGE plpgsql
SECURITY DEFINER -- Run as owner to bypass RLS if needed
AS $$
DECLARE
  weeks_count INTEGER;
  total_count INTEGER;
BEGIN
  -- 1. Check total accounts ever created by this IP
  SELECT COUNT(*) INTO total_count
  FROM public.ip_signup_tracking
  WHERE ip_address = client_ip;

  IF total_count >= 10 THEN
    RETURN QUERY SELECT false, 'max_total_limit_reached';
    RETURN;
  END IF;

  -- 2. Check accounts created in the last 7 days (rolling window)
  SELECT COUNT(*) INTO weeks_count
  FROM public.ip_signup_tracking
  WHERE ip_address = client_ip
    AND created_at > (NOW() - INTERVAL '7 days');

  IF weeks_count >= 2 THEN
    RETURN QUERY SELECT false, 'weekly_limit_reached';
    RETURN;
  END IF;

  -- If we get here, signup is allowed
  RETURN QUERY SELECT true, NULL;
END;
$$;

-- Function to record a successful signup
CREATE OR REPLACE FUNCTION public.record_ip_signup(client_ip INET, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.ip_signup_tracking (ip_address, user_id)
  VALUES (client_ip, p_user_id);
END;
$$;
