import {
  buildCoachPayload,
  fetchCoachEntries,
  fetchCoachHistoryPage,
  fetchCoachHistorySummary,
  fetchLatestReadyCoachEntry,
  fetchRecentCoachScans,
  generateCoachGuidance,
  getCoachEntryFailureDebugInfo,
  getCoachQuotaFromError,
  resolveCoachFailureKindFromEntry,
  resolveCoachFailureKindFromError,
  isCoachQuotaExhaustedError,
  CoachServiceError,
} from '@/services/coach';
import { DEFAULT_COACH_PERSONA_KEY } from '@/shared/coachPersonas';
import type { CoachGuidancePayload, CoachScanDigest } from '@/types';

const { supabase } = jest.requireMock('@/services/supabase') as {
  supabase: {
    from: jest.Mock;
    rpc: jest.Mock;
    auth: {
      getSession: jest.Mock;
    };
  };
};

describe('coach service', () => {
  const originalFetch = global.fetch;
  const originalSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    supabase.auth.getSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'token-123',
        },
      },
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.EXPO_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
  });

  function createScansSelectMock(data: unknown[], error: unknown = null) {
    const queryChain: any = {
      limit: jest.fn((limit: number) =>
        Promise.resolve({
          data: error ? null : data.slice(0, limit),
          error,
        }),
      ),
      range: jest.fn((from: number, to: number) =>
        Promise.resolve({
          data: error ? null : data.slice(from, to + 1),
          error,
        }),
      ),
    };
    queryChain.order = jest.fn(() => queryChain);

    return {
      select: jest.fn(() => queryChain),
    };
  }

  function createCoachEntriesSelectMock(data: unknown, error: unknown = null) {
    const queryResult = {
      data,
      error,
    };
    const queryChain: any = {
      data,
      error,
      limit: jest.fn().mockResolvedValue(queryResult),
    };
    queryChain.order = jest.fn(() => queryChain);

    return {
      select: jest.fn(() => queryChain),
    };
  }

  function createCoachHistoryRow(
    id: string,
    overrides: Record<string, unknown> = {},
  ) {
    return {
      id,
      title: `Coach title ${id}`,
      body: `Coach body ${id}`,
      disclaimer:
        'Wellness guidance only. This is not a diagnosis or medical advice.',
      persona_key: 'gentle_supportive',
      cta_label: null,
      cta_route: null,
      created_at: '2026-04-06T08:00:00.000Z',
      generated_at: '2026-04-06T08:00:00.000Z',
      source: 'n8n',
      status: 'ready',
      user_id: 'user-1',
      cache_key: `cache-${id}`,
      input_hash: `hash-${id}`,
      request_payload_json: {},
      response_payload_json: {},
      expires_at: null,
      locale: null,
      error_code: null,
      ...overrides,
    };
  }

  function createLatestEntrySelectMock(
    data: unknown,
    onEq: jest.Mock = jest.fn(),
    error: unknown = null,
    onIs: jest.Mock = jest.fn(),
  ) {
    const maybeSingle = jest.fn().mockResolvedValue({
      data,
      error,
    });
    const filterChain: any = {
      eq: jest.fn((field: string, value: unknown) => {
        onEq(field, value);
        return filterChain;
      }),
      is: jest.fn((field: string, value: unknown) => {
        onIs(field, value);
        return filterChain;
      }),
      not: jest.fn(() => filterChain),
      neq: jest.fn(() => filterChain),
      order: jest.fn(() => ({
        order: jest.fn(() => ({
          limit: jest.fn(() => ({
            maybeSingle,
          })),
        })),
      })),
    };

    return {
      select: jest.fn(() => filterChain),
    };
  }

  function createFaceScanRow(
    id: string,
    analyzedAt: string,
    analysisOverrides: Record<string, unknown> = {},
  ) {
    return {
      id,
      scan_type: 'health',
      created_at: analyzedAt,
      analyzed_at: analyzedAt,
      analysis_result: {
        schema_version: 3,
        scan_type: 'face',
        face_score: 87,
        perceived_age: 28,
        skin_quality_score: 80,
        symmetry_percentage: 88,
        fatigue_level: 22,
        glow_index: 61,
        energy_score: 73,
        face_shape_key: 'oval',
        collagen_level: 64,
        hydration_level: 70,
        photogenic_score: 86,
        ...analysisOverrides,
      },
    };
  }

  function createBodyScanRow(
    id: string,
    analyzedAt: string,
    analysisOverrides: Record<string, unknown> = {},
  ) {
    return {
      id,
      scan_type: 'body',
      created_at: analyzedAt,
      analyzed_at: analyzedAt,
      analysis_result: {
        schema_version: 3,
        scan_type: 'body',
        body_score: 81,
        body_fat_percentage: 19,
        muscle_mass_key: 'balanced',
        body_type_key: 'athletic',
        posture_score: 78,
        waist_estimation_cm: 82,
        strength_index: 74,
        body_symmetry: 77,
        bmi_estimate: 23,
        metabolic_age: 31,
        ...analysisOverrides,
      },
    };
  }

  function createNutritionScanRow(
    id: string,
    analyzedAt: string,
    analysisOverrides: Record<string, unknown> = {},
  ) {
    return {
      id,
      scan_type: 'nutrition',
      created_at: analyzedAt,
      analyzed_at: analyzedAt,
      analysis_result: {
        schema_version: 3,
        scan_type: 'nutrition',
        plate_health_score: 91,
        calories_estimate: 540,
        protein_grams: 32,
        carbs_grams: 44,
        fat_grams: 16,
        verdict_key: 'balanced',
        glycemic_index_key: 'low',
        satiety_index: 9,
        ingredient_quality_key: 'natural',
        main_vitamin_keys: ['vitamin_a', 'vitamin_c'],
        ...analysisOverrides,
      },
    };
  }

  function createSuperScanRow(
    id: string,
    analyzedAt: string,
    analysisOverrides: Record<string, unknown> = {},
  ) {
    return {
      id,
      scan_type: 'super',
      created_at: analyzedAt,
      analyzed_at: analyzedAt,
      analysis_result: {
        schema_version: 3,
        scan_type: 'super_health_v2',
        global_risk_score: 52,
        urgency_flag: false,
        summary_key: 'medical_attention',
        disclaimer_key: 'medical_not_diagnosis',
        detected_conditions: [
          {
            condition_key: 'unknown',
            category_key: 'general',
            probability: 61,
            severity_key: 'moderate',
            explanation_key: 'unknown',
            advice_key: 'unknown',
          },
        ],
        ...analysisOverrides,
      },
    };
  }

  function createFatDistributionSuperScanRow(
    id: string,
    analyzedAt: string,
    analysisOverrides: Record<string, unknown> = {},
  ) {
    return {
      id,
      scan_type: 'super',
      created_at: analyzedAt,
      analyzed_at: analyzedAt,
      analysis_result: {
        scan_type: 'fat_distribution_scan_v2',
        regions: [],
        ...analysisOverrides,
      },
    };
  }

  async function buildPayloadFromRows(
    promptType: Parameters<typeof buildCoachPayload>[0],
    rows: unknown[],
  ) {
    supabase.from.mockReturnValue(createScansSelectMock(rows));
    const scans = await fetchRecentCoachScans();
    return buildCoachPayload(promptType, scans);
  }

  function getLegacyPayloadBlock(
    payload: Awaited<ReturnType<typeof buildPayloadFromRows>>,
  ) {
    return {
      prompt_type: payload.prompt_type,
      generated_at: payload.generated_at,
      scan_count_7d: payload.scan_count_7d,
      selected_scan: payload.selected_scan,
      recent_scans: payload.recent_scans,
      ...(payload.by_type ? { by_type: payload.by_type } : {}),
    };
  }

  function expectLegacyDigestShape(digest: CoachScanDigest | null) {
    if (!digest) {
      return;
    }

    expect(Object.keys(digest).sort()).toEqual([
      'captured_at',
      'metrics',
      'normalized_scan_type',
      'scan_id',
      'scan_type',
    ]);
    expect(digest).not.toHaveProperty('analysis_result_normalized');
    expect(digest).not.toHaveProperty('key_metrics');
    expect(digest).not.toHaveProperty('raw_fallback_fields');
    expect(digest).not.toHaveProperty('coach_relevant_flags');
  }

  const recentScans = [
    createFaceScanRow('scan-face', '2026-04-06T10:05:00.000Z'),
  ];

  function readConditionTextEntries(
    rawFallbackFields: CoachGuidancePayload['latest_scan'] extends infer T
      ? T extends { raw_fallback_fields: infer R }
        ? R
        : never
      : never,
  ) {
    if (
      !rawFallbackFields ||
      typeof rawFallbackFields !== 'object' ||
      !('condition_texts' in rawFallbackFields)
    ) {
      return [] as Record<string, unknown>[];
    }

    const conditionTexts = (rawFallbackFields as Record<string, unknown>).condition_texts;
    return Array.isArray(conditionTexts)
      ? (conditionTexts as Record<string, unknown>[])
      : [];
  }

  it('keeps the legacy payload block byte-for-byte compatible in shape while adding v2 fields separately', async () => {
    const dateNowSpy = jest
      .spyOn(Date, 'now')
      .mockReturnValue(new Date('2026-04-07T12:00:00.000Z').getTime());

    try {
      const payload = await buildPayloadFromRows('weekly_plan', [
        createFaceScanRow('scan-face', '2026-04-07T10:00:00.000Z'),
        createBodyScanRow('scan-body', '2026-04-07T09:00:00.000Z'),
        createNutritionScanRow('scan-food', '2026-04-07T08:00:00.000Z'),
        createSuperScanRow('scan-super', '2026-04-07T07:00:00.000Z'),
      ]);

      const legacyBlock = getLegacyPayloadBlock(payload);

      expect(legacyBlock).toEqual({
        prompt_type: 'weekly_plan',
        generated_at: expect.any(String),
        scan_count_7d: 4,
        selected_scan: {
          scan_id: 'scan-face',
          scan_type: 'health',
          captured_at: '2026-04-07T10:00:00.000Z',
          normalized_scan_type: 'face',
          metrics: {
            face_score: 87,
            perceived_age: 28,
            symmetry_percentage: 88,
            fatigue_level: 22,
            glow_index: 61,
            hydration_level: 70,
            skin_clarity_score: null,
            under_eye_shadow_score: null,
            skin_radiance_score: null,
            lip_dryness_score: null,
            perceived_sex_key: null,
            perceived_age_range_key: null,
            perceived_stress_level: null,
            perceived_sleep_quality: null,
          },
        },
        recent_scans: [
          {
            scan_id: 'scan-face',
            scan_type: 'health',
            captured_at: '2026-04-07T10:00:00.000Z',
            normalized_scan_type: 'face',
            metrics: {
              face_score: 87,
              perceived_age: 28,
              symmetry_percentage: 88,
              fatigue_level: 22,
              glow_index: 61,
              hydration_level: 70,
              skin_clarity_score: null,
              under_eye_shadow_score: null,
              skin_radiance_score: null,
              lip_dryness_score: null,
              perceived_sex_key: null,
              perceived_age_range_key: null,
              perceived_stress_level: null,
              perceived_sleep_quality: null,
            },
          },
          {
            scan_id: 'scan-body',
            scan_type: 'body',
            captured_at: '2026-04-07T09:00:00.000Z',
            normalized_scan_type: 'body',
            metrics: {
              body_score: 81,
              body_fat_percentage: 19,
              muscle_mass_key: 'balanced',
              body_type_key: 'athletic',
              posture_score: 78,
              strength_index: 74,
              muscle_definition_score: null,
              v_taper_score: null,
              perceived_sex_key: null,
              perceived_age_range_key: null,
              estimated_height_range_key: null,
              estimated_weight_range_key: null,
              body_frame_key: null,
              perceived_fitness_level_key: null,
            },
          },
          {
            scan_id: 'scan-food',
            scan_type: 'nutrition',
            captured_at: '2026-04-07T08:00:00.000Z',
            normalized_scan_type: 'nutrition',
            metrics: {
              plate_health_score: 91,
              calories_estimate: 540,
              protein_grams: 32,
              carbs_grams: 44,
              fat_grams: 16,
              verdict_key: 'balanced',
              glycemic_index_key: 'low',
              fiber_grams_estimate: null,
              sugar_grams_estimate: null,
              processing_level_score: null,
              meal_type_key: null,
              color_diversity_score: null,
              vegetable_portion_ratio: null,
              cuisine_type_key: null,
              cooking_method_key: null,
              meal_dietary_pattern_key: null,
              allergen_visibility_keys: [],
            },
          },
          {
            scan_id: 'scan-super',
            scan_type: 'super',
            captured_at: '2026-04-07T07:00:00.000Z',
            normalized_scan_type: 'super_health_v2',
            metrics: {
              global_risk_score: 52,
              urgency_flag: false,
              summary_key: 'medical_attention',
              detected_conditions: [
                {
                  condition_key: 'unknown',
                  severity_key: 'moderate',
                  probability: 61,
                },
              ],
            },
          },
        ],
        by_type: {
          health: {
            scan_id: 'scan-face',
            scan_type: 'health',
            captured_at: '2026-04-07T10:00:00.000Z',
            normalized_scan_type: 'face',
            metrics: {
              face_score: 87,
              perceived_age: 28,
              symmetry_percentage: 88,
              fatigue_level: 22,
              glow_index: 61,
              hydration_level: 70,
              skin_clarity_score: null,
              under_eye_shadow_score: null,
              skin_radiance_score: null,
              lip_dryness_score: null,
              perceived_sex_key: null,
              perceived_age_range_key: null,
              perceived_stress_level: null,
              perceived_sleep_quality: null,
            },
          },
          body: {
            scan_id: 'scan-body',
            scan_type: 'body',
            captured_at: '2026-04-07T09:00:00.000Z',
            normalized_scan_type: 'body',
            metrics: {
              body_score: 81,
              body_fat_percentage: 19,
              muscle_mass_key: 'balanced',
              body_type_key: 'athletic',
              posture_score: 78,
              strength_index: 74,
              muscle_definition_score: null,
              v_taper_score: null,
              perceived_sex_key: null,
              perceived_age_range_key: null,
              estimated_height_range_key: null,
              estimated_weight_range_key: null,
              body_frame_key: null,
              perceived_fitness_level_key: null,
            },
          },
          nutrition: {
            scan_id: 'scan-food',
            scan_type: 'nutrition',
            captured_at: '2026-04-07T08:00:00.000Z',
            normalized_scan_type: 'nutrition',
            metrics: {
              plate_health_score: 91,
              calories_estimate: 540,
              protein_grams: 32,
              carbs_grams: 44,
              fat_grams: 16,
              verdict_key: 'balanced',
              glycemic_index_key: 'low',
              fiber_grams_estimate: null,
              sugar_grams_estimate: null,
              processing_level_score: null,
              meal_type_key: null,
              color_diversity_score: null,
              vegetable_portion_ratio: null,
              cuisine_type_key: null,
              cooking_method_key: null,
              meal_dietary_pattern_key: null,
              allergen_visibility_keys: [],
            },
          },
          super: {
            scan_id: 'scan-super',
            scan_type: 'super',
            captured_at: '2026-04-07T07:00:00.000Z',
            normalized_scan_type: 'super_health_v2',
            metrics: {
              global_risk_score: 52,
              urgency_flag: false,
              summary_key: 'medical_attention',
              detected_conditions: [
                {
                  condition_key: 'unknown',
                  severity_key: 'moderate',
                  probability: 61,
                },
              ],
            },
          },
        },
      });

      expectLegacyDigestShape(payload.selected_scan);
      payload.recent_scans.forEach((digest) => expectLegacyDigestShape(digest));
      Object.values(payload.by_type ?? {}).forEach((digest) =>
        expectLegacyDigestShape(digest),
      );

      expect(payload).toEqual(
        expect.objectContaining({
          payload_version: 2,
          latest_scan: expect.any(Object),
          prior_scans: expect.any(Array),
          latest_by_type: expect.any(Object),
          comparison_to_previous: expect.any(Object),
          trend_summary: expect.any(Object),
        }),
      );
    } finally {
      dateNowSpy.mockRestore();
    }
  });

  it('preserves legacy coach payload fields while adding payload v2 rich context', async () => {
    const dateNowSpy = jest
      .spyOn(Date, 'now')
      .mockReturnValue(new Date('2026-04-06T12:00:00.000Z').getTime());

    try {
      const payload = await buildPayloadFromRows('nutrition_focus', [
        createBodyScanRow('scan-body', '2026-04-06T09:00:00.000Z'),
        createNutritionScanRow('scan-food', '2026-04-06T10:00:00.000Z'),
      ]);

      expect(payload.payload_version).toBe(2);
      expect(payload.prompt_type).toBe('nutrition_focus');
      expect(payload.selected_scan?.scan_id).toBe('scan-food');
      expect(payload.recent_scans).toHaveLength(2);
      expect(payload.generated_at).toEqual(expect.any(String));
      expect(payload.scan_count_7d).toBe(2);
      expect(payload.latest_scan?.scan_id).toBe('scan-food');
      expect(payload.prior_scans).toHaveLength(1);
      expect(payload.latest_by_type.health).toBeNull();
      expect(payload.latest_by_type.body?.scan_id).toBe('scan-body');
      expect(payload.latest_by_type.nutrition?.scan_id).toBe('scan-food');
      expect(payload.latest_by_type.super).toBeNull();
      expect(payload.comparison_to_previous.available).toBe(false);
      expect(payload.trend_summary.available).toBe(false);
    } finally {
      dateNowSpy.mockRestore();
    }
  });

  it('builds a rich latest_scan context for health scans', async () => {
    const payload = await buildPayloadFromRows('face_focus', [
      createFaceScanRow('scan-face', '2026-04-07T10:00:00.000Z', {
        glow_index: 66,
        energy_score: 77,
        hydration_level: 72,
      }),
    ]);

    expect(payload.latest_scan).toMatchObject({
      scan_id: 'scan-face',
      scan_type: 'health',
      normalized_scan_type: 'face',
      key_metrics: {
        face_score: 87,
        perceived_age: 28,
        skin_quality_score: 80,
        symmetry_percentage: 88,
        fatigue_level: 22,
        glow_index: 66,
        energy_score: 77,
        face_shape_key: 'oval',
        collagen_level: 64,
        hydration_level: 72,
        photogenic_score: 86,
      },
    });
  });

  it('builds a rich latest_scan context for body scans', async () => {
    const payload = await buildPayloadFromRows('body_focus', [
      createBodyScanRow('scan-body', '2026-04-07T11:00:00.000Z'),
    ]);

    expect(payload.latest_scan).toMatchObject({
      scan_id: 'scan-body',
      scan_type: 'body',
      normalized_scan_type: 'body',
      key_metrics: {
        body_score: 81,
        body_fat_percentage: 19,
        muscle_mass_key: 'balanced',
        body_type_key: 'athletic',
        posture_score: 78,
        waist_estimation_cm: 82,
        strength_index: 74,
        body_symmetry: 77,
        bmi_estimate: 23,
        metabolic_age: 31,
      },
    });
  });

  it('builds a rich latest_scan context for nutrition scans', async () => {
    const payload = await buildPayloadFromRows('nutrition_focus', [
      createNutritionScanRow('scan-food', '2026-04-07T12:00:00.000Z'),
    ]);

    expect(payload.latest_scan).toMatchObject({
      scan_id: 'scan-food',
      scan_type: 'nutrition',
      normalized_scan_type: 'nutrition',
      key_metrics: {
        plate_health_score: 91,
        calories_estimate: 540,
        protein_grams: 32,
        carbs_grams: 44,
        fat_grams: 16,
        verdict_key: 'balanced',
        glycemic_index_key: 'low',
        satiety_index: 9,
        ingredient_quality_key: 'natural',
        main_vitamin_keys: ['vitamin_a', 'vitamin_c'],
      },
    });
  });

  it('builds a rich latest_scan context for super scans', async () => {
    const payload = await buildPayloadFromRows('latest_scan', [
      createSuperScanRow('scan-super', '2026-04-07T13:00:00.000Z', {
        global_risk_score: 74,
        urgency_flag: true,
        detected_conditions: [
          {
            condition_key: 'unknown',
            category_key: 'general',
            probability: 88,
            severity_key: 'high',
            explanation_key: 'unknown',
            advice_key: 'unknown',
          },
        ],
      }),
    ]);

    expect(payload.latest_scan).toMatchObject({
      scan_id: 'scan-super',
      scan_type: 'super',
      normalized_scan_type: 'super_health_v2',
      key_metrics: {
        global_risk_score: 74,
        urgency_flag: true,
        summary_key: 'medical_attention',
        disclaimer_key: 'medical_not_diagnosis',
      },
      coach_relevant_flags: expect.arrayContaining([
        'high_risk_scan',
        'urgent_attention_flag',
      ]),
    });
    expect(payload.latest_scan?.key_metrics).toMatchObject({
      detected_conditions: [
        expect.objectContaining({
          condition_key: 'unknown',
          severity_key: 'high',
          probability: 88,
        }),
      ],
    });
  });

  it('bypasses fat_distribution_scan_v2 so Coach falls back to the latest supported scan', async () => {
    const payload = await buildPayloadFromRows('latest_scan', [
      createFatDistributionSuperScanRow('scan-super-fat', '2026-04-07T13:30:00.000Z'),
      createFaceScanRow('scan-face', '2026-04-07T12:00:00.000Z'),
    ]);

    expect(payload.selected_scan?.scan_id).toBe('scan-face');
    expect(payload.latest_scan?.scan_id).toBe('scan-face');
    expect(payload.latest_by_type.super).toBeNull();
    expect(payload.recent_scans.map((scan) => scan.scan_id)).toEqual(['scan-face']);
  });

  it('paginates beyond unusable rows until it finds a usable coach scan', async () => {
    const unusableRows = Array.from({ length: 32 }, (_, index) =>
      createFatDistributionSuperScanRow(
        `scan-fat-${index}`,
        `2026-04-${String(28 - Math.min(index, 27)).padStart(2, '0')}T10:00:00.000Z`,
      ),
    );

    supabase.from.mockReturnValue(
      createScansSelectMock([
        ...unusableRows,
        createFaceScanRow('scan-old-but-usable', '2025-01-01T10:00:00.000Z'),
      ]),
    );

    const scans = await fetchRecentCoachScans();
    const payload = buildCoachPayload('latest_scan', scans);

    expect(payload.selected_scan?.scan_id).toBe('scan-old-but-usable');
    expect(payload.recent_scans.map((scan) => scan.scan_id)).toEqual([
      'scan-old-but-usable',
    ]);
  });

  it('returns an empty recent scan list only after exhausting unusable scan rows', async () => {
    supabase.from.mockReturnValue(
      createScansSelectMock([
        createFatDistributionSuperScanRow(
          'scan-fat-only',
          '2026-04-07T13:30:00.000Z',
        ),
      ]),
    );

    await expect(fetchRecentCoachScans()).resolves.toEqual([]);
  });

  it('builds comparison_to_previous when two comparable scans of the same type exist', async () => {
    const payload = await buildPayloadFromRows('face_focus', [
      createFaceScanRow('scan-face-2', '2026-04-07T10:00:00.000Z', {
        face_score: 90,
        fatigue_level: 20,
        hydration_level: 72,
      }),
      createFaceScanRow('scan-face-1', '2026-04-06T10:00:00.000Z', {
        face_score: 84,
        fatigue_level: 26,
        hydration_level: 63,
      }),
    ]);

    expect(payload.comparison_to_previous).toMatchObject({
      available: true,
      compared_scan_id: 'scan-face-1',
    });
    expect(payload.comparison_to_previous.metric_deltas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metric: 'face_score',
          current_value: 90,
          previous_value: 84,
          delta: 6,
          direction: 'up',
          interpretation_hint: 'higher_is_better',
        }),
        expect.objectContaining({
          metric: 'fatigue_level',
          current_value: 20,
          previous_value: 26,
          delta: -6,
          direction: 'down',
          interpretation_hint: 'lower_is_better',
        }),
      ]),
    );
    expect(payload.latest_scan?.coach_relevant_flags).toEqual(
      expect.arrayContaining(['has_recent_improvement']),
    );
  });

  it('marks comparison_to_previous unavailable when no previous same-type scan exists', async () => {
    const payload = await buildPayloadFromRows('body_focus', [
      createBodyScanRow('scan-body', '2026-04-07T11:00:00.000Z'),
      createNutritionScanRow('scan-food', '2026-04-07T10:00:00.000Z'),
    ]);

    expect(payload.comparison_to_previous).toEqual({
      available: false,
      compared_scan_id: null,
      metric_deltas: [],
    });
  });

  it('does not fabricate a trend summary without at least three same-type scans', async () => {
    const payload = await buildPayloadFromRows('nutrition_focus', [
      createNutritionScanRow('scan-food-2', '2026-04-07T12:00:00.000Z', {
        protein_grams: 26,
      }),
      createNutritionScanRow('scan-food-1', '2026-04-06T12:00:00.000Z', {
        protein_grams: 24,
      }),
    ]);

    expect(payload.trend_summary).toEqual({
      available: false,
      scan_type: 'nutrition',
      summary_flags: [],
      score_trend: null,
      metric_trends: [],
    });
  });

  it('builds a simple trend summary when three same-type scans support it', async () => {
    const payload = await buildPayloadFromRows('face_focus', [
      createFaceScanRow('scan-face-3', '2026-04-07T10:00:00.000Z', {
        face_score: 90,
        fatigue_level: 20,
        hydration_level: 72,
      }),
      createFaceScanRow('scan-face-2', '2026-04-06T10:00:00.000Z', {
        face_score: 86,
        fatigue_level: 24,
        hydration_level: 68,
      }),
      createFaceScanRow('scan-face-1', '2026-04-05T10:00:00.000Z', {
        face_score: 82,
        fatigue_level: 28,
        hydration_level: 64,
      }),
    ]);

    expect(payload.trend_summary).toMatchObject({
      available: true,
      scan_type: 'health',
      summary_flags: expect.arrayContaining([
        'score_improving',
        'fatigue_decreasing',
        'hydration_increasing',
      ]),
      score_trend: {
        metric: 'face_score',
        current_value: 90,
        previous_value: 82,
        delta: 8,
        direction: 'up',
        interpretation_hint: 'higher_is_better',
        sample_count: 3,
      },
    });
    expect(payload.trend_summary.metric_trends).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metric: 'fatigue_level',
          current_value: 20,
          previous_value: 28,
          delta: -8,
          direction: 'down',
          sample_count: 3,
        }),
        expect.objectContaining({
          metric: 'hydration_level',
          current_value: 72,
          previous_value: 64,
          delta: 8,
          direction: 'up',
          sample_count: 3,
        }),
      ]),
    );
  });

  it('serializes the enriched payload and keeps weekly_plan compatibility', async () => {
    const payload = await buildPayloadFromRows('weekly_plan', [
      createFaceScanRow('scan-face', '2026-04-07T10:00:00.000Z'),
      createBodyScanRow('scan-body', '2026-04-07T09:00:00.000Z'),
      createNutritionScanRow('scan-food', '2026-04-07T08:00:00.000Z'),
      createSuperScanRow('scan-super', '2026-04-07T07:00:00.000Z'),
    ]);

    const serialized = JSON.stringify(payload);

    expect(serialized).toContain('"payload_version":2');
    expect(Object.keys(payload.latest_by_type).sort()).toEqual([
      'body',
      'health',
      'nutrition',
      'super',
    ]);
    expect(payload.by_type).toMatchObject({
      health: expect.objectContaining({ scan_id: 'scan-face' }),
      body: expect.objectContaining({ scan_id: 'scan-body' }),
      nutrition: expect.objectContaining({ scan_id: 'scan-food' }),
      super: expect.objectContaining({ scan_id: 'scan-super' }),
    });
    expect(payload.latest_by_type).toMatchObject({
      health: expect.objectContaining({ scan_id: 'scan-face' }),
      body: expect.objectContaining({ scan_id: 'scan-body' }),
      nutrition: expect.objectContaining({ scan_id: 'scan-food' }),
      super: expect.objectContaining({ scan_id: 'scan-super' }),
    });
  });

  it('keeps rich payload generation robust for legacy raw scans with compact fallback fields', async () => {
    const payload = await buildPayloadFromRows('latest_scan', [
      {
        id: 'scan-super-legacy',
        scan_type: 'super',
        created_at: '2026-04-07T14:00:00.000Z',
        analyzed_at: '2026-04-07T14:00:00.000Z',
        analysis_result: {
          scan_type: 'super_health_v2',
          global_risk_score: 78,
          urgency_flag: true,
          summary_key: 'medical_attention',
          disclaimer_key: 'medical_not_diagnosis',
          analysis_summary: 'Please consult a doctor soon',
          disclaimer_text: 'This is not a diagnosis',
          detected_conditions: [
            {
              condition_name: 'Inflammation',
              category: 'General',
              probability: 84,
              severity: 'High',
              explanation: 'Custom explanation wording for coach',
              actionable_advice: 'Custom advice wording for coach',
            },
          ],
        },
      },
    ]);

    expect(payload.latest_scan?.raw_fallback_fields).toEqual({
      analysis_summary_text: 'Please consult a doctor soon',
      disclaimer_text: 'This is not a diagnosis',
      condition_texts: [
        {
          condition_key: 'unknown',
          condition_name_text: 'Inflammation',
          explanation_text: 'Custom explanation wording for coach',
          advice_text: 'Custom advice wording for coach',
        },
      ],
    });
    expect(payload.latest_scan?.raw_fallback_fields).not.toHaveProperty(
      'detected_conditions',
    );
    expect(payload.latest_scan?.raw_fallback_fields).not.toHaveProperty(
      'global_risk_score',
    );
    expect(payload.latest_scan?.raw_fallback_fields).not.toHaveProperty(
      'urgency_flag',
    );
    expect(
      readConditionTextEntries(payload.latest_scan?.raw_fallback_fields ?? null)[0],
    ).not.toHaveProperty('category_text');
    expect(payload.latest_scan?.coach_relevant_flags).toEqual(
      expect.arrayContaining(['high_risk_scan', 'urgent_attention_flag']),
    );
  });

  it('reuses a cached server response and sends the selected persona key', async () => {
    supabase.from.mockImplementation((table: string) => {
      if (table === 'scans') {
        return createScansSelectMock(recentScans);
      }

      return createLatestEntrySelectMock(null);
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          success: true,
          cached: true,
          entry_id: 'entry-1',
          persona_key: 'patient_calm',
          status: 'ready',
          title: 'Coach guidance',
          body: 'Stay hydrated and keep your current routine steady.',
          disclaimer:
            'Wellness guidance only. This is not a diagnosis or medical advice.',
          cta_label: null,
          cta_route: null,
          source: 'n8n',
          expires_at: '2026-04-06T12:00:00.000Z',
          response_payload_json: { cached: true },
          quota: {
            account_tier: 'premium',
            limit: 8,
            used_count: 2,
            available: 6,
            next_recharge_at: '2026-04-07T10:00:00.000Z',
            unlimited: false,
            window_seconds: 86400,
            as_of: '2026-04-06T10:00:00.000Z',
          },
        }),
    }) as typeof global.fetch;

    const result = await generateCoachGuidance({
      promptType: 'latest_scan',
      locale: 'en',
      personaKey: 'patient_calm',
    });

    expect(result.cached).toBe(true);
    expect(result.fallback).toBe(false);
    expect(result.persona_key).toBe('patient_calm');
    expect(result.quota).toEqual(
      expect.objectContaining({
        account_tier: 'premium',
        limit: 8,
        used_count: 2,
        available: 6,
        next_recharge_at: '2026-04-07T10:00:00.000Z',
      }),
    );
    expect(result.disclaimer).toContain('not a diagnosis');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/functions/v1/coach-generate-response'),
      expect.objectContaining({
        method: 'POST',
        body: expect.any(String),
      }),
    );

    const requestBody = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[0][1].body as string,
    );
    expect(requestBody.persona_key).toBe('patient_calm');
    expect(requestBody.locale).toBe('en');
    expect(requestBody.payload.payload_version).toBe(2);
    expect(requestBody.payload.selected_scan.scan_id).toBe('scan-face');
    expect(requestBody.payload.latest_scan.scan_id).toBe('scan-face');
  });

  it('falls back to the default persona when no valid persona is selected', async () => {
    supabase.from.mockImplementation((table: string) => {
      if (table === 'scans') {
        return createScansSelectMock(recentScans);
      }

      return createLatestEntrySelectMock(null);
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          success: true,
          cached: false,
          entry_id: 'entry-default',
          status: 'ready',
          title: 'Default coach guidance',
          body: 'Keep the basics steady this week.',
          disclaimer:
            'Wellness guidance only. This is not a diagnosis or medical advice.',
          cta_label: null,
          cta_route: null,
          source: 'n8n',
          expires_at: null,
          response_payload_json: {},
        }),
    }) as typeof global.fetch;

    const result = await generateCoachGuidance({
      promptType: 'latest_scan',
      locale: 'en',
      personaKey: 'not_a_real_persona' as any,
    });

    const requestBody = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[0][1].body as string,
    );

    expect(requestBody.persona_key).toBe(DEFAULT_COACH_PERSONA_KEY);
    expect(result.persona_key).toBe(DEFAULT_COACH_PERSONA_KEY);
  });

  it('does not fall back to cached guidance when the server rejects Coach quota', async () => {
    supabase.from.mockImplementation((table: string) => {
      if (table === 'scans') {
        return createScansSelectMock(recentScans);
      }

      return createLatestEntrySelectMock({
        id: 'entry-cached',
        title: 'Cached guidance',
        body: 'This should not be returned for quota exhaustion.',
        disclaimer:
          'Wellness guidance only. This is not a diagnosis or medical advice.',
        persona_key: 'gentle_supportive',
        cta_label: null,
        cta_route: null,
        created_at: '2026-04-06T08:00:00.000Z',
        generated_at: '2026-04-06T08:00:00.000Z',
        source: 'n8n',
        status: 'ready',
        response_payload_json: {},
      });
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () =>
        JSON.stringify({
          success: false,
          error: 'Coach quota exhausted',
          code: 'coach_quota_exhausted',
          status: 429,
          details: {
            quota_account_tier: 'free',
            quota_limit: 1,
            quota_used_count: 1,
            quota_available: 0,
            quota_next_recharge_at: '2026-04-07T10:00:00.000Z',
            quota_unlimited: false,
            quota_window_seconds: 86400,
            quota_as_of: '2026-04-06T10:00:00.000Z',
          },
          request_id: 'req-quota',
        }),
    }) as typeof global.fetch;

    let caughtError: unknown = null;
    try {
      await generateCoachGuidance({
        promptType: 'latest_scan',
        locale: 'en',
        personaKey: 'gentle_supportive',
      });
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toMatchObject({
      code: 'coach_quota_exhausted',
      status: 429,
      requestId: 'req-quota',
    });
    expect(isCoachQuotaExhaustedError(caughtError)).toBe(true);
    expect(getCoachQuotaFromError(caughtError)).toEqual(
      expect.objectContaining({
        account_tier: 'free',
        limit: 1,
        used_count: 1,
        available: 0,
        next_recharge_at: '2026-04-07T10:00:00.000Z',
      }),
    );
  });

  it('falls back to the latest ready guidance for the same persona when generation fails', async () => {
    const eqCalls = jest.fn();

    supabase.from.mockImplementation((table: string) => {
      if (table === 'scans') {
        return createScansSelectMock(recentScans);
      }

      return createLatestEntrySelectMock(
        {
          id: 'entry-fallback',
          title: 'Saved guidance',
          body: 'Keep your current routine steady this week.',
          disclaimer:
            'Wellness guidance only. This is not a diagnosis or medical advice.',
          persona_key: 'strict_tough',
          created_at: '2026-04-06T09:00:00.000Z',
          status: 'ready',
          locale: 'en',
          cta_label: null,
          cta_route: null,
          source: 'n8n',
          response_payload_json: {},
        },
        eqCalls,
      );
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => JSON.stringify({ error: 'n8n unavailable' }),
    }) as typeof global.fetch;

    const result = await generateCoachGuidance({
      promptType: 'latest_scan',
      locale: 'en',
      personaKey: 'strict_tough',
    });

    expect(result.fallback).toBe(true);
    expect(result.title).toBe('Saved guidance');
    expect(result.persona_key).toBe('strict_tough');
    expect(eqCalls).toHaveBeenCalledWith('status', 'ready');
    expect(eqCalls).toHaveBeenCalledWith('persona_key', 'strict_tough');
    expect(eqCalls).toHaveBeenCalledWith('locale', 'en');
  });

  it('does not fall back to a coach entry from another locale', async () => {
    const eqCalls = jest.fn();

    supabase.from.mockImplementation((table: string) => {
      if (table === 'scans') {
        return createScansSelectMock(recentScans);
      }

      return createLatestEntrySelectMock(null, eqCalls);
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => JSON.stringify({ error: 'n8n unavailable' }),
    }) as typeof global.fetch;

    await expect(
      generateCoachGuidance({
        promptType: 'latest_scan',
        locale: 'fr',
        personaKey: 'strict_tough',
      }),
    ).rejects.toMatchObject({
      status: 503,
    });

    expect(eqCalls).toHaveBeenCalledWith('status', 'ready');
    expect(eqCalls).toHaveBeenCalledWith('persona_key', 'strict_tough');
    expect(eqCalls).toHaveBeenCalledWith('locale', 'fr');
  });

  it('only falls back to legacy entries when no locale is provided', async () => {
    const eqCalls = jest.fn();
    const isCalls = jest.fn();

    supabase.from.mockImplementation((table: string) => {
      if (table === 'scans') {
        return createScansSelectMock(recentScans);
      }

      return createLatestEntrySelectMock(
        {
          id: 'entry-legacy',
          title: 'Saved legacy guidance',
          body: 'Keep your current routine steady this week.',
          disclaimer:
            'Wellness guidance only. This is not a diagnosis or medical advice.',
          persona_key: 'patient_calm',
          created_at: '2026-04-06T09:00:00.000Z',
          status: 'ready',
          cta_label: null,
          cta_route: null,
          source: 'n8n',
          response_payload_json: {},
        },
        eqCalls,
        null,
        isCalls,
      );
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => JSON.stringify({ error: 'n8n unavailable' }),
    }) as typeof global.fetch;

    const result = await generateCoachGuidance({
      promptType: 'latest_scan',
      personaKey: 'patient_calm',
    });

    expect(result.fallback).toBe(true);
    expect(result.title).toBe('Saved legacy guidance');
    expect(eqCalls).toHaveBeenCalledWith('status', 'ready');
    expect(eqCalls).toHaveBeenCalledWith('persona_key', 'patient_calm');
    expect(isCalls).toHaveBeenCalledWith('locale', null);
  });

  it('preserves pending coach entries so the app can keep polling until they are ready', async () => {
    supabase.from.mockReturnValue(
      createCoachEntriesSelectMock([
        {
          id: 'entry-pending',
          title: null,
          body: null,
          disclaimer:
            'Wellness guidance only. This is not a diagnosis or medical advice.',
          persona_key: 'gentle_supportive',
          cta_label: null,
          cta_route: null,
          created_at: '2026-04-06T09:00:00.000Z',
          source: 'n8n',
          status: 'pending',
          response_payload_json: {},
        },
      ]),
    );

    await expect(fetchCoachEntries()).resolves.toEqual([
      expect.objectContaining({
        id: 'entry-pending',
        title: null,
        body: null,
        status: 'pending',
      }),
    ]);
  });

  it('loads a first coach history batch without fetching the whole table', async () => {
    supabase.rpc.mockResolvedValue({
      data: [
        createCoachHistoryRow('entry-1', {
          created_at: '2026-04-06T10:00:00.000Z',
          generated_at: '2026-04-06T10:00:00.000Z',
        }),
        createCoachHistoryRow('entry-2', {
          created_at: '2026-04-05T10:00:00.000Z',
          generated_at: '2026-04-05T10:00:00.000Z',
        }),
      ],
      error: null,
    });

    await expect(
      fetchCoachHistoryPage({
        limit: 10,
        excludeEntryId: 'entry-active',
      }),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({ id: 'entry-1' }),
        expect.objectContaining({ id: 'entry-2' }),
      ],
      has_more: false,
      next_cursor: null,
    });

    expect(supabase.rpc).toHaveBeenCalledWith('get_coach_history_page', {
      p_limit: 11,
      p_cursor_sort_at: null,
      p_cursor_created_at: null,
      p_cursor_id: null,
      p_exclude_entry_id: 'entry-active',
    });
  });

  it('returns a next cursor when more history pages are available', async () => {
    supabase.rpc.mockResolvedValue({
      data: [
        ...Array.from({ length: 10 }, (_, index) =>
          createCoachHistoryRow(`entry-${index}`, {
            created_at: `2026-04-${String(15 - index).padStart(2, '0')}T10:00:00.000Z`,
            generated_at: `2026-04-${String(15 - index).padStart(2, '0')}T10:00:00.000Z`,
          }),
        ),
        createCoachHistoryRow('entry-10', {
          created_at: '2026-04-05T09:00:00.000Z',
          generated_at: '2026-04-05T09:00:00.000Z',
        }),
      ],
      error: null,
    });

    const page = await fetchCoachHistoryPage({ limit: 10 });

    expect(page.items).toHaveLength(10);
    expect(page.has_more).toBe(true);
    expect(page.next_cursor).toEqual(expect.any(String));
  });

  it('continues coach history pagination with a stable cursor and no duplicate ids', async () => {
    supabase.rpc
      .mockResolvedValueOnce({
        data: [
          createCoachHistoryRow('entry-a', {
            created_at: '2026-04-10T10:00:00.000Z',
            generated_at: '2026-04-10T10:00:00.000Z',
          }),
          createCoachHistoryRow('entry-b', {
            created_at: '2026-04-10T10:00:00.000Z',
            generated_at: '2026-04-10T10:00:00.000Z',
          }),
          createCoachHistoryRow('entry-c', {
            created_at: '2026-04-09T10:00:00.000Z',
            generated_at: '2026-04-09T10:00:00.000Z',
          }),
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          createCoachHistoryRow('entry-d', {
            created_at: '2026-04-08T10:00:00.000Z',
            generated_at: '2026-04-08T10:00:00.000Z',
          }),
        ],
        error: null,
      });

    const firstPage = await fetchCoachHistoryPage({ limit: 2 });
    const secondPage = await fetchCoachHistoryPage({
      limit: 2,
      cursor: firstPage.next_cursor,
    });

    expect(firstPage.items.map((entry) => entry.id)).toEqual(['entry-a', 'entry-b']);
    expect(secondPage.items.map((entry) => entry.id)).toEqual(['entry-d']);
    expect(new Set([...firstPage.items, ...secondPage.items].map((entry) => entry.id)).size).toBe(
      firstPage.items.length + secondPage.items.length,
    );
    expect(supabase.rpc.mock.calls[1][1]).toMatchObject({
      p_cursor_sort_at: '2026-04-10T10:00:00.000Z',
      p_cursor_created_at: '2026-04-10T10:00:00.000Z',
      p_cursor_id: 'entry-b',
    });
  });

  it('surfaces a precise coach history pagination error when the RPC is unavailable', async () => {
    supabase.rpc.mockResolvedValueOnce({
      data: null,
      error: {
        code: 'PGRST202',
        message: 'Could not find function public.get_coach_history_page',
      },
    });

    await expect(fetchCoachHistoryPage()).rejects.toMatchObject({
      code: 'coach_history_page_unavailable',
      status: 503,
      message: expect.stringContaining('get_coach_history_page'),
    });
  });

  it('returns an exact coach history summary for renderable entries', async () => {
    supabase.rpc.mockResolvedValue({
      data: [
        {
          total_count: '12',
          latest_entry_at: '2026-04-10T10:00:00.000Z',
        },
      ],
      error: null,
    });

    await expect(
      fetchCoachHistorySummary({
        excludeEntryId: 'entry-active',
      }),
    ).resolves.toEqual({
      total_count: 12,
      latest_entry_at: '2026-04-10T10:00:00.000Z',
    });

    expect(supabase.rpc).toHaveBeenCalledWith('get_coach_history_summary', {
      p_exclude_entry_id: 'entry-active',
    });
  });

  it('surfaces a precise coach history summary error when the RPC is unavailable', async () => {
    supabase.rpc.mockResolvedValueOnce({
      data: null,
      error: {
        code: 'PGRST202',
        message: 'Could not find function public.get_coach_history_summary',
      },
    });

    await expect(fetchCoachHistorySummary()).rejects.toMatchObject({
      code: 'coach_history_summary_unavailable',
      status: 503,
      message: expect.stringContaining('get_coach_history_summary'),
    });
  });

  it('loads the latest ready coach entry without filtering by persona', async () => {
    const eqCalls = jest.fn();
    const isCalls = jest.fn();

    supabase.from.mockImplementation((table: string) => {
      if (table !== 'coach_entries') {
        throw new Error(`Unexpected table ${table}`);
      }

      return createLatestEntrySelectMock(
        createCoachHistoryRow('entry-global', {
          persona_key: 'strict_tough',
          generated_at: '2026-04-10T10:00:00.000Z',
          locale: 'fr',
        }),
        eqCalls,
        null,
        isCalls,
      );
    });

    await expect(
      fetchLatestReadyCoachEntry({
        locale: 'fr',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'entry-global',
        persona_key: 'strict_tough',
        has_valid_persona: true,
      }),
    );

    expect(eqCalls).toHaveBeenCalledWith('status', 'ready');
    expect(eqCalls).toHaveBeenCalledWith('locale', 'fr');
    expect(eqCalls).not.toHaveBeenCalledWith('persona_key', expect.anything());
    expect(isCalls).not.toHaveBeenCalledWith('locale', null);
  });

  it('loads the latest ready coach entry scoped by persona when requested', async () => {
    const eqCalls = jest.fn();

    supabase.from.mockImplementation((table: string) => {
      if (table !== 'coach_entries') {
        throw new Error(`Unexpected table ${table}`);
      }

      return createLatestEntrySelectMock(
        createCoachHistoryRow('entry-persona', {
          persona_key: 'patient_calm',
          generated_at: '2026-04-09T10:00:00.000Z',
          locale: 'fr',
        }),
        eqCalls,
      );
    });

    await expect(
      fetchLatestReadyCoachEntry({
        personaKey: 'patient_calm',
        locale: 'fr',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'entry-persona',
        persona_key: 'patient_calm',
      }),
    );

    expect(eqCalls).toHaveBeenCalledWith('status', 'ready');
    expect(eqCalls).toHaveBeenCalledWith('persona_key', 'patient_calm');
    expect(eqCalls).toHaveBeenCalledWith('locale', 'fr');
  });

  it('keeps invalid or missing persisted personas neutral in parsed coach entries', async () => {
    supabase.from.mockReturnValue(
      createCoachEntriesSelectMock([
        {
          id: 'entry-legacy',
          title: 'Legacy guidance',
          body: 'This entry predates persona persistence.',
          disclaimer:
            'Wellness guidance only. This is not a diagnosis or medical advice.',
          persona_key: null,
          cta_label: null,
          cta_route: null,
          created_at: '2026-04-06T09:00:00.000Z',
          source: 'n8n',
          status: 'ready',
          response_payload_json: {},
        },
      ]),
    );

    await expect(fetchCoachEntries()).resolves.toEqual([
      expect.objectContaining({
        id: 'entry-legacy',
        persona_key: DEFAULT_COACH_PERSONA_KEY,
        has_valid_persona: false,
      }),
    ]);
  });

  it('extracts detailed tracked-entry failure metadata from stored coach response payloads', () => {
    const debugInfo = getCoachEntryFailureDebugInfo({
      status: 'error',
      error_code: 'coach_webhook_503',
      response_payload_json: {
        error: 'temporary outage',
        request_id: 'req-coach-1',
        webhook_status: 503,
        provider: 'n8n',
        source: 'coach_generation',
        fallback: true,
        response_body_present: true,
      },
    });

    expect(debugInfo).toMatchObject({
      message: 'temporary outage',
      code: 'coach_webhook_503',
      status: 503,
      requestId: 'req-coach-1',
      functionName: 'coach-generate-response',
      webhookStatus: 503,
      provider: 'n8n',
      source: 'coach_generation',
      fallbackUsed: true,
      responseBodyPresent: true,
    });
    expect(resolveCoachFailureKindFromEntry({
      status: 'error',
      error_code: 'coach_webhook_503',
      response_payload_json: {
        webhook_status: 503,
      },
    })).toBe('provider_request_failed');
  });

  it('classifies invalid provider payload failures separately from provider transport failures', () => {
    expect(resolveCoachFailureKindFromEntry({
      status: 'error',
      error_code: 'invalid_coach_response',
      response_payload_json: {
        request_id: 'req-invalid',
        webhook_status: 200,
      },
    })).toBe('invalid_provider_response');

    expect(
      resolveCoachFailureKindFromError(
        new CoachServiceError('Coach generation returned an invalid payload', {
          code: 'invalid_coach_response',
          status: 502,
          requestId: 'req-invalid',
          functionName: 'coach-generate-response',
        }),
      ),
    ).toBe('invalid_provider_response');
  });

  it('surfaces a precise coach entries error instead of returning an empty state', async () => {
    supabase.from.mockReturnValue(
      createCoachEntriesSelectMock(null, {
        code: '42P01',
        message: 'relation "coach_entries" does not exist',
      }),
    );

    await expect(fetchCoachEntries()).rejects.toMatchObject({
      code: 'coach_entries_unavailable',
      status: 503,
      message: expect.stringContaining('coach_entries'),
    });
  });

  it('surfaces a precise coach entries policy denial instead of a generic read error', async () => {
    supabase.from.mockReturnValue(
      createCoachEntriesSelectMock(null, {
        code: '42501',
        message: 'permission denied for table coach_entries',
      }),
    );

    await expect(fetchCoachEntries()).rejects.toMatchObject({
      code: 'coach_entries_policy_denied',
      status: 403,
      message: expect.stringContaining('denied'),
    });
  });

  it('surfaces a precise recent scans error instead of returning an empty array', async () => {
    supabase.from.mockReturnValue(
      createScansSelectMock([], {
        code: '42P01',
        message: 'relation "scans" does not exist',
      }),
    );

    await expect(fetchRecentCoachScans()).rejects.toMatchObject({
      code: 'coach_scans_unavailable',
      status: 503,
      message: expect.stringContaining('scans'),
    });
  });

  it('surfaces a precise recent scans schema mismatch instead of a generic read error', async () => {
    supabase.from.mockReturnValue(
      createScansSelectMock([], {
        code: '42703',
        message: 'column "analysis_result" does not exist',
      }),
    );

    await expect(fetchRecentCoachScans()).rejects.toMatchObject({
      code: 'coach_scans_schema_mismatch',
      status: 503,
      message: expect.stringContaining('missing required columns'),
    });
  });

  it('surfaces locked persona rejection when no fallback entry is available', async () => {
    supabase.from.mockImplementation((table: string) => {
      if (table === 'scans') {
        return createScansSelectMock(recentScans);
      }

      return createLatestEntrySelectMock(null);
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () =>
        JSON.stringify({
          error: 'Coach persona requires premium',
          code: 'coach_persona_requires_premium',
        }),
    }) as typeof global.fetch;

    await expect(
      generateCoachGuidance({
        promptType: 'latest_scan',
        locale: 'en',
        personaKey: 'strict_tough',
      }),
    ).rejects.toMatchObject({
      code: 'coach_persona_requires_premium',
      status: 403,
    });
  });

  it('does not call the coach Edge Function when no usable scan exists', async () => {
    supabase.from.mockImplementation((table: string) => {
      if (table === 'scans') {
        return createScansSelectMock([
          createFatDistributionSuperScanRow(
            'scan-fat-only',
            '2026-04-07T13:30:00.000Z',
          ),
        ]);
      }

      return createLatestEntrySelectMock(createCoachHistoryRow('entry-stale'));
    });

    global.fetch = jest.fn() as typeof global.fetch;

    await expect(
      generateCoachGuidance({
        promptType: 'latest_scan',
        locale: 'fr',
        personaKey: 'gentle_supportive',
      }),
    ).rejects.toMatchObject({
      code: 'coach_no_usable_scan',
      status: 400,
    });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it('surfaces a missing coach webhook env when generation cannot be configured server-side', async () => {
    supabase.from.mockImplementation((table: string) => {
      if (table === 'scans') {
        return createScansSelectMock(recentScans);
      }

      return createLatestEntrySelectMock({
        id: 'entry-fallback',
        title: 'Saved guidance',
        body: 'This should not mask a missing env.',
        disclaimer:
          'Wellness guidance only. This is not a diagnosis or medical advice.',
        persona_key: 'patient_calm',
        created_at: '2026-04-06T09:00:00.000Z',
        status: 'ready',
        cta_label: null,
        cta_route: null,
        source: 'n8n',
        response_payload_json: {},
      });
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () =>
        JSON.stringify({
          error: 'Coach generation provider is not configured',
          code: 'coach_webhook_not_configured',
        }),
    }) as typeof global.fetch;

    await expect(
      generateCoachGuidance({
        promptType: 'latest_scan',
        locale: 'en',
        personaKey: 'patient_calm',
      }),
    ).rejects.toMatchObject({
      code: 'coach_webhook_not_configured',
      status: 503,
    });
  });

  it('preserves fallback lookup parity errors instead of swallowing them behind stale guidance', async () => {
    supabase.from.mockImplementation((table: string) => {
      if (table === 'scans') {
        return createScansSelectMock(recentScans);
      }

      return createLatestEntrySelectMock(
        null,
        jest.fn(),
        {
          code: '42703',
          message: 'column "persona_key" does not exist',
        },
      );
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => JSON.stringify({ error: 'n8n unavailable' }),
    }) as typeof global.fetch;

    await expect(
      generateCoachGuidance({
        promptType: 'latest_scan',
        locale: 'en',
        personaKey: 'patient_calm',
      }),
    ).rejects.toMatchObject({
      code: 'coach_entries_schema_mismatch',
      status: 503,
    });
  });

  it('names the missing Coach generation route when the function is not deployed', async () => {
    supabase.from.mockImplementation((table: string) => {
      if (table === 'scans') {
        return createScansSelectMock(recentScans);
      }

      return createLatestEntrySelectMock(null);
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => '',
    }) as typeof global.fetch;

    await expect(
      generateCoachGuidance({
        promptType: 'latest_scan',
        locale: 'en',
        personaKey: 'patient_calm',
      }),
    ).rejects.toMatchObject({
      code: 'edge_function_route_missing',
      status: 404,
      functionName: 'coach-generate-response',
      message: expect.stringContaining('coach-generate-response'),
    });
  });
});
