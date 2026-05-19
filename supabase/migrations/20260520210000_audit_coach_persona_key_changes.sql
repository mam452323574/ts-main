-- C-07 (cf. COACH_SECURITY_AUDIT.md) — audit trigger sur les changements de
-- `user_profiles.coach_persona_key`.
--
-- Risque adresse : un attaquant qui compromet un compte (cf. AUTH-VULN
-- residuel) peut changer le persona coach silencieusement (ex: passer de
-- `gentle_supportive` a `strict_tough`) pour modifier le ton des conseils
-- sante. Sans audit log, ce changement est invisible et non investigable.
--
-- L'audit log est strict append-only : pas d'UPDATE ni de DELETE possibles
-- (BLOCK policies + REVOKE sur authenticated/anon). Seul service_role peut
-- inserer (via le trigger). Lecture autorisee a l'utilisateur sur ses propres
-- entrees pour transparence (RGPD art. 15 — droit d'acces).

CREATE TABLE IF NOT EXISTS public.coach_persona_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  changed_at timestamptz NOT NULL DEFAULT now(),
  old_persona_key text,
  new_persona_key text,
  changed_by uuid,
  source text NOT NULL DEFAULT 'user_profile_update'
);

CREATE INDEX IF NOT EXISTS idx_coach_persona_audit_user_changed_at
  ON public.coach_persona_audit(user_id, changed_at DESC);

ALTER TABLE public.coach_persona_audit ENABLE ROW LEVEL SECURITY;

-- Lecture : l'utilisateur peut lire ses propres entrees (RGPD art. 15).
DROP POLICY IF EXISTS "coach_persona_audit_select_own" ON public.coach_persona_audit;
CREATE POLICY "coach_persona_audit_select_own"
  ON public.coach_persona_audit
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Mutations : bloquees pour authenticated/anon. Seul service_role (via le
-- trigger SECURITY DEFINER) peut inserer.
DROP POLICY IF EXISTS "coach_persona_audit_block_insert" ON public.coach_persona_audit;
CREATE POLICY "coach_persona_audit_block_insert"
  ON public.coach_persona_audit
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "coach_persona_audit_block_update" ON public.coach_persona_audit;
CREATE POLICY "coach_persona_audit_block_update"
  ON public.coach_persona_audit
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "coach_persona_audit_block_delete" ON public.coach_persona_audit;
CREATE POLICY "coach_persona_audit_block_delete"
  ON public.coach_persona_audit
  FOR DELETE
  TO authenticated
  USING (false);

REVOKE INSERT, UPDATE, DELETE ON TABLE public.coach_persona_audit FROM authenticated;
REVOKE ALL ON TABLE public.coach_persona_audit FROM anon;
GRANT SELECT ON TABLE public.coach_persona_audit TO authenticated;

CREATE OR REPLACE FUNCTION public.audit_coach_persona_key_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Trigger fires only on actual changes (cf. WHEN clause on CREATE TRIGGER).
  -- Sanity check: skip if both values are NULL (no real change).
  IF OLD.coach_persona_key IS NULL AND NEW.coach_persona_key IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.coach_persona_audit(
    user_id,
    changed_at,
    old_persona_key,
    new_persona_key,
    changed_by,
    source
  ) VALUES (
    NEW.id,
    now(),
    OLD.coach_persona_key,
    NEW.coach_persona_key,
    auth.uid(),
    'user_profile_update'
  );

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.audit_coach_persona_key_change() FROM PUBLIC;
-- Trigger functions invoked by the engine; no grant needed.

DROP TRIGGER IF EXISTS trg_audit_coach_persona_key_change ON public.user_profiles;

CREATE TRIGGER trg_audit_coach_persona_key_change
  AFTER UPDATE OF coach_persona_key ON public.user_profiles
  FOR EACH ROW
  WHEN (OLD.coach_persona_key IS DISTINCT FROM NEW.coach_persona_key)
  EXECUTE FUNCTION public.audit_coach_persona_key_change();

COMMENT ON FUNCTION public.audit_coach_persona_key_change() IS
  'C-07: append-only audit log for coach_persona_key changes.';

COMMENT ON TRIGGER trg_audit_coach_persona_key_change ON public.user_profiles IS
  'C-07: AFTER UPDATE OF coach_persona_key — logs to coach_persona_audit.';

SELECT pg_notify('pgrst', 'reload schema');
