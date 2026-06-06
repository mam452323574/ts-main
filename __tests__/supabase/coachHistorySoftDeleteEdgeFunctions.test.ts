import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = process.cwd();
const FUNCTIONS_DIR = path.join(REPO_ROOT, 'supabase', 'functions');
const SHARED_HELPER_PATH = path.join(
  FUNCTIONS_DIR,
  '_shared',
  'coachHistorySoftDelete.ts',
);
const ACTIVE_MANIFEST_PATH = path.join(FUNCTIONS_DIR, 'active-edge-functions.json');
const CONFIG_TOML_PATH = path.join(REPO_ROOT, 'supabase', 'config.toml');

const NEW_FUNCTION_SLUGS = [
  'coach-delete-entry',
  'coach-restore-entry',
  'coach-delete-conversation',
  'coach-restore-conversation',
] as const;

function read(p: string) {
  return fs.readFileSync(p, 'utf8');
}

describe('coach history soft-delete Edge Functions', () => {
  it('each function has its own directory + index.ts', () => {
    for (const slug of NEW_FUNCTION_SLUGS) {
      const indexPath = path.join(FUNCTIONS_DIR, slug, 'index.ts');
      expect(fs.existsSync(indexPath)).toBe(true);
    }
  });

  it('each function is registered in active-edge-functions.json', () => {
    const manifest = JSON.parse(read(ACTIVE_MANIFEST_PATH)) as { functions: string[] };
    for (const slug of NEW_FUNCTION_SLUGS) {
      expect(manifest.functions).toContain(slug);
    }
  });

  it('each function has a verify_jwt = true block in config.toml', () => {
    const toml = read(CONFIG_TOML_PATH);
    for (const slug of NEW_FUNCTION_SLUGS) {
      const escaped = slug.replace(/-/g, '\\-');
      const re = new RegExp(`\\[functions\\.${escaped}\\][\\s\\S]+?verify_jwt\\s*=\\s*true`);
      expect(toml).toMatch(re);
    }
  });

  it('each function goes through requireAuthenticatedUser before doing any work', () => {
    for (const slug of NEW_FUNCTION_SLUGS) {
      const source = read(path.join(FUNCTIONS_DIR, slug, 'index.ts'));
      expect(source).toContain("from '../_shared/phase2Auth.ts'");
      expect(source).toContain('requireAuthenticatedUser(supabase, req)');
    }
  });

  it('each function validates the incoming id as a UUID before calling the RPC', () => {
    for (const slug of NEW_FUNCTION_SLUGS) {
      const source = read(path.join(FUNCTIONS_DIR, slug, 'index.ts'));
      expect(source).toMatch(/UUID_REGEX/);
      expect(source).toMatch(/\/\^\[0-9a-fA-F-\]\{36\}\$\//);
    }
  });

  it('conversation-scoped functions also enforce the coach_chat feature flag', () => {
    for (const slug of ['coach-delete-conversation', 'coach-restore-conversation']) {
      const source = read(path.join(FUNCTIONS_DIR, slug, 'index.ts'));
      expect(source).toContain('coach_chat_enabled');
      expect(source).toContain('requireFeatureEnabled');
    }
  });

  it('entry-scoped functions skip the coach_chat flag (entries are a separate feature)', () => {
    for (const slug of ['coach-delete-entry', 'coach-restore-entry']) {
      const source = read(path.join(FUNCTIONS_DIR, slug, 'index.ts'));
      expect(source).not.toContain('coach_chat_enabled');
    }
  });

  it('each function reports failures through logPhase2Error with a request id', () => {
    for (const slug of NEW_FUNCTION_SLUGS) {
      const source = read(path.join(FUNCTIONS_DIR, slug, 'index.ts'));
      expect(source).toContain('logPhase2Error');
      expect(source).toContain('request_id: requestId');
    }
  });
});

describe('coach history soft-delete shared helper', () => {
  const source = read(SHARED_HELPER_PATH);

  it('exports the four RPC bridge functions', () => {
    for (const exportName of [
      'deleteCoachEntry',
      'restoreCoachEntry',
      'deleteCoachConversation',
      'restoreCoachConversation',
    ]) {
      expect(source).toMatch(new RegExp(`export async function ${exportName}\\(`));
    }
  });

  it('routes every helper through createPhase2DatabaseError on Supabase failures', () => {
    expect(source).toContain('createPhase2DatabaseError');
    // One per helper.
    expect(
      source.match(/createPhase2DatabaseError\(error/g)?.length,
    ).toBeGreaterThanOrEqual(4);
  });

  it('passes p_entry_id / p_conversation_id + p_user_id verbatim to the RPCs', () => {
    expect(source).toMatch(/p_entry_id: options\.entryId/);
    expect(source).toMatch(/p_user_id: options\.userId/);
    expect(source).toMatch(/p_conversation_id: options\.conversationId/);
  });

  it('surfaces the cache_key conflict marker from restore_coach_entry', () => {
    expect(source).toContain('coach_entry_restore_cache_key_conflict');
  });
});
