-- 20260425240000_disable_mfa_aal2_extended.sql
--
-- Extension de 20260425220000_disable_mfa_aal2.sql
--
-- La migration precedente couvrait :
--   - Un set ferme de tables (scans, social_*, etc.)
--   - Storage policies portant sur scan-images
--
-- Cette extension scrute exhaustivement TOUTES les policies (public.* et
-- storage.objects) et unwrap toute clause "AND aal=aal2" residuelle.
-- Idempotente : si la regex ne matche rien, no-op.
--
-- Necessaire pour debloquer notamment :
--   - storage.objects pour les avatars (l'unwrap precedent etait limite a
--     scan-images)
--   - social_post_views, social_post_categories, et autres tables ajoutees
--     apres la redaction de la migration originale
--
-- Note : aucune verification AAL2 cote Edge Functions n'est touchee ici,
-- elles sont neutralisees cote code via assertAal2BearerToken qui devient
-- un no-op (cf. phase2Auth.ts).

DO $$
DECLARE
  policy_rec record;
  new_qual text;
  new_check text;
  cmd_str text;
  alter_command text;
BEGIN
  FOR policy_rec IN
    SELECT
      n.nspname AS schemaname,
      c.relname AS tablename,
      p.polname AS policyname,
      pg_get_expr(p.polqual, p.polrelid) AS qual_expr,
      pg_get_expr(p.polwithcheck, p.polrelid) AS check_expr
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('public', 'storage')
      AND (
        COALESCE(pg_get_expr(p.polqual, p.polrelid), '') LIKE '%aal%'
        OR COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), '') LIKE '%aal%'
      )
  LOOP
    new_qual := policy_rec.qual_expr;
    new_check := policy_rec.check_expr;

    IF new_qual IS NOT NULL THEN
      new_qual := regexp_replace(
        new_qual,
        '\s*AND\s*\(\(auth\.jwt\(\)\s*->>\s*''aal''::text\)\s*=\s*''aal2''::text\)',
        '',
        'g'
      );
    END IF;
    IF new_check IS NOT NULL THEN
      new_check := regexp_replace(
        new_check,
        '\s*AND\s*\(\(auth\.jwt\(\)\s*->>\s*''aal''::text\)\s*=\s*''aal2''::text\)',
        '',
        'g'
      );
    END IF;

    -- Si la policy ne reste plus que "aal=aal2" sans rien d'autre, le qual
    -- devient trivialement vrai. On la drop entierement plutot que d'avoir
    -- une policy degeneree.
    IF (new_qual IS NULL OR btrim(new_qual) IN ('', 'true', '(true)'))
       AND (new_check IS NULL OR btrim(new_check) IN ('', 'true', '(true)')) THEN
      cmd_str := format(
        'DROP POLICY IF EXISTS %I ON %I.%I',
        policy_rec.policyname, policy_rec.schemaname, policy_rec.tablename
      );
      EXECUTE cmd_str;
      RAISE NOTICE 'Dropped degenerate aal2-only policy % on %.%',
        policy_rec.policyname, policy_rec.schemaname, policy_rec.tablename;
      CONTINUE;
    END IF;

    cmd_str := format(
      'ALTER POLICY %I ON %I.%I',
      policy_rec.policyname, policy_rec.schemaname, policy_rec.tablename
    );

    IF new_qual IS NOT NULL THEN
      cmd_str := cmd_str || format(' USING (%s)', new_qual);
    END IF;
    IF new_check IS NOT NULL THEN
      cmd_str := cmd_str || format(' WITH CHECK (%s)', new_check);
    END IF;

    EXECUTE cmd_str;
    RAISE NOTICE 'Unwrapped residual aal2 from policy % on %.%',
      policy_rec.policyname, policy_rec.schemaname, policy_rec.tablename;
  END LOOP;
END $$;

SELECT pg_notify('pgrst', 'reload schema');
