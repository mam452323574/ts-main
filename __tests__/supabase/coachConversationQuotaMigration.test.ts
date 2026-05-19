import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = process.cwd();
const MIGRATION_PATH = path.join(
  REPO_ROOT,
  'supabase',
  'migrations',
  '20260524160000_create_coach_conversation_quota.sql',
);

function readMigrationSource() {
  return fs.readFileSync(MIGRATION_PATH, 'utf8');
}

describe('coach conversation quota migration', () => {
  const migrationSource = readMigrationSource();

  it('creates the dedicated event ledger and the attempts table without client policies', () => {
    expect(migrationSource).toContain(
      'CREATE TABLE IF NOT EXISTS public.coach_conversation_message_events',
    );
    expect(migrationSource).toContain(
      'CREATE TABLE IF NOT EXISTS public.coach_conversation_attempts',
    );
    expect(migrationSource).toContain(
      'ALTER TABLE public.coach_conversation_message_events ENABLE ROW LEVEL SECURITY',
    );
    expect(migrationSource).toContain(
      'ALTER TABLE public.coach_conversation_attempts ENABLE ROW LEVEL SECURITY',
    );
    expect(migrationSource).toContain(
      'REVOKE ALL ON TABLE public.coach_conversation_message_events FROM PUBLIC',
    );
    expect(migrationSource).toContain(
      'REVOKE ALL ON TABLE public.coach_conversation_attempts FROM PUBLIC',
    );
    expect(migrationSource).not.toContain('CREATE POLICY');
  });

  it('models premium 40/day, free 4 lifetime, admin unlimited from account_tier', () => {
    expect(migrationSource).toContain('v_premium_limit integer := 40');
    expect(migrationSource).toContain('v_free_message_limit integer := 4');
    expect(migrationSource).toContain('v_per_conversation_limit integer := 20');
    expect(migrationSource).toContain("IF v_account_tier = 'admin'");
    expect(migrationSource).toContain("'unlimited', true");
    expect(migrationSource).toContain(
      "WHEN account_tier IN ('premium', 'admin') THEN account_tier",
    );
  });

  it('uses rolling 24h windows with no midnight reset', () => {
    expect(migrationSource).toContain(
      "requested_at > (p_now - interval '24 hours')",
    );
    expect(migrationSource).toContain(
      "v_oldest_requested_at + interval '24 hours'",
    );
    expect(migrationSource).not.toContain("date_trunc('day'");
  });

  it('keeps slot reservation atomic via advisory lock and FOR UPDATE rows', () => {
    expect(migrationSource).toContain('pg_advisory_xact_lock');
    expect(migrationSource).toContain('FOR UPDATE');
    expect(migrationSource).toContain(
      'CREATE OR REPLACE FUNCTION public.reserve_coach_conversation_message_slot',
    );
    expect(migrationSource).toContain("'code', 'coach_conversation_quota_exhausted'");
    expect(migrationSource).toContain(
      "'code', 'coach_free_conversation_already_used'",
    );
    expect(migrationSource).toContain(
      "'code', 'coach_conversation_message_limit_reached'",
    );
    expect(migrationSource).toContain(
      "'code', 'coach_free_conversation_message_limit_reached'",
    );
  });

  it('exposes the conversation lifecycle as service_role-only mutating RPCs', () => {
    const mutating = [
      'public.record_coach_conversation_attempt(uuid, integer, integer, integer)',
      'public.get_coach_conversation_quota_status(uuid)',
      'public.start_coach_conversation(uuid, text, text)',
      'public.reserve_coach_conversation_message_slot(uuid, uuid)',
      'public.attach_coach_conversation_quota_event(uuid, uuid, uuid)',
      'public.refund_coach_conversation_quota_event(uuid, uuid, text)',
      'public.end_coach_conversation(uuid, uuid, text)',
      'public.archive_coach_conversation(uuid, uuid)',
    ];
    for (const fn of mutating) {
      expect(migrationSource).toContain(`REVOKE ALL ON FUNCTION ${fn} FROM PUBLIC`);
      expect(migrationSource).toContain(`GRANT EXECUTE ON FUNCTION ${fn} TO service_role`);
    }
  });

  it('grants the two read RPCs to authenticated using SECURITY INVOKER', () => {
    expect(migrationSource).toContain(
      'GRANT EXECUTE ON FUNCTION public.get_coach_conversations_page(integer, timestamptz, uuid, boolean) TO authenticated',
    );
    expect(migrationSource).toContain(
      'GRANT EXECUTE ON FUNCTION public.get_coach_conversation_messages_page(uuid, integer, timestamptz, uuid) TO authenticated',
    );
    expect(migrationSource).toContain(
      'CREATE OR REPLACE FUNCTION public.get_coach_conversations_page',
    );
    expect(migrationSource).toContain(
      'CREATE OR REPLACE FUNCTION public.get_coach_conversation_messages_page',
    );
    expect(migrationSource).toContain(
      'WHERE conv.user_id = auth.uid()',
    );
    expect(migrationSource).toContain(
      'WHERE msg.user_id = auth.uid()',
    );
  });

  it('refunds counters on the conversation and the free state on technical failures', () => {
    expect(migrationSource).toContain(
      'CREATE OR REPLACE FUNCTION public.refund_coach_conversation_quota_event',
    );
    expect(migrationSource).toContain(
      "metadata = COALESCE(metadata, '{}'::jsonb)",
    );
    expect(migrationSource).toContain(
      'GREATEST(COALESCE(user_message_count, 0) - 1, 0)',
    );
  });

  it('bumps the per-conversation counter and surfaces a quota_reached status at the 20th message', () => {
    expect(migrationSource).toContain(
      'UPDATE public.coach_conversations',
    );
    expect(migrationSource).toContain(
      'user_message_count = COALESCE(user_message_count, 0) + 1',
    );
    expect(migrationSource).toContain(
      "ended_reason = COALESCE(ended_reason, 'quota_reached')",
    );
  });

  it('initializes the free state row and flips consumed=true at the fourth user message', () => {
    expect(migrationSource).toContain(
      'INSERT INTO public.coach_free_conversation_state',
    );
    expect(migrationSource).toContain(
      'consumed = CASE',
    );
    expect(migrationSource).toContain(
      'COALESCE(user_message_count, 0) + 1 >= v_free_message_limit',
    );
  });

  it('notifies PostgREST so the new RPCs are immediately available', () => {
    expect(migrationSource).toContain("NOTIFY pgrst, 'reload schema'");
  });
});
