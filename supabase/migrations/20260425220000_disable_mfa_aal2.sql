-- 20260425220000_disable_mfa_aal2.sql
--
-- DESACTIVATION DE LA SECURITE MFA (AAL2)
--
-- Cette migration annule les renforcements MFA introduits par
-- 20260424090000_security_hardening.sql. Apres son application :
--   - Les utilisateurs aal1 (mot de passe seul) peuvent acceder a toutes les
--     tables sensibles precedemment gates par aal=aal2.
--   - Les fonctions client enrollTotp / verifyTotpEnrollment restent en place
--     dans le code (reactivable plus tard) mais ne sont plus appelees par les
--     flows d'auth.
--
-- ATTENTION : reduit la posture de securite. Un mot de passe compromis donne
-- desormais acces complet aux donnees du user.

-- =============================================================================
-- Partie 1 : user_profiles -- DROP policies MFA-only, recreer sans MFA
-- =============================================================================

DROP POLICY IF EXISTS "Users can view own MFA verified profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own MFA verified profile" ON public.user_profiles;

-- "Users can view own profile" existe deja (creee par 20260425200000) mais on
-- la recree par securite pour s'assurer qu'elle est bien presente sans MFA.
DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
CREATE POLICY "Users can view own profile"
  ON public.user_profiles FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
CREATE POLICY "Users can update own profile"
  ON public.user_profiles FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

-- =============================================================================
-- Partie 2 : tables sensibles -- unwrap " AND aal=aal2" dans les policies
-- =============================================================================

DO $$
DECLARE
  policy_rec record;
  new_qual text;
  new_check text;
  cmd_str text;
  target_tables text[] := ARRAY[
    'scans',
    'health_scores',
    'purchases',
    'notifications',
    'fridge_scans',
    'coach_entries',
    'oauth_connections',
    'social_posts',
    'social_comments',
    'social_post_reactions',
    'social_comment_likes'
  ];
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
    WHERE n.nspname = 'public' AND c.relname = ANY(target_tables)
  LOOP
    new_qual := policy_rec.qual_expr;
    new_check := policy_rec.check_expr;

    IF (new_qual IS NULL OR new_qual NOT LIKE '%aal%')
       AND (new_check IS NULL OR new_check NOT LIKE '%aal%') THEN
      CONTINUE;
    END IF;

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
    RAISE NOTICE 'Unwrapped aal2 from policy % on %.%',
      policy_rec.policyname, policy_rec.schemaname, policy_rec.tablename;
  END LOOP;
END $$;

-- =============================================================================
-- Partie 3 : storage.objects (scan-images) -- meme unwrap
-- =============================================================================

DO $$
DECLARE
  policy_rec record;
  new_qual text;
  new_check text;
  cmd_str text;
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
    WHERE n.nspname = 'storage' AND c.relname = 'objects'
      AND (
        COALESCE(pg_get_expr(p.polqual, p.polrelid), '') LIKE '%scan-images%'
        OR COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), '') LIKE '%scan-images%'
      )
  LOOP
    new_qual := policy_rec.qual_expr;
    new_check := policy_rec.check_expr;

    IF (new_qual IS NULL OR new_qual NOT LIKE '%aal%')
       AND (new_check IS NULL OR new_check NOT LIKE '%aal%') THEN
      CONTINUE;
    END IF;

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

    cmd_str := format('ALTER POLICY %I ON storage.objects', policy_rec.policyname);

    IF new_qual IS NOT NULL THEN
      cmd_str := cmd_str || format(' USING (%s)', new_qual);
    END IF;
    IF new_check IS NOT NULL THEN
      cmd_str := cmd_str || format(' WITH CHECK (%s)', new_check);
    END IF;

    EXECUTE cmd_str;
    RAISE NOTICE 'Unwrapped aal2 from storage policy %', policy_rec.policyname;
  END LOOP;
END $$;

SELECT pg_notify('pgrst', 'reload schema');
