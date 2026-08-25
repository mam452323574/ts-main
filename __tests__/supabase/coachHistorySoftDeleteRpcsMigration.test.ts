import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = process.cwd();
const RPCS_MIGRATION_PATH = path.join(
  REPO_ROOT,
  'supabase',
  'migrations',
  '20260527120100_add_coach_history_soft_delete_rpcs.sql',
);
const COLUMNS_MIGRATION_PATH = path.join(
  REPO_ROOT,
  'supabase',
  'migrations',
  '20260527120000_add_coach_history_soft_delete_columns.sql',
);

function read(p: string) {
  return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
}

function readFunctionBlock(source: string, functionName: string) {
  const signature = `CREATE OR REPLACE FUNCTION public.${functionName}`;
  const blockStart = source.indexOf(signature);
  const bodyStart = source.indexOf('AS $$', blockStart);
  const blockEnd = source.indexOf('\n$$;', bodyStart);

  if (blockStart < 0 || bodyStart < 0 || blockEnd < 0) {
    throw new Error(`Unable to extract SQL function block for ${functionName}`);
  }

  return source.slice(blockStart, blockEnd + '\n$$;'.length);
}

describe('coach history soft-delete RPCs migration', () => {
  const sql = read(RPCS_MIGRATION_PATH);

  it('runs after the schema migration (timestamp ordering)', () => {
    expect(COLUMNS_MIGRATION_PATH < RPCS_MIGRATION_PATH).toBe(true);
  });

  it('extends get_coach_history_page_v2 with a deleted_at filter', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.get_coach_history_page_v2');
    expect(sql).toContain('entry.deleted_at IS NULL');
  });

  it('extends get_coach_conversations_page with a p_include_hidden parameter', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.get_coach_conversations_page');
    expect(sql).toContain('p_include_hidden boolean DEFAULT false');
    expect(sql).toMatch(/AND \(p_include_hidden OR conv\.hidden_at IS NULL\)/);
  });

  it('exposes the new conversations RETURNS shape with both archived_at and hidden_at', () => {
    expect(sql).toContain('archived_at timestamptz,\n  hidden_at timestamptz');
  });

  it('drops the previous 4-arg get_coach_conversations_page signature', () => {
    expect(sql).toContain(
      'DROP FUNCTION IF EXISTS public.get_coach_conversations_page(integer, timestamptz, uuid, boolean);',
    );
  });

  it('updates archive_coach_conversation to also set hidden_at (backward compat with unified history)', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.archive_coach_conversation[\s\S]+hidden_at = COALESCE\(hidden_at, v_now\)/);
  });

  describe('delete_coach_entry / restore_coach_entry', () => {
    it('declare both RPCs as SECURITY DEFINER with a fixed search_path', () => {
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.delete_coach_entry');
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.restore_coach_entry');
      const entryBlock = readFunctionBlock(sql, 'delete_coach_entry');
      expect(entryBlock).toContain('SECURITY DEFINER');
      expect(entryBlock).toContain('SET search_path = public, auth');
    });

    it('enforces (id, user_id) ownership on delete', () => {
      const block = readFunctionBlock(sql, 'delete_coach_entry');
      expect(block).toMatch(/WHERE id = p_entry_id[\s\S]+AND user_id = p_user_id/);
    });

    it('only flips deleted_at on rows that are still live (idempotent)', () => {
      const block = readFunctionBlock(sql, 'delete_coach_entry');
      expect(block).toContain('AND deleted_at IS NULL');
    });

    it('detects cache_key collisions on restore so we never violate the partial unique index', () => {
      const block = readFunctionBlock(sql, 'restore_coach_entry');
      expect(block).toContain('coach_entry_restore_cache_key_conflict');
      expect(block).toContain('cache_key');
    });
  });

  describe('delete_coach_conversation', () => {
    const block = readFunctionBlock(sql, 'delete_coach_conversation');
    const executableBlock = block.replace(/--.*$/gm, '');

    it('is SECURITY DEFINER with a fixed search_path', () => {
      expect(block).toContain('SECURITY DEFINER');
      expect(block).toContain('SET search_path = public, auth');
    });

    it('enforces ownership via (id, user_id)', () => {
      expect(block).toMatch(/WHERE id = p_conversation_id[\s\S]+AND user_id = p_user_id/);
    });

    it('never touches coach_free_conversation_state.consumed (free-tier lifetime gate)', () => {
      // Critical security contract: a free user must not be able to start a
      // new free conversation by deleting their previous one.
      expect(executableBlock).not.toContain('coach_free_conversation_state');
      expect(executableBlock).not.toContain('consumed');
    });

    it('only flips hidden_at on rows that are still visible (idempotent)', () => {
      expect(block).toContain('AND hidden_at IS NULL');
    });

    it('never changes status nor cascades to coach_conversation_messages', () => {
      expect(block).not.toMatch(/SET status\s*=/);
      expect(block).not.toContain('coach_conversation_messages');
    });
  });

  describe('restore_coach_conversation', () => {
    const block = readFunctionBlock(sql, 'restore_coach_conversation');

    it('enforces ownership via (id, user_id)', () => {
      expect(block).toMatch(/WHERE id = p_conversation_id[\s\S]+AND user_id = p_user_id/);
    });

    it('rolls back the legacy archived status when restoring', () => {
      expect(block).toMatch(/WHEN status = 'archived' THEN 'ended'/);
    });

    it('also clears archived_at when un-archiving', () => {
      expect(block).toMatch(/archived_at = CASE[\s\S]+THEN NULL/);
    });
  });

  describe('get_coach_unified_history_page_v1', () => {
    it('returns a kind discriminator so the client can route to the right card', () => {
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.get_coach_unified_history_page_v1');
      expect(sql).toMatch(/kind text/);
      expect(sql).toContain("'entry'::text                                   AS kind");
      expect(sql).toContain("'conversation'::text                                              AS kind");
    });

    it('orders by sort_at DESC then kind DESC then id DESC (deterministic keyset pagination)', () => {
      expect(sql).toContain('ORDER BY combined.sort_at DESC, combined.kind DESC, combined.id DESC');
    });

    it('exposes p_include_hidden so a future trash UI can opt in to soft-deleted rows', () => {
      expect(sql).toContain('p_include_hidden boolean DEFAULT false');
      expect(sql).toMatch(/p_include_hidden OR entry\.deleted_at IS NULL/);
      expect(sql).toMatch(/p_include_hidden OR conv\.hidden_at IS NULL/);
    });

    it('is SECURITY INVOKER so RLS applies to the authenticated caller', () => {
      const block = readFunctionBlock(sql, 'get_coach_unified_history_page_v1');
      expect(block).toContain('SECURITY INVOKER');
      expect(block).toContain('SET search_path = public, auth');
    });

    it('filters entries to ready-only with non-empty title/body (parity with v2)', () => {
      const block = sql.match(
        /FROM public\.coach_entries AS entry[\s\S]+?UNION ALL/,
      )?.[0];
      expect(block).toContain("entry.status = 'ready'");
      expect(block).toContain("btrim(entry.title) <> ''");
      expect(block).toContain("btrim(entry.body) <> ''");
    });
  });

  describe('grants', () => {
    it('revokes the soft-delete RPCs from PUBLIC and grants them to service_role only', () => {
      expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.delete_coach_entry(uuid, uuid) FROM PUBLIC');
      expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.restore_coach_entry(uuid, uuid) FROM PUBLIC');
      expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.delete_coach_conversation(uuid, uuid) FROM PUBLIC');
      expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.restore_coach_conversation(uuid, uuid) FROM PUBLIC');
      expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.delete_coach_entry(uuid, uuid) TO service_role');
      expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.delete_coach_conversation(uuid, uuid) TO service_role');
    });

    it('grants the unified history RPC to authenticated for direct client-side use', () => {
      expect(sql).toMatch(
        /GRANT EXECUTE ON FUNCTION public\.get_coach_unified_history_page_v1\([\s\S]+\) TO authenticated/,
      );
    });
  });

  it('reloads the PostgREST schema cache so the new RPCs are immediately callable', () => {
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'");
  });
});
