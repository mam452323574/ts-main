/**
 * PROMPT 6 — service-layer tests for the unified Coach history feed and the
 * soft-delete / restore mutations.
 */
import {
  fetchCoachUnifiedHistoryPage,
  COACH_ENTRY_RESTORE_CACHE_KEY_CONFLICT_ERROR_CODE,
} from '@/services/coachHistorySoftDelete';
import { supabase } from '@/services/supabase';

jest.mock('@/services/supabase', () => ({
  supabase: {
    rpc: jest.fn(),
  },
}));

jest.mock('@/services/edgeFunctions', () => ({
  invokeAuthedEdgeFunction: jest.fn(),
  getConfiguredSupabaseProjectLabel: () => 'test-project',
}));

const rpcMock = supabase.rpc as unknown as jest.Mock;

describe('fetchCoachUnifiedHistoryPage', () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it('asks the v1 unified RPC with a normalised limit and a null cursor by default', async () => {
    rpcMock.mockResolvedValueOnce({ data: [], error: null });
    await fetchCoachUnifiedHistoryPage();
    expect(rpcMock).toHaveBeenCalledWith('get_coach_unified_history_page_v1', {
      p_limit: 21, // 20 (default) + 1 sentinel
      p_cursor_sort_at: null,
      p_cursor_kind: null,
      p_cursor_id: null,
      p_include_hidden: false,
    });
  });

  it('clamps the limit to [1, 50] and forwards include_hidden + cursor verbatim', async () => {
    rpcMock.mockResolvedValueOnce({ data: [], error: null });
    await fetchCoachUnifiedHistoryPage({
      limit: 9999,
      cursor: { sort_at: '2026-04-10T00:00:00Z', kind: 'entry', id: 'e-1' },
      includeHidden: true,
    });
    expect(rpcMock).toHaveBeenCalledWith('get_coach_unified_history_page_v1', {
      p_limit: 51, // clamped to 50 + 1 sentinel
      p_cursor_sort_at: '2026-04-10T00:00:00Z',
      p_cursor_kind: 'entry',
      p_cursor_id: 'e-1',
      p_include_hidden: true,
    });
  });

  it('parses entry rows and normalises content_json to the structured contract', async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        {
          kind: 'entry',
          id: 'e-1',
          user_id: 'u-1',
          sort_at: '2026-04-10T08:00:00Z',
          title: 'Title',
          body: 'Body',
          persona_key: 'gentle_supportive',
          locale: 'fr',
          status: 'ready',
          source: 'n8n',
          created_at: '2026-04-10T07:00:00Z',
          generated_at: '2026-04-10T08:00:00Z',
          updated_at: '2026-04-10T08:00:00Z',
          prompt_type: 'free_question',
          question_key: 'free',
          question_text: 'Why?',
          response_version: 2,
          content_json: { summary: 'short' },
          cta_label: null,
          cta_route: null,
          expires_at: null,
          disclaimer: 'Wellness only.',
          deleted_at: null,
        },
      ],
      error: null,
    });

    const page = await fetchCoachUnifiedHistoryPage();
    expect(page.items).toHaveLength(1);
    const item = page.items[0];
    expect(item.kind).toBe('entry');
    if (item.kind === 'entry') {
      expect(item.title).toBe('Title');
      expect(item.body).toBe('Body');
      expect(item.content_json).toMatchObject({
        title: 'Title',
        summary: 'short',
        context_notes: [],
        priorities: [],
        action_steps: [],
      });
      expect(item.response_version).toBe(2);
    }
  });

  it('parses conversation rows and exposes both status and conversation_status', async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        {
          kind: 'conversation',
          id: 'c-1',
          user_id: 'u-1',
          sort_at: '2026-04-11T08:00:00Z',
          title: 'Chat',
          persona_key: 'gentle_supportive',
          locale: 'fr',
          status: 'active',
          created_at: '2026-04-10T00:00:00Z',
          updated_at: '2026-04-11T08:00:00Z',
          message_count: 6,
          user_message_count: 3,
          account_tier_at_start: 'premium',
          last_user_message_at: '2026-04-11T08:00:00Z',
          last_assistant_message_at: '2026-04-11T08:00:30Z',
          ended_at: null,
          ended_reason: null,
          archived_at: null,
          hidden_at: null,
          metadata: { source: 'app' },
        },
      ],
      error: null,
    });

    const page = await fetchCoachUnifiedHistoryPage();
    expect(page.items).toHaveLength(1);
    const item = page.items[0];
    expect(item.kind).toBe('conversation');
    if (item.kind === 'conversation') {
      expect(item.status).toBe('active');
      expect(item.conversation_status).toBe('active');
      expect(item.message_count).toBe(6);
      expect(item.user_message_count).toBe(3);
      expect(item.account_tier_at_start).toBe('premium');
      expect(item.metadata).toEqual({ source: 'app' });
    }
  });

  it('drops rows with an unrecognised kind (forward-compat)', async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        { kind: 'mystery', id: 'x', user_id: 'u-1', sort_at: '2026-04-10T00:00:00Z' },
        {
          kind: 'entry',
          id: 'e-1',
          user_id: 'u-1',
          sort_at: '2026-04-10T08:00:00Z',
          title: 'Title',
          body: 'Body',
          persona_key: 'gentle_supportive',
          status: 'ready',
          created_at: '2026-04-10T07:00:00Z',
          generated_at: '2026-04-10T08:00:00Z',
          updated_at: '2026-04-10T08:00:00Z',
          content_json: null,
          disclaimer: null,
          deleted_at: null,
        },
      ],
      error: null,
    });

    const page = await fetchCoachUnifiedHistoryPage();
    expect(page.items.map((i) => i.id)).toEqual(['e-1']);
  });

  it('builds a next_cursor on the last item when the sentinel row is present', async () => {
    const sentinel = 21;
    const rows = Array.from({ length: sentinel }, (_, i) => ({
      kind: 'entry',
      id: `e-${i}`,
      user_id: 'u-1',
      sort_at: `2026-04-${(20 - i).toString().padStart(2, '0')}T00:00:00Z`,
      title: 'T',
      body: 'B',
      persona_key: 'gentle_supportive',
      status: 'ready',
      created_at: '2026-04-01T00:00:00Z',
      generated_at: null,
      updated_at: null,
      content_json: null,
      disclaimer: null,
      deleted_at: null,
    }));
    rpcMock.mockResolvedValueOnce({ data: rows, error: null });

    const page = await fetchCoachUnifiedHistoryPage(); // limit 20 → sentinel pulls 21
    expect(page.items).toHaveLength(20);
    expect(page.has_more).toBe(true);
    expect(page.next_cursor).toEqual({
      sort_at: rows[19].sort_at,
      kind: 'entry',
      id: 'e-19',
    });
  });

  it('returns has_more=false when the RPC returns fewer rows than the page size', async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        {
          kind: 'entry',
          id: 'e-1',
          user_id: 'u-1',
          sort_at: '2026-04-10T08:00:00Z',
          title: 'Title',
          body: 'Body',
          persona_key: 'gentle_supportive',
          status: 'ready',
          created_at: '2026-04-10T07:00:00Z',
          generated_at: '2026-04-10T08:00:00Z',
          updated_at: '2026-04-10T08:00:00Z',
          content_json: null,
          disclaimer: null,
          deleted_at: null,
        },
      ],
      error: null,
    });

    const page = await fetchCoachUnifiedHistoryPage();
    expect(page.has_more).toBe(false);
    expect(page.next_cursor).toBeNull();
  });

  it('throws a typed CoachServiceError when Supabase reports an error', async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'rpc broken', code: '42P01' },
    });
    await expect(fetchCoachUnifiedHistoryPage()).rejects.toMatchObject({
      code: 'coach_unified_history_page_load_failed',
      status: 502,
    });
  });
});

describe('cache-key conflict marker', () => {
  it('exposes the well-known conflict code so the UI can render a "regenerate instead" affordance', () => {
    expect(COACH_ENTRY_RESTORE_CACHE_KEY_CONFLICT_ERROR_CODE).toBe(
      'coach_entry_restore_cache_key_conflict',
    );
  });
});
