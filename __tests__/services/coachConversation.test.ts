import {
  COACH_CONVERSATION_FREE_ALREADY_USED_ERROR_CODE,
  COACH_CONVERSATION_FREE_LIMIT_REACHED_ERROR_CODE,
  COACH_CONVERSATION_QUOTA_EXHAUSTED_ERROR_CODE,
  fetchCoachConversationsPage,
  generateCoachConversationClientRequestId,
  getCoachConversationQuotaFromError,
  isCoachConversationQuotaExhaustedError,
} from '@/services/coachConversation';
import { CoachServiceError } from '@/services/coach';
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

function buildInboxRow(id: string, personaKey: 'gentle_supportive' | 'patient_calm' = 'gentle_supportive') {
  return {
    id,
    user_id: 'user-1',
    created_at: '2026-05-26T09:00:00.000Z',
    updated_at: '2026-05-27T09:00:00.000Z',
    title: null,
    persona_key: personaKey,
    locale: 'fr',
    status: 'active',
    message_count: 2,
    user_message_count: 1,
    account_tier_at_start: 'free',
    last_user_message_at: '2026-05-27T08:00:00.000Z',
    last_assistant_message_at: '2026-05-27T09:00:00.000Z',
    ended_at: null,
    ended_reason: null,
    archived_at: null,
    metadata: { source: 'rpc' },
    first_user_message_preview: `First ${id}`,
    last_message_preview: `Last ${id}`,
    last_message_at: '2026-05-27T09:00:00.000Z',
  };
}

describe('coachConversation service helpers', () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  describe('fetchCoachConversationsPage', () => {
    it('sends p_persona_key null for the global inbox', async () => {
      rpcMock.mockResolvedValueOnce({ data: [], error: null });

      await fetchCoachConversationsPage();

      expect(rpcMock).toHaveBeenCalledWith('get_coach_conversations_page', {
        p_limit: 21,
        p_cursor_updated_at: null,
        p_cursor_id: null,
        p_include_archived: false,
        p_include_hidden: false,
        p_persona_key: null,
      });
    });

    it('sends the explicit persona key for filtered inbox mode', async () => {
      rpcMock.mockResolvedValueOnce({ data: [], error: null });

      await fetchCoachConversationsPage({
        persona_key: 'patient_calm',
        limit: 10,
        cursor: {
          updated_at: '2026-05-27T10:00:00.000Z',
          id: 'conv-10',
        },
        include_archived: true,
      });

      expect(rpcMock).toHaveBeenCalledWith('get_coach_conversations_page', {
        p_limit: 11,
        p_cursor_updated_at: '2026-05-27T10:00:00.000Z',
        p_cursor_id: 'conv-10',
        p_include_archived: true,
        p_include_hidden: false,
        p_persona_key: 'patient_calm',
      });
    });

    it('derives has_more and next_cursor from the limit + 1 sentinel row', async () => {
      rpcMock.mockResolvedValueOnce({
        data: [
          buildInboxRow('conv-1'),
          buildInboxRow('conv-2'),
          buildInboxRow('conv-3'),
        ],
        error: null,
      });

      const page = await fetchCoachConversationsPage({ limit: 2 });

      expect(page.items.map((item) => item.id)).toEqual(['conv-1', 'conv-2']);
      expect(page.has_more).toBe(true);
      expect(page.next_cursor).toEqual({
        updated_at: '2026-05-27T09:00:00.000Z',
        id: 'conv-2',
      });
    });

    it('maps direct RPC failures to CoachServiceError', async () => {
      rpcMock.mockResolvedValueOnce({
        data: null,
        error: { message: 'boom', code: 'rpc_failed' },
      });

      await expect(fetchCoachConversationsPage()).rejects.toMatchObject({
        name: 'CoachServiceError',
        code: 'coach_conversations_list_failed',
        status: 502,
        details: { message: 'boom', code: 'rpc_failed' },
      });
    });
  });

  describe('generateCoachConversationClientRequestId', () => {
    it('produces a stable UUIDv4 shape', () => {
      const id = generateCoachConversationClientRequestId();
      expect(typeof id).toBe('string');
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });

    it('never returns the same id twice in a row', () => {
      const seen = new Set<string>();
      for (let i = 0; i < 32; i += 1) {
        const id = generateCoachConversationClientRequestId();
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
    });
  });

  describe('isCoachConversationQuotaExhaustedError', () => {
    it.each([
      COACH_CONVERSATION_QUOTA_EXHAUSTED_ERROR_CODE,
      COACH_CONVERSATION_FREE_LIMIT_REACHED_ERROR_CODE,
      COACH_CONVERSATION_FREE_ALREADY_USED_ERROR_CODE,
    ])('returns true for code "%s"', (code) => {
      const error = new CoachServiceError('Quota exhausted', { code });
      expect(isCoachConversationQuotaExhaustedError(error)).toBe(true);
    });

    it('returns false for other errors', () => {
      expect(
        isCoachConversationQuotaExhaustedError(
          new CoachServiceError('Other', { code: 'coach_conversation_other' }),
        ),
      ).toBe(false);
      expect(isCoachConversationQuotaExhaustedError(new Error('boom'))).toBe(
        false,
      );
      expect(isCoachConversationQuotaExhaustedError(null)).toBe(false);
    });
  });

  describe('getCoachConversationQuotaFromError', () => {
    it('returns the quota snapshot when packed under details.quota', () => {
      const quota = { tier: 'free', free_used: true } as never;
      const error = new CoachServiceError('Exhausted', {
        code: COACH_CONVERSATION_QUOTA_EXHAUSTED_ERROR_CODE,
        details: { quota },
      });
      expect(getCoachConversationQuotaFromError(error)).toBe(quota);
    });

    it('returns the quota snapshot when packed under details.payload.quota', () => {
      const quota = { tier: 'free', quota_exceeded: true } as never;
      const error = new CoachServiceError('Exhausted', {
        code: COACH_CONVERSATION_QUOTA_EXHAUSTED_ERROR_CODE,
        details: { payload: { quota } },
      });
      expect(getCoachConversationQuotaFromError(error)).toBe(quota);
    });

    it('returns null when no quota snapshot is present', () => {
      const error = new CoachServiceError('Exhausted', {
        code: COACH_CONVERSATION_QUOTA_EXHAUSTED_ERROR_CODE,
        details: { something: 'else' },
      });
      expect(getCoachConversationQuotaFromError(error)).toBeNull();
    });

    it('returns null for plain errors', () => {
      expect(getCoachConversationQuotaFromError(new Error('x'))).toBeNull();
    });
  });
});
