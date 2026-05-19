import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = process.cwd();
const BACKFILL_PATH = path.join(
  REPO_ROOT,
  'supabase',
  'migrations',
  '20260520180300_backfill_coach_entries_prompt_fields.sql',
);
const V2_PATH = path.join(
  REPO_ROOT,
  'supabase',
  'migrations',
  '20260520180400_add_get_coach_history_page_v2.sql',
);

function read(p: string) {
  return fs.readFileSync(p, 'utf8');
}

describe('get_coach_history_page_v2 migration (C-05)', () => {
  it('runs after the backfill migration (timestamp ordering)', () => {
    expect(BACKFILL_PATH < V2_PATH).toBe(true);
  });

  it('creates a v2 function alongside v1 (no DROP of v1)', () => {
    const sql = read(V2_PATH);
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.get_coach_history_page_v2');
    expect(sql).not.toMatch(/DROP FUNCTION[^;]*get_coach_history_page\s*\(/);
  });

  it('omits the five internal columns from the RETURNS TABLE', () => {
    const sql = read(V2_PATH);
    // The RETURNS TABLE block must NOT contain these names.
    const returnsBlockMatch = sql.match(/RETURNS TABLE \(([\s\S]+?)\)\s*LANGUAGE/);
    expect(returnsBlockMatch).toBeTruthy();
    const returnsBlock = returnsBlockMatch![1];

    for (const column of [
      'request_payload_json',
      'response_payload_json',
      'cache_key',
      'input_hash',
      'error_code',
    ]) {
      expect(returnsBlock).not.toContain(column);
    }
  });

  it('keeps the columns the UI consumes', () => {
    const sql = read(V2_PATH);
    const returnsBlockMatch = sql.match(/RETURNS TABLE \(([\s\S]+?)\)\s*LANGUAGE/);
    const returnsBlock = returnsBlockMatch![1];

    for (const column of [
      'id',
      'user_id',
      'title',
      'body',
      'disclaimer',
      'persona_key',
      'prompt_type',
      'question_key',
      'question_text',
      'response_version',
      'content_json',
      'cta_label',
      'cta_route',
      'created_at',
      'source',
      'locale',
      'status',
      'expires_at',
      'generated_at',
    ]) {
      expect(returnsBlock).toContain(column);
    }
  });

  it('keeps SECURITY INVOKER and fixes search_path', () => {
    const sql = read(V2_PATH);
    expect(sql).toContain('SECURITY INVOKER');
    expect(sql).toContain('SET search_path = public, auth');
  });

  it('applies the same RLS filter (entry.user_id = auth.uid()) as v1', () => {
    const sql = read(V2_PATH);
    expect(sql).toContain('entry.user_id = auth.uid()');
  });

  it('grants EXECUTE to authenticated', () => {
    const sql = read(V2_PATH);
    expect(sql).toContain(
      'GRANT EXECUTE ON FUNCTION public.get_coach_history_page_v2(integer, timestamptz, timestamptz, uuid, uuid)',
    );
    expect(sql).toContain('TO authenticated');
  });

  it('asks PostgREST to reload its schema cache after the change', () => {
    const sql = read(V2_PATH);
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'");
  });
});

describe('coach_entries prompt fields backfill migration (C-05 prerequisite)', () => {
  it('backfills the 7 prompt_type values not done by 20260423120000', () => {
    const sql = read(BACKFILL_PATH);
    for (const value of [
      'recovery_plan',
      'hydration_focus',
      'sleep_coach',
      'risk_watch',
      'trend_review',
      'latest_scan_issue_resolution',
      'free_question',
    ]) {
      expect(sql).toContain(`'${value}'`);
    }
  });

  it('maps the legacy trend_comparison alias to trend_review', () => {
    const sql = read(BACKFILL_PATH);
    expect(sql).toMatch(/SET prompt_type = 'trend_review'/);
    expect(sql).toMatch(/= 'trend_comparison'/);
  });

  it('only updates rows where prompt_type IS NULL (idempotent)', () => {
    const sql = read(BACKFILL_PATH);
    // Every UPDATE on prompt_type must guard with WHERE prompt_type IS NULL.
    const updates = sql.match(/UPDATE public\.coach_entries\s+SET prompt_type[\s\S]*?;/g) ?? [];
    expect(updates.length).toBeGreaterThan(0);
    for (const update of updates) {
      expect(update).toContain('prompt_type IS NULL');
    }
  });

  it('also defensively re-runs the question_key/question_text backfill', () => {
    const sql = read(BACKFILL_PATH);
    expect(sql).toContain('question_key');
    expect(sql).toContain('question_text');
    expect(sql).toContain("regexp_replace");
  });
});
