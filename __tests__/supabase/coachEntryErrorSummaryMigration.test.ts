import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = process.cwd();
const RPC_PATH = path.join(
  REPO_ROOT,
  'supabase',
  'migrations',
  '20260605130000_add_get_coach_entry_error_summary.sql',
);

function read(p: string) {
  return fs.readFileSync(p, 'utf8');
}

describe('get_coach_entry_error_summary migration', () => {
  it('creates the RPC function', () => {
    const sql = read(RPC_PATH);
    expect(sql).toContain(
      'CREATE OR REPLACE FUNCTION public.get_coach_entry_error_summary',
    );
  });

  it('uses SECURITY DEFINER with a pinned search_path', () => {
    const sql = read(RPC_PATH);
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain('SET search_path = public, auth');
  });

  it('returns only the curated safe projection', () => {
    const sql = read(RPC_PATH);
    const returnsBlockMatch = sql.match(/RETURNS TABLE \(([\s\S]+?)\)\s*LANGUAGE/);
    expect(returnsBlockMatch).toBeTruthy();
    const returnsBlock = returnsBlockMatch![1];

    for (const column of [
      'id',
      'status',
      'error_code',
      'webhook_status',
      'provider_failure_kind',
      'source',
      'locale',
      'created_at',
      'updated_at',
    ]) {
      expect(returnsBlock).toContain(column);
    }
  });

  it('never exposes raw provider topology in the RETURNS TABLE', () => {
    const sql = read(RPC_PATH);
    const returnsBlockMatch = sql.match(/RETURNS TABLE \(([\s\S]+?)\)\s*LANGUAGE/);
    const returnsBlock = returnsBlockMatch![1];

    for (const forbidden of [
      'provider_node_name',
      'provider_node_type',
      'request_payload_json',
      'cache_key',
      'input_hash',
    ]) {
      expect(returnsBlock).not.toContain(forbidden);
    }
    // response_payload_json is read by the function body to derive
    // webhook_status / provider_failure_kind, but must not appear raw in the
    // returned projection.
    expect(returnsBlock).not.toContain('response_payload_json');
  });

  it('scopes results to the calling user via auth.uid()', () => {
    const sql = read(RPC_PATH);
    expect(sql).toContain('entry.user_id = auth.uid()');
  });

  it("filters to error entries only", () => {
    const sql = read(RPC_PATH);
    expect(sql).toContain("entry.status = 'error'");
  });

  it('revokes PUBLIC and grants EXECUTE to authenticated', () => {
    const sql = read(RPC_PATH);
    expect(sql).toContain(
      'REVOKE ALL ON FUNCTION public.get_coach_entry_error_summary(uuid) FROM PUBLIC',
    );
    expect(sql).toContain(
      'GRANT EXECUTE ON FUNCTION public.get_coach_entry_error_summary(uuid)',
    );
    expect(sql).toContain('TO authenticated');
  });

  it('asks PostgREST to reload its schema cache', () => {
    const sql = read(RPC_PATH);
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'");
  });
});
