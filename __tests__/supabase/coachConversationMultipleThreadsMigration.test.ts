import * as fs from 'fs';
import * as path from 'path';

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    'supabase',
    'migrations',
    '20260606140000_allow_multiple_free_coach_threads.sql',
  ),
  'utf8',
);

describe('multiple free Coach conversation threads migration', () => {
  it('always inserts a new thread and no longer resumes an active free thread on start', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.start_coach_conversation');
    expect(migration).toContain('INSERT INTO public.coach_conversations');
    expect(migration).toContain("'conversation_id', v_conversation_id");
    expect(migration).not.toContain('coach_free_conversation_resumed');
    expect(migration).not.toContain('SELECT conversation.id');
  });

  it('keeps the compatibility pointer without defining message quota logic here', () => {
    expect(migration).toContain('INSERT INTO public.coach_free_conversation_state');
    expect(migration).toContain('conversation_id = EXCLUDED.conversation_id');
    expect(migration).toContain('build_coach_conversation_quota_status_json');
    expect(migration).not.toContain(
      'CREATE OR REPLACE FUNCTION public.reserve_coach_conversation_message_slot',
    );
  });
});
