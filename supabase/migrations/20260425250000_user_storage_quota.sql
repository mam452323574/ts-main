-- 20260425250000_user_storage_quota.sql
--
-- RPC SECURITY DEFINER pour calculer la taille totale du stockage utilisee
-- par un utilisateur, somme sur tous les buckets.
--
-- Utilise par les Edge Functions (social-create-post, social-reserve-upload,
-- fridge-scan-submit) pour bloquer un user qui depasserait son quota
-- (par defaut 100 MB cote code via USER_STORAGE_QUOTA_BYTES).
--
-- SECURITY DEFINER + GRANT EXECUTE TO authenticated permet aussi un appel
-- direct depuis le client (avatar) si besoin futur. STABLE car la fonction
-- ne mute rien.

CREATE OR REPLACE FUNCTION public.user_storage_bytes_used(p_user_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT COALESCE(sum((metadata->>'size')::bigint), 0)::bigint
  FROM storage.objects
  WHERE owner = p_user_id;
$$;

REVOKE ALL ON FUNCTION public.user_storage_bytes_used(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_storage_bytes_used(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.user_storage_bytes_used(uuid) IS
  'Returns the total bytes of storage.objects owned by a user across all buckets. '
  'Used by Edge Functions to enforce a per-user storage quota '
  '(default 100 MB, see supabase/functions/_shared/userQuota.ts).';

SELECT pg_notify('pgrst', 'reload schema');
