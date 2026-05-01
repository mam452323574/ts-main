import {
  createSocialModerationProvider,
  resolveSocialReportWorkflowStatusForDecision,
} from './phase2Moderation.ts';
import type { Phase2ModerationSubject } from './phase2Types.ts';

function assert(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEquals<T>(
  actual: T,
  expected: T,
  message: string,
) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}`);
  }
}

function assertArrayEquals<T>(
  actual: T[],
  expected: T[],
  message: string,
) {
  assertEquals(actual.length, expected.length, `${message} length mismatch`);
  for (let index = 0; index < actual.length; index += 1) {
    assertEquals(actual[index], expected[index], `${message} at index ${index}`);
  }
}

function createSubject(
  overrides: Partial<Phase2ModerationSubject> = {},
): Phase2ModerationSubject {
  return {
    content_type: 'post',
    content_id: '11111111-1111-4111-8111-111111111111',
    author_id: '22222222-2222-4222-8222-222222222222',
    author_username: 'worker-user',
    category: 'food',
    content_text: 'Testing queued moderation',
    asset_path: null,
    asset_url: null,
    moderation_state: 'pending',
    moderation_reason: null,
    moderation_provider: null,
    created_at: '2026-04-09T12:00:00.000Z',
    total_reports_24h: 0,
    unique_reporters_24h: 0,
    open_reports: 0,
    reason_codes: [],
    last_reported_at: null,
    moderation_queued_at: '2026-04-09T12:00:00.000Z',
    moderation_claimed_at: '2026-04-09T12:01:00.000Z',
    moderation_completed_at: null,
    moderation_attempt_count: 1,
    moderation_last_error: null,
    ...overrides,
  };
}

Deno.test('createSocialModerationProvider flags queued text content for manual review', async () => {
  const provider = createSocialModerationProvider();
  const decision = await provider.reviewSubject(createSubject());

  assertEquals(provider.name, 'manual_review', 'Unexpected provider name');
  assertEquals(decision.action, 'flag', 'Queued content should be flagged');
  assertEquals(decision.next_state, 'flagged', 'Queued content should move to flagged');
  assertEquals(
    decision.reason_code,
    'manual_review_required',
    'Unexpected moderation reason code',
  );
  assertEquals(decision.provider, 'manual_review', 'Unexpected provider id');
  assertArrayEquals(
    decision.labels ?? [],
    ['text_only'],
    'Text-only content should advertise its decision label',
  );
});

Deno.test('createSocialModerationProvider marks asset-backed content explicitly in summary labels', async () => {
  const provider = createSocialModerationProvider();
  const decision = await provider.reviewSubject(
    createSubject({
      asset_path: '22222222-2222-4222-8222-222222222222/posts/example.jpg',
      asset_url: 'https://example.com/example.jpg',
      open_reports: 2,
      total_reports_24h: 3,
      unique_reporters_24h: 2,
    }),
  );

  assertArrayEquals(
    decision.labels ?? [],
    ['asset_present'],
    'Asset-backed content should advertise the asset-present label',
  );
  assertEquals(
    decision.summary.open_reports,
    2,
    'Decision summary should preserve report rollup metadata',
  );
});

Deno.test('resolveSocialReportWorkflowStatusForDecision keeps worker flag decisions in reviewing', () => {
  const workflowStatus = resolveSocialReportWorkflowStatusForDecision({
    action: 'flag',
    nextState: 'flagged',
    flaggedWorkflowStatus: 'reviewing',
  });

  assertEquals(
    workflowStatus,
    'reviewing',
    'Worker flag decisions should keep linked reports in reviewing',
  );
});

Deno.test('resolveSocialReportWorkflowStatusForDecision resolves final moderation states', () => {
  const resolvedStates = [
    resolveSocialReportWorkflowStatusForDecision({
      action: 'approve',
      nextState: 'approved',
    }),
    resolveSocialReportWorkflowStatusForDecision({
      action: 'reject',
      nextState: 'rejected',
    }),
    resolveSocialReportWorkflowStatusForDecision({
      action: 'hide',
      nextState: 'hidden',
    }),
    resolveSocialReportWorkflowStatusForDecision({
      action: 'remove',
      nextState: 'removed',
    }),
  ];

  assert(
    resolvedStates.every((status) => status === 'resolved'),
    'Final moderation states should resolve linked reports',
  );
});
