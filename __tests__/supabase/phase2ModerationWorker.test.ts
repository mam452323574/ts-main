import {
  createSocialModerationProvider,
  resolveSocialReportWorkflowStatusForDecision,
} from '@/supabase/functions/_shared/phase2Moderation';
import { selectClaimableSocialModerationSubjects } from '@/supabase/functions/_shared/phase2Social';
import type { Phase2ModerationSubject } from '@/supabase/functions/_shared/phase2Types';

function createSubject(
  overrides: Partial<Phase2ModerationSubject> = {},
): Phase2ModerationSubject {
  return {
    content_type: 'post',
    content_id: '10000000-0000-4000-8000-000000000000',
    author_id: '20000000-0000-4000-8000-000000000000',
    author_username: 'queue-user',
    category: 'food',
    content_text: 'Queued content',
    asset_path: null,
    asset_url: null,
    moderation_state: 'pending',
    moderation_reason: null,
    moderation_provider: null,
    created_at: '2026-04-09T12:00:00.000Z',
    total_reports_24h: 0,
    unique_reporters_24h: 0,
    open_reports: 0,
    unique_viewer_count: 0,
    reason_codes: [],
    last_reported_at: null,
    moderation_queued_at: '2026-04-09T12:00:00.000Z',
    moderation_claimed_at: null,
    moderation_completed_at: null,
    moderation_attempt_count: 0,
    moderation_last_error: null,
    author_active_bans: [],
    ...overrides,
  };
}

describe('phase2 moderation worker helpers', () => {
  it('flags pending content through the placeholder moderation provider', async () => {
    const provider = createSocialModerationProvider();
    const decision = await provider.reviewSubject(
      createSubject({
        asset_path: '20000000-0000-4000-8000-000000000000/posts/example.jpg',
        asset_url: 'https://example.com/example.jpg',
        open_reports: 2,
      }),
    );

    expect(provider.name).toBe('manual_review');
    expect(decision).toMatchObject({
      action: 'flag',
      next_state: 'flagged',
      reason_code: 'manual_review_required',
      provider: 'manual_review',
    });
    expect(decision.labels).toEqual(['asset_present']);
    expect(decision.summary.open_reports).toBe(2);
  });

  it('keeps flagged worker decisions in reviewing and resolves final actions', () => {
    expect(
      resolveSocialReportWorkflowStatusForDecision({
        action: 'flag',
        nextState: 'flagged',
        flaggedWorkflowStatus: 'reviewing',
      }),
    ).toBe('reviewing');

    expect(
      resolveSocialReportWorkflowStatusForDecision({
        action: 'approve',
        nextState: 'approved',
      }),
    ).toBe('resolved');

    expect(
      resolveSocialReportWorkflowStatusForDecision({
        action: 'remove',
        nextState: 'removed',
      }),
    ).toBe('resolved');
  });

  it('selects claimable subjects by open reports before queue age', () => {
    const selected = selectClaimableSocialModerationSubjects(
      [
        createSubject({
          content_id: '10000000-0000-4000-8000-000000000010',
          open_reports: 1,
          moderation_queued_at: '2026-04-09T12:05:00.000Z',
        }),
        createSubject({
          content_id: '10000000-0000-4000-8000-000000000011',
          open_reports: 3,
          moderation_queued_at: '2026-04-09T12:15:00.000Z',
        }),
        createSubject({
          content_id: '10000000-0000-4000-8000-000000000012',
          open_reports: 3,
          moderation_queued_at: '2026-04-09T12:01:00.000Z',
        }),
        createSubject({
          content_id: '10000000-0000-4000-8000-000000000013',
          moderation_state: 'approved',
          open_reports: 10,
        }),
      ],
      {
        limit: 3,
        nowIso: '2026-04-09T12:30:00.000Z',
        staleAfterMinutes: 15,
      },
    );

    expect(selected.map((subject) => subject.content_id)).toEqual([
      '10000000-0000-4000-8000-000000000012',
      '10000000-0000-4000-8000-000000000011',
      '10000000-0000-4000-8000-000000000010',
    ]);
  });
});
