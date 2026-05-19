-- Defense-in-depth (C-06 of COACH_SECURITY_AUDIT). The conversation tables
-- created in 20260524150000 ship with explicit INSERT/UPDATE/DELETE BLOCK
-- policies for the `authenticated` role so an accidental future GRANT to
-- authenticated cannot bypass the service-role-only mutation contract.
--
-- Back-port the same pattern to the original coach_entries table. Today only
-- SELECT is granted to authenticated (see 20260406120000:357), and no policy
-- explicitly denies the other operations — adding the BLOCK policies plus a
-- redundant REVOKE keeps the table on the same hardening level as the new
-- ones.
--
-- This migration is purely additive: no existing client can write to
-- coach_entries today (the Edge Functions use service_role which bypasses
-- RLS), so no behaviour change is expected.

DROP POLICY IF EXISTS "coach_entries_block_insert" ON public.coach_entries;
CREATE POLICY "coach_entries_block_insert"
  ON public.coach_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "coach_entries_block_update" ON public.coach_entries;
CREATE POLICY "coach_entries_block_update"
  ON public.coach_entries
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "coach_entries_block_delete" ON public.coach_entries;
CREATE POLICY "coach_entries_block_delete"
  ON public.coach_entries
  FOR DELETE
  TO authenticated
  USING (false);

REVOKE INSERT, UPDATE, DELETE ON TABLE public.coach_entries FROM authenticated;

NOTIFY pgrst, 'reload schema';
