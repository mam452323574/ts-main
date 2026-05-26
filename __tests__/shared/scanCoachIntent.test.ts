import {
  buildCoachGenerationInputFromScanCoachIntent,
  decodeScanCoachIntentParam,
  encodeScanCoachIntentParam,
  isScanCoachIntentDowngradedForFreeTier,
  resolveScanCoachIntentPremiumPromptType,
  scanCoachIntent,
} from '@/shared/scanCoachIntent';

describe('shared scanCoachIntent exports', () => {
  it('keeps the legacy issue-resolution prompt_type on the intent itself', () => {
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
  });

  it('maps a face hydration intent to the hydration_focus preset for both tiers', () => {
    const intent = scanCoachIntent(
      {
        scan_type: 'face',
        hydration_level: 30,
      },
      { scanId: 'scan-face', locale: 'fr' },
    );

    const free = buildCoachGenerationInputFromScanCoachIntent(intent, {
      accountTier: 'free',
      locale: 'fr',
    });
    expect(free.promptType).toBe('hydration_focus');
    expect(free.questionKey).toBe('hydration_focus__easy_daily_hydration');
    expect(typeof free.questionText).toBe('string');
    expect(free.questionText.length).toBeGreaterThan(0);

    const premium = buildCoachGenerationInputFromScanCoachIntent(intent, {
      accountTier: 'premium',
      locale: 'fr',
    });
    expect(premium.questionKey).toBe(free.questionKey);
    expect(premium.promptType).toBe('hydration_focus');
  });

  it('maps a body posture intent to latest_scan (free) and body_focus (premium)', () => {
    const intent = scanCoachIntent({
      scan_type: 'body',
      posture_score: 30,
    });

    const free = buildCoachGenerationInputFromScanCoachIntent(intent, {
      accountTier: 'free',
    });
    expect(free.questionKey).toBe('latest_scan__top_priority_today');
    expect(free.promptType).toBe('latest_scan');

    const premium = buildCoachGenerationInputFromScanCoachIntent(intent, {
      accountTier: 'premium',
    });
    expect(premium.questionKey).toBe('body_focus__mobility_posture_priorities');
    expect(premium.promptType).toBe('body_focus');
  });

  it('maps a nutrition sugar excess to nutrition_focus_swaps (premium) and avoid_worse (free)', () => {
    const intent = scanCoachIntent({
      scan_type: 'nutrition',
      sugar_grams_estimate: 50,
    });

    const free = buildCoachGenerationInputFromScanCoachIntent(intent, {
      accountTier: 'free',
    });
    expect(free.questionKey).toBe('latest_scan__avoid_worse_today');

    const premium = buildCoachGenerationInputFromScanCoachIntent(intent, {
      accountTier: 'premium',
    });
    expect(premium.questionKey).toBe('nutrition_focus__smart_swaps_week');
    expect(premium.promptType).toBe('nutrition_focus');
  });

  it('maps a super scan with urgency flag to risk_watch (premium) / latest_scan (free)', () => {
    const intent = scanCoachIntent({
      scan_type: 'super',
      global_risk_score: 80,
      urgency_flag: true,
    });

    expect(intent.scan_type).toBe('super');
    const free = buildCoachGenerationInputFromScanCoachIntent(intent, {
      accountTier: 'free',
    });
    expect(free.questionKey).toBe('latest_scan__top_priority_today');
    expect(free.promptType).toBe('latest_scan');

    const premium = buildCoachGenerationInputFromScanCoachIntent(intent, {
      accountTier: 'premium',
    });
    expect(premium.questionKey).toBe('risk_watch__what_to_monitor_today');
    expect(premium.promptType).toBe('risk_watch');
  });

  it('falls back to avoid_worse_today (free) / habits_to_continue (premium) when scan is stable', () => {
    // No metric below threshold, but a high recovery_readiness so signals do not trigger.
    const intent = scanCoachIntent({ scan_type: 'face' });

    expect(intent.has_actionable_issue).toBe(false);
    expect(intent.question_key).toBe('maintain_results_from_scan');

    const free = buildCoachGenerationInputFromScanCoachIntent(intent, {
      accountTier: 'free',
    });
    expect(free.questionKey).toBe('latest_scan__avoid_worse_today');
    expect(free.promptType).toBe('latest_scan');

    const premium = buildCoachGenerationInputFromScanCoachIntent(intent, {
      accountTier: 'premium',
    });
    expect(premium.questionKey).toBe('trend_review__habits_to_continue');
    expect(premium.promptType).toBe('trend_review');
  });

  it('falls back to maintain preset when scan quality is too low', () => {
    const intent = scanCoachIntent({
      scan_type: 'face',
      confidence_score: 30,
      hydration_level: 20,
    });

    // hasReliableEnoughData returns false → buildFallback path
    expect(intent.has_actionable_issue).toBe(false);
    const free = buildCoachGenerationInputFromScanCoachIntent(intent, {
      accountTier: 'free',
    });
    expect(free.questionKey).toBe('latest_scan__avoid_worse_today');
  });

  it('treats unknown account tier as free', () => {
    const intent = scanCoachIntent({
      scan_type: 'body',
      posture_score: 30,
    });

    const result = buildCoachGenerationInputFromScanCoachIntent(intent, {});
    expect(result.questionKey).toBe('latest_scan__top_priority_today');
  });

  it('treats admin tier as premium', () => {
    const intent = scanCoachIntent({
      scan_type: 'body',
      posture_score: 30,
    });

    const result = buildCoachGenerationInputFromScanCoachIntent(intent, {
      accountTier: 'admin',
    });
    expect(result.questionKey).toBe('body_focus__mobility_posture_priorities');
  });

  describe('isScanCoachIntentDowngradedForFreeTier', () => {
    it('returns true for a free user with body scan when premium would route to body_focus', () => {
      const intent = scanCoachIntent({
        scan_type: 'body',
        posture_score: 30,
      });
      expect(isScanCoachIntentDowngradedForFreeTier(intent, 'free')).toBe(true);
    });

    it('returns false for the same scan when the user is premium', () => {
      const intent = scanCoachIntent({
        scan_type: 'body',
        posture_score: 30,
      });
      expect(isScanCoachIntentDowngradedForFreeTier(intent, 'premium')).toBe(false);
    });

    it('returns false for a free user when free and premium presets are identical (hydration)', () => {
      const intent = scanCoachIntent({
        scan_type: 'face',
        hydration_level: 30,
      });
      expect(isScanCoachIntentDowngradedForFreeTier(intent, 'free')).toBe(false);
    });

    it('returns true for a free user with stable scan (maintain → free latest_scan vs premium trend_review)', () => {
      const intent = scanCoachIntent({ scan_type: 'face' });
      expect(isScanCoachIntentDowngradedForFreeTier(intent, 'free')).toBe(true);
    });
  });

  describe('resolveScanCoachIntentPremiumPromptType', () => {
    it('returns body_focus for a body posture scan', () => {
      const intent = scanCoachIntent({
        scan_type: 'body',
        posture_score: 30,
      });
      expect(resolveScanCoachIntentPremiumPromptType(intent)).toBe('body_focus');
    });

    it('returns trend_review for the maintain fallback', () => {
      const intent = scanCoachIntent({ scan_type: 'face' });
      expect(resolveScanCoachIntentPremiumPromptType(intent)).toBe('trend_review');
    });

    it('returns risk_watch for a super scan with urgency', () => {
      const intent = scanCoachIntent({
        scan_type: 'super',
        global_risk_score: 75,
        urgency_flag: true,
      });
      expect(resolveScanCoachIntentPremiumPromptType(intent)).toBe('risk_watch');
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
