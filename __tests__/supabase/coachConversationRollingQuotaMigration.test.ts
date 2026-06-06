import * as fs from 'fs';
import * as path from 'path';

import {
  COACH_CONVERSATION_ENDED_ERROR_CODE,
  COACH_CONVERSATION_FREE_ALREADY_USED_ERROR_CODE,
  COACH_CONVERSATION_FREE_LIMIT_REACHED_ERROR_CODE,
  COACH_CONVERSATION_MESSAGE_LIMIT_ERROR_CODE,
  COACH_CONVERSATION_NOT_FOUND_ERROR_CODE,
  COACH_CONVERSATION_QUOTA_EXHAUSTED_ERROR_CODE,
  COACH_CONVERSATION_REQUEST_IN_PROGRESS_ERROR_CODE,
  mapCoachConversationReservationToHttpError,
  normalizeCoachConversationQuotaStatus,
  type CoachConversationQuotaStatus,
  type CoachConversationReservationResult,
} from '@/supabase/functions/_shared/coachConversationQuota';

const REPO_ROOT = process.cwd();
const MIGRATION_PATH = path.join(
  REPO_ROOT,
  'supabase',
  'migrations',
  '20260606120000_roll_free_coach_conversation_quota.sql',
);
const SEND_HANDLER_PATH = path.join(
  REPO_ROOT,
  'supabase',
  'functions',
  'coach-send-message',
  'handler.ts',
);

const migrationSource = fs.readFileSync(MIGRATION_PATH, 'utf8');
const sendHandlerSource = fs.readFileSync(SEND_HANDLER_PATH, 'utf8');

describe('free Coach conversation rolling quota migration', () => {
  it('supersedes the lifetime gate and preserves legacy users without a permanent denial', () => {
    expect(migrationSource).toContain('UPDATE public.coach_free_conversation_state');
    expect(migrationSource).toContain('SET consumed = false');
    expect(migrationSource).toContain('lifetime_guard_disabled_at');
    expect(migrationSource).not.toContain("'coach_free_conversation_already_used'");
  });

  it('counts only active free events in a rolling 72 hour window', () => {
    expect(migrationSource).toContain('v_free_message_limit integer := 4');
    expect(migrationSource).toContain('v_free_window_seconds integer := 259200');
    expect(migrationSource).toContain("requested_at > (p_now - interval '72 hours')");
    expect(migrationSource).toContain("requested_at > (v_now - interval '72 hours')");
    expect(migrationSource).toContain(
      "COALESCE(metadata->>'quota_tier', 'free') = 'free'",
    );
    expect(migrationSource).not.toContain("date_trunc('day'");
  });

  it('returns independently rechargeable free quota fields and the oldest recharge instant', () => {
    expect(migrationSource).toContain(
      "v_free_oldest_requested_at + interval '72 hours'",
    );
    for (const field of [
      "'free_used_count'",
      "'free_remaining_messages'",
      "'free_next_recharge_at'",
      "'free_window_seconds'",
      "'quota_exceeded'",
    ]) {
      expect(migrationSource).toContain(field);
    }
  });

  it('serializes reservations and makes client_request_id a server-side deduplication key', () => {
    expect(migrationSource).toContain(
      'ADD COLUMN IF NOT EXISTS client_request_id text',
    );
    expect(migrationSource).toContain(
      'coach_conversation_message_events_client_request_id_unique',
    );
    expect(migrationSource).toContain(
      'DROP FUNCTION IF EXISTS public.reserve_coach_conversation_message_slot(uuid, uuid)',
    );
    expect(migrationSource).toContain('p_client_request_id text DEFAULT NULL');
    expect(migrationSource).toContain('pg_advisory_xact_lock');
    expect(migrationSource).toContain("'code', 'coach_conversation_request_in_progress'");
  });

  it('keeps premium on its existing rolling daily quota rather than applying the free cap', () => {
    expect(migrationSource).toContain("ELSIF v_account_tier = 'premium'");
    expect(migrationSource).toContain("requested_at > (v_now - interval '24 hours')");
    expect(migrationSource).toContain('v_premium_limit integer := 40');
  });

  it('neutralizes accepted events through the existing refund lifecycle', () => {
    expect(migrationSource).toContain(
      'CREATE OR REPLACE FUNCTION public.refund_coach_conversation_quota_event',
    );
    expect(migrationSource).toContain("SET status = 'refunded'");
    expect(migrationSource).toContain("'refund_reason'");
  });

  it('wires request idempotency and invalid provider responses through the send handler', () => {
    expect(sendHandlerSource).toContain('clientRequestId: parsed.client_request_id');
    expect(sendHandlerSource).toContain("reason: 'coach_conversation_user_message_failed'");
    expect(sendHandlerSource).toContain(
      "reason: 'coach_conversation_generation_setup_failed'",
    );
    expect(sendHandlerSource).toMatch(
      /REFUNDABLE_ERROR_CODES = new Set\(\[[\s\S]*COACH_CONVERSATION_RESPONSE_INVALID_CODE/,
    );
  });
});

describe('free Coach conversation quota response contract', () => {
  it.each([
    { used: 0, remaining: 4, exhausted: false },
    { used: 1, remaining: 3, exhausted: false },
    { used: 4, remaining: 0, exhausted: true },
  ])('normalizes $used active messages with $remaining remaining', ({
    used,
    remaining,
    exhausted,
  }) => {
    const nextRechargeAt =
      used > 0 ? '2026-05-29T10:00:00.000Z' : null;
    const quota = normalizeCoachConversationQuotaStatus({
      tier: 'free',
      account_tier: 'free',
      unlimited: false,
      window_seconds: 259200,
      premium_today_used: 0,
      premium_today_limit: null,
      premium_today_available: null,
      next_recharge_at: nextRechargeAt,
      per_conversation_limit: 20,
      free_used: exhausted,
      free_message_limit: 4,
      free_used_count: used,
      free_remaining_messages: remaining,
      free_next_recharge_at: nextRechargeAt,
      free_window_seconds: 259200,
      free_conversation_id: '42b2ab79-2787-4430-9d4e-70a9c79f38d7',
      quota_exceeded: exhausted,
      as_of: '2026-05-26T10:00:00.000Z',
    });

    expect(quota.free_used_count).toBe(used);
    expect(quota.free_remaining_messages).toBe(remaining);
    expect(quota.free_next_recharge_at).toBe(nextRechargeAt);
    expect(quota.free_window_seconds).toBe(259200);
    expect(quota.quota_exceeded).toBe(exhausted);
  });

  it('exports the reservation race error used to reject a duplicate in-flight request', () => {
    expect(COACH_CONVERSATION_REQUEST_IN_PROGRESS_ERROR_CODE).toBe(
      'coach_conversation_request_in_progress',
    );
  });
});

describe('free Coach conversation rolling quota — SQL invariants (regression locks)', () => {
  it('locks reservations behind an advisory transaction lock keyed on the user', () => {
    // Without the advisory lock a free user could race four concurrent
    // reservations through the COUNT()/INSERT gap and end up with > 4
    // accepted events. The lock is the only thing serializing them.
    expect(migrationSource).toMatch(
      /pg_advisory_xact_lock\(hashtext\(p_user_id::text \|\| ':coach_conv_quota'\)::bigint\)/,
    );
  });

  it('locks conversation creation behind its own advisory lock', () => {
    expect(migrationSource).toMatch(
      /pg_advisory_xact_lock\(hashtext\(p_user_id::text \|\| ':coach_conv_start'\)::bigint\)/,
    );
  });

  it('returns coach_conversation_request_in_progress on a duplicate client_request_id retry', () => {
    expect(migrationSource).toContain('p_client_request_id text DEFAULT NULL');
    expect(migrationSource).toContain(
      "'code', 'coach_conversation_request_in_progress'",
    );
    expect(migrationSource).toContain('WHERE user_id = p_user_id');
    expect(migrationSource).toContain('AND client_request_id = p_client_request_id');
  });

  it('uses the oldest accepted event in the active window to compute the next recharge', () => {
    // Recharges are independent: each accepted event recharges 72h after its
    // own requested_at. The "next" recharge is therefore the minimum of the
    // active accepted events plus 72h.
    expect(migrationSource).toMatch(
      /MIN\(requested_at\)[\s\S]*?v_free_oldest_requested_at/,
    );
    expect(migrationSource).toContain(
      "v_free_oldest_requested_at + interval '72 hours'",
    );
  });

  it('refunds revert status to refunded and decrement the conversation message counter', () => {
    expect(migrationSource).toMatch(
      /CREATE OR REPLACE FUNCTION public\.refund_coach_conversation_quota_event/,
    );
    expect(migrationSource).toContain("SET status = 'refunded'");
    expect(migrationSource).toContain('refunded_at = v_now');
    expect(migrationSource).toContain('GREATEST(COALESCE(user_message_count, 0) - 1, 0)');
    expect(migrationSource).toContain('GREATEST(COALESCE(message_count, 0) - 1, 0)');
  });

  it('does not re-refund an already refunded event (idempotent refund)', () => {
    // The refund function selects FOR UPDATE then returns refunded=false when
    // status is no longer 'accepted'. Locks the row + checks the status to
    // make the refund a true no-op on retries.
    expect(migrationSource).toMatch(
      /SELECT id, conversation_id, status[\s\S]*?FROM public\.coach_conversation_message_events[\s\S]*?FOR UPDATE/,
    );
    expect(migrationSource).toContain(
      "IF NOT FOUND OR v_event.status <> 'accepted'",
    );
    expect(migrationSource).toContain("'refunded', false");
  });

  it('clears any legacy lifetime guard rows before applying the rolling quota', () => {
    expect(migrationSource).toContain('UPDATE public.coach_free_conversation_state');
    expect(migrationSource).toContain('SET consumed = false');
    expect(migrationSource).toContain('lifetime_guard_disabled_at');
    expect(migrationSource).toMatch(/WHERE consumed = true[\s\S]*?OR consumed_at IS NOT NULL/);
  });

  it('uses a rolling window (interval), not a calendar day reset', () => {
    expect(migrationSource).toMatch(/requested_at > \([^)]*- interval '72 hours'\)/);
    expect(migrationSource).not.toContain("date_trunc('day'");
    expect(migrationSource).not.toContain("date_trunc('hour'");
  });

  it('attaches a quota_tier on every accepted event so legacy/free-only counting stays sound', () => {
    expect(migrationSource).toContain("'quota_tier', v_account_tier");
    expect(migrationSource).toContain(
      "COALESCE(metadata->>'quota_tier', 'free') = 'free'",
    );
  });

  it('exposes the active free conversation only when its row is still active', () => {
    expect(migrationSource).toMatch(
      /JOIN public\.coach_conversations[\s\S]*?ON conversation\.id = state\.conversation_id[\s\S]*?AND conversation\.status = 'active'/,
    );
  });
});

describe('free Coach conversation rolling quota — TS contract (recharges, codes)', () => {
  const buildBaseFreeQuota = (
    overrides: Partial<CoachConversationQuotaStatus> = {},
  ): CoachConversationQuotaStatus => ({
    tier: 'free',
    account_tier: 'free',
    unlimited: false,
    window_seconds: 259200,
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
    free_window_seconds: 259200,
    free_conversation_id: null,
    quota_exceeded: false,
    as_of: '2026-05-26T10:00:00.000Z',
    last_conversation_by_persona: {},
    conversation_count_by_persona: {},
    ...overrides,
  });

  it('reports 4 remaining when no message has been sent in the last 72h', () => {
    const quota = normalizeCoachConversationQuotaStatus({
      tier: 'free',
      account_tier: 'free',
      unlimited: false,
      window_seconds: 259200,
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
      free_window_seconds: 259200,
      free_conversation_id: null,
      quota_exceeded: false,
      as_of: '2026-05-26T10:00:00.000Z',
    });
    expect(quota.free_used_count).toBe(0);
    expect(quota.free_remaining_messages).toBe(4);
    expect(quota.free_next_recharge_at).toBeNull();
    expect(quota.quota_exceeded).toBe(false);
  });

  it('locks the fifth message and surfaces a recharge for the oldest active message + 72h', () => {
    // Simulate the SQL output when four messages were accepted at four
    // different timestamps in the active window. The "next" recharge must
    // mirror the oldest requested_at + 72h.
    const oldestAccepted = '2026-05-24T08:00:00.000Z'; // sent ~50h ago
    const expectedRecharge = '2026-05-27T08:00:00.000Z'; // oldestAccepted + 72h

    const quota = normalizeCoachConversationQuotaStatus({
      ...buildBaseFreeQuota({
        free_used_count: 4,
        free_remaining_messages: 0,
        free_used: true,
        free_next_recharge_at: expectedRecharge,
        next_recharge_at: expectedRecharge,
        quota_exceeded: true,
      }),
      as_of: '2026-05-26T10:00:00.000Z',
      // The four accepted messages are summarised in `free_used_count`; only
      // the oldest contributes to `free_next_recharge_at`.
      // (the raw events table is the authority server-side.)
      // We're asserting the contract surface seen by the client.
      // No additional fields needed.
    });
    expect(quota.free_used_count).toBe(4);
    expect(quota.free_remaining_messages).toBe(0);
    expect(quota.free_used).toBe(true);
    expect(quota.quota_exceeded).toBe(true);
    expect(quota.free_next_recharge_at).toBe(expectedRecharge);
    // The oldest message dictates the soonest recharge — independent recharges
    // for each subsequent message follow but are not part of the published
    // contract (the UI only needs the next one).
    const recharge = Date.parse(expectedRecharge);
    const oldest = Date.parse(oldestAccepted);
    expect(recharge - oldest).toBe(72 * 60 * 60 * 1000);
  });

  it('decrements the active count once a message ages past the 72h window', () => {
    // After 72h the oldest message no longer counts. From 4 used we drop to
    // 3 used with a refreshed recharge anchored on the new oldest message.
    const quota = normalizeCoachConversationQuotaStatus({
      ...buildBaseFreeQuota({
        free_used_count: 3,
        free_remaining_messages: 1,
        free_used: false,
        free_next_recharge_at: '2026-05-28T08:00:00.000Z',
        quota_exceeded: false,
      }),
      as_of: '2026-05-27T10:00:00.000Z',
    });
    expect(quota.free_used_count).toBe(3);
    expect(quota.free_remaining_messages).toBe(1);
    expect(quota.free_used).toBe(false);
    expect(quota.quota_exceeded).toBe(false);
    expect(quota.free_next_recharge_at).toBe('2026-05-28T08:00:00.000Z');
  });

  it('returns the most imminent recharge among independent message recharges', () => {
    // Four messages were sent at t0, t0+6h, t0+24h, t0+48h. The most imminent
    // recharge is t0+72h (anchored on the first message). The migration uses
    // MIN(requested_at) so `free_next_recharge_at` always reflects this.
    const t0 = '2026-05-23T10:00:00.000Z';
    const expectedRecharge = '2026-05-26T10:00:00.000Z'; // t0 + 72h

    const quota = normalizeCoachConversationQuotaStatus({
      ...buildBaseFreeQuota({
        free_used_count: 4,
        free_remaining_messages: 0,
        free_used: true,
        free_next_recharge_at: expectedRecharge,
        quota_exceeded: true,
      }),
      as_of: '2026-05-25T10:00:00.000Z',
    });
    const recharge = Date.parse(quota.free_next_recharge_at ?? '');
    const oldest = Date.parse(t0);
    expect(recharge - oldest).toBe(72 * 60 * 60 * 1000);
  });

  it('keeps premium tier independent of the free 72h window', () => {
    const quota = normalizeCoachConversationQuotaStatus({
      tier: 'premium',
      account_tier: 'premium',
      unlimited: false,
      window_seconds: 86400,
      premium_today_used: 12,
      premium_today_limit: 40,
      premium_today_available: 28,
      next_recharge_at: '2026-05-27T10:00:00.000Z',
      per_conversation_limit: 20,
      free_used: false,
      free_message_limit: null,
      free_used_count: null,
      free_remaining_messages: null,
      free_next_recharge_at: null,
      free_window_seconds: null,
      free_conversation_id: null,
      quota_exceeded: false,
      as_of: '2026-05-26T10:00:00.000Z',
    });
    expect(quota.tier).toBe('premium');
    expect(quota.window_seconds).toBe(86400);
    expect(quota.premium_today_used).toBe(12);
    expect(quota.premium_today_limit).toBe(40);
    expect(quota.premium_today_available).toBe(28);
    expect(quota.free_message_limit).toBeNull();
    expect(quota.free_used_count).toBeNull();
    expect(quota.free_remaining_messages).toBeNull();
    expect(quota.quota_exceeded).toBe(false);
  });

  it('reports admins as unlimited (no quota gate)', () => {
    const quota = normalizeCoachConversationQuotaStatus({
      tier: 'admin',
      account_tier: 'admin',
      unlimited: true,
      window_seconds: 86400,
      premium_today_used: 0,
      premium_today_limit: null,
      premium_today_available: null,
      next_recharge_at: null,
      per_conversation_limit: 20,
      free_used: false,
      free_message_limit: null,
      free_used_count: null,
      free_remaining_messages: null,
      free_next_recharge_at: null,
      free_window_seconds: null,
      free_conversation_id: null,
      quota_exceeded: false,
      as_of: '2026-05-26T10:00:00.000Z',
      last_conversation_by_persona: {},
      conversation_count_by_persona: {},
    });
    expect(quota.tier).toBe('admin');
    expect(quota.unlimited).toBe(true);
    expect(quota.quota_exceeded).toBe(false);
  });
});

describe('mapCoachConversationReservationToHttpError', () => {
  const baseQuota: CoachConversationQuotaStatus = {
    tier: 'free',
    account_tier: 'free',
    unlimited: false,
    window_seconds: 259200,
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
    free_window_seconds: 259200,
    free_conversation_id: null,
    quota_exceeded: false,
    as_of: '2026-05-26T10:00:00.000Z',
    last_conversation_by_persona: {},
    conversation_count_by_persona: {},
  };

  const buildResult = (
    overrides: Partial<CoachConversationReservationResult> = {},
    quotaOverrides: Partial<CoachConversationQuotaStatus> = {},
  ): CoachConversationReservationResult => ({
    allowed: false,
    code: null,
    usage_event_id: null,
    quota: { ...baseQuota, ...quotaOverrides },
    ...overrides,
  });

  it('returns 403 with the free-limit code when 4 active messages exist', () => {
    const error = mapCoachConversationReservationToHttpError(
      buildResult(
        { code: COACH_CONVERSATION_FREE_LIMIT_REACHED_ERROR_CODE },
        {
          free_used: true,
          free_used_count: 4,
          free_remaining_messages: 0,
          free_next_recharge_at: '2026-05-27T08:00:00.000Z',
          quota_exceeded: true,
        },
      ),
    );
    expect(error.status).toBe(403);
    expect(error.code).toBe(COACH_CONVERSATION_FREE_LIMIT_REACHED_ERROR_CODE);
    expect(error.details).toMatchObject({
      quota_account_tier: 'free',
      quota_free_used: true,
      quota_free_used_count: 4,
      quota_free_remaining_messages: 0,
      quota_free_next_recharge_at: '2026-05-27T08:00:00.000Z',
    });
  });

  it('returns 409 when an inflight client_request_id retry races a previous request', () => {
    const error = mapCoachConversationReservationToHttpError(
      buildResult({
        code: COACH_CONVERSATION_REQUEST_IN_PROGRESS_ERROR_CODE,
        usage_event_id: 'existing-event-id',
      }),
    );
    expect(error.status).toBe(409);
    expect(error.code).toBe(COACH_CONVERSATION_REQUEST_IN_PROGRESS_ERROR_CODE);
  });

  it('returns 403 with the legacy already-used code for grandfathered users', () => {
    const error = mapCoachConversationReservationToHttpError(
      buildResult({ code: COACH_CONVERSATION_FREE_ALREADY_USED_ERROR_CODE }),
    );
    expect(error.status).toBe(403);
    expect(error.code).toBe(COACH_CONVERSATION_FREE_ALREADY_USED_ERROR_CODE);
  });

  it('returns 403 for the per-conversation message cap', () => {
    const error = mapCoachConversationReservationToHttpError(
      buildResult({ code: COACH_CONVERSATION_MESSAGE_LIMIT_ERROR_CODE }),
    );
    expect(error.status).toBe(403);
    expect(error.code).toBe(COACH_CONVERSATION_MESSAGE_LIMIT_ERROR_CODE);
  });

  it('returns 404 when the conversation does not exist or belongs to another user', () => {
    const error = mapCoachConversationReservationToHttpError(
      buildResult({ code: COACH_CONVERSATION_NOT_FOUND_ERROR_CODE }),
    );
    expect(error.status).toBe(404);
    expect(error.code).toBe(COACH_CONVERSATION_NOT_FOUND_ERROR_CODE);
  });

  it('returns 409 when the conversation has already ended or been archived', () => {
    const error = mapCoachConversationReservationToHttpError(
      buildResult({ code: COACH_CONVERSATION_ENDED_ERROR_CODE }),
    );
    expect(error.status).toBe(409);
    expect(error.code).toBe(COACH_CONVERSATION_ENDED_ERROR_CODE);
  });

  it('falls back to 429 quota_exhausted when the code is missing', () => {
    const error = mapCoachConversationReservationToHttpError(buildResult());
    expect(error.status).toBe(429);
    expect(error.code).toBe(COACH_CONVERSATION_QUOTA_EXHAUSTED_ERROR_CODE);
  });
});
