-- Follow-up hardening from the broad audit:
-- - remove legacy plaintext email verification artifacts
-- - make public RPC exposure explicit instead of relying on default EXECUTE grants
-- - prevent a reserved social asset from backing multiple posts

DROP FUNCTION IF EXISTS public.create_verification_code(uuid, text);
DROP FUNCTION IF EXISTS public.verify_email_code(uuid, text);
DROP FUNCTION IF EXISTS public.generate_verification_code();
DROP FUNCTION IF EXISTS public.cleanup_expired_verification_codes();
DROP TABLE IF EXISTS public.email_verification_codes;

CREATE UNIQUE INDEX IF NOT EXISTS idx_social_posts_asset_path_unique
  ON public.social_posts(asset_path)
  WHERE asset_path IS NOT NULL;

DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT proc.oid
    FROM pg_proc AS proc
    JOIN pg_namespace AS ns
      ON ns.oid = proc.pronamespace
    WHERE ns.nspname = 'public'
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',
      fn.oid::regprocedure
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %s TO service_role',
      fn.oid::regprocedure
    );
  END LOOP;
END;
$$;

DO $$
DECLARE
  fn record;
  authenticated_rpc_names text[] := ARRAY[
    'ensure_user_growth_experience',
    'get_auth_gate_profile',
    'get_coach_history_page',
    'get_coach_history_summary',
    'get_premium_potential_data',
    'get_public_profiles',
    'get_social_comments_for_post',
    'get_social_comments_page',
    'get_social_feed_page',
    'get_social_post_detail',
    'get_user_gamification_state',
    'mark_coach_seen',
    'mark_entry_offer_claimed',
    'mark_entry_offer_dismissed',
    'mark_entry_offer_shown'
  ];
BEGIN
  FOR fn IN
    SELECT proc.oid
    FROM pg_proc AS proc
    JOIN pg_namespace AS ns
      ON ns.oid = proc.pronamespace
    WHERE ns.nspname = 'public'
      AND proc.proname = ANY(authenticated_rpc_names)
  LOOP
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %s TO authenticated',
      fn.oid::regprocedure
    );
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
