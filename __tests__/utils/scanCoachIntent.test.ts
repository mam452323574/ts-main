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
    // After the post-scan mapping fix, the builder no longer emits the
    // hidden 'latest_scan_issue_resolution' prompt_type; it resolves to a
    // valid preset CoachQuestionKey based on the user tier. Free users with
    // a face hydration intent land on hydration_focus (no premium gate).
    expect(buildCoachGenerationInputFromScanCoachIntent(intent)).toMatchObject({
      promptType: 'hydration_focus',
      questionKey: 'hydration_focus__easy_daily_hydration',
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
    // Super scan with reliable global risk priority: free users see latest_scan
    // (the high-priority preset), premium users get the dedicated risk_watch
    // route.
    expect(
      buildCoachGenerationInputFromScanCoachIntent(intent, { accountTier: 'free' })
        .promptType,
    ).toBe('latest_scan');
    expect(
      buildCoachGenerationInputFromScanCoachIntent(intent, {
        accountTier: 'premium',
      }).promptType,
    ).toBe('risk_watch');
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
    // body_fat_percentage reste verrouillée pour les comptes gratuits dans
    // PREMIUM_LOCKED_FIELDS.body — on l'utilise ici pour vérifier que
    // l'intent reporte bien `premium_required: true`.
    const intent = scanCoachIntent({
      scan_type: 'body',
      body_fat_percentage: 35,
      analysis_meta: {
        confidence_score: 95,
        image_quality_score: 90,
        metric_coverage_score: 85,
        limitation_flags: [],
      },
    });

    expect(intent).toMatchObject({
      has_actionable_issue: true,
      priority_metric: 'body_fat_percentage',
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

  describe('attractive question_text rewiring', () => {
    const META = {
      confidence_score: 92,
      image_quality_score: 88,
      metric_coverage_score: 90,
      limitation_flags: [],
    } as const;

    /**
     * Toutes les questions affichées doivent respecter le nouveau contrat
     * produit : pas de pattern plat "Comment améliorer X à partir de mon
     * dernier scan ?" et pas de claim médical / pathologique.
     */
    function expectAttractiveWording(intent: ScanCoachIntent) {
      const text = intent.question_text;
      expect(text).not.toMatch(/^Comment am[eé]liorer/i);
      expect(text).not.toMatch(/à partir de mon dernier scan/i);
      const blocked = ['gu[eé]rir', 'soigner', 'traiter', 'diagnostiquer', 'pathologie', 'maladie'];
      for (const term of blocked) {
        expect(text.toLowerCase()).not.toMatch(new RegExp(term, 'i'));
      }
    }

    it('replaces the legacy "Comment améliorer X..." pattern across scan types', () => {
      const intents = [
        scanCoachIntent({ scan_type: 'face', hydration_level: 30, analysis_meta: META }),
        scanCoachIntent({ scan_type: 'face', fatigue_level: 85, analysis_meta: META }),
        scanCoachIntent({ scan_type: 'face', skin_clarity_score: 30, analysis_meta: META }),
        scanCoachIntent({ scan_type: 'body', posture_score: 3, analysis_meta: META }),
        scanCoachIntent({ scan_type: 'body', body_fat_percentage: 35, analysis_meta: META }),
        scanCoachIntent({ scan_type: 'body', recovery_readiness_score: 30, analysis_meta: META }),
        scanCoachIntent({ scan_type: 'nutrition', protein_grams: 8, analysis_meta: META }),
        scanCoachIntent({ scan_type: 'nutrition', sugar_grams_estimate: 50, analysis_meta: META }),
        scanCoachIntent({ scan_type: 'nutrition', meal_balance_score: 30, analysis_meta: META }),
      ];

      intents.forEach(expectAttractiveWording);
    });

    it('produces a deterministic question_text for the same scanId + metric', () => {
      const a = scanCoachIntent(
        { scan_type: 'face', hydration_level: 30, analysis_meta: META },
        { scanId: 'scan-abc' },
      );
      const b = scanCoachIntent(
        { scan_type: 'face', hydration_level: 30, analysis_meta: META },
        { scanId: 'scan-abc' },
      );
      expect(a.question_text).toBe(b.question_text);
    });

    it('rotates the question_text across different scanIds for the same metric', () => {
      // Try a handful of scanIds; with 3 variants and a djb2-like hash, we
      // expect to see at least 2 distinct rendered questions across these.
      const scanIds = [
        'scan-aa1',
        'scan-bb2',
        'scan-cc3',
        'scan-dd4',
        'scan-ee5',
        'scan-ff6',
        'scan-gg7',
      ];
      const renderedSet = new Set(
        scanIds.map(
          (scanId) =>
            scanCoachIntent(
              { scan_type: 'face', hydration_level: 30, analysis_meta: META },
              { scanId },
            ).question_text,
        ),
      );
      expect(renderedSet.size).toBeGreaterThanOrEqual(2);
    });

    it('switches to the English translation when locale is "en"', () => {
      const frIntent = scanCoachIntent(
        { scan_type: 'face', fatigue_level: 85, analysis_meta: META },
        { scanId: 'scan-locale', locale: 'fr' },
      );
      const enIntent = scanCoachIntent(
        { scan_type: 'face', fatigue_level: 85, analysis_meta: META },
        { scanId: 'scan-locale', locale: 'en' },
      );

      expect(frIntent.question_text).not.toBe(enIntent.question_text);
      // Basic sanity check: English string should not contain typical
      // French articles.
      expect(enIntent.question_text).not.toMatch(/\b(le|la|les|du|des)\b/);
    });

    it('still emits an attractive question on the positive fallback', () => {
      const intent = scanCoachIntent(
        // No metric exceeds any threshold → falls through to positive path.
        { scan_type: 'face', analysis_meta: META },
        { scanId: 'scan-positive' },
      );
      expect(intent.has_actionable_issue).toBe(false);
      expectAttractiveWording(intent);
    });
  });
});
