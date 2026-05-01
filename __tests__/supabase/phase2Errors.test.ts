import {
  classifySupabaseDatabaseError,
  createPhase2DatabaseError,
  Phase2HttpError,
  toPhase2ErrorPayload,
} from '@/supabase/functions/_shared/phase2Errors';
import { summarizeWebhookResult } from '@/supabase/functions/_shared/phase2Observability';

describe('phase2 error payloads', () => {
  it('keeps only safe structured debug details on Phase 2 errors', () => {
    const payload = toPhase2ErrorPayload(
      new Phase2HttpError(502, 'analysis_provider_failed', 'Provider failed', {
        webhook_status: 502,
        webhook_text: 'should not leak',
      }),
      { requestId: 'req-123' },
    );

    expect(payload).toEqual({
      success: false,
      error: 'Provider failed',
      code: 'analysis_provider_failed',
      status: 502,
      details: {
        webhook_status: 502,
      },
      request_id: 'req-123',
    });
  });

  it('returns a generic internal error message for unexpected failures', () => {
    expect(
      toPhase2ErrorPayload(new Error('raw internal failure'), {
        requestId: 'req-456',
      }),
    ).toEqual({
      success: false,
      error: 'Unexpected server error',
      code: 'internal_error',
      status: 500,
      request_id: 'req-456',
    });
  });

  it('stores only safe webhook summaries for provider failures', () => {
    expect(
      summarizeWebhookResult({
        status: 504,
        bodyPresent: true,
        payload: {
          moderation_state: 'pending',
          moderation_reason: 'timeout',
          webhook_text: 'raw body should not leak',
        },
      }),
    ).toEqual({
      webhook_status: 504,
      response_body_present: true,
      moderation_state: 'pending',
      moderation_reason: 'timeout',
    });
  });

  it('classifies missing columns and policy denials from Supabase errors', () => {
    expect(
      classifySupabaseDatabaseError({
        code: '42703',
        message: 'column "coach_persona_key" does not exist',
      }),
    ).toEqual(
      expect.objectContaining({
        category: 'missing_column',
        column: 'coach_persona_key',
      }),
    );

    expect(
      classifySupabaseDatabaseError({
        code: '42501',
        message: 'permission denied for table coach_entries',
      }),
    ).toEqual(
      expect.objectContaining({
        category: 'policy_denied',
        relation: 'coach_entries',
      }),
    );
  });

  it('extracts the real column name from ambiguous PL/pgSQL column-reference errors', () => {
    expect(
      classifySupabaseDatabaseError({
        code: '42702',
        message: 'column reference "comment_id" is ambiguous',
        details:
          'It could refer to either a PL/pgSQL variable or a table column.',
      }),
    ).toEqual(
      expect.objectContaining({
        category: 'unknown',
        sourceCode: '42702',
        column: 'comment_id',
      }),
    );
  });

  it('turns Supabase schema mismatches into precise Phase 2 HTTP errors', () => {
    expect(
      createPhase2DatabaseError(
        {
          code: 'PGRST202',
          message: 'Could not find the function public.get_social_feed_page',
        },
        {
          contextLabel: 'Social feed lookup',
          fallbackCode: 'social_feed_load_failed',
          fallbackMessage: 'Failed to load social feed',
          rpcName: 'get_social_feed_page',
        },
      ),
    ).toEqual(
      expect.objectContaining({
        status: 503,
        code: 'database_rpc_missing',
        message: expect.stringContaining('get_social_feed_page'),
      }),
    );
  });
});
