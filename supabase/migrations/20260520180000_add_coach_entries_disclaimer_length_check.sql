-- Defense-in-depth (C-09 of COACH_SECURITY_AUDIT_2026_05).
-- Cap coach_entries.disclaimer at 1000 chars so a misbehaving provider or a
-- buggy backfill cannot store an arbitrarily long disclaimer that would bloat
-- the row and degrade pagination perf.
--
-- The default disclaimer string written by 20260406223000_phase5_phase6_phase7
-- is ~60 chars. The provider-derived disclaimer is bounded by the LLM contract
-- but is not enforced server-side until this migration. 1000 chars gives a
-- generous margin over any realistic UI display surface.
--
-- Idempotent via DROP CONSTRAINT IF EXISTS, the standard pattern in this repo.

ALTER TABLE public.coach_entries
  DROP CONSTRAINT IF EXISTS coach_entries_disclaimer_length_check;

ALTER TABLE public.coach_entries
  ADD CONSTRAINT coach_entries_disclaimer_length_check
  CHECK (disclaimer IS NULL OR char_length(disclaimer) <= 1000);

NOTIFY pgrst, 'reload schema';
