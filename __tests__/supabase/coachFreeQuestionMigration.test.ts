import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = process.cwd();
const MIGRATION_PATH = path.join(
  REPO_ROOT,
  'supabase',
  'migrations',
  '20260514130000_add_free_question_coach_prompt.sql',
);

function readMigrationSource() {
  return fs.readFileSync(MIGRATION_PATH, 'utf8');
}

describe('coach free_question migration', () => {
  it('adds free_question without dropping existing Coach prompt types', () => {
    const migrationSource = readMigrationSource();

    expect(migrationSource).toContain('coach_entries_prompt_type_check');
    expect(migrationSource).toContain("'free_question'");
    expect(migrationSource).toContain("'latest_scan'");
    expect(migrationSource).toContain("'latest_scan_issue_resolution'");
    expect(migrationSource).toContain("'weekly_plan'");
    expect(migrationSource).toContain("'trend_review'");
  });

  it('allows 800 characters only for required free_question text', () => {
    const migrationSource = readMigrationSource();

    expect(migrationSource).toContain(
      'prompt_type = \'free_question\'',
    );
    expect(migrationSource).toContain('question_text IS NOT NULL');
    expect(migrationSource).toContain(
      'char_length(btrim(question_text)) BETWEEN 1 AND 800',
    );
    expect(migrationSource).toContain(
      "prompt_type IS DISTINCT FROM 'free_question'",
    );
    expect(migrationSource).toContain('char_length(question_text) <= 200');
  });
});
