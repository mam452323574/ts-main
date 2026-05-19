import * as fs from 'fs';
import * as path from 'path';

const MIGRATION_PATH = path.join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260520210000_audit_coach_persona_key_changes.sql',
);

describe('C-07 coach persona key audit migration', () => {
  const source = fs.readFileSync(MIGRATION_PATH, 'utf8');

  it('creates coach_persona_audit table with cascade FK', () => {
    expect(source).toContain('CREATE TABLE IF NOT EXISTS public.coach_persona_audit');
    expect(source).toContain('REFERENCES public.user_profiles(id) ON DELETE CASCADE');
    expect(source).toContain(
      'ALTER TABLE public.coach_persona_audit ENABLE ROW LEVEL SECURITY',
    );
  });

  it('grants SELECT to the owning user (RGPD art. 15 transparency)', () => {
    expect(source).toMatch(
      /CREATE POLICY "coach_persona_audit_select_own"[\s\S]+USING \(user_id = auth\.uid\(\)\)/,
    );
    expect(source).toContain('GRANT SELECT ON TABLE public.coach_persona_audit TO authenticated');
  });

  it('blocks all mutations from authenticated/anon (append-only)', () => {
    expect(source).toMatch(
      /CREATE POLICY "coach_persona_audit_block_insert"[\s\S]+WITH CHECK \(false\)/,
    );
    expect(source).toMatch(
      /CREATE POLICY "coach_persona_audit_block_update"[\s\S]+USING \(false\)/,
    );
    expect(source).toMatch(
      /CREATE POLICY "coach_persona_audit_block_delete"[\s\S]+USING \(false\)/,
    );
    expect(source).toContain(
      'REVOKE INSERT, UPDATE, DELETE ON TABLE public.coach_persona_audit FROM authenticated',
    );
    expect(source).toContain('REVOKE ALL ON TABLE public.coach_persona_audit FROM anon');
  });

  it('declares the audit function as SECURITY DEFINER', () => {
    expect(source).toContain(
      'CREATE OR REPLACE FUNCTION public.audit_coach_persona_key_change()',
    );
    expect(source).toContain('SECURITY DEFINER');
    expect(source).toContain('SET search_path = public, auth');
    expect(source).toContain('changed_by,');
    expect(source).toContain('auth.uid()');
  });

  it('attaches the trigger on UPDATE of coach_persona_key with WHEN clause', () => {
    expect(source).toMatch(
      /CREATE TRIGGER trg_audit_coach_persona_key_change[\s\S]+AFTER UPDATE OF coach_persona_key ON public\.user_profiles/,
    );
    expect(source).toContain(
      'WHEN (OLD.coach_persona_key IS DISTINCT FROM NEW.coach_persona_key)',
    );
    expect(source).toContain('EXECUTE FUNCTION public.audit_coach_persona_key_change()');
  });
});
