import {
  buildCoachGenerationInputFromScanCoachIntent,
  decodeScanCoachIntentParam,
  encodeScanCoachIntentParam,
  scanCoachIntent,
} from '@/shared/scanCoachIntent';

describe('shared scanCoachIntent exports', () => {
  it('builds a hidden issue-resolution generation input for scan intents', () => {
    const intent = scanCoachIntent(
      {
        scan_type: 'face',
        hydration_level: 42,
      },
      { scanId: 'scan-face' },
    );

    expect(intent).toMatchObject({
      scan_id: 'scan-face',
      scan_type: 'face',
      has_actionable_issue: true,
      priority_metric: 'hydration_level',
      prompt_type: 'latest_scan_issue_resolution',
      question_key: 'improve_hydration_from_scan',
      fallback_prompt_type: 'latest_scan',
    });
    expect(buildCoachGenerationInputFromScanCoachIntent(intent)).toEqual({
      promptType: 'latest_scan_issue_resolution',
      questionKey: null,
      questionText: intent.question_text,
    });
  });

  it('round-trips the strict target contract through route params', () => {
    const intent = scanCoachIntent({
      scan_type: 'nutrition',
      protein_grams: 12,
    });

    expect(decodeScanCoachIntentParam(encodeScanCoachIntentParam(intent))).toEqual(
      intent,
    );
    expect(Object.keys(intent).sort()).toEqual(
      [
        'scan_type',
        'fallback_prompt_type',
        'has_actionable_issue',
        'premium_required',
        'priority_label',
        'priority_metric',
        'prompt_type',
        'question_key',
        'question_text',
        'reason',
        'severity',
        'user_facing_summary',
      ].sort(),
    );
  });
});
