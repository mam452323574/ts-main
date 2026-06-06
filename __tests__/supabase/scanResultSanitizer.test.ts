import {
  isPremiumTier,
  resolveTierFromProfile,
  sanitizeScanAnalysisResultForTier,
  sanitizeScanForTier,
} from '@/supabase/functions/_shared/scanResultSanitizer';

describe('isPremiumTier', () => {
  it('returns true for premium and admin', () => {
    expect(isPremiumTier('premium')).toBe(true);
    expect(isPremiumTier('admin')).toBe(true);
  });

  it('returns false for free, unknown and missing tiers', () => {
    expect(isPremiumTier('free')).toBe(false);
    expect(isPremiumTier('')).toBe(false);
    expect(isPremiumTier(null)).toBe(false);
    expect(isPremiumTier(undefined)).toBe(false);
    expect(isPremiumTier('basic')).toBe(false);
  });
});

describe('resolveTierFromProfile', () => {
  it('keeps premium and admin', () => {
    expect(resolveTierFromProfile('premium')).toBe('premium');
    expect(resolveTierFromProfile('admin')).toBe('admin');
  });

  it('fails closed to free for any other value', () => {
    expect(resolveTierFromProfile('free')).toBe('free');
    expect(resolveTierFromProfile(null)).toBe('free');
    expect(resolveTierFromProfile(undefined)).toBe('free');
    expect(resolveTierFromProfile('basic')).toBe('free');
    expect(resolveTierFromProfile(42)).toBe('free');
  });
});

describe('sanitizeScanAnalysisResultForTier (face)', () => {
  const fullFace = {
    scan_type: 'face',
    face_score: 82,
    perceived_age: 28,
    symmetry_percentage: 75,
    hydration_level: 60,
    skin_radiance_score: 65,
    fatigue_level: 32,
    photogenic_score: 78,
    skin_quality_score: 70,
    energy_score: 80,
    collagen_level: 66,
    skin_clarity_score: 78,
    skin_evenness_score: 50,
    under_eye_shadow_score: 30,
    under_eye_volume_score: 40,
    eye_openness_score: 70,
    complexion_redness_score: 25,
    pore_visibility_score: 50,
    lip_dryness_score: 20,
    forehead_smoothness_score: 60,
    t_zone_oiliness_score: 35,
    perceived_stress_level: 40,
    perceived_sleep_quality: 70,
  } as const;

  it('strips premium face fields for free users', () => {
    const sanitized = sanitizeScanAnalysisResultForTier(
      fullFace,
      'free',
    ) as Record<string, unknown>;
    expect(sanitized).not.toBe(fullFace);
    expect('photogenic_score' in sanitized).toBe(false);
    expect('skin_quality_score' in sanitized).toBe(false);
    expect('energy_score' in sanitized).toBe(false);
    expect('collagen_level' in sanitized).toBe(false);
    expect('under_eye_volume_score' in sanitized).toBe(false);
    expect('eye_openness_score' in sanitized).toBe(false);
    expect('complexion_redness_score' in sanitized).toBe(false);
    expect('pore_visibility_score' in sanitized).toBe(false);
    expect('lip_dryness_score' in sanitized).toBe(false);
    expect('forehead_smoothness_score' in sanitized).toBe(false);
    expect('t_zone_oiliness_score' in sanitized).toBe(false);
    expect('perceived_stress_level' in sanitized).toBe(false);
    expect('perceived_sleep_quality' in sanitized).toBe(false);
  });

  it('keeps free face fields (score, hydration, symmetry, radiance) for free users', () => {
    const sanitized = sanitizeScanAnalysisResultForTier(
      fullFace,
      'free',
    ) as Record<string, unknown>;
    expect(sanitized.face_score).toBe(82);
    expect(sanitized.perceived_age).toBe(28);
    expect(sanitized.symmetry_percentage).toBe(75);
    expect(sanitized.hydration_level).toBe(60);
    expect(sanitized.skin_radiance_score).toBe(65);
  });

  it('keeps fatigue + the three glow-up scores for free users (numeric values exposed)', () => {
    // Rééquilibrage produit 2026-05-27 : ces 4 valeurs chiffrées sont
    //   désormais affichées telles quelles aux comptes gratuits (au lieu d'un
    //   label qualitatif intermédiaire).
    const sanitized = sanitizeScanAnalysisResultForTier(
      fullFace,
      'free',
    ) as Record<string, unknown>;
    expect(sanitized.fatigue_level).toBe(32);
    expect(sanitized.skin_clarity_score).toBe(78);
    expect(sanitized.skin_evenness_score).toBe(50);
    expect(sanitized.under_eye_shadow_score).toBe(30);
  });

  it('returns input unchanged for premium tier', () => {
    const sanitized = sanitizeScanAnalysisResultForTier(fullFace, 'premium');
    expect(sanitized).toBe(fullFace);
  });

  it('returns input unchanged for admin tier', () => {
    const sanitized = sanitizeScanAnalysisResultForTier(fullFace, 'admin');
    expect(sanitized).toBe(fullFace);
  });
});

describe('sanitizeScanAnalysisResultForTier (body)', () => {
  const fullBody = {
    scan_type: 'body',
    body_score: 72,
    posture_score: 65,
    bmi_estimate: 22,
    waist_estimation_cm: 80,
    body_fat_percentage: 18,
    strength_index: 60,
    metabolic_age: 30,
    body_symmetry: 75,
    muscle_definition_score: 55,
    midsection_definition_score: 50,
    shoulder_alignment_score: 60,
    recovery_readiness_score: 70,
    upper_body_definition_score: 60,
    lower_body_definition_score: 55,
    arm_definition_score: 50,
    v_taper_score: 65,
    body_tension_indicator_score: 45,
  } as const;

  it('strips premium body fields for free users', () => {
    const sanitized = sanitizeScanAnalysisResultForTier(
      fullBody,
      'free',
    ) as Record<string, unknown>;
    expect('body_fat_percentage' in sanitized).toBe(false);
    expect('strength_index' in sanitized).toBe(false);
    expect('metabolic_age' in sanitized).toBe(false);
    expect('body_symmetry' in sanitized).toBe(false);
    expect('muscle_definition_score' in sanitized).toBe(false);
    expect('v_taper_score' in sanitized).toBe(false);
    expect(sanitized.body_score).toBe(72);
    expect(sanitized.posture_score).toBe(65);
    expect(sanitized.bmi_estimate).toBe(22);
  });

  it('keeps recovery_readiness_score visible for free users', () => {
    // Rééquilibrage produit 2026-05-27.
    const sanitized = sanitizeScanAnalysisResultForTier(
      fullBody,
      'free',
    ) as Record<string, unknown>;
    expect(sanitized.recovery_readiness_score).toBe(70);
  });
});

describe('sanitizeScanAnalysisResultForTier (nutrition)', () => {
  const fullNutrition = {
    scan_type: 'nutrition',
    plate_health_score: 70,
    calories_estimate: 600,
    protein_grams: 35,
    carbs_grams: 60,
    fat_grams: 20,
    satiety_index: 65,
    fiber_grams_estimate: 8,
    processing_level_score: 30,
    meal_balance_score: 68,
    micronutrients: { vit_a: 'medium' },
    recommendations: ['eat more veggies'],
  } as const;

  it('strips premium nutrition fields for free users', () => {
    const sanitized = sanitizeScanAnalysisResultForTier(
      fullNutrition,
      'free',
    ) as Record<string, unknown>;
    expect('satiety_index' in sanitized).toBe(false);
    expect('fiber_grams_estimate' in sanitized).toBe(false);
    expect('processing_level_score' in sanitized).toBe(false);
    expect('micronutrients' in sanitized).toBe(false);
    expect('recommendations' in sanitized).toBe(false);
    expect(sanitized.plate_health_score).toBe(70);
    expect(sanitized.calories_estimate).toBe(600);
    expect(sanitized.protein_grams).toBe(35);
    expect(sanitized.carbs_grams).toBe(60);
    expect(sanitized.fat_grams).toBe(20);
  });

  it('keeps meal_balance_score visible for free users', () => {
    // Rééquilibrage produit 2026-05-27.
    const sanitized = sanitizeScanAnalysisResultForTier(
      fullNutrition,
      'free',
    ) as Record<string, unknown>;
    expect(sanitized.meal_balance_score).toBe(68);
  });
});

describe('sanitizeScanAnalysisResultForTier (edge cases)', () => {
  it('returns null unchanged', () => {
    expect(sanitizeScanAnalysisResultForTier(null, 'free')).toBeNull();
  });

  it('returns undefined unchanged', () => {
    expect(sanitizeScanAnalysisResultForTier(undefined, 'free')).toBeUndefined();
  });

  it('returns primitive unchanged', () => {
    expect(sanitizeScanAnalysisResultForTier('not an object', 'free')).toBe(
      'not an object',
    );
    expect(sanitizeScanAnalysisResultForTier(42, 'free')).toBe(42);
  });

  it('returns array unchanged', () => {
    const arr = [{ scan_type: 'face', skin_quality_score: 70 }];
    expect(sanitizeScanAnalysisResultForTier(arr, 'free')).toBe(arr);
  });

  it('returns same reference when nothing matched (legacy scan without premium fields)', () => {
    const legacy = { scan_type: 'face', face_score: 80, perceived_age: 30 };
    expect(sanitizeScanAnalysisResultForTier(legacy, 'free')).toBe(legacy);
  });

  it('returns same reference when scan_type is unknown', () => {
    const exotic = { scan_type: 'unknown_type', skin_quality_score: 50 };
    expect(sanitizeScanAnalysisResultForTier(exotic, 'free')).toBe(exotic);
  });

  it('uses scanTypeHint when scan_type is missing on the payload', () => {
    const payload = { skin_quality_score: 70, face_score: 82 };
    const sanitized = sanitizeScanAnalysisResultForTier(
      payload,
      'free',
      'face',
    ) as Record<string, unknown>;
    expect('skin_quality_score' in sanitized).toBe(false);
    expect(sanitized.face_score).toBe(82);
  });
});

describe('sanitizeScanForTier (wrapping)', () => {
  const baseFaceScan = {
    id: 'scan-1',
    user_id: 'user-1',
    scan_type: 'face',
    image_url: null,
    image_path: 'path/scan-1.jpg',
    created_at: '2026-05-26T10:00:00Z',
    analyzed_at: '2026-05-26T10:00:30Z',
    analysis_result: {
      scan_type: 'face',
      face_score: 82,
      skin_quality_score: 70,
      collagen_level: 66,
      skin_clarity_score: 78,
      perceived_stress_level: 40,
    },
  };

  it('returns the same scan reference for premium', () => {
    expect(sanitizeScanForTier(baseFaceScan, 'premium')).toBe(baseFaceScan);
  });

  it('returns the same scan reference for admin', () => {
    expect(sanitizeScanForTier(baseFaceScan, 'admin')).toBe(baseFaceScan);
  });

  it('returns a cloned scan with filtered analysis_result for free', () => {
    const result = sanitizeScanForTier(baseFaceScan, 'free');
    expect(result).not.toBe(baseFaceScan);
    expect(result.id).toBe('scan-1');
    expect(result.image_path).toBe('path/scan-1.jpg');
    expect(result.analyzed_at).toBe('2026-05-26T10:00:30Z');

    const analysis = result.analysis_result as Record<string, unknown>;
    expect(analysis).not.toBe(baseFaceScan.analysis_result);
    expect(analysis.face_score).toBe(82);
    expect(analysis.skin_clarity_score).toBe(78);
    expect('skin_quality_score' in analysis).toBe(false);
    expect('collagen_level' in analysis).toBe(false);
    expect('perceived_stress_level' in analysis).toBe(false);
  });

  it('returns the same scan reference when analysis_result is null', () => {
    const noResult = {
      id: 'scan-1',
      scan_type: 'face',
      analysis_result: null as unknown,
    };
    expect(sanitizeScanForTier(noResult, 'free')).toBe(noResult);
  });

  it('returns the same scan reference when scan_type is missing and analysis is not face/body/nutrition', () => {
    const oddScan = {
      id: 'scan-x',
      analysis_result: { face_score: 50 }, // no scan_type
    };
    expect(sanitizeScanForTier(oddScan, 'free')).toBe(oddScan);
  });

  it('uses the scan.scan_type when analysis_result.scan_type is missing', () => {
    const looseScan = {
      id: 'scan-x',
      scan_type: 'face',
      analysis_result: { face_score: 80, skin_quality_score: 65 },
    };
    const result = sanitizeScanForTier(looseScan, 'free');
    const analysis = result.analysis_result as Record<string, unknown>;
    expect('skin_quality_score' in analysis).toBe(false);
    expect(analysis.face_score).toBe(80);
  });
});
