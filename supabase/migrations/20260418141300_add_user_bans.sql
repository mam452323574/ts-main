-- Supabase Migration: User Bans and Moderation Implementation

-- Create user_bans table
CREATE TABLE IF NOT EXISTS public.user_bans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    scope TEXT NOT NULL CHECK (scope IN ('all', 'posts', 'comments', 'avatar')),
    reason TEXT,
    starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ends_at TIMESTAMPTZ, -- Nullable for permanent bans
    issued_by UUID NOT NULL REFERENCES auth.users(id),
    revoked_at TIMESTAMPTZ,
    revoked_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_user_bans_user_id ON public.user_bans(user_id);
CREATE INDEX IF NOT EXISTS idx_user_bans_active ON public.user_bans(user_id, scope, revoked_at) 
WHERE revoked_at IS NULL;

-- Enable RLS
ALTER TABLE public.user_bans ENABLE ROW LEVEL SECURITY;

-- Policy: Users can independently read their own active bans (could be useful for UX states)
CREATE POLICY "Users can read own bans"
ON public.user_bans FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Policy: Admins can do everything
CREATE POLICY "Admins can manage user bans"
ON public.user_bans FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE user_profiles.id = auth.uid()
        AND user_profiles.account_tier = 'admin'
    )
);

-- RPC for secure validation checks across Post/Comment/Avatar insertion.
CREATE OR REPLACE FUNCTION public.is_user_banned(p_user_id UUID, p_scope TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_banned BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM user_bans
        WHERE user_id = p_user_id
          AND scope IN ('all', p_scope)
          AND starts_at <= now()
          AND (ends_at IS NULL OR ends_at > now())
          AND revoked_at IS NULL
    ) INTO v_is_banned;
    
    RETURN v_is_banned;
END;
$$;

-- Trigger function for updated_at
CREATE OR REPLACE FUNCTION public.update_user_bans_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at
CREATE TRIGGER update_user_bans_updated_at
BEFORE UPDATE ON public.user_bans
FOR EACH ROW
EXECUTE FUNCTION public.update_user_bans_updated_at();

-- Modify existing avatar upload policies in Storage to incorporate the ban check
DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;

CREATE POLICY "Users can upload own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text AND
  NOT public.is_user_banned(auth.uid(), 'avatar')
);

CREATE POLICY "Users can update own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text AND
  NOT public.is_user_banned(auth.uid(), 'avatar')
)
WITH CHECK (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text AND
  NOT public.is_user_banned(auth.uid(), 'avatar')
);
