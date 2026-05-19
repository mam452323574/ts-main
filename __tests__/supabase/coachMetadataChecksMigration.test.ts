import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = process.cwd();
const MIGRATION_PATH = path.join(
  REPO_ROOT,
  'supabase',
  'migrations',
  '20260520180100_add_coach_metadata_size_checks.sql',
);

function readMigrationSource() {
  return fs.readFileSync(MIGRATION_PATH, 'utf8');
}

describe('coach metadata size checks migration (N-F)', () => {
  it('protects coach_conversations.metadata with a 4 KB jsonb-object cap', () => {
    const sql = readMigrationSource();
    expect(sql).toContain(
      'DROP CONSTRAINT IF EXISTS coach_conversations_metadata_size_check',
    );
    expect(sql).toContain('ADD CONSTRAINT coach_conversations_metadata_size_check');
    expect(sql).toMatch(
      /coach_conversations_metadata_size_check[\s\S]+jsonb_typeof\(metadata\) = 'object'[\s\S]+length\(metadata::text\) <= 4096/,
    );
  });

  it('protects coach_conversation_messages.metadata with a 4 KB jsonb-object cap', () => {
    const sql = readMigrationSource();
    expect(sql).toContain(
      'DROP CONSTRAINT IF EXISTS coach_conversation_messages_metadata_size_check',
    );
    expect(sql).toContain(
      'ADD CONSTRAINT coach_conversation_messages_metadata_size_check',
    );
    expect(sql).toMatch(
      /coach_conversation_messages_metadata_size_check[\s\S]+jsonb_typeof\(metadata\) = 'object'[\s\S]+length\(metadata::text\) <= 4096/,
    );
  });

  it('protects coach_free_conversation_state.metadata with a tighter 2 KB cap', () => {
    const sql = readMigrationSource();
    expect(sql).toContain(
      'DROP CONSTRAINT IF EXISTS coach_free_conversation_state_metadata_size_check',
    );
    expect(sql).toContain(
      'ADD CONSTRAINT coach_free_conversation_state_metadata_size_check',
    );
    expect(sql).toMatch(
      /coach_free_conversation_state_metadata_size_check[\s\S]+length\(metadata::text\) <= 2048/,
    );
  });

  it('does not touch any non-metadata constraint on the three tables', () => {
    const sql = readMigrationSource();
    expect(sql).not.toMatch(/DROP CONSTRAINT IF EXISTS coach_conversations_persona_key_check/);
    expect(sql).not.toMatch(/DROP CONSTRAINT IF EXISTS coach_conversations_status_check/);
    expect(sql).not.toMatch(/DROP CONSTRAINT IF EXISTS coach_conversation_messages_role_check/);
    expect(sql).not.toMatch(
      /DROP CONSTRAINT IF EXISTS coach_conversation_messages_content_length_check/,
    );
  });

  it('asks PostgREST to reload its schema cache after the change', () => {
    const sql = readMigrationSource();
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'");
  });
});
