import {
  normalizeScanAnalysisLanguage,
  resolveNormalizedScanAnalysisPayload,
} from './scanAnalysis.ts';

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
    throw new Error(
      `${message}. Expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

Deno.test('resolveNormalizedScanAnalysisPayload accepts the new fat distribution payload for SuperScan', () => {
  const result = resolveNormalizedScanAnalysisPayload(
    {
      scan_type: 'fat_distribution_scan_v2',
      global_body_fat_estimate_percent: '21.5',
      global_facial_fat_estimate_percent: 14,
      global_water_retention_estimate_percent: '9',
      analysis_summary: 'High water retention around the jawline.',
      dominant_storage_pattern: 'lower_body',
      areas_analysis: [
        {
          area_name: 'Abdomen',
          subcutaneous_fat_percent: '35.5',
          water_retention_percent: 7,
          definition_percent: '42',
          dominant_type: 'subcutaneous_fat',
          confidence: '0.83',
          explanation: 'Main storage area.',
          actionable_advice: 'Reduce sodium intake.',
          preserved_extra_field: 'keep-me',
        },
        'ignored',
      ],
      priority_zones: ['Abdomen', '', 12],
      disclaimer_text: 'Non medical estimate.',
      provider_extra_field: {
        keep: true,
      },
    },
    'super',
  ) as Record<string, unknown>;

  assertEquals(
    result.scan_type,
    'fat_distribution_scan_v2',
    'The new SuperScan payload should preserve its true scan type',
  );
  assertEquals(
    result.global_body_fat_estimate_percent,
    21.5,
    'Body fat estimate should be normalized to a finite number',
  );
  assertEquals(
    result.global_facial_fat_estimate_percent,
    14,
    'Facial fat estimate should be preserved',
  );
  assertEquals(
    result.global_water_retention_estimate_percent,
    9,
    'Water retention estimate should be normalized to a finite number',
  );
  assert(
    !('global_risk_score' in result),
    'The new payload should not synthesize legacy SuperScan score fields',
  );
  assert(
    Array.isArray(result.areas_analysis) && result.areas_analysis.length === 1,
    'Invalid area entries should be dropped while preserving the valid analysis rows',
  );
  const area = (result.areas_analysis as Record<string, unknown>[])[0];
  assertEquals(
    area.subcutaneous_fat_percent,
    35.5,
    'Area-level numeric fields should be normalized to finite numbers',
  );
  assertEquals(
    area.preserved_extra_field,
    'keep-me',
    'Unknown area-level fields should be preserved',
  );
  assertEquals(
    JSON.stringify(result.priority_zones),
    JSON.stringify(['Abdomen']),
    'Priority zones should be normalized to a trimmed string array',
  );
});

Deno.test('normalizeScanAnalysisLanguage supports the app languages with French fallback', () => {
  assertEquals(normalizeScanAnalysisLanguage('fr'), 'fr', 'French should pass through');
  assertEquals(normalizeScanAnalysisLanguage('en'), 'en', 'English should pass through');
  assertEquals(normalizeScanAnalysisLanguage('es'), 'es', 'Spanish should pass through');
  assertEquals(normalizeScanAnalysisLanguage('de'), 'de', 'German should pass through');
  assertEquals(normalizeScanAnalysisLanguage('it'), 'it', 'Italian should pass through');
  assertEquals(normalizeScanAnalysisLanguage('pt'), 'pt', 'Portuguese should pass through');
  assertEquals(normalizeScanAnalysisLanguage('fr-FR'), 'fr', 'Locales should resolve to base code');
  assertEquals(normalizeScanAnalysisLanguage('en_US'), 'en', 'Underscore locales should resolve to base code');
  assertEquals(normalizeScanAnalysisLanguage('pt-BR'), 'pt', 'Regional locales should resolve to base code');
  assertEquals(normalizeScanAnalysisLanguage(undefined), 'fr', 'Missing language should fall back to French');
  assertEquals(normalizeScanAnalysisLanguage('nl'), 'fr', 'Unsupported language should fall back to French');
});

Deno.test('resolveNormalizedScanAnalysisPayload preserves bounded qualitative fallback fields for standard scans', () => {
  const faceResult = resolveNormalizedScanAnalysisPayload(
    {
      scan_type: 'face',
      face_score: 81,
      perceived_age: 29,
      skin_quality_score: 74,
      symmetry_percentage: 88,
      fatigue_level: 18,
      glow_index: 7,
      face_shape: 'Oval\u0007',
      face_shape_key: 'oval',
      face_shape_fallback_text: 'Ovale',
      collagen_level: 62,
      hydration_level: 67,
      photogenic_score: 8,
    },
    'face',
  ) as Record<string, unknown>;

  assertEquals(
    faceResult.face_shape,
    'Oval',
    'Face shape text should be preserved after control-character sanitization',
  );
  assertEquals(
    faceResult.face_shape_key,
    'oval',
    'Face shape key should be preserved for storage',
  );
  assertEquals(
    faceResult.face_shape_fallback_text,
    'Ovale',
    'Face fallback text should be preserved for historical rendering',
  );

  const nutritionResult = resolveNormalizedScanAnalysisPayload(
    {
      scan_type: 'nutrition',
      plate_health_score: 82,
      calories_estimate: 640,
      protein_grams: 31,
      carbs_grams: 44,
      fat_grams: 19,
      verdict_key: 'energisant_mais_gras',
      verdict_fallback_text: 'Chef\u0007 special',
      glycemic_index_key: 'slow_release',
      glycemic_index_label: 'Slow release',
      glycemic_index_fallback_text: 'Slow release',
      satiety_index: 8,
      ingredient_quality_key: 'farm_fresh',
      ingredient_quality: 'Farm fresh',
      ingredient_quality_fallback_text: 'Farm fresh',
      main_vitamin_keys: ['Vitamin B3', '', 'Omega 3'],
      main_vitamins: 'Vitamin P',
      main_vitamins_fallback_text: 'A'.repeat(2_500),
      short_verdict: 'Balanced meal',
    },
    'nutrition',
  ) as Record<string, unknown>;

  assertEquals(
    nutritionResult.verdict_fallback_text,
    'Chef special',
    'Verdict fallback text should be sanitized and preserved',
  );
  assertEquals(
    nutritionResult.glycemic_index_fallback_text,
    'Slow release',
    'Glycemic fallback text should be preserved for storage',
  );
  assertEquals(
    nutritionResult.ingredient_quality_fallback_text,
    'Farm fresh',
    'Ingredient quality fallback text should be preserved for storage',
  );
  assertEquals(
    JSON.stringify(nutritionResult.main_vitamin_keys),
    JSON.stringify(['Vitamin B3', 'Omega 3']),
    'Vitamin key arrays should remain trimmed string arrays',
  );
  assertEquals(
    nutritionResult.main_vitamins,
    'Vitamin P',
    'Vitamin display text should be preserved for fallback rendering',
  );
  assertEquals(
    (nutritionResult.main_vitamins_fallback_text as string).length,
    2_000,
    'Long vitamin fallback text should be bounded before storage',
  );
});

Deno.test('resolveNormalizedScanAnalysisPayload accepts partial but clearly new SuperScan payloads', () => {
  const result = resolveNormalizedScanAnalysisPayload(
    {
      result: {
        dominant_storage_pattern: 'upper_body',
        areas_analysis: [
          {
            area_name: 'Jawline',
            explanation: 'Visible fluid retention.',
          },
        ],
      },
    },
    'super',
  ) as Record<string, unknown>;

  assertEquals(
    result.scan_type,
    'fat_distribution_scan_v2',
    'Marker-based SuperScan payloads should resolve to the new scan type',
  );
  assertEquals(
    result.global_body_fat_estimate_percent,
    null,
    'Missing top-level estimates should default to null on the new format',
  );
  assertEquals(
    result.global_facial_fat_estimate_percent,
    null,
    'Missing top-level facial estimates should default to null on the new format',
  );
  assertEquals(
    result.global_water_retention_estimate_percent,
    null,
    'Missing top-level water retention estimates should default to null on the new format',
  );
  assertEquals(
    JSON.stringify(result.priority_zones),
    JSON.stringify([]),
    'Missing priority zones should default to an empty array',
  );
  assert(
    Array.isArray(result.areas_analysis) && result.areas_analysis.length === 1,
    'Clearly new payloads should still keep partial areas analysis rows',
  );
  const area = (result.areas_analysis as Record<string, unknown>[])[0];
  assertEquals(
    area.water_retention_percent,
    null,
    'Missing area-level numeric fields should default to null',
  );
  assert(
    !('analysis_summary' in result),
    'Missing optional text fields should be omitted instead of being synthesized',
  );
});

Deno.test('resolveNormalizedScanAnalysisPayload adapts a simple SuperScan JSON text response', () => {
  const result = resolveNormalizedScanAnalysisPayload(
    {
      analysis: 'Detailed webhook analysis',
    },
    'super',
  ) as Record<string, unknown>;

  assertEquals(
    result.scan_type,
    'super_health_v2',
    'Simple SuperScan payloads should be synthesized into the expected scan type',
  );
  assertEquals(
    result.analysis_summary,
    'Detailed webhook analysis',
    'The detailed analysis text should be kept as the summary payload',
  );
});

Deno.test('resolveNormalizedScanAnalysisPayload adapts nested SuperScan JSON text responses', () => {
  const result = resolveNormalizedScanAnalysisPayload(
    {
      result: {
        analysis: 'Nested detailed webhook analysis',
      },
    },
    'super',
  ) as Record<string, unknown>;

  assertEquals(
    result.analysis_summary,
    'Nested detailed webhook analysis',
    'Nested analysis text should be extracted from result containers',
  );
});

Deno.test('resolveNormalizedScanAnalysisPayload accepts LLM-style content fields for SuperScan', () => {
  const result = resolveNormalizedScanAnalysisPayload(
    {
      content: 'LLM content response',
    },
    'super',
  ) as Record<string, unknown>;

  assertEquals(
    result.analysis_summary,
    'LLM content response',
    'LLM-style content fields should be mapped to the rendered SuperScan summary',
  );
});

Deno.test('resolveNormalizedScanAnalysisPayload canonicalizes SuperScan payloads that already include scan_type and analysis', () => {
  const result = resolveNormalizedScanAnalysisPayload(
    {
      scan_type: 'super_health_v2',
      global_risk_score: 52,
      urgency_flag: false,
      analysis: 'Detailed provider analysis',
      detected_conditions: [],
    },
    'super',
  ) as Record<string, unknown>;

  assertEquals(
    result.analysis_summary,
    'Detailed provider analysis',
    'Canonical SuperScan payloads should still map analysis into analysis_summary',
  );
  assertEquals(
    result.scan_type,
    'super_health_v2',
    'The canonicalized payload should preserve the SuperScan type',
  );
});

Deno.test('resolveNormalizedScanAnalysisPayload canonicalizes SuperScan payloads that already include scan_type and content', () => {
  const result = resolveNormalizedScanAnalysisPayload(
    {
      scan_type: 'super_health_v2',
      content: 'Detailed provider content',
      detected_conditions: [],
    },
    'super',
  ) as Record<string, unknown>;

  assertEquals(
    result.analysis_summary,
    'Detailed provider content',
    'Canonical SuperScan payloads should still map content into analysis_summary',
  );
});

Deno.test('resolveNormalizedScanAnalysisPayload canonicalizes nested SuperScan payloads that already include scan_type', () => {
  const result = resolveNormalizedScanAnalysisPayload(
    {
      scan_type: 'super_health_v2',
      result: {
        analysis: 'Nested provider analysis',
        detected_conditions: [],
      },
    },
    'super',
  ) as Record<string, unknown>;

  assertEquals(
    result.analysis_summary,
    'Nested provider analysis',
    'Nested provider analysis should still be promoted into analysis_summary',
  );
});

Deno.test('resolveNormalizedScanAnalysisPayload keeps supporting legacy SuperScan payloads after new-format support is added', () => {
  const result = resolveNormalizedScanAnalysisPayload(
    {
      data: {
        scan_type: 'super_health_v2',
        global_risk_score: 52,
        urgency_flag: false,
        analysis: 'Legacy provider analysis',
        detected_conditions: [],
      },
    },
    'super',
  ) as Record<string, unknown>;

  assertEquals(
    result.scan_type,
    'super_health_v2',
    'Legacy payloads should keep their legacy scan type',
  );
  assertEquals(
    result.analysis_summary,
    'Legacy provider analysis',
    'Legacy payloads should continue mapping free-text analysis into analysis_summary',
  );
});

Deno.test('resolveNormalizedScanAnalysisPayload prefers detailed SuperScan text over status labels', () => {
  const result = resolveNormalizedScanAnalysisPayload(
    {
      status: 'a surveiller',
      analysis: 'Detailed text should win',
    },
    'super',
  ) as Record<string, unknown>;

  assertEquals(
    result.analysis_summary,
    'Detailed text should win',
    'Detailed analysis text should win over generic status labels',
  );
});

Deno.test('resolveNormalizedScanAnalysisPayload prefers detailed text over status when scan_type is already present', () => {
  const result = resolveNormalizedScanAnalysisPayload(
    {
      scan_type: 'super_health_v2',
      status: 'a surveiller',
      analysis: 'Detailed text should still win',
      detected_conditions: [],
    },
    'super',
  ) as Record<string, unknown>;

  assertEquals(
    result.analysis_summary,
    'Detailed text should still win',
    'Detailed analysis text should still win over status labels on canonical payloads',
  );
});

Deno.test('resolveNormalizedScanAnalysisPayload accepts raw text responses for SuperScan', () => {
  const result = resolveNormalizedScanAnalysisPayload(
    null,
    'super',
    'Raw provider text response',
  ) as Record<string, unknown>;

  assertEquals(
    result.analysis_summary,
    'Raw provider text response',
    'Raw non-JSON provider text should become the SuperScan summary',
  );
  assert(
    Array.isArray(result.detected_conditions),
    'Synthesized SuperScan payloads should keep a detected_conditions array',
  );
});
