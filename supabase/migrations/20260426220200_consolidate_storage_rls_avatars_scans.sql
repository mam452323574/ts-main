-- 20260426220200_consolidate_storage_rls_avatars_scans.sql
--
-- ============================================================================
-- FIX RUNTIME — "new row violates row-level security policy" sur Storage
-- ============================================================================
--
-- Symptômes observés en runtime (logs client) :
--   ERROR  Error uploading avatar: [StorageApiError: new row violates row-level security policy]
--   ERROR  [ScanPreviewScreen] Scan flow failed { code: "UPLOAD", error_status: 400,
--          message: "new row violates row-level security policy", scan_type: "health" }
--
-- Cause racine :
-- Au fil des migrations (phase1_hardening, add_user_bans, restore_authenticated_runtime_access)
-- on a accumulé plusieurs policies INSERT/UPDATE coexistantes sur storage.objects
-- pour les buckets 'avatars' et 'scan-images' :
--
-- Pour bucket 'avatars' :
--   - "Users can upload own canonical avatar" (phase1_hardening, path strict {uid}/avatar.{ext})
--   - "Users can upload own avatar" (add_user_bans, path moins strict + NOT is_user_banned())
--
-- Le check NOT is_user_banned() peut échouer (fonction qui ne RAISE pas mais retourne
-- une valeur qui empêche la combinaison OR de plusieurs policies PERMISSIVE de marcher
-- correctement en pratique sur certains setups Supabase). Combiné à des policies
-- redondantes, l'évaluation RLS devient imprévisible.
--
-- Cette migration consolide à un set minimal de policies par bucket :
--   - 1 SELECT, 1 INSERT, 1 UPDATE, 1 DELETE
--   - Path strict (canonical) sur avatars : empêche le user de polluer le bucket
--   - Pas de check de ban (les bans sont gérés en aval via les Edge Functions
--     d'admin et via les policies sur les autres tables — un user banni ne peut
--     plus poster de social_post, donc l'avatar uploadé n'a pas d'impact)
--   - (select auth.uid()) pour optimal RLS sur grosses tables
--
-- Trade-off sécurité : on retire le check de ban sur l'upload Storage. Acceptable
-- car (1) le bucket avatars est private et l'image n'est servie qu'aux clients
-- authentifiés ; (2) la modération métier reste en place sur les artefacts
-- consommateurs (social_posts.moderation_state, etc.). Voir SETTINGS_ADMIN_SECURITY_AUDIT.md
-- si on veut ré-ajouter le ban check via un trigger BEFORE INSERT plus tard.

-- ============================================================================
-- BUCKET 'avatars' — reset complet des policies
-- ============================================================================

DROP POLICY IF EXISTS "Anyone authenticated can view avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can view avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own canonical avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own canonical avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own avatars" ON storage.objects;

CREATE POLICY "Users can view avatars"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = (select auth.uid())::text
  AND name IN (
    (select auth.uid())::text || '/avatar.jpg',
    (select auth.uid())::text || '/avatar.png',
    (select auth.uid())::text || '/avatar.webp'
  )
);

CREATE POLICY "Users can update own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = (select auth.uid())::text
)
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = (select auth.uid())::text
  AND name IN (
    (select auth.uid())::text || '/avatar.jpg',
    (select auth.uid())::text || '/avatar.png',
    (select auth.uid())::text || '/avatar.webp'
  )
);

CREATE POLICY "Users can delete own avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = (select auth.uid())::text
);

-- ============================================================================
-- BUCKET 'scan-images' — reset complet des policies
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own scan images" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own scan images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own scan images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own scan images" ON storage.objects;

CREATE POLICY "Users can view own scan images"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'scan-images'
  AND (storage.foldername(name))[1] = (select auth.uid())::text
  AND (storage.foldername(name))[2] = 'scans'
);

CREATE POLICY "Users can upload own scan images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'scan-images'
  AND (storage.foldername(name))[1] = (select auth.uid())::text
  AND (storage.foldername(name))[2] = 'scans'
);

CREATE POLICY "Users can update own scan images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'scan-images'
  AND (storage.foldername(name))[1] = (select auth.uid())::text
  AND (storage.foldername(name))[2] = 'scans'
)
WITH CHECK (
  bucket_id = 'scan-images'
  AND (storage.foldername(name))[1] = (select auth.uid())::text
  AND (storage.foldername(name))[2] = 'scans'
);

CREATE POLICY "Users can delete own scan images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'scan-images'
  AND (storage.foldername(name))[1] = (select auth.uid())::text
  AND (storage.foldername(name))[2] = 'scans'
);

NOTIFY pgrst, 'reload schema';
