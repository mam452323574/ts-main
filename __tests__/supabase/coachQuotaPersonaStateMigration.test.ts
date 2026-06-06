import * as fs from 'fs';
import * as path from 'path';

const MIGRATION_PATH = path.join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260527180000_extend_coach_quota_with_persona_state.sql',
);

describe('coach quota — persona state extension migration', () => {
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');

  it('replaces build_coach_conversation_quota_status_json (not a new RPC)', () => {
    expect(sql).toContain(
      'CREATE OR REPLACE FUNCTION public.build_coach_conversation_quota_status_json',
    );
  });

  it('computes the per-persona last visible conversation with DISTINCT ON', () => {
    expect(sql).toMatch(
      /SELECT DISTINCT ON \(conv\.persona_key\)[\s\S]+FROM public\.coach_conversations/,
    );
  });

  it('orders the per-persona snapshot by the activity timestamp (last_user_message_at, updated_at)', () => {
    expect(sql).toMatch(
      /ORDER BY[\s\S]+conv\.persona_key[\s\S]+COALESCE\(conv\.last_user_message_at, conv\.updated_at\) DESC/,
    );
  });

  it('excludes soft-deleted conversations (hidden_at IS NOT NULL) from both maps', () => {
    // Two distinct sub-queries (last + count) each must filter on hidden_at.
    const filterMatches = sql.match(/AND conv\.hidden_at IS NULL/g) ?? [];
    expect(filterMatches.length).toBeGreaterThanOrEqual(2);
  });

  it('groups the count map by persona_key', () => {
    expect(sql).toMatch(
      /SELECT conv\.persona_key, COUNT\(\*\)::integer AS conv_count[\s\S]+GROUP BY conv\.persona_key/,
    );
  });

  it('returns the two new fields for the admin tier branch', () => {
    const adminBranch = sql.match(
      /IF v_account_tier = 'admin' THEN[\s\S]+?END IF;/,
    )?.[0];
    expect(adminBranch).toBeDefined();
    expect(adminBranch).toContain(
      "'last_conversation_by_persona', COALESCE(v_persona_last, '{}'::jsonb)",
    );
    expect(adminBranch).toContain(
      "'conversation_count_by_persona', COALESCE(v_persona_counts, '{}'::jsonb)",
    );
  });

  it('returns the two new fields for the free/premium return branch', () => {
    // The final RETURN block contains the free/premium payload — assert the
    // two new keys are present alongside the legacy ones.
    expect(sql).toContain(
      "'last_conversation_by_persona', COALESCE(v_persona_last, '{}'::jsonb)",
    );
    expect(sql).toContain(
      "'conversation_count_by_persona', COALESCE(v_persona_counts, '{}'::jsonb)",
    );
  });

  it('triggers a PostgREST schema reload at the tail of the migration', () => {
    expect(sql).toContain("NOTIFY pgrst, 'reload schema';");
  });
});
