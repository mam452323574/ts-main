-- ============================================================================
-- S-07 — Nettoyage automatique des images scan orphelines
-- ============================================================================
-- Trois mécanismes :
--   1) RPC `cleanup_orphan_scan_images` exécutée par cron pg_cron pour purger
--      les objets storage.objects/scan-images sans ligne `scans` ou
--      `fridge_scans` correspondante depuis plus de 24 h.
--   2) RPC `purge_user_scan_data` exécutée par l'Edge Function
--      cleanup-orphan-user (suppression compte) pour vider toutes les
--      images du namespace utilisateur.
--   3) Extension pg_cron activée si possible (fallback : la RPC peut être
--      invoquée à la main si pg_cron n'est pas dispo dans l'instance).
-- ============================================================================

-- pg_cron : disponible en Supabase (extension pré-installée). On crée
-- l'extension si pas déjà présente, sinon on no-op silencieusement (la RPC
-- reste appelable à la main par un opérateur).
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'pg_cron extension not enabled (insufficient privilege) — RPC reste invocable manuellement';
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron extension not available — RPC reste invocable manuellement';
END $$;

-- ============================================================================
-- RPC : nettoyage des objets storage orphelins
-- ============================================================================
-- Supprime les rows storage.objects qui :
--   - sont dans le bucket `scan-images`
--   - ont une création > 24 h
--   - n'ont pas de scan correspondant (path canonique {user}/scans/{id}.jpg
--     ne matche aucune ligne `scans`)
--   - et ne sont pas une image fridge ({user}/fridge-scans/{id}.jpg → match
--     sur `fridge_scans`)
-- Borné à 1000 deletions par invocation pour éviter les transactions trop
-- longues. Le cron tourne toutes les heures.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cleanup_orphan_scan_images(
  p_grace_period interval DEFAULT interval '24 hours',
  p_batch_size integer DEFAULT 1000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  v_deleted_count integer := 0;
  v_now timestamptz := now();
BEGIN
  WITH candidates AS (
    SELECT obj.bucket_id, obj.name
    FROM storage.objects obj
    WHERE obj.bucket_id = 'scan-images'
      AND obj.created_at < (v_now - p_grace_period)
      AND NOT EXISTS (
        SELECT 1 FROM public.scans s
        WHERE s.image_path = obj.name
           OR concat(s.user_id::text, '/scans/', s.id::text, '.jpg') = obj.name
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.fridge_scans fs
        WHERE fs.image_path = obj.name
      )
    LIMIT p_batch_size
  ),
  deleted AS (
    DELETE FROM storage.objects obj
    USING candidates c
    WHERE obj.bucket_id = c.bucket_id AND obj.name = c.name
    RETURNING 1
  )
  SELECT count(*) INTO v_deleted_count FROM deleted;

  RETURN jsonb_build_object(
    'deleted', v_deleted_count,
    'batch_size', p_batch_size,
    'grace_period', p_grace_period::text
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_orphan_scan_images(interval, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_orphan_scan_images(interval, integer) TO service_role;

-- ============================================================================
-- RPC : purge complète des données scan d'un utilisateur (RGPD art. 17)
-- ============================================================================
-- Appelée par cleanup-orphan-user lors de la suppression de compte. Supprime
-- les rows scans + fridge_scans + scan_metrics + objets storage du namespace.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.purge_user_scan_data(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  v_scans_deleted integer := 0;
  v_metrics_deleted integer := 0;
  v_fridge_deleted integer := 0;
  v_objects_deleted integer := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id required';
  END IF;

  WITH d AS (
    DELETE FROM public.scan_metrics WHERE user_id = p_user_id RETURNING 1
  )
  SELECT count(*) INTO v_metrics_deleted FROM d;

  WITH d AS (
    DELETE FROM public.scans WHERE user_id = p_user_id RETURNING 1
  )
  SELECT count(*) INTO v_scans_deleted FROM d;

  WITH d AS (
    DELETE FROM public.fridge_scans WHERE user_id = p_user_id RETURNING 1
  )
  SELECT count(*) INTO v_fridge_deleted FROM d;

  WITH d AS (
    DELETE FROM storage.objects
    WHERE bucket_id = 'scan-images'
      AND name LIKE p_user_id::text || '/%'
    RETURNING 1
  )
  SELECT count(*) INTO v_objects_deleted FROM d;

  RETURN jsonb_build_object(
    'scans_deleted', v_scans_deleted,
    'metrics_deleted', v_metrics_deleted,
    'fridge_scans_deleted', v_fridge_deleted,
    'storage_objects_deleted', v_objects_deleted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.purge_user_scan_data(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_user_scan_data(uuid) TO service_role;

-- ============================================================================
-- Schedule pg_cron : nettoyage horaire des orphelins
-- ============================================================================
-- Idempotent : on dé-schedule l'éventuel job existant avant de re-schedule.
-- ============================================================================

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    SELECT jobid INTO v_job_id
    FROM cron.job
    WHERE jobname = 'cleanup_orphan_scan_images_hourly';

    IF v_job_id IS NOT NULL THEN
      PERFORM cron.unschedule(v_job_id);
    END IF;

    PERFORM cron.schedule(
      'cleanup_orphan_scan_images_hourly',
      '17 * * * *', -- toutes les heures à xx:17 pour étaler la charge
      $cron$ SELECT public.cleanup_orphan_scan_images(); $cron$
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron schedule skipped: %', SQLERRM;
END $$;
