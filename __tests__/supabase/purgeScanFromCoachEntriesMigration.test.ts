import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = process.cwd();
const MIGRATION_PATH = path.join(
  REPO_ROOT,
  'supabase',
  'migrations',
  '20260520170000_purge_scan_from_coach_entries.sql',
);

function readMigrationSource() {
  return fs.readFileSync(MIGRATION_PATH, 'utf8');
}

describe('CO-03 purge_scan_from_coach_entries migration', () => {
  const source = readMigrationSource();

  it('declares the purge function as SECURITY DEFINER with locked search_path', () => {
    expect(source).toContain(
      'CREATE OR REPLACE FUNCTION public.purge_scan_from_coach_entries()',
    );
    expect(source).toContain('SECURITY DEFINER');
    expect(source).toContain('SET search_path = public');
    expect(source).toContain('REVOKE EXECUTE ON FUNCTION public.purge_scan_from_coach_entries() FROM PUBLIC');
  });

  it('attaches an AFTER DELETE trigger on scans', () => {
    expect(source).toMatch(
      /CREATE TRIGGER trg_purge_scan_from_coach_entries[\s\S]+AFTER DELETE ON public\.scans/,
    );
    expect(source).toContain('FOR EACH ROW');
    expect(source).toContain('EXECUTE FUNCTION public.purge_scan_from_coach_entries()');
    expect(source).toContain(
      'DROP TRIGGER IF EXISTS trg_purge_scan_from_coach_entries ON public.scans',
    );
  });

  it('purges latest_scan when scan_id matches', () => {
    expect(source).toMatch(
      /request_payload_json->'latest_scan'->>'scan_id' = v_scan_id/,
    );
    expect(source).toContain("jsonb_build_object('latest_scan', NULL)");
  });

  it('purges selected_scan when scan_id matches', () => {
    expect(source).toMatch(
      /request_payload_json->'selected_scan'->>'scan_id' = v_scan_id/,
    );
    expect(source).toContain("jsonb_build_object('selected_scan', NULL)");
  });

  it('filters recent_scans and prior_scans arrays', () => {
    expect(source).toContain("'{recent_scans}'");
    expect(source).toContain("'{prior_scans}'");
    expect(source).toMatch(
      /jsonb_agg\(elem\)[\s\S]+WHERE elem->>'scan_id' IS DISTINCT FROM v_scan_id/,
    );
  });

  it('filters latest_by_type record', () => {
    expect(source).toContain("'{latest_by_type}'");
    expect(source).toContain('jsonb_object_agg(key, value)');
    expect(source).toMatch(
      /jsonb_each\([\s\S]+latest_by_type[\s\S]+\)[\s\S]+WHERE value->>'scan_id' IS DISTINCT FROM v_scan_id/,
    );
  });

  it('scopes all updates to OLD.user_id (no cross-user leak)', () => {
    const userIdGuards = source.match(/ce\.user_id = OLD\.user_id/g);
    expect(userIdGuards).not.toBeNull();
    expect(userIdGuards!.length).toBeGreaterThanOrEqual(5);
  });

  it('documents the RGPD intent', () => {
    expect(source).toMatch(/RGPD art\.?\s*17/);
    expect(source).toContain('CO-03');
  });
});
