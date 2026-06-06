import {
  isPremiumTier,
  sanitizeScanAnalysisResultForTier,
  sanitizeScanForTier,
} from '@/utils/scanResultSanitizer';

describe('client scanResultSanitizer (mirrors Edge Function behaviour)', () => {
  it('strips premium face fields while keeping fatigue + glow-up scores for free', () => {
    // Rééquilibrage produit 2026-05-27 : `fatigue_level`,
    //   `skin_clarity_score`, `skin_evenness_score`, `under_eye_shadow_score`
    //   sont désormais visibles en gratuit avec leur valeur chiffrée.
    const input = {
      scan_type: 'face',
      face_score: 82,
      fatigue_level: 32,
      skin_quality_score: 70,
      energy_score: 80,
      collagen_level: 66,
      skin_clarity_score: 78,
      skin_evenness_score: 50,
      under_eye_shadow_score: 30,
      perceived_stress_level: 40,
      perceived_sleep_quality: 70,
      pore_visibility_score: 50,
    };
    const sanitized = sanitizeScanAnalysisResultForTier(
      input,
      'free',
    ) as Record<string, unknown>;
    expect('skin_quality_score' in sanitized).toBe(false);
    expect('energy_score' in sanitized).toBe(false);
    expect('collagen_level' in sanitized).toBe(false);
    expect('perceived_stress_level' in sanitized).toBe(false);
    expect('perceived_sleep_quality' in sanitized).toBe(false);
    expect('pore_visibility_score' in sanitized).toBe(false);
    expect(sanitized.fatigue_level).toBe(32);
    expect(sanitized.skin_clarity_score).toBe(78);
    expect(sanitized.skin_evenness_score).toBe(50);
    expect(sanitized.under_eye_shadow_score).toBe(30);
    expect(sanitized.face_score).toBe(82);
  });

  it('preserves full payload for premium tier', () => {
    const input = {
      scan_type: 'face',
      face_score: 82,
      skin_quality_score: 70,
      collagen_level: 66,
    };
    expect(sanitizeScanAnalysisResultForTier(input, 'premium')).toBe(input);
  });

  it('preserves full payload for admin tier', () => {
    const input = {
      scan_type: 'face',
      face_score: 82,
      skin_quality_score: 70,
    };
    expect(sanitizeScanAnalysisResultForTier(input, 'admin')).toBe(input);
  });

  it('strips premium body fields for free users while keeping body_score, posture_score and recovery', () => {
    // `recovery_readiness_score` est désormais visible en gratuit
    //   (rééquilibrage produit 2026-05-27).
    const input = {
      scan_type: 'body',
      body_score: 70,
      posture_score: 65,
      bmi_estimate: 22,
      body_fat_percentage: 18,
      strength_index: 60,
      metabolic_age: 30,
      body_symmetry: 75,
      v_taper_score: 65,
      recovery_readiness_score: 72,
    };
    const sanitized = sanitizeScanAnalysisResultForTier(
      input,
      'free',
    ) as Record<string, unknown>;
    expect('body_fat_percentage' in sanitized).toBe(false);
    expect('strength_index' in sanitized).toBe(false);
    expect('metabolic_age' in sanitized).toBe(false);
    expect('body_symmetry' in sanitized).toBe(false);
    expect('v_taper_score' in sanitized).toBe(false);
    expect(sanitized.body_score).toBe(70);
    expect(sanitized.posture_score).toBe(65);
    expect(sanitized.bmi_estimate).toBe(22);
    expect(sanitized.recovery_readiness_score).toBe(72);
  });

  it('keeps macros, plate score and meal_balance for free nutrition while stripping detailed analysis fields', () => {
    // `meal_balance_score` est désormais visible en gratuit (rééquilibrage
    //   produit 2026-05-27).
    const input = {
      scan_type: 'nutrition',
      plate_health_score: 70,
      calories_estimate: 600,
      protein_grams: 35,
      carbs_grams: 60,
      fat_grams: 20,
      satiety_index: 65,
      meal_balance_score: 68,
      recommendations: ['eat more veggies'],
      micronutrients: { vit_a: 'medium' },
    };
    const sanitized = sanitizeScanAnalysisResultForTier(
      input,
      'free',
    ) as Record<string, unknown>;
    expect('satiety_index' in sanitized).toBe(false);
    expect('recommendations' in sanitized).toBe(false);
    expect('micronutrients' in sanitized).toBe(false);
    expect(sanitized.protein_grams).toBe(35);
    expect(sanitized.carbs_grams).toBe(60);
    expect(sanitized.fat_grams).toBe(20);
    expect(sanitized.calories_estimate).toBe(600);
    expect(sanitized.meal_balance_score).toBe(68);
  });

  it('does not crash on legacy scans missing premium fields', () => {
    const legacy = { scan_type: 'face', face_score: 80, perceived_age: 30 };
    expect(sanitizeScanAnalysisResultForTier(legacy, 'free')).toBe(legacy);
  });

  it('returns same reference when analysis_result is null on a Scan wrapper', () => {
    const scan = {
      id: 'scan-1',
      scan_type: 'face',
      analysis_result: null,
    };
    expect(sanitizeScanForTier(scan, 'free')).toBe(scan);
  });

  it('sanitizeScanForTier returns clone with filtered analysis_result for free', () => {
    const scan = {
      id: 'scan-1',
      scan_type: 'face',
      analysis_result: {
        scan_type: 'face',
        face_score: 80,
        skin_quality_score: 70,
        skin_clarity_score: 78,
      },
    };
    const result = sanitizeScanForTier(scan, 'free');
    expect(result).not.toBe(scan);
    const analysis = result.analysis_result as Record<string, unknown>;
    expect('skin_quality_score' in analysis).toBe(false);
    expect(analysis.face_score).toBe(80);
    expect(analysis.skin_clarity_score).toBe(78);
  });

  it('isPremiumTier matches the server-side helper', () => {
    expect(isPremiumTier('premium')).toBe(true);
    expect(isPremiumTier('admin')).toBe(true);
    expect(isPremiumTier('free')).toBe(false);
    expect(isPremiumTier(null)).toBe(false);
  });
});
