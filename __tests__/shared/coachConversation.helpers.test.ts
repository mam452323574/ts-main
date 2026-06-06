import {
  canSendMessageInCoachConversation,
  getCoachConversationFreeNextRechargeAt,
  getCoachConversationFreeRemainingMessages,
  getCoachConversationPersonaState,
  isCoachConversationFreeConversationAllowed,
  isCoachConversationFreeQuotaExhausted,
  type CoachConversationQuotaStatus,
} from '@/shared/coachConversation';

function buildFreeQuota(
  overrides: Partial<CoachConversationQuotaStatus> = {},
): CoachConversationQuotaStatus {
  return {
    tier: 'free',
    account_tier: 'free',
    unlimited: false,
    window_seconds: 259_200,
    premium_today_used: 0,
    premium_today_limit: null,
    premium_today_available: null,
    next_recharge_at: null,
    per_conversation_limit: 20,
    free_used: false,
    free_message_limit: 4,
    free_used_count: 0,
    free_remaining_messages: 4,
    free_next_recharge_at: null,
    free_window_seconds: 259_200,
    free_conversation_id: null,
    quota_exceeded: false,
    as_of: '2026-05-26T10:00:00.000Z',
    last_conversation_by_persona: {},
    conversation_count_by_persona: {},
    ...overrides,
  };
}

function buildPremiumQuota(
  overrides: Partial<CoachConversationQuotaStatus> = {},
): CoachConversationQuotaStatus {
  return {
    ...buildFreeQuota(),
    tier: 'premium',
    account_tier: 'premium',
    premium_today_limit: 40,
    premium_today_used: 0,
    premium_today_available: 40,
    free_used: false,
    free_used_count: null,
    free_remaining_messages: null,
    free_next_recharge_at: null,
    free_window_seconds: null,
    free_message_limit: null,
    ...overrides,
  };
}

describe('shared/coachConversation helpers (rolling 72h quota)', () => {
  describe('isCoachConversationFreeQuotaExhausted', () => {
    it('returns false when the free user still has remaining messages', () => {
      expect(
        isCoachConversationFreeQuotaExhausted(
          buildFreeQuota({ free_remaining_messages: 3, free_used_count: 1 }),
        ),
      ).toBe(false);
    });

    it('returns true when free_remaining_messages is 0', () => {
      expect(
        isCoachConversationFreeQuotaExhausted(
          buildFreeQuota({ free_remaining_messages: 0, free_used_count: 4 }),
        ),
      ).toBe(true);
    });

    it('returns true when quota_exceeded is true even if remaining > 0', () => {
      expect(
        isCoachConversationFreeQuotaExhausted(
          buildFreeQuota({
            free_remaining_messages: 1,
            quota_exceeded: true,
          }),
        ),
      ).toBe(true);
    });

    it('returns true when free_used flag is set', () => {
      expect(
        isCoachConversationFreeQuotaExhausted(
          buildFreeQuota({ free_used: true, free_remaining_messages: 0 }),
        ),
      ).toBe(true);
    });

    it('returns false for premium and admin tiers', () => {
      expect(isCoachConversationFreeQuotaExhausted(buildPremiumQuota())).toBe(
        false,
      );
      expect(
        isCoachConversationFreeQuotaExhausted(
          buildPremiumQuota({ tier: 'admin', account_tier: 'admin' }),
        ),
      ).toBe(false);
    });
  });

  describe('getCoachConversationFreeRemainingMessages', () => {
    it('clamps to zero and reads free_remaining_messages', () => {
      expect(
        getCoachConversationFreeRemainingMessages(
          buildFreeQuota({ free_remaining_messages: 2 }),
        ),
      ).toBe(2);
      expect(
        getCoachConversationFreeRemainingMessages(
          buildFreeQuota({ free_remaining_messages: -3 }),
        ),
      ).toBe(0);
      expect(
        getCoachConversationFreeRemainingMessages(
          buildFreeQuota({ free_remaining_messages: null }),
        ),
      ).toBe(0);
    });

    it('returns 0 for non-free tiers', () => {
      expect(
        getCoachConversationFreeRemainingMessages(buildPremiumQuota()),
      ).toBe(0);
    });
  });

  describe('getCoachConversationFreeNextRechargeAt', () => {
    it('prefers free_next_recharge_at over next_recharge_at', () => {
      expect(
        getCoachConversationFreeNextRechargeAt(
          buildFreeQuota({
            free_next_recharge_at: '2026-05-29T10:00:00.000Z',
            next_recharge_at: '2026-05-30T10:00:00.000Z',
          }),
        ),
      ).toBe('2026-05-29T10:00:00.000Z');
    });

    it('falls back to next_recharge_at when free_next_recharge_at is missing', () => {
      expect(
        getCoachConversationFreeNextRechargeAt(
          buildFreeQuota({
            free_next_recharge_at: null,
            next_recharge_at: '2026-05-30T10:00:00.000Z',
          }),
        ),
      ).toBe('2026-05-30T10:00:00.000Z');
    });

    it('returns null for premium', () => {
      expect(
        getCoachConversationFreeNextRechargeAt(buildPremiumQuota()),
      ).toBeNull();
    });
  });

  describe('isCoachConversationFreeConversationAllowed', () => {
    it('allows entry while credits remain', () => {
      expect(
        isCoachConversationFreeConversationAllowed(
          buildFreeQuota({ free_remaining_messages: 4 }),
        ),
      ).toBe(true);
    });

    it('blocks entry once the rolling window is exhausted', () => {
      expect(
        isCoachConversationFreeConversationAllowed(
          buildFreeQuota({
            free_remaining_messages: 0,
            free_used: true,
            quota_exceeded: true,
          }),
        ),
      ).toBe(false);
    });

    it('always allows premium and admin', () => {
      expect(
        isCoachConversationFreeConversationAllowed(buildPremiumQuota()),
      ).toBe(true);
      expect(
        isCoachConversationFreeConversationAllowed(
          buildPremiumQuota({ tier: 'admin', account_tier: 'admin' }),
        ),
      ).toBe(true);
    });
  });

  describe('getCoachConversationPersonaState', () => {
    it('returns zero count and null lastConversation when quota is null', () => {
      expect(
        getCoachConversationPersonaState(null, 'gentle_supportive'),
      ).toEqual({ lastConversation: null, count: 0 });
    });

    it('returns zero count and null lastConversation when the persona has no entry', () => {
      const quota = buildFreeQuota({
        last_conversation_by_persona: {
          playful_light: {
            id: 'conv-1',
            updated_at: '2026-05-26T10:00:00.000Z',
            last_user_message_at: '2026-05-26T09:55:00.000Z',
          },
        },
        conversation_count_by_persona: { playful_light: 1 },
      });
      expect(
        getCoachConversationPersonaState(quota, 'gentle_supportive'),
      ).toEqual({ lastConversation: null, count: 0 });
    });

    it('returns the persona snapshot when it exists', () => {
      const snapshot = {
        id: 'conv-7',
        updated_at: '2026-05-27T10:00:00.000Z',
        last_user_message_at: '2026-05-27T09:55:00.000Z',
      };
      const quota = buildPremiumQuota({
        last_conversation_by_persona: { strict_tough: snapshot },
        conversation_count_by_persona: { strict_tough: 3 },
      });
      expect(
        getCoachConversationPersonaState(quota, 'strict_tough'),
      ).toEqual({ lastConversation: snapshot, count: 3 });
    });

    it('treats explicit null entries as absent', () => {
      const quota = buildPremiumQuota({
        last_conversation_by_persona: { motivational_energetic: null },
        conversation_count_by_persona: { motivational_energetic: 0 },
      });
      expect(
        getCoachConversationPersonaState(quota, 'motivational_energetic'),
      ).toEqual({ lastConversation: null, count: 0 });
    });
  });

  describe('canSendMessageInCoachConversation', () => {
    it('allows a free user with remaining credits inside an active conversation', () => {
      const conversation = { status: 'active' as const };
      expect(
        canSendMessageInCoachConversation(
          conversation,
          buildFreeQuota({ free_remaining_messages: 1 }),
        ),
      ).toBe(true);
    });

    it('denies a free user once the rolling window is exhausted', () => {
      const conversation = { status: 'active' as const };
      expect(
        canSendMessageInCoachConversation(
          conversation,
          buildFreeQuota({
            free_remaining_messages: 0,
            free_used: true,
            quota_exceeded: true,
          }),
        ),
      ).toBe(false);
    });

    it('denies sending when the conversation itself is no longer active', () => {
      const conversation = { status: 'ended' as const };
      expect(
        canSendMessageInCoachConversation(
          conversation,
          buildFreeQuota({ free_remaining_messages: 4 }),
        ),
      ).toBe(false);
    });
  });
});
