import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = process.cwd();

const TABLES_MIGRATION_PATH = path.join(
  REPO_ROOT,
  'supabase',
  'migrations',
  '20260524150000_create_coach_conversation_tables.sql',
);

const FEATURE_FLAG_MIGRATION_PATH = path.join(
  REPO_ROOT,
  'supabase',
  'migrations',
  '20260524170000_add_coach_chat_feature_flag.sql',
);

function readSource(target: string): string {
  return fs.readFileSync(target, 'utf8');
}

describe('coach conversation tables migration', () => {
  const migrationSource = readSource(TABLES_MIGRATION_PATH);

  it('creates the three new tables with cascade on user deletion', () => {
    expect(migrationSource).toContain(
      'CREATE TABLE IF NOT EXISTS public.coach_conversations',
    );
    expect(migrationSource).toContain(
      'CREATE TABLE IF NOT EXISTS public.coach_conversation_messages',
    );
    expect(migrationSource).toContain(
      'CREATE TABLE IF NOT EXISTS public.coach_free_conversation_state',
    );
    expect(migrationSource).toMatch(
      /user_id uuid NOT NULL REFERENCES public\.user_profiles\(id\) ON DELETE CASCADE/,
    );
    expect(migrationSource).toContain(
      'REFERENCES public.coach_conversations(id) ON DELETE CASCADE',
    );
  });

  it('whitelists the same six persona keys as the rest of the Coach stack', () => {
    const personas = [
      'gentle_supportive',
      'strict_tough',
      'motivational_energetic',
      'patient_calm',
      'analytical_precise',
      'playful_light',
    ];
    for (const persona of personas) {
      expect(migrationSource).toContain(`'${persona}'`);
    }
    expect(migrationSource).toContain('coach_conversations_persona_key_check');
  });

  it('constrains conversation status and ended reason values', () => {
    expect(migrationSource).toContain('coach_conversations_status_check');
    expect(migrationSource).toContain(
      "status IN ('active', 'ended', 'quota_reached', 'archived')",
    );
    expect(migrationSource).toContain('coach_conversations_ended_reason_check');
    expect(migrationSource).toContain(
      "ended_reason IN ('user_ended', 'quota_reached', 'admin', 'timeout')",
    );
  });

  it('caps user message content at 2000 chars and assistant at 8000', () => {
    expect(migrationSource).toContain(
      'coach_conversation_messages_content_length_check',
    );
    expect(migrationSource).toContain(
      "CASE WHEN role = 'user' THEN 2000 ELSE 8000 END",
    );
  });

  it('enforces idempotency via a UNIQUE (user_id, client_request_id) partial index', () => {
    expect(migrationSource).toContain(
      'coach_conversation_messages_client_request_id_unique',
    );
    expect(migrationSource).toContain('WHERE client_request_id IS NOT NULL');
  });

  it('enables RLS on all three tables with owner-only SELECT and explicit write denials', () => {
    expect(migrationSource).toContain(
      'ALTER TABLE public.coach_conversations ENABLE ROW LEVEL SECURITY',
    );
    expect(migrationSource).toContain(
      'ALTER TABLE public.coach_conversation_messages ENABLE ROW LEVEL SECURITY',
    );
    expect(migrationSource).toContain(
      'ALTER TABLE public.coach_free_conversation_state ENABLE ROW LEVEL SECURITY',
    );
    expect(migrationSource).toContain('coach_conversations_owner_select');
    expect(migrationSource).toContain('coach_conversation_messages_owner_select');
    expect(migrationSource).toContain('coach_free_conversation_state_owner_select');
    expect(migrationSource).toContain('user_id = (select auth.uid())');
    expect(migrationSource).toContain('WITH CHECK (false)');
    expect(migrationSource).toContain('USING (false)');
    expect(migrationSource).toContain(
      'REVOKE INSERT, UPDATE, DELETE ON TABLE public.coach_conversations FROM authenticated',
    );
    expect(migrationSource).toContain(
      'REVOKE INSERT, UPDATE, DELETE ON TABLE public.coach_conversation_messages FROM authenticated',
    );
    expect(migrationSource).toContain(
      'REVOKE INSERT, UPDATE, DELETE ON TABLE public.coach_free_conversation_state FROM authenticated',
    );
  });

  it('attaches updated_at triggers for all tables and notifies PostgREST', () => {
    expect(migrationSource).toContain(
      'phase2_set_coach_conversations_updated_at',
    );
    expect(migrationSource).toContain(
      'phase2_set_coach_conversation_messages_updated_at',
    );
    expect(migrationSource).toContain(
      'phase2_set_coach_free_conversation_state_updated_at',
    );
    expect(migrationSource).toContain("NOTIFY pgrst, 'reload schema'");
  });

  it('indexes conversation listing, message ordering, and 24h user-message scans', () => {
    expect(migrationSource).toContain(
      'idx_coach_conversations_user_updated_at',
    );
    expect(migrationSource).toContain(
      'idx_coach_conversations_user_status_updated_at',
    );
    expect(migrationSource).toContain(
      'idx_coach_conversation_messages_conv_created',
    );
    expect(migrationSource).toContain(
      "WHERE role = 'user' AND status IN ('ready', 'streaming')",
    );
  });
});

describe('coach chat feature flag migration', () => {
  const migrationSource = readSource(FEATURE_FLAG_MIGRATION_PATH);

  it('adds coach_chat_enabled as a boolean column defaulting to false', () => {
    expect(migrationSource).toContain(
      'ADD COLUMN IF NOT EXISTS coach_chat_enabled boolean NOT NULL DEFAULT false',
    );
  });

  it('exposes coach_chat_enabled through get_phase2_feature_flags and the app_config view', () => {
    expect(migrationSource).toContain('CREATE OR REPLACE FUNCTION public.get_phase2_feature_flags');
    expect(migrationSource).toContain('coach_chat_enabled boolean');
    expect(migrationSource).toContain('feature_flags.coach_chat_enabled');
    expect(migrationSource).toContain(
      "GRANT EXECUTE ON FUNCTION public.get_phase2_feature_flags(text) TO authenticated",
    );
    expect(migrationSource).toContain('CREATE VIEW public.app_config');
    expect(migrationSource).toContain("'coach_chat_enabled', coach_chat_enabled");
  });
});
