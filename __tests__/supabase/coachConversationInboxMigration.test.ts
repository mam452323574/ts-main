import * as fs from 'fs';
import * as path from 'path';

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    'supabase',
    'migrations',
    '20260606130000_add_coach_conversation_inbox_previews.sql',
  ),
  'utf8',
);

describe('coach conversation inbox preview migration', () => {
  it('keeps persona and hidden-row filtering in the page RPC', () => {
    expect(migration).toContain('p_persona_key text DEFAULT NULL');
    expect(migration).toContain('p_include_hidden OR conv.hidden_at IS NULL');
    expect(migration).toContain('p_persona_key IS NULL OR conv.persona_key = p_persona_key');
  });

  it('keeps ownership enforcement in the authenticated SECURITY INVOKER context', () => {
    expect(migration).toContain('SECURITY INVOKER');
    expect(migration).toContain('WHERE conv.user_id = auth.uid()');
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.get_coach_conversations_page\([\s\S]+?\) TO authenticated;/,
    );
  });

  it('returns first-user and latest displayable message previews', () => {
    expect(migration).toContain('first_user_message_preview text');
    expect(migration).toContain('last_message_preview text');
    expect(migration).toContain('last_message_at timestamptz');
    expect(migration).toContain("msg.role = 'user'");
    expect(migration).toContain("msg.role IN ('user', 'assistant', 'system')");
    expect(migration).toContain("msg.status <> 'error'");
  });

  it('preserves keyset ordering and refreshes the PostgREST schema', () => {
    expect(migration).toContain('ORDER BY conv.updated_at DESC, conv.id DESC');
    expect(migration).toContain("NOTIFY pgrst, 'reload schema';");
  });
});
