import { normalizeAnalysisResult } from '@/utils/analysisNormalization';

describe('analysisNormalization', () => {
  it('upgrades an already normalized v2 payload to schema v4 while preserving display fallbacks', () => {
    const normalized = normalizeAnalysisResult({
      schema_version: 2,
      scan_type: 'nutrition',
      plate_health_score: 88,
      calories_estimate: 560,
      protein_grams: 24,
      carbs_grams: 36,
      fat_grams: 18,
      verdict_key: 'balanced',
      verdict_fallback_text: 'Balanced meal',
      glycemic_index_key: 'low',
      satiety_index: 9,
      ingredient_quality_key: 'natural',
      main_vitamin_keys: ['vitamin_a', 'vitamin_c'],
      main_vitamins_fallback_text: 'A, C',
    });

    expect(normalized).toEqual({
      schema_version: 4,
      scan_type: 'nutrition',
      analysis_meta: null,
      plate_health_score: 88,
      calories_estimate: 560,
      protein_grams: 24,
      carbs_grams: 36,
      fat_grams: 18,
      verdict_key: 'balanced',
      verdict_fallback_text: 'Balanced meal',
      glycemic_index_key: 'low',
      satiety_index: 9,
      ingredient_quality_key: 'natural',
      main_vitamins_fallback_text: 'A, C',
      main_vitamin_keys: ['vitamin_a', 'vitamin_c'],
    });
  });

  it('converts legacy free-text nutrition payloads into canonical keys', () => {
    const normalized = normalizeAnalysisResult({
      scan_type: 'nutrition',
      plate_health_score: 77,
      calories_estimate: 420,
      protein_grams: 21,
      carbs_grams: 36,
      fat_grams: 12,
      short_verdict: 'Ideal for smoothies',
      glycemic_index_label: 'Low glycemic index',
      satiety_index: 8,
      ingredient_quality: 'Natural',
      main_vitamins: 'Vitamine A, Vitamina C',
    });

    expect(normalized).toMatchObject({
      schema_version: 4,
      scan_type: 'nutrition',
      verdict_key: 'smoothie_ideal',
      glycemic_index_key: 'low',
      ingredient_quality_key: 'natural',
      main_vitamin_keys: ['vitamin_a', 'vitamin_c'],
    });
  });

  it('canonicalizes explicit nutrition keys when legacy aliases come from the backend', () => {
    const normalized = normalizeAnalysisResult({
      scan_type: 'nutrition',
      plate_health_score: 68,
      calories_estimate: 410,
      protein_grams: 17,
      carbs_grams: 33,
      fat_grams: 15,
      verdict_key: 'balanced',
      glycemic_index_key: 'bas',
      satiety_index: 6,
      ingredient_quality_key: 'natural',
      main_vitamin_keys: ['B'],
    });

    expect(normalized).toMatchObject({
      schema_version: 4,
      scan_type: 'nutrition',
      verdict_key: 'balanced',
      glycemic_index_key: 'low',
      ingredient_quality_key: 'natural',
      main_vitamin_keys: ['vitamin_b'],
    });
  });

  it('preserves provider-supplied canonical nutrition verdict keys', () => {
    const normalized = normalizeAnalysisResult({
      scan_type: 'nutrition',
      plate_health_score: 73,
      calories_estimate: 540,
      protein_grams: 31,
      carbs_grams: 42,
      fat_grams: 16,
      verdict_key: 'protein_dense',
      glycemic_index_key: 'low',
      satiety_index: 8,
      ingredient_quality_key: 'natural',
      main_vitamin_keys: ['vitamin_c'],
    });

    expect(normalized).toMatchObject({
      schema_version: 4,
      scan_type: 'nutrition',
      verdict_key: 'protein_dense',
      glycemic_index_key: 'low',
      ingredient_quality_key: 'natural',
      main_vitamin_keys: ['vitamin_c'],
    });
  });

  it('folds unsupported legacy nutrition values into controlled unknown placeholders', () => {
    const normalized = normalizeAnalysisResult({
      scan_type: 'nutrition',
      plate_health_score: 64,
      calories_estimate: 380,
      protein_grams: 18,
      carbs_grams: 30,
      fat_grams: 14,
      short_verdict: 'Chef special',
      glycemic_index_label: 'Slow release',
      satiety_index: 6,
      ingredient_quality: 'Farm fresh',
      main_vitamins: 'Vitamin P',
    });

    expect(normalized).toMatchObject({
      schema_version: 4,
      verdict_key: 'unknown',
      verdict_fallback_text: 'Chef special',
      glycemic_index_key: 'unknown',
      glycemic_index_fallback_text: 'Slow release',
      ingredient_quality_key: 'natural',
      ingredient_quality_fallback_text: 'Farm fresh',
      main_vitamin_keys: ['unknown'],
      main_vitamins_fallback_text: 'Vitamin P',
    });
  });

  it('re-canonicalizes approved explicit nutrition aliases and folds unsupported keys to unknown', () => {
    const normalized = normalizeAnalysisResult({
      scan_type: 'nutrition',
      plate_health_score: 58,
      calories_estimate: 360,
      protein_grams: 14,
      carbs_grams: 32,
      fat_grams: 12,
      verdict_key: 'energisant_mais_gras',
      glycemic_index_key: 'slow_release',
      satiety_index: 5,
      ingredient_quality_key: 'mystery_grade',
      main_vitamin_keys: ['niacine'],
    });

    expect(normalized).toMatchObject({
      schema_version: 4,
      scan_type: 'nutrition',
      verdict_key: 'unknown',
      glycemic_index_key: 'unknown',
      ingredient_quality_key: 'unknown',
      main_vitamin_keys: ['vitamin_b3'],
    });
  });

  it('prefers explicit *_code fields over legacy text when both are present', () => {
    const normalized = normalizeAnalysisResult({
      scan_type: 'body',
      body_score: 80,
      body_fat_percentage: 18,
      muscle_mass_label: 'Faible',
      muscle_mass_code: 'balanced',
      body_type: 'Rectangle',
      body_type_code: 'athletic',
      posture_score: 7,
      waist_estimation_cm: 80,
      strength_index: 72,
      body_symmetry: 78,
      bmi_estimate: 23,
      metabolic_age: 30,
    });

    expect(normalized).toMatchObject({
      schema_version: 4,
      scan_type: 'body',
      muscle_mass_key: 'balanced',
      muscle_mass_fallback_text: 'Faible',
      body_type_key: 'athletic',
      body_type_fallback_text: 'Rectangle',
    });
  });

  it('preserves face fallback text alongside normalized qualitative keys', () => {
    const normalized = normalizeAnalysisResult({
      scan_type: 'face',
      face_score: 81,
      perceived_age: 29,
      skin_quality_score: 75,
      symmetry_percentage: 88,
      fatigue_level: 20,
      glow_index: 7,
      face_shape: 'Oval',
      collagen_level: 68,
      hydration_level: 72,
      photogenic_score: 8,
    });

    expect(normalized).toMatchObject({
      schema_version: 4,
      scan_type: 'face',
      face_shape_key: 'oval',
      face_shape_fallback_text: 'Oval',
    });
  });

  it('preserves legacy super scan free text while normalizing structured keys', () => {
    const normalized = normalizeAnalysisResult({
      scan_type: 'super_health_v2',
      global_risk_score: 63,
      urgency_flag: true,
      analysis_summary: 'Please consult a doctor',
      disclaimer_text: 'This is not a diagnosis',
      detected_conditions: [
        {
          condition_name: 'Inflammation',
          category: 'General',
          probability: 82,
          severity: 'Élevée',
          explanation: 'Inflammatory markers look elevated',
          actionable_advice: 'Schedule a consultation',
        },
      ],
    });

    expect(normalized).toMatchObject({
      schema_version: 3,
      scan_type: 'super_health_v2',
      summary_key: 'medical_attention',
      summary_fallback_text: 'Please consult a doctor',
      disclaimer_key: 'medical_not_diagnosis',
      disclaimer_fallback_text: 'This is not a diagnosis',
      detected_conditions: [
        {
          condition_key: 'unknown',
          condition_fallback_text: 'Inflammation',
          category_key: 'general',
          severity_key: 'high',
          explanation_key: 'inflammatory_markers_look_elevated',
          advice_key: 'schedule_a_consultation',
        },
      ],
    });
  });

  it('preserves explicit super scan fallback text even when normalized keys remain generic', () => {
    const normalized = normalizeAnalysisResult({
      schema_version: 3,
      scan_type: 'super_health_v2',
      global_risk_score: 44,
      urgency_flag: false,
      summary_key: 'unknown',
      summary_fallback_text: 'Detailed webhook text that must stay visible',
      disclaimer_key: 'unknown',
      disclaimer_fallback_text: 'Custom disclaimer from provider',
      detected_conditions: [],
    });

    expect(normalized).toMatchObject({
      schema_version: 3,
      scan_type: 'super_health_v2',
      summary_key: 'unknown',
      summary_fallback_text: 'Detailed webhook text that must stay visible',
      disclaimer_key: 'unknown',
      disclaimer_fallback_text: 'Custom disclaimer from provider',
    });
  });

  it('preserves stored super scan text from analysis when analysis_summary is absent', () => {
    const normalized = normalizeAnalysisResult({
      scan_type: 'super_health_v2',
      global_risk_score: 51,
      urgency_flag: false,
      analysis: 'Detailed provider analysis kept from the historical payload',
      detected_conditions: [],
    } as any);

    expect(normalized).toMatchObject({
      scan_type: 'super_health_v2',
      summary_key: 'unknown',
      summary_fallback_text:
        'Detailed provider analysis kept from the historical payload',
    });
  });

  it('preserves stored super scan text from content and disclaimer aliases', () => {
    const normalized = normalizeAnalysisResult({
      scan_type: 'super_health_v2',
      globalRiskScore: 38,
      urgencyFlag: true,
      content: 'Detailed provider content kept from the historical payload',
      disclaimer: 'Custom provider disclaimer alias',
      detected_conditions: [],
    } as any);

    expect(normalized).toMatchObject({
      scan_type: 'super_health_v2',
      global_risk_score: 38,
      urgency_flag: true,
      summary_key: 'unknown',
      summary_fallback_text:
        'Detailed provider content kept from the historical payload',
      disclaimer_key: 'unknown',
      disclaimer_fallback_text: 'Custom provider disclaimer alias',
    });
  });

  it('preserves stored nested super scan text from result containers', () => {
    const normalized = normalizeAnalysisResult({
      scan_type: 'super_health_v2',
      result: {
        analysis: 'Nested provider analysis kept from the historical payload',
        disclaimer_text: 'Nested provider disclaimer',
        global_risk_score: 47,
        urgency_flag: true,
        detected_conditions: [],
      },
    } as any);

    expect(normalized).toMatchObject({
      scan_type: 'super_health_v2',
      global_risk_score: 47,
      urgency_flag: true,
      summary_key: 'unknown',
      summary_fallback_text:
        'Nested provider analysis kept from the historical payload',
      disclaimer_key: 'unknown',
      disclaimer_fallback_text: 'Nested provider disclaimer',
    });
  });

  it('prefers stored detailed analysis text over generic status labels', () => {
    const normalized = normalizeAnalysisResult({
      scan_type: 'super_health_v2',
      global_risk_score: 58,
      urgency_flag: false,
      status: 'À surveiller',
      analysis: 'Detailed analysis should still win over the status label',
      detected_conditions: [],
    } as any);

    expect(normalized).toMatchObject({
      scan_type: 'super_health_v2',
      summary_key: 'unknown',
      summary_fallback_text:
        'Detailed analysis should still win over the status label',
    });
  });

  it('preserves legacy condition explanation and advice text for unlocked rendering', () => {
    const normalized = normalizeAnalysisResult({
      scan_type: 'super_health_v2',
      global_risk_score: 28,
      urgency_flag: false,
      analysis_summary: 'Hydration looks stable overall',
      disclaimer_text: 'Informational only',
      detected_conditions: [
        {
          condition_name: 'Custom signal',
          category: 'Rare bucket',
          probability: 41,
          severity: 'Moderate',
          explanation: 'A detailed explanation from the webhook',
          actionable_advice: 'A detailed advice block from the webhook',
        },
      ],
    });

    expect(normalized).toMatchObject({
      detected_conditions: [
        {
          condition_key: 'unknown',
          condition_fallback_text: 'Custom signal',
          category_key: 'unknown',
          category_fallback_text: 'Rare bucket',
          severity_key: 'moderate',
          explanation_key: 'unknown',
          explanation_fallback_text: 'A detailed explanation from the webhook',
          advice_key: 'unknown',
          advice_fallback_text: 'A detailed advice block from the webhook',
        },
      ],
    });
  });

  it('revalidates schema v3 super scan keys instead of trusting arbitrary backend slugs', () => {
    const normalized = normalizeAnalysisResult({
      schema_version: 3,
      scan_type: 'super_health_v2',
      global_risk_score: 55,
      urgency_flag: false,
      summary_key: 'rare_summary',
      disclaimer_key: 'rare_disclaimer',
      detected_conditions: [
        {
          condition_key: 'inflammation',
          category_key: 'general',
          probability: 61,
          severity_key: 'high',
          explanation_key: 'rare_explanation',
          advice_key: 'rare_advice',
        },
      ],
    });

    expect(normalized).toMatchObject({
      schema_version: 3,
      scan_type: 'super_health_v2',
      summary_key: 'unknown',
      disclaimer_key: 'unknown',
      detected_conditions: [
        {
          condition_key: 'unknown',
          category_key: 'general',
          severity_key: 'high',
          explanation_key: 'unknown',
          advice_key: 'unknown',
        },
      ],
    });
  });

  it('normalizes the new fat distribution super scan without converting it to the legacy model', () => {
    const normalized = normalizeAnalysisResult(
      {
        scan_type: 'fat_distribution_scan_v2',
        result: {
          global_body_fat_estimate_percent: null,
          global_facial_fat_estimate_percent: null,
          global_water_retention_estimate_percent: 14.6,
          analysis_summary: 'Water retention looks mild overall',
          dominant_storage_pattern: 'lower_body',
          areas_analysis: [],
          priority_zones: [],
          disclaimer_text: 'Indicative only',
        },
      } as any,
      { expectedScanType: 'super' }
    );

    expect(normalized).toEqual({
      schema_version: 3,
      scan_type: 'fat_distribution_scan_v2',
      global_body_fat_estimate_percent: null,
      global_facial_fat_estimate_percent: null,
      global_water_retention_estimate_percent: 14.6,
      analysis_summary: 'Water retention looks mild overall',
      dominant_storage_pattern: 'lower_body',
      areas_analysis: [],
      priority_zones: [],
      disclaimer_text: 'Indicative only',
    });
  });

  it('preserves new fat distribution super scan arrays and nullable metrics as typed fields', () => {
    const normalized = normalizeAnalysisResult({
      scan_type: 'fat_distribution_scan_v2',
      global_body_fat_estimate_percent: '26.4',
      global_facial_fat_estimate_percent: '18.2',
      global_water_retention_estimate_percent: '12.8',
      analysis_summary: 'Distribution remains concentrated around the abdomen',
      dominant_storage_pattern: 'central',
      areas_analysis: [
        {
          area_name: 'abdomen',
          subcutaneous_fat_percent: 28,
          confidence: 0.92,
        },
      ],
      priority_zones: ['abdomen', { zone: 'flanks', priority: 'medium' }],
      disclaimer_text: 'Not a medical diagnosis',
    } as any);

    expect(normalized).toEqual({
      schema_version: 3,
      scan_type: 'fat_distribution_scan_v2',
      global_body_fat_estimate_percent: 26.4,
      global_facial_fat_estimate_percent: 18.2,
      global_water_retention_estimate_percent: 12.8,
      analysis_summary: 'Distribution remains concentrated around the abdomen',
      dominant_storage_pattern: 'central',
      areas_analysis: [
        {
          actionable_advice: '',
          area_name: 'abdomen',
          subcutaneous_fat_percent: 28,
          confidence: 0.92,
          definition_percent: 0,
          dominant_type: '',
          explanation: '',
          water_retention_percent: 0,
        },
      ],
      priority_zones: ['abdomen', 'flanks'],
      disclaimer_text: 'Not a medical diagnosis',
    });
  });

  it('extracts canonical keys from localized descriptor payloads without keeping free text', () => {
    const normalized = normalizeAnalysisResult({
      scan_type: 'nutrition',
      plate_health_score: 71,
      calories_estimate: 390,
      protein_grams: 19,
      carbs_grams: 34,
      fat_grams: 11,
      short_verdict_i18n: {
        translations: {
          fr: 'Repas Ã©quilibrÃ©',
          en: 'Balanced meal',
        },
      },
      glycemic_index_label_i18n: {
        translations: {
          fr: 'Faible',
        },
      },
      satiety_index: 7,
      ingredient_quality_i18n: {
        translations: {
          en: 'Natural',
        },
      },
      main_vitamins_i18n: {
        translations: {
          it: 'Vitamina A, Vitamina C',
        },
      },
    });

    expect(normalized).toEqual({
      schema_version: 4,
      scan_type: 'nutrition',
      analysis_meta: null,
      plate_health_score: 71,
      calories_estimate: 390,
      protein_grams: 19,
      carbs_grams: 34,
      fat_grams: 11,
      verdict_key: 'balanced',
      verdict_fallback_text: 'Balanced meal',
      glycemic_index_key: 'low',
      glycemic_index_fallback_text: 'Faible',
      satiety_index: 7,
      ingredient_quality_key: 'natural',
      ingredient_quality_fallback_text: 'Natural',
      main_vitamin_keys: ['vitamin_a', 'vitamin_c'],
      main_vitamins_fallback_text: 'Vitamina A, Vitamina C',
    });
  });

  it('preserves optional long nutrition text fields for the result screen', () => {
    const rawNutritionResult = {
      scan_type: 'nutrition' as const,
      plate_health_score: 71,
      calories_estimate: 390,
      protein_grams: 19,
      carbs_grams: 34,
      fat_grams: 11,
      short_verdict: 'Balanced meal',
      glycemic_index_label: 'Low',
      satiety_index: 7,
      ingredient_quality: 'Natural',
      main_vitamin_keys: ['vitamin_c', 'vitamin_a', 'magnesium'],
      main_vitamins_fallback_text:
        'Vitamin C, vitamin A and magnesium are visible from citrus, greens and seeds.',
      micronutrients_i18n: {
        translations: {
          en: 'Magnesium, potassium and vitamin C appear visually plausible.',
        },
      },
      nutrition_points:
        'High color variety, moderate starch load and a visible protein component.',
      recommendations:
        'Add extra leafy vegetables if this is intended to be a recovery meal.',
      food_details: 'Mostly whole foods with a small amount of processed sauce.',
      meal_analysis: 'The plate looks balanced but portion estimates remain visual.',
      estimated_composition:
        'Protein source plus complex carbs, vegetables and a light fat source.',
    };
    const normalized = normalizeAnalysisResult(rawNutritionResult);

    expect(normalized).toMatchObject({
      schema_version: 4,
      scan_type: 'nutrition',
      main_vitamin_keys: ['vitamin_c', 'vitamin_a', 'magnesium'],
      main_vitamins_fallback_text:
        'Vitamin C, vitamin A and magnesium are visible from citrus, greens and seeds.',
      micronutrients: 'Magnesium, potassium and vitamin C appear visually plausible.',
      nutrition_points:
        'High color variety, moderate starch load and a visible protein component.',
      recommendations:
        'Add extra leafy vegetables if this is intended to be a recovery meal.',
      dietary_details: 'Mostly whole foods with a small amount of processed sauce.',
      plate_analysis: 'The plate looks balanced but portion estimates remain visual.',
      estimated_composition:
        'Protein source plus complex carbs, vegetables and a light fat source.',
    });
  });

  it('throws on scan type mismatches when an expected scan type is provided', () => {
    expect(() =>
      normalizeAnalysisResult(
        {
          scan_type: 'nutrition',
          plate_health_score: 75,
          calories_estimate: 420,
          protein_grams: 20,
          carbs_grams: 33,
          fat_grams: 11,
          short_verdict: 'Balanced meal',
          glycemic_index_label: 'Low',
          satiety_index: 7,
          ingredient_quality: 'Natural',
          main_vitamins: 'A',
        },
        { expectedScanType: 'health' }
      )
    ).toThrow('Normalized analysis type mismatch');
  });

  it('parses analysis_meta on standard scans and clamps unsupported values', () => {
    const normalized = normalizeAnalysisResult({
      scan_type: 'face',
      face_score: 81,
      perceived_age: 28,
      skin_quality_score: 74,
      symmetry_percentage: 86,
      fatigue_level: 21,
      glow_index: 7,
      collagen_level: 62,
      hydration_level: 69,
      photogenic_score: 8,
      analysis_meta: {
        confidence_score: '110',
        imageQualityScore: '-4',
        metric_coverage_score: 72,
        limitation_flags: ['blur', 'unsupported_flag', 'blur'],
      },
    } as any);

    expect(normalized).toMatchObject({
      schema_version: 4,
      scan_type: 'face',
      analysis_meta: {
        confidence_score: 100,
        image_quality_score: 0,
        metric_coverage_score: 72,
        limitation_flags: ['blur'],
      },
    });
  });

  it('preserves optional extended face metrics from enriched analysis payloads', () => {
    const normalized = normalizeAnalysisResult({
      scan_type: 'face',
      face_score: 81,
      perceived_age: 28,
      skin_quality_score: 74,
      symmetry_percentage: 86,
      fatigue_level: 21,
      glow_index: 7,
      collagen_level: 62,
      hydration_level: 69,
      photogenic_score: 8,
      metrics: {
        skin_clarity_score: '84',
        skin_evenness_score: 78,
      },
      under_eye_shadow_score: 29,
      pore_visibility_score: 41,
      complexion_redness_score: 24,
      perceived_sleep_quality: 67,
    } as any);

    expect(normalized).toMatchObject({
      scan_type: 'face',
      skin_clarity_score: 84,
      skin_evenness_score: 78,
      under_eye_shadow_score: 29,
      pore_visibility_score: 41,
      complexion_redness_score: 24,
      perceived_sleep_quality: 67,
    });
  });
});
