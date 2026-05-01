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
      schema_version: 3,
      scan_type: 'face',
      face_score: 84,
    });
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
