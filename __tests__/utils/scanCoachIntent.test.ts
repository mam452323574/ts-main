import {
  buildCoachGenerationInputFromScanCoachIntent,
  decodeScanCoachIntentParam,
  encodeScanCoachIntentParam,
  sanitizeScanCoachIntent,
  scanCoachIntent,
  type ScanCoachIntent,
} from '@/shared/scanCoachIntent';

function expectTargetIntentShape(intent: ScanCoachIntent) {
  expect(Object.keys(intent).sort()).toEqual(
    [
      ...(intent.scan_id ? ['scan_id'] : []),
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
}

function expectSafeWording(intent: ScanCoachIntent) {
  const combinedText = [
    intent.user_facing_summary,
    intent.question_text,
    intent.priority_label,
    intent.reason,
  ].join(' ');

  expect(combinedText).not.toContain('IA');
  expect(combinedText.toLowerCase()).not.toContain('diagnostic');
}

describe('scanCoachIntent', () => {
  it('maps weak face hydration to a deterministic actionable intent', () => {
    const intent = scanCoachIntent(
      {
        scan_type: 'face',
        hydration_level: 42,
        fatigue_level: 20,
        analysis_meta: {
          confidence_score: 92,
          image_quality_score: 88,
          metric_coverage_score: 90,
          limitation_flags: [],
        },
      },
      { scanId: 'scan-face' },
    );

    expectTargetIntentShape(intent);
    expect(intent).toMatchObject({
      scan_id: 'scan-face',
      scan_type: 'face',
      has_actionable_issue: true,
      priority_metric: 'hydration_level',
      priority_label: 'Hydratation',
      severity: 'medium',
      prompt_type: 'latest_scan_issue_resolution',
      question_key: 'improve_hydration_from_scan',
      fallback_prompt_type: 'latest_scan',
      premium_required: false,
    });
    expect(buildCoachGenerationInputFromScanCoachIntent(intent)).toEqual({
      promptType: 'latest_scan_issue_resolution',
      questionKey: null,
      questionText: intent.question_text,
    });
  });

  it('detects a reliable super scan priority from global risk signals', () => {
    const intent = scanCoachIntent(
      {
        scan_type: 'super_health_v2',
        global_risk_score: 64,
        urgency_flag: false,
        detected_conditions: [],
      },
      { scanId: 'scan-super', scanType: 'super_health_v2' },
    );

    expectTargetIntentShape(intent);
    expect(intent).toMatchObject({
      scan_id: 'scan-super',
      scan_type: 'super',
      has_actionable_issue: true,
      priority_metric: 'global_risk_score',
      priority_label: 'Vigilance globale',
      severity: 'medium',
      prompt_type: 'latest_scan_issue_resolution',
      question_key: 'latest_scan__top_priority_today',
      fallback_prompt_type: 'latest_scan',
      premium_required: false,
    });
    expect(buildCoachGenerationInputFromScanCoachIntent(intent).promptType).toBe(
      'latest_scan_issue_resolution',
    );
  });

  it('falls back cleanly when a super scan has no reliable priority signal', () => {
    const intent = scanCoachIntent({
      scan_type: 'super_health_v2',
      global_risk_score: 22,
      urgency_flag: false,
      detected_conditions: [],
    });

    expectTargetIntentShape(intent);
    expect(intent).toMatchObject({
      scan_type: 'super',
      has_actionable_issue: false,
      priority_metric: null,
      priority_label: null,
      severity: null,
      question_key: 'maintain_results_from_scan',
      prompt_type: 'latest_scan_issue_resolution',
      fallback_prompt_type: 'latest_scan',
    });
  });

  it('uses a positive fallback when no clear signal is present', () => {
    const intent = scanCoachIntent({
      scan_type: 'face',
      hydration_level: 82,
      fatigue_level: 18,
      perceived_sleep_quality: 74,
      analysis_meta: {
        confidence_score: 94,
        image_quality_score: 90,
        metric_coverage_score: 88,
        limitation_flags: [],
      },
    });

    expectTargetIntentShape(intent);
    expect(intent).toMatchObject({
      has_actionable_issue: false,
      priority_metric: null,
      priority_label: null,
      severity: null,
      reason: null,
      prompt_type: 'latest_scan_issue_resolution',
      question_key: 'maintain_results_from_scan',
      fallback_prompt_type: 'latest_scan',
      premium_required: false,
    });
  });

  it('does not invent an issue when requested metrics are absent', () => {
    const intent = scanCoachIntent({
      scan_type: 'body',
      glow_index: 28,
      generic_score: 12,
    });

    expect(intent).toMatchObject({
      has_actionable_issue: false,
      priority_metric: null,
      priority_label: null,
      severity: null,
    });
  });

  it('blocks issue detection when scan reliability is too low', () => {
    const intent = scanCoachIntent({
      scan_type: 'nutrition',
      meal_balance_score: 22,
      analysis_meta: {
        confidence_score: 40,
        image_quality_score: 92,
        metric_coverage_score: 90,
        limitation_flags: [],
      },
    });

    expect(intent).toMatchObject({
      has_actionable_issue: false,
      priority_metric: null,
      severity: null,
      premium_required: false,
    });
  });

  it('prioritizes severity before business priority and intensity', () => {
    const intent = scanCoachIntent({
      scan_type: 'face',
      hydration_level: 42,
      fatigue_level: 82,
      analysis_meta: {
        confidence_score: 90,
        image_quality_score: 90,
        metric_coverage_score: 90,
        limitation_flags: [],
      },
    });

    expect(intent).toMatchObject({
      has_actionable_issue: true,
      priority_metric: 'fatigue_level',
      priority_label: 'Fatigue visible',
      severity: 'high',
      question_key: 'improve_visible_fatigue_from_scan',
      premium_required: true,
    });
  });

  it('marks premium metrics according to existing result gating', () => {
    const intent = scanCoachIntent({
      scan_type: 'body',
      posture_score: 3.2,
      analysis_meta: {
        confidence_score: 95,
        image_quality_score: 90,
        metric_coverage_score: 85,
        limitation_flags: [],
      },
    });

    expect(intent).toMatchObject({
      has_actionable_issue: true,
      priority_metric: 'posture_score',
      severity: 'high',
      premium_required: true,
    });
  });

  it('supports legacy rows with nested analysis_result payloads', () => {
    const intent = scanCoachIntent({
      id: 'legacy-food',
      type: 'meal',
      analysis_result: {
        metrics: {
          vegetable_portion_ratio: 5,
        },
      },
    });

    expect(intent).toMatchObject({
      has_actionable_issue: true,
      priority_metric: 'vegetable_portion_ratio',
      severity: 'high',
      prompt_type: 'latest_scan_issue_resolution',
      fallback_prompt_type: 'latest_scan',
      premium_required: true,
    });
  });

  it('keeps user-facing wording away from blocked terms', () => {
    const intents = [
      scanCoachIntent({ scan_type: 'nutrition', protein_grams: 12 }),
      scanCoachIntent({ scan_type: 'body', body_tension_indicator_score: 82 }),
      scanCoachIntent({ scan_type: 'face', hydration_level: 80 }),
    ];

    intents.forEach(expectSafeWording);
  });

  it('round-trips and sanitizes only the target scan intent contract', () => {
    const intent = scanCoachIntent({
      scan_type: 'face',
      hydration_level: 42,
    });

    expect(decodeScanCoachIntentParam(encodeScanCoachIntentParam(intent))).toEqual(
      intent,
    );
    expect(sanitizeScanCoachIntent(intent)).toEqual(intent);
    expect(sanitizeScanCoachIntent({ ...intent, extra_field: true })).toBeNull();
    expect(sanitizeScanCoachIntent({ ...intent, severity: 'moderate' })).toBeNull();
    expect(sanitizeScanCoachIntent({ ...intent, scan_id: '' })).toBeNull();
    expect(decodeScanCoachIntentParam('%7Bnot-json')).toBeNull();
  });
});
