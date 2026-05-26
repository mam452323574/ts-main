import { Phase2HttpError } from '@/supabase/functions/_shared/phase2Errors';
import {
  parseCoachGenerateRequest,
  parseSocialCreateCommentRequest,
  parseSocialCreatePostRequest,
  parseSocialDeleteCommentRequest,
  parseSocialModerateContentRequest,
  parseSocialReclassifyPostRequest,
  parseSocialRecordImpressionsRequest,
  parseSocialRecordPostViewsRequest,
  parseSocialReportContentRequest,
  parseSocialSetCommentLikeRequest,
  parseSocialSetReactionRequest,
  parseSocialUpdateCommentRequest,
} from '@/supabase/functions/_shared/phase2Contracts';

describe('phase2 contracts', () => {
  it('accepts a social post with text only', () => {
    expect(
      parseSocialCreatePostRequest({
        category: 'physique',
        content_text: 'Hello   social',
      })
    ).toEqual({
      category: 'physique',
      content_text: 'Hello social',
      upload_id: undefined,
      reserved_asset_path: undefined,
      scan_id: undefined,
      share_payload_snapshot: undefined,
    });
  });

  it('accepts a social post with a reserved upload id only', () => {
    expect(
      parseSocialCreatePostRequest({
        category: 'before_after',
        upload_id: '11111111-1111-4111-8111-111111111111',
      })
    ).toEqual({
      category: 'before_after',
      content_text: undefined,
      upload_id: '11111111-1111-4111-8111-111111111111',
      reserved_asset_path: undefined,
      scan_id: undefined,
      share_payload_snapshot: undefined,
    });
  });

  it('accepts a social post with both upload_id and reserved_asset_path', () => {
    expect(
      parseSocialCreatePostRequest({
        category: 'before_after',
        upload_id: '11111111-1111-4111-8111-111111111111',
        reserved_asset_path:
          'user-1/posts/11111111-1111-4111-8111-111111111111.jpg',
      })
    ).toEqual({
      category: 'before_after',
      content_text: undefined,
      upload_id: '11111111-1111-4111-8111-111111111111',
      reserved_asset_path:
        'user-1/posts/11111111-1111-4111-8111-111111111111.jpg',
      scan_id: undefined,
      share_payload_snapshot: undefined,
    });
  });

  it('accepts a social post with a share payload snapshot', () => {
    expect(
      parseSocialCreatePostRequest({
        category: 'food',
        share_payload_snapshot: {
          variant: 'body',
          score: 92,
        },
      })
    ).toEqual({
      category: 'food',
      content_text: undefined,
      upload_id: undefined,
      reserved_asset_path: undefined,
      scan_id: undefined,
      share_payload_snapshot: {
        variant: 'body',
        variantLabel: 'body',
        score: 92,
        scoreLabel: '92',
        heroImageUri: null,
        metrics: [],
        accentColor: '#000000',
        accentColorSecondary: undefined,
        headline: undefined,
        footerBrand: 'HEALTH SCAN',
        footerCta: 'Track your progress',
        statusBadgeLabel: undefined,
        statusTone: undefined,
      },
    });
  });

  it('rejects a social post without text, stable asset, or share payload', () => {
    expect(() =>
      parseSocialCreatePostRequest({
        category: 'physique',
      }),
    ).toThrow(Phase2HttpError);
    expect(() =>
      parseSocialCreatePostRequest({
        category: 'physique',
      }),
    ).toThrow(
      'A post must include text, a stable asset, or a share payload snapshot'
    );
  });

  it('rejects reserved_asset_path when upload_id is missing', () => {
    expect(() =>
      parseSocialCreatePostRequest({
        category: 'physique',
        reserved_asset_path:
          'user-1/posts/11111111-1111-4111-8111-111111111111.jpg',
      }),
    ).toThrow('reserved_asset_path requires upload_id');
  });

  it('rejects malformed reserved_asset_path values with an upload reference error', () => {
    expect(() =>
      parseSocialCreatePostRequest({
        category: 'physique',
        upload_id: '11111111-1111-4111-8111-111111111111',
        reserved_asset_path: 'https://cdn.example.com/not-stable.jpg',
      }),
    ).toThrow('The provided social upload reference is invalid');
  });

  it('rejects a social post that still tries to send a client-chosen asset_path', () => {
    expect(() =>
      parseSocialCreatePostRequest({
        category: 'physique',
        asset_path: 'user-123/cards/social-card.png',
      })
    ).toThrow('Request body contains unsupported fields');
  });

  it('parses a social comment request safely', () => {
    expect(
      parseSocialCreateCommentRequest({
        post_id: '11111111-1111-4111-8111-111111111111',
        content_text: 'Nice result',
      })
    ).toEqual({
      post_id: '11111111-1111-4111-8111-111111111111',
      content_text: 'Nice result',
    });
  });

  it('parses an explicit social reaction request safely', () => {
    expect(
      parseSocialSetReactionRequest({
        post_id: '22222222-2222-4222-8222-222222222222',
        reaction: 'dislike',
      })
    ).toEqual({
      post_id: '22222222-2222-4222-8222-222222222222',
      reaction: 'dislike',
    });
  });

  it('parses an explicit social comment like request safely', () => {
    expect(
      parseSocialSetCommentLikeRequest({
        comment_id: '33333333-3333-4333-8333-333333333333',
        liked: true,
      }),
    ).toEqual({
      comment_id: '33333333-3333-4333-8333-333333333333',
      liked: true,
    });
  });

  it('parses a camelCase social comment like id safely', () => {
    expect(
      parseSocialSetCommentLikeRequest({
        commentId: '33333333-3333-4333-8333-333333333333',
        liked: true,
      }),
    ).toEqual({
      comment_id: '33333333-3333-4333-8333-333333333333',
      liked: true,
    });
  });

  it('rejects conflicting social comment like id aliases', () => {
    expect(() =>
      parseSocialSetCommentLikeRequest({
        comment_id: '33333333-3333-4333-8333-333333333333',
        commentId: '44444444-4444-4444-8444-444444444444',
        liked: true,
      }),
    ).toThrow('comment_id and commentId must reference the same comment');
  });

  it('rejects a social comment like request when liked is missing or invalid', () => {
    expect(() =>
      parseSocialSetCommentLikeRequest({
        comment_id: '33333333-3333-4333-8333-333333333333',
      }),
    ).toThrow('liked must be provided as a boolean');

    expect(() =>
      parseSocialSetCommentLikeRequest({
        comment_id: '33333333-3333-4333-8333-333333333333',
        liked: 'yes',
      }),
    ).toThrow('liked must be provided as a boolean');
  });

  it('parses a social comment update request safely', () => {
    expect(
      parseSocialUpdateCommentRequest({
        comment_id: '33333333-3333-4333-8333-333333333333',
        content_text: '  Updated   comment  ',
      }),
    ).toEqual({
      comment_id: '33333333-3333-4333-8333-333333333333',
      content_text: 'Updated comment',
    });
  });

  it('parses a social comment delete request safely', () => {
    expect(
      parseSocialDeleteCommentRequest({
        comment_id: '33333333-3333-4333-8333-333333333333',
      }),
    ).toEqual({
      comment_id: '33333333-3333-4333-8333-333333333333',
    });
  });

  it('parses a report request for a comment target', () => {
    expect(
      parseSocialReportContentRequest({
        target_type: 'comment',
        target_comment_id: '33333333-3333-4333-8333-333333333333',
        reason_code: 'harassment',
        details: 'Contains harassment',
      })
    ).toEqual({
      target_type: 'comment',
      target_post_id: undefined,
      target_comment_id: '33333333-3333-4333-8333-333333333333',
      reason_code: 'harassment',
      details: 'Contains harassment',
    });
  });

  it('rejects an unsupported social report reason code', () => {
    expect(() =>
      parseSocialReportContentRequest({
        target_type: 'post',
        target_post_id: '33333333-3333-4333-8333-333333333333',
        reason_code: 'abuse',
      }),
    ).toThrow('reason_code is not supported');
  });

  it('requires details when the report reason is other', () => {
    expect(() =>
      parseSocialReportContentRequest({
        target_type: 'post',
        target_post_id: '33333333-3333-4333-8333-333333333333',
        reason_code: 'other',
      }),
    ).toThrow('details are required when reason_code is other');
  });

  it('parses batched social impressions safely and dedupes post ids', () => {
    expect(
      parseSocialRecordImpressionsRequest({
        post_ids: [
          '44444444-4444-4444-8444-444444444444',
          '44444444-4444-4444-8444-444444444444',
          '55555555-5555-4555-8555-555555555555',
        ],
        source: 'feed',
      }),
    ).toEqual({
      post_ids: [
        '44444444-4444-4444-8444-444444444444',
        '55555555-5555-4555-8555-555555555555',
      ],
      source: 'feed',
    });
  });

  it('parses batched social post views safely and dedupes post ids', () => {
    expect(
      parseSocialRecordPostViewsRequest({
        post_ids: [
          '44444444-4444-4444-8444-444444444444',
          '44444444-4444-4444-8444-444444444444',
          '55555555-5555-4555-8555-555555555555',
        ],
      }),
    ).toEqual({
      post_ids: [
        '44444444-4444-4444-8444-444444444444',
        '55555555-5555-4555-8555-555555555555',
      ],
    });
  });

  it('parses a moderator action request with linked reports', () => {
    expect(
      parseSocialModerateContentRequest({
        target_type: 'comment',
        target_comment_id: '66666666-6666-4666-8666-666666666666',
        action: 'hide',
        reason_code: 'report_threshold',
        note: 'Escalated after repeated reports',
        report_ids: [
          '77777777-7777-4777-8777-777777777777',
          '88888888-8888-4888-8888-888888888888',
        ],
      }),
    ).toEqual({
      target_type: 'comment',
      target_post_id: undefined,
      target_comment_id: '66666666-6666-4666-8666-666666666666',
      action: 'hide',
      reason_code: 'report_threshold',
      note: 'Escalated after repeated reports',
      report_ids: [
        '77777777-7777-4777-8777-777777777777',
        '88888888-8888-4888-8888-888888888888',
      ],
    });
  });

  it('parses a post reclassification request safely', () => {
    expect(
      parseSocialReclassifyPostRequest({
        post_id: '99999999-9999-4999-8999-999999999999',
        category: 'before_after',
      }),
    ).toEqual({
      post_id: '99999999-9999-4999-8999-999999999999',
      category: 'before_after',
    });
  });

  it('rejects invalid post reclassification categories', () => {
    expect(() =>
      parseSocialReclassifyPostRequest({
        post_id: '99999999-9999-4999-8999-999999999999',
        category: 'other',
      }),
    ).toThrow('category must be one of before_after, food, or physique');
  });

  it('parses a coach generate request with normalized payload', () => {
    expect(
      parseCoachGenerateRequest({
        payload: {
          prompt_type: 'latest_scan',
          payload_version: 1,
          scan_count_7d: 5,
        },
        persona_key: 'gentle_supportive',
        locale: 'fr',
        force_refresh: true,
      })
    ).toEqual({
      payload: {
        prompt_type: 'latest_scan',
        payload_version: 1,
        scan_count_7d: 5,
        question_key: 'latest_scan__top_priority_today',
        question_text:
          "Quelle priorite n\u00b01 traiter aujourd'hui ?",
        question_hints: {
          intent_key: 'latest_scan_priority_today',
          time_scope: 'today',
          preferred_artifacts: ['priorities', 'action_steps', 'knowledge_card'],
          discouraged_artifacts: ['daily_schedule', 'shopping_list'],
          ui_tags: ['starter', 'priority', 'morning'],
        },
      },
      persona_key: 'gentle_supportive',
      locale: 'fr',
      force_refresh: true,
    });
  });

  it('rejects coach generation when payload is not a normalized object', () => {
    expect(() =>
      parseCoachGenerateRequest({
        payload: 'bad-payload',
      })
    ).toThrow('payload must be a normalized object');
  });
});
