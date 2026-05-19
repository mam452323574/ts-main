import { Phase2HttpError } from '@/supabase/functions/_shared/phase2Errors';
import {
  isStoredScanAnalysisComplete,
  normalizeScanAnalysisLanguage,
  resolveNormalizedScanAnalysisPayload,
} from '@/supabase/functions/_shared/scanAnalysis';

describe('scan analysis helpers', () => {
  it('normalizes SuperScan language requests to the six app languages', () => {
    expect(['fr', 'en', 'es', 'de', 'it', 'pt'].map(normalizeScanAnalysisLanguage)).toEqual([
      'fr',
      'en',
      'es',
      'de',
      'it',
      'pt',
    ]);

    expect(normalizeScanAnalysisLanguage('fr-FR')).toBe('fr');
    expect(normalizeScanAnalysisLanguage('en_US')).toBe('en');
    expect(normalizeScanAnalysisLanguage('de-DE')).toBe('de');
    expect(normalizeScanAnalysisLanguage('pt-BR')).toBe('pt');
    expect(normalizeScanAnalysisLanguage(undefined)).toBe('fr');
    expect(normalizeScanAnalysisLanguage('')).toBe('fr');
    expect(normalizeScanAnalysisLanguage(42)).toBe('fr');
    expect(normalizeScanAnalysisLanguage('nl')).toBe('fr');
  });

  it('normalizes provider payloads and preserves supported schema versions', () => {
    expect(
      resolveNormalizedScanAnalysisPayload(
        {
          success: true,
          data: {
            schema_version: 3,
            scan_type: 'face',
            face_score: 84,
          },
        },
        'health',
      ),
    ).toEqual({
      schema_version: 4,
      scan_type: 'face',
      face_score: 84,
      analysis_meta: null,
      face_shape: null,
      face_shape_key: null,
      face_shape_fallback_text: null,
      skin_clarity_score: null,
      under_eye_shadow_score: null,
      under_eye_volume_score: null,
      eye_openness_score: null,
      complexion_redness_score: null,
      pore_visibility_score: null,
      skin_evenness_score: null,
      skin_radiance_score: null,
      lip_dryness_score: null,
      forehead_smoothness_score: null,
      t_zone_oiliness_score: null,
      perceived_sex_key: null,
      perceived_age_range_key: null,
      perceived_stress_level: null,
      perceived_sleep_quality: null,
    });
  });

  it('sanitizes standard analysis_meta for coach-facing standard scans', () => {
    expect(
      resolveNormalizedScanAnalysisPayload(
        {
          success: true,
          data: {
            schema_version: 3,
            scan_type: 'nutrition',
            plate_health_score: 79,
            analysis_meta: {
              confidence_score: '105',
              imageQualityScore: '-2',
              metric_coverage_score: 68,
              limitation_flags: ['portion_uncertain', 'invalid_flag', 'portion_uncertain'],
            },
          },
        },
        'nutrition',
      ),
    ).toEqual({
      schema_version: 4,
      scan_type: 'nutrition',
      plate_health_score: 79,
      analysis_meta: {
        confidence_score: 100,
        image_quality_score: 0,
        metric_coverage_score: 68,
        limitation_flags: ['portion_uncertain'],
      },
      verdict_key: null,
      verdict_fallback_text: null,
      glycemic_index_key: null,
      glycemic_index_label: null,
      glycemic_index_fallback_text: null,
      ingredient_quality_key: null,
      ingredient_quality: null,
      ingredient_quality_fallback_text: null,
      main_vitamin_keys: [],
      main_vitamins: null,
      main_vitamins_fallback_text: null,
      short_verdict: null,
      fiber_grams_estimate: null,
      sugar_grams_estimate: null,
      processing_level_score: null,
      hydration_contribution_score: null,
      sodium_level_score: null,
      meal_balance_score: null,
      inflammation_index_score: null,
      meal_type_key: null,
      portion_size_key: null,
      color_diversity_score: null,
      vegetable_portion_ratio: null,
      protein_visibility_score: null,
      whole_grain_indicator_score: null,
      meal_freshness_score: null,
      cuisine_type_key: null,
      meat_type_key: null,
      cooking_method_key: null,
      meal_dietary_pattern_key: null,
      allergen_visibility_keys: [],
    });
  });

  it('surfaces nested provider error messages without changing the failure code', () => {
    try {
      resolveNormalizedScanAnalysisPayload(
        {
          success: false,
          data: {
            scan_type: 'error',
            message: 'Invalid scan response.',
          },
        },
        'health',
      );
      throw new Error('Expected resolveNormalizedScanAnalysisPayload to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(Phase2HttpError);
      expect((error as Phase2HttpError).status).toBe(502);
      expect((error as Phase2HttpError).code).toBe('analysis_failed');
      expect((error as Error).message).toBe('Invalid scan response.');
    }
  });

  it('accepts fat_distribution_scan_v2 for super scans without forcing legacy fields', () => {
    expect(
      resolveNormalizedScanAnalysisPayload(
        {
          success: true,
          data: {
            scan_type: 'fat_distribution_scan_v2',
            global_body_fat_estimate_percent: '24.5',
            global_facial_fat_estimate_percent: 11,
            global_water_retention_estimate_percent: '8',
            analysis_summary: 'Water retention concentrated in the face.',
            dominant_storage_pattern: 'upper_body',
            areas_analysis: [
              {
                area_name: 'Jawline',
                subcutaneous_fat_percent: '13.2',
                water_retention_percent: '18',
                definition_percent: 41,
                dominant_type: 'water_retention',
                confidence: '0.72',
                explanation: 'Soft tissue looks puffy.',
                actionable_advice: 'Hydrate consistently.',
                preserved_extra_field: 'keep-me',
              },
            ],
            priority_zones: ['Jawline', '', 5],
            disclaimer_text: 'Non medical estimate.',
            provider_extra_field: {
              keep: true,
            },
          },
        },
        'super',
      ),
    ).toEqual({
      scan_type: 'fat_distribution_scan_v2',
      schema_version: 3,
      global_body_fat_estimate_percent: 24.5,
      global_facial_fat_estimate_percent: 11,
      global_water_retention_estimate_percent: 8,
      analysis_summary: 'Water retention concentrated in the face.',
      dominant_storage_pattern: 'upper_body',
      areas_analysis: [
        {
          area_name: 'Jawline',
          subcutaneous_fat_percent: 13.2,
          water_retention_percent: 18,
          definition_percent: 41,
          dominant_type: 'water_retention',
          confidence: 0.72,
          explanation: 'Soft tissue looks puffy.',
          actionable_advice: 'Hydrate consistently.',
          preserved_extra_field: 'keep-me',
        },
      ],
      priority_zones: ['Jawline'],
      disclaimer_text: 'Non medical estimate.',
      provider_extra_field: {
        keep: true,
      },
    });
  });

  it('accepts partial fat distribution payloads for super scans and applies safe defaults', () => {
    expect(
      resolveNormalizedScanAnalysisPayload(
        {
          result: {
            dominant_storage_pattern: 'lower_body',
            areas_analysis: [
              {
                area_name: 'Abdomen',
                explanation: 'Primary storage area.',
              },
            ],
          },
        },
        'super',
      ),
    ).toEqual({
      scan_type: 'fat_distribution_scan_v2',
      schema_version: 3,
      global_body_fat_estimate_percent: null,
      global_facial_fat_estimate_percent: null,
      global_water_retention_estimate_percent: null,
      dominant_storage_pattern: 'lower_body',
      areas_analysis: [
        {
          area_name: 'Abdomen',
          subcutaneous_fat_percent: null,
          water_retention_percent: null,
          definition_percent: null,
          confidence: null,
          explanation: 'Primary storage area.',
        },
      ],
      priority_zones: [],
    });
  });

  it('rejects provider payloads whose analysis type does not match the reserved scan type', () => {
    expect(() =>
      resolveNormalizedScanAnalysisPayload(
        {
          success: true,
          data: {
            schema_version: 3,
            scan_type: 'body',
          },
        },
        'health',
      ),
    ).toThrow(Phase2HttpError);

    expect(() =>
      resolveNormalizedScanAnalysisPayload(
        {
          success: true,
          data: {
            schema_version: 3,
            scan_type: 'body',
          },
        },
        'health',
      ),
    ).toThrow('Expected face analysis for health, received body');
  });

  it('still rejects fat_distribution_scan_v2 when the reserved scan type is not super', () => {
    expect(() =>
      resolveNormalizedScanAnalysisPayload(
        {
          success: true,
          data: {
            scan_type: 'fat_distribution_scan_v2',
          },
        },
        'health',
      ),
    ).toThrow(Phase2HttpError);

    expect(() =>
      resolveNormalizedScanAnalysisPayload(
        {
          success: true,
          data: {
            scan_type: 'fat_distribution_scan_v2',
          },
        },
        'health',
      ),
    ).toThrow('Expected face analysis for health, received fat_distribution_scan_v2');
  });

  it('keeps supporting legacy super_health_v2 payloads for super scans', () => {
    expect(
      resolveNormalizedScanAnalysisPayload(
        {
          success: true,
          data: {
            scan_type: 'super_health_v2',
            global_risk_score: 52,
            urgency_flag: false,
            analysis: 'Legacy provider analysis',
            detected_conditions: [],
          },
        },
        'super',
      ),
    ).toEqual({
      scan_type: 'super_health_v2',
      schema_version: 3,
      global_risk_score: 52,
      urgency_flag: false,
      analysis_summary: 'Legacy provider analysis',
      detected_conditions: [],
    });
  });

  it('marks scans as already finalized only when both analysis_result and analyzed_at exist', () => {
    expect(
      isStoredScanAnalysisComplete({
        analysis_result: { scan_type: 'face' },
        analyzed_at: '2026-04-08T12:00:00.000Z',
      }),
    ).toBe(true);
    expect(
      isStoredScanAnalysisComplete({
        analysis_result: { scan_type: 'face' },
        analyzed_at: null,
      }),
    ).toBe(false);
    expect(
      isStoredScanAnalysisComplete({
        analysis_result: null,
        analyzed_at: '2026-04-08T12:00:00.000Z',
      }),
    ).toBe(false);
  });

  describe('S-05 — bornes contenu IA fat_distribution_scan_v2', () => {
    it('tronque analysis_summary aux 4000 premiers chars', () => {
      const longSummary = 'A'.repeat(50_000);

      const normalized = resolveNormalizedScanAnalysisPayload(
        {
          success: true,
          data: {
            scan_type: 'fat_distribution_scan_v2',
            global_water_retention_estimate_percent: 5,
            analysis_summary: longSummary,
            areas_analysis: [],
            priority_zones: [],
          },
        },
        'super',
      );

      expect(typeof normalized.analysis_summary).toBe('string');
      expect((normalized.analysis_summary as string).length).toBe(4000);
    });

    it('borne areas_analysis à 20 items et tronque les champs textuels par area', () => {
      const tooManyAreas = Array.from({ length: 100 }, (_, index) => ({
        area_name: `Area-${index}`,
        subcutaneous_fat_percent: 10,
        water_retention_percent: 10,
        definition_percent: 50,
        dominant_type: 'water_retention',
        confidence: 0.5,
        explanation: 'X'.repeat(10_000),
        actionable_advice: 'Y'.repeat(10_000),
      }));

      const normalized = resolveNormalizedScanAnalysisPayload(
        {
          success: true,
          data: {
            scan_type: 'fat_distribution_scan_v2',
            global_water_retention_estimate_percent: 5,
            analysis_summary: 'short',
            areas_analysis: tooManyAreas,
            priority_zones: [],
          },
        },
        'super',
      );

      const normalizedRecord = normalized as Record<string, unknown>;
      expect(Array.isArray(normalizedRecord.areas_analysis)).toBe(true);
      const areas = normalizedRecord.areas_analysis as Array<Record<string, unknown>>;
      expect(areas.length).toBe(20);
      for (const area of areas) {
        expect((area.explanation as string).length).toBeLessThanOrEqual(2000);
        expect((area.actionable_advice as string).length).toBeLessThanOrEqual(2000);
      }
    });

    it('borne priority_zones à 20 items et tronque chaque label', () => {
      const tooManyZones = Array.from({ length: 100 }, () => 'Z'.repeat(5_000));

      const normalized = resolveNormalizedScanAnalysisPayload(
        {
          success: true,
          data: {
            scan_type: 'fat_distribution_scan_v2',
            global_water_retention_estimate_percent: 5,
            analysis_summary: 'short',
            areas_analysis: [],
            priority_zones: tooManyZones,
          },
        },
        'super',
      );

      const normalizedRecord = normalized as Record<string, unknown>;
      expect(Array.isArray(normalizedRecord.priority_zones)).toBe(true);
      const zones = normalizedRecord.priority_zones as string[];
      expect(zones.length).toBe(20);
      for (const zone of zones) {
        expect(zone.length).toBeLessThanOrEqual(200);
      }
    });

    it('strippe les caractères de contrôle dans analysis_summary', () => {
      const summaryWithControlChars = 'Hello world';

      const normalized = resolveNormalizedScanAnalysisPayload(
        {
          success: true,
          data: {
            scan_type: 'fat_distribution_scan_v2',
            global_water_retention_estimate_percent: 5,
            analysis_summary: summaryWithControlChars,
            areas_analysis: [],
            priority_zones: [],
          },
        },
        'super',
      );

      expect(normalized.analysis_summary).toBe('Hello world');
    });

    it('borne aussi les champs de super_health_v2 (legacy)', () => {
      const longSummary = 'A'.repeat(50_000);

      const normalized = resolveNormalizedScanAnalysisPayload(
        {
          success: true,
          data: {
            scan_type: 'super_health_v2',
            schema_version: 3,
            global_risk_score: 50,
            urgency_flag: false,
            analysis_summary: longSummary,
            disclaimer_text: 'B'.repeat(10_000),
            detected_conditions: [],
          },
        },
        'super',
      );

      expect((normalized.analysis_summary as string).length).toBeLessThanOrEqual(4000);
      expect((normalized.disclaimer_text as string).length).toBeLessThanOrEqual(2000);
    });
  });
});
