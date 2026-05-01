const mockGetSupabaseFunctionUrl = jest.fn();
const mockGetSession = jest.fn();
const mockCreateMissingEdgeFunctionRouteMessage = jest.fn();
const mockGetConfiguredSupabaseProjectLabel = jest.fn();

jest.mock('@/services/runtimeConfig', () => ({
  getSupabaseFunctionUrl: (...args: unknown[]) => mockGetSupabaseFunctionUrl(...args),
}));

jest.mock('@/services/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  },
}));

jest.mock('@/services/edgeFunctions', () => ({
  createMissingEdgeFunctionRouteMessage: (...args: unknown[]) =>
    mockCreateMissingEdgeFunctionRouteMessage(...args),
  getConfiguredSupabaseProjectLabel: (...args: unknown[]) =>
    mockGetConfiguredSupabaseProjectLabel(...args),
}));

import {
  adjustSocialPostReactions,
  eradicateSocialUser,
  SocialAdminServiceError,
  fetchSocialAdminModerationQueue,
  getSocialAdminServiceErrorDebugInfo,
  moderateSocialContent,
  moderateSocialUser,
  reclassifySocialPost,
  resolveSocialAdminFailureKindFromError,
} from '@/services/socialAdmin';

describe('socialAdmin service', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSupabaseFunctionUrl.mockImplementation(
      (functionName: string) =>
        `https://qpogulljnnacrxdjbwiz.supabase.co/functions/v1/${functionName}`,
    );
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'token-123',
        },
      },
    });
    mockCreateMissingEdgeFunctionRouteMessage.mockImplementation(
      (scopeLabel: string, functionName: string) =>
        `${scopeLabel} route "${functionName}" is not deployed on Supabase project "qpogulljnnacrxdjbwiz" (404).`,
    );
    mockGetConfiguredSupabaseProjectLabel.mockReturnValue('qpogulljnnacrxdjbwiz');
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('surfaces missing moderation queue routes as route_missing errors with debug metadata', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 'Not Found',
        }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
          },
        },
      ),
    ) as typeof fetch;

    const request = fetchSocialAdminModerationQueue('needs_review');

    await expect(request).rejects.toMatchObject({
      message:
        'Social admin route "social-list-moderation-queue" is not deployed on Supabase project "qpogulljnnacrxdjbwiz" (404).',
      code: 'edge_function_route_missing',
      status: 404,
      functionName: 'social-list-moderation-queue',
    });

    const error = await request.catch((reason) => reason);

    expect(resolveSocialAdminFailureKindFromError(error)).toBe('route_missing');
    expect(getSocialAdminServiceErrorDebugInfo(error)).toMatchObject({
      code: 'edge_function_route_missing',
      status: 404,
      functionName: 'social-list-moderation-queue',
      projectLabel: 'qpogulljnnacrxdjbwiz',
    });
  });

  it('passes the moderation filter in the queue request URL and parses processed counts', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          items: [],
          pending_count: 1,
          flagged_count: 2,
          reported_count: 3,
          needs_review_count: 3,
          processed_count: 4,
          limit: 25,
          has_more: true,
          next_cursor: 'NA',
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
          },
        },
      ),
    ) as typeof fetch;

    const response = await fetchSocialAdminModerationQueue('processed', {
      limit: 25,
      cursor: 'Mg',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://qpogulljnnacrxdjbwiz.supabase.co/functions/v1/social-list-moderation-queue?filter=processed&limit=25&cursor=Mg',
      expect.any(Object),
    );
    expect(response).toMatchObject({
      processed_count: 4,
      reported_count: 3,
      limit: 25,
      has_more: true,
      next_cursor: 'NA',
    });
  });

  it('parses admin reaction adjustment fields and active bans from the moderation queue payload', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          items: [
            {
              content_type: 'post',
              content_id: 'post-1',
              author_id: 'author-1',
              author_username: 'alice',
              category: 'food',
              content_text: 'hello',
              asset_url: null,
              moderation_state: 'approved',
              moderation_reason: null,
              moderation_provider: 'admin',
              created_at: '2026-04-18T10:00:00.000Z',
              open_reports: 0,
              total_reports_24h: 0,
              unique_reporters_24h: 0,
              unique_viewer_count: 12,
              reason_codes: [],
              last_reported_at: null,
              moderation_queued_at: null,
              moderation_claimed_at: null,
              moderation_completed_at: '2026-04-18T10:30:00.000Z',
              moderation_attempt_count: 1,
              moderation_last_error: null,
              raw_like_count: 4,
              raw_dislike_count: 2,
              admin_like_adjustment: -10,
              admin_dislike_adjustment: 3,
              effective_like_count: 0,
              effective_dislike_count: 5,
              author_active_bans: [
                {
                  scope: 'posts',
                  ends_at: null,
                  reason: 'spam',
                },
              ],
            },
          ],
          pending_count: 0,
          flagged_count: 0,
          reported_count: 0,
          needs_review_count: 0,
          processed_count: 1,
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
          },
        },
      ),
    ) as typeof fetch;

    const response = await fetchSocialAdminModerationQueue('processed');

    expect(response.items[0]).toMatchObject({
      raw_like_count: 4,
      raw_dislike_count: 2,
      admin_like_adjustment: -10,
      admin_dislike_adjustment: 3,
      effective_like_count: 0,
      effective_dislike_count: 5,
      author_active_bans: [
        {
          scope: 'posts',
          ends_at: null,
          reason: 'spam',
        },
      ],
    });
  });

  it('defaults optional moderation queue enrichment fields when the payload is partial but valid', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          items: [
            {
              content_type: 'post',
              content_id: 'post-2',
              author_id: 'author-2',
              author_username: 'bruce',
              category: 'before_after',
              content_text: 'partial payload',
              asset_url: null,
              moderation_state: 'pending',
              moderation_reason: null,
              moderation_provider: null,
              created_at: '2026-04-18T12:00:00.000Z',
              open_reports: 1,
              total_reports_24h: 1,
              unique_reporters_24h: 1,
            },
          ],
          pending_count: 1,
          flagged_count: 0,
          reported_count: 0,
          needs_review_count: 1,
          processed_count: 0,
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
          },
        },
      ),
    ) as typeof fetch;

    const response = await fetchSocialAdminModerationQueue('needs_review');

    expect(response.items[0]).toMatchObject({
      content_id: 'post-2',
      unique_viewer_count: 0,
      reason_codes: [],
      moderation_attempt_count: 0,
      raw_like_count: 0,
      raw_dislike_count: 0,
      admin_like_adjustment: 0,
      admin_dislike_adjustment: 0,
      effective_like_count: 0,
      effective_dislike_count: 0,
      author_active_bans: [],
    });
  });

  it('returns a real empty moderation queue without turning it into an error', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          items: [],
          pending_count: 0,
          flagged_count: 0,
          reported_count: 0,
          needs_review_count: 0,
          processed_count: 0,
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
          },
        },
      ),
    ) as typeof fetch;

    await expect(fetchSocialAdminModerationQueue('reported')).resolves.toEqual({
      success: true,
      items: [],
      pending_count: 0,
      flagged_count: 0,
      reported_count: 0,
      needs_review_count: 0,
      processed_count: 0,
      limit: 0,
      has_more: false,
      next_cursor: null,
    });
  });

  it('classifies admin-only moderation failures without losing backend context', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 'Admin access required',
          code: 'admin_required',
          request_id: 'req-admin-403',
        }),
        {
          status: 403,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
          },
        },
      ),
    ) as typeof fetch;

    const request = moderateSocialContent({
      target_type: 'post',
      target_post_id: 'post-1',
      action: 'approve',
    });

    await expect(request).rejects.toMatchObject({
      message: 'Admin access required',
      code: 'admin_required',
      status: 403,
      requestId: 'req-admin-403',
      functionName: 'social-moderate-content',
    });

    const error = await request.catch((reason) => reason);

    expect(resolveSocialAdminFailureKindFromError(error)).toBe('admin_access');
    expect(getSocialAdminServiceErrorDebugInfo(error)).toMatchObject({
      code: 'admin_required',
      status: 403,
      requestId: 'req-admin-403',
      functionName: 'social-moderate-content',
      projectLabel: 'qpogulljnnacrxdjbwiz',
    });
  });

  it('classifies moderation queue schema mismatches as schema_mismatch with debug metadata', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error:
            'Social moderation queue listing requires the "unique_viewer_count" column on the configured Supabase project.',
          code: 'database_column_missing',
          details: {
            relation: 'social_moderation_queue',
            column: 'unique_viewer_count',
            source_code: '42703',
          },
          request_id: 'req-schema-503',
        }),
        {
          status: 503,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
          },
        },
      ),
    ) as typeof fetch;

    const request = fetchSocialAdminModerationQueue('reported');

    await expect(request).rejects.toMatchObject({
      code: 'database_column_missing',
      status: 503,
      requestId: 'req-schema-503',
      functionName: 'social-list-moderation-queue',
    });

    const error = await request.catch((reason) => reason);

    expect(resolveSocialAdminFailureKindFromError(error)).toBe('schema_mismatch');
    expect(getSocialAdminServiceErrorDebugInfo(error)).toMatchObject({
      code: 'database_column_missing',
      status: 503,
      requestId: 'req-schema-503',
      functionName: 'social-list-moderation-queue',
      projectLabel: 'qpogulljnnacrxdjbwiz',
      details: {
        relation: 'social_moderation_queue',
        column: 'unique_viewer_count',
        source_code: '42703',
      },
    });
  });

  it('treats invalid moderation queue payloads as payload_invalid errors', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify(['unexpected']), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
      }),
    ) as typeof fetch;

    const request = fetchSocialAdminModerationQueue();

    await expect(request).rejects.toMatchObject({
      message:
        'Social moderation queue on Supabase project "qpogulljnnacrxdjbwiz" returned an invalid payload.',
      code: 'social_admin_queue_invalid_payload',
      status: 500,
      functionName: 'social-list-moderation-queue',
    });

    const error = await request.catch((reason) => reason);

    expect(error).toBeInstanceOf(SocialAdminServiceError);
    expect(resolveSocialAdminFailureKindFromError(error)).toBe('payload_invalid');
    expect(getSocialAdminServiceErrorDebugInfo(error)).toMatchObject({
      code: 'social_admin_queue_invalid_payload',
      status: 500,
      functionName: 'social-list-moderation-queue',
      projectLabel: 'qpogulljnnacrxdjbwiz',
    });
  });

  it('rejects invalid category responses instead of silently falling back to physique', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          post_id: '11111111-1111-4111-8111-111111111111',
          previous_category: 'invalid-category',
          category: 'physique',
          event_id: 'event-1',
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
          },
        },
      ),
    ) as typeof fetch;

    const request = reclassifySocialPost({
      post_id: '11111111-1111-4111-8111-111111111111',
      category: 'physique',
    });

    await expect(request).rejects.toMatchObject({
      code: 'social_reclassify_post_invalid_payload',
      status: 500,
      functionName: 'social-reclassify-post',
    });
  });

  it('parses the admin moderate user response and keeps the audit event id', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          action: 'remove_avatar',
          target_user_id: '11111111-1111-4111-8111-111111111111',
          event_id: 'event-avatar-1',
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
          },
        },
      ),
    ) as typeof fetch;

    const response = await moderateSocialUser({
      target_user_id: '11111111-1111-4111-8111-111111111111',
      action: 'remove_avatar',
    });

    expect(response).toEqual({
      success: true,
      action: 'remove_avatar',
      target_user_id: '11111111-1111-4111-8111-111111111111',
      event_id: 'event-avatar-1',
    });
  });

  it('parses the eradicate user response including cleanup status', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          target_user_id: '11111111-1111-4111-8111-111111111111',
          operation_id: 'op-1',
          event_id: 'event-1',
          post_count: 4,
          own_comment_count: 8,
          cascaded_comment_count: 2,
          resolved_report_count: 3,
          ban_created: true,
          storage_cleanup_status: 'partial',
          deleted_asset_paths: ['user/posts/a.jpg'],
          failed_asset_paths: ['user/posts/b.jpg'],
          deleted_avatar_paths: ['user/avatar.jpg'],
          failed_avatar_paths: [],
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
          },
        },
      ),
    ) as typeof fetch;

    const response = await eradicateSocialUser({
      target_user_id: '11111111-1111-4111-8111-111111111111',
    });

    expect(response).toMatchObject({
      operation_id: 'op-1',
      storage_cleanup_status: 'partial',
      deleted_asset_paths: ['user/posts/a.jpg'],
      failed_asset_paths: ['user/posts/b.jpg'],
    });
  });

  it('parses the adjust reactions response with raw and effective counts', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          post_id: 'post-1',
          raw_like_count: 5,
          raw_dislike_count: 1,
          admin_like_adjustment: -8,
          admin_dislike_adjustment: 4,
          effective_like_count: 0,
          effective_dislike_count: 5,
          event_id: 'event-adjust-1',
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
          },
        },
      ),
    ) as typeof fetch;

    const response = await adjustSocialPostReactions({
      post_id: 'post-1',
      admin_like_adjustment: -8,
      admin_dislike_adjustment: 4,
      note: 'cleanup ranking',
    });

    expect(response).toEqual({
      success: true,
      post_id: 'post-1',
      raw_like_count: 5,
      raw_dislike_count: 1,
      admin_like_adjustment: -8,
      admin_dislike_adjustment: 4,
      effective_like_count: 0,
      effective_dislike_count: 5,
      event_id: 'event-adjust-1',
    });
  });
});
