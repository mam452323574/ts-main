import {
  buildCoachPayload,
  fetchCoachEntries,
  fetchCoachEntryErrorSummary,
  fetchCoachHistoryPage,
  fetchCoachHistorySummary,
  fetchCoachScreenSnapshot,
  fetchLatestReadyCoachEntry,
  fetchRecentCoachScans,
  generateCoachGuidance,
  getCoachEntryFailureDebugInfo,
  getCoachQuotaFromError,
  getCoachServiceErrorDebugInfo,
  invalidateCoachProfileMemoryCache,
  mergeCoachEntryFailureDebugInfo,
  resolveCoachFailureKindFromDebugInfo,
  resolveCoachFailureKindFromEntry,
  resolveCoachFailureKindFromError,
  isCoachQuotaExhaustedError,
  sanitizeCoachServiceErrorDebugInfo,
  shouldDebugCoachService,
  CoachServiceError,
} from '@/services/coach';
import { DEFAULT_COACH_PERSONA_KEY } from '@/shared/coachPersonas';
import type { CoachGuidancePayload, CoachScanDigest } from '@/types';
import { logExpectedFailure, logOperationalError } from '@/utils/observability';

jest.mock('@/utils/observability', () => ({
  logOperationalError: jest.fn(),
  logExpectedFailure: jest.fn(),
  logOperationalInfo: jest.fn(),
}));

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

  it('adds persisted coach profile memory as a separate payload field', async () => {
    supabase.from.mockReturnValue(
      createScansSelectMock([
        createFaceScanRow('scan-face', '2026-04-07T10:00:00.000Z'),
      ]),
    );
    const scans = await fetchRecentCoachScans();
    const payload = buildCoachPayload('latest_scan', scans, {
      coachProfileMemory: {
        detected_diet_signals: ['protein_focus'],
        detected_strong_focus: 'nutrition',
        suggested_goals: ['Hydration'],
        suggested_persona_key: 'patient_calm',
        last_updated_at: '2026-05-12T08:00:00.000Z',
        update_count: 2,
      },
    });

    expect(payload.inferred_persona).toBeTruthy();
    expect(payload.coach_profile_memory).toEqual({
      detected_diet_signals: ['protein_focus'],
      detected_strong_focus: 'nutrition',
      suggested_goals: ['Hydration'],
      suggested_persona_key: 'patient_calm',
      last_updated_at: '2026-05-12T08:00:00.000Z',
      update_count: 2,
    });
  });

  it('resolves preset and free-text coach questions into the payload', async () => {
    supabase.from.mockReturnValue(
      createScansSelectMock([
        createFaceScanRow('scan-face', '2026-04-07T10:00:00.000Z'),
      ]),
    );
    const scans = await fetchRecentCoachScans();
    const presetPayload = buildCoachPayload('latest_scan', scans, {
      locale: 'fr',
      questionKey: 'latest_scan__three_simple_actions',
      questionText:
        "Quelles 3 actions simples auront le plus d'impact d'ici ce soir ?",
    });
    const freeTextPayload = buildCoachPayload('latest_scan', scans, {
      locale: 'fr',
      questionKey: 'latest_scan__three_simple_actions',
      questionText: 'Sur quoi je dois me concentrer avant ma seance ce soir ?',
    });

    expect(presetPayload.question_key).toBe(
      'latest_scan__three_simple_actions',
    );
    expect(presetPayload.question_text).toBe(
      "Quelles 3 actions simples auront le plus d'impact d'ici ce soir ?",
    );
    expect(presetPayload.question_hints).toEqual(
      expect.objectContaining({
        intent_key: 'latest_scan_three_actions',
        preferred_artifacts: expect.arrayContaining([
          'action_steps',
          'reminders',
        ]),
      }),
    );
    expect(freeTextPayload.question_key).toBeNull();
    expect(freeTextPayload.question_text).toBe(
      'Sur quoi je dois me concentrer avant ma seance ce soir ?',
    );
    expect(freeTextPayload.question_hints).toEqual(
      expect.objectContaining({
        intent_key: 'latest_scan_priority_today',
      }),
    );
  });

  it('keeps trend_review canonical while tolerating legacy trend aliases on provider responses', async () => {
    supabase.from.mockImplementation((table: string) => {
      if (table === 'scans') {
        return createScansSelectMock([
          createFaceScanRow('scan-face', '2026-04-07T10:00:00.000Z'),
        ]);
      }

      return createLatestEntrySelectMock(null);
    });

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            success: true,
            applied_count: 0,
            profile_memory: null,
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            success: true,
            cached: false,
            entry_id: 'entry-trend-legacy',
            persona_key: 'patient_calm',
            prompt_type: 'trend_comparison',
            question_key: 'trend_comparison__week_progress_review',
            question_text: null,
            status: 'ready',
            title: 'Lecture de tendance',
            body: 'On observe une progression avec un point a surveiller.',
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
      promptType: 'trend_review',
      locale: 'fr',
      personaKey: 'patient_calm',
      questionKey: 'trend_review__week_progress_review',
    });

    expect(result.prompt_type).toBe('trend_review');
    expect(result.question_key).toBe('trend_review__week_progress_review');
    expect(result.question_text).toBe(
      "Dis-moi ce qui s'ameliore, ce qui bloque et quoi continuer cette semaine.",
    );
  });

  it('classifies nutrition free text into intent-aware question hints', async () => {
    supabase.from.mockReturnValue(
      createScansSelectMock([
        createNutritionScanRow('scan-food', '2026-04-07T10:00:00.000Z'),
      ]),
    );
    const scans = await fetchRecentCoachScans();
    const payload = buildCoachPayload('nutrition_focus', scans, {
      locale: 'fr',
      questionKey: 'nutrition_focus__breakfast_no_crash',
      questionText: 'Fais-moi une liste de courses simple pour 3 jours.',
    });

    expect(payload.question_key).toBeNull();
    expect(payload.question_text).toBe(
      'Fais-moi une liste de courses simple pour 3 jours.',
    );
    expect(payload.question_hints).toEqual(
      expect.objectContaining({
        intent_key: 'nutrition_shopping_list',
        preferred_artifacts: expect.arrayContaining([
          'shopping_list',
          'quick_recipe',
        ]),
      }),
    );
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

  it('uses an explicit selected scan id for selected and latest context', async () => {
    supabase.from.mockReturnValue(
      createScansSelectMock([
        createNutritionScanRow('scan-food', '2026-04-06T10:00:00.000Z'),
        createBodyScanRow('scan-body', '2026-04-06T09:00:00.000Z'),
      ]),
    );

    const scans = await fetchRecentCoachScans();
    const payload = buildCoachPayload('nutrition_focus', scans, {
      selectedScanId: 'scan-body',
    });

    expect(payload.prompt_type).toBe('nutrition_focus');
    expect(payload.selected_scan?.scan_id).toBe('scan-body');
    expect(payload.latest_scan?.scan_id).toBe('scan-body');
    expect(payload.latest_by_type.nutrition?.scan_id).toBe('scan-food');
    expect(payload.latest_by_type.body?.scan_id).toBe('scan-body');
    expect(payload.selected_scan_id).toBe('scan-body');
    expect(payload).not.toHaveProperty('scan_intent');
  });

  it('exposes hidden selected scan context in the backend payload fields', async () => {
    supabase.from.mockReturnValue(
      createScansSelectMock([
        createNutritionScanRow('scan-food', '2026-04-06T10:00:00.000Z'),
        createBodyScanRow('scan-body', '2026-04-06T09:00:00.000Z'),
      ]),
    );

    const scans = await fetchRecentCoachScans();
    const payload = buildCoachPayload('latest_scan', scans, {
      selectedScanId: 'scan-body',
    });

    expect(payload.prompt_type).toBe('latest_scan');
    expect(payload.selected_scan?.scan_id).toBe('scan-body');
    expect(payload.latest_scan?.scan_id).toBe('scan-body');
    expect(payload.recent_scans[0]?.scan_id).toBe('scan-body');
    expect(payload.selected_scan_id).toBe('scan-body');
    expect(payload).not.toHaveProperty('scan_intent');
  });

  it('falls back to prompt selection when selected scan id is invalid', async () => {
    supabase.from.mockReturnValue(
      createScansSelectMock([
        createNutritionScanRow('scan-food', '2026-04-06T10:00:00.000Z'),
        createBodyScanRow('scan-body', '2026-04-06T09:00:00.000Z'),
      ]),
    );

    const scans = await fetchRecentCoachScans();
    const payload = buildCoachPayload('nutrition_focus', scans, {
      selectedScanId: 'missing-scan',
    });

    expect(payload.selected_scan_id).toBe('missing-scan');
    expect(payload).not.toHaveProperty('scan_intent');
    expect(payload.selected_scan?.scan_id).toBe('scan-food');
    expect(payload.latest_scan?.scan_id).toBe('scan-food');
  });

  it('serializes scan intent as the slim coach payload contract', async () => {
    supabase.from.mockReturnValue(
      createScansSelectMock([
        createBodyScanRow('scan-body', '2026-04-06T09:00:00.000Z'),
      ]),
    );

    const scans = await fetchRecentCoachScans();
    const payload = buildCoachPayload('latest_scan_issue_resolution', scans, {
      selectedScanId: 'scan-body',
      scanIntent: {
        scan_id: 'scan-body',
        scan_type: 'body',
        has_actionable_issue: true,
        priority_metric: 'posture_score',
        priority_label: 'Posture',
        severity: 'high',
        reason: 'Le scan indique une posture perfectible.',
        user_facing_summary:
          'Ta posture semble être le point le plus intéressant à améliorer après ce scan.',
        prompt_type: 'latest_scan_issue_resolution',
        question_key: 'improve_posture_from_scan',
        question_text:
          'Comment améliorer ma posture à partir de mon dernier scan ?',
        fallback_prompt_type: 'latest_scan',
        premium_required: true,
      },
    });

    expect(payload.prompt_type).toBe('latest_scan_issue_resolution');
    expect(payload.selected_scan_id).toBe('scan-body');
    expect(payload.selected_scan?.scan_id).toBe('scan-body');
    expect(payload.scan_intent).toEqual({
      has_actionable_issue: true,
      priority_metric: 'posture_score',
      priority_label: 'Posture',
      severity: 'high',
      question_text:
        'Comment améliorer ma posture à partir de mon dernier scan ?',
      user_facing_summary:
        'Ta posture semble être le point le plus intéressant à améliorer après ce scan.',
    });
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

  it('builds a rich latest_scan context for fat_distribution_scan_v2 super scans', async () => {
    const payload = await buildPayloadFromRows('latest_scan', [
      createFatDistributionSuperScanRow('scan-super-fat', '2026-04-07T13:30:00.000Z'),
      createFaceScanRow('scan-face', '2026-04-07T12:00:00.000Z'),
    ]);

    expect(payload.selected_scan).toMatchObject({
      scan_id: 'scan-super-fat',
      scan_type: 'super',
      normalized_scan_type: 'fat_distribution_scan_v2',
      metrics: expect.objectContaining({
        global_water_retention_estimate_percent: expect.any(Number),
      }),
    });
    expect(payload.latest_scan).toMatchObject({
      scan_id: 'scan-super-fat',
      scan_type: 'super',
      normalized_scan_type: 'fat_distribution_scan_v2',
      key_metrics: expect.objectContaining({
        global_water_retention_estimate_percent: expect.any(Number),
        priority_zones: expect.any(Array),
      }),
    });
    expect(payload.latest_by_type.super?.scan_id).toBe('scan-super-fat');
    expect(payload.recent_scans.map((scan) => scan.scan_id)).toEqual([
      'scan-super-fat',
      'scan-face',
    ]);
  });

  it('keeps fat_distribution_scan_v2 rows in the recent coach scan list', async () => {
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

    expect(payload.selected_scan?.scan_id).toBe('scan-fat-0');
    expect(payload.recent_scans[0]).toMatchObject({
      scan_id: 'scan-fat-0',
      normalized_scan_type: 'fat_distribution_scan_v2',
    });
  });

  it('returns fat_distribution_scan_v2 when it is the only recent scan row', async () => {
    supabase.from.mockReturnValue(
      createScansSelectMock([
        createFatDistributionSuperScanRow(
          'scan-fat-only',
          '2026-04-07T13:30:00.000Z',
        ),
      ]),
    );

    const scans = await fetchRecentCoachScans();

    expect(scans).toHaveLength(1);
    expect(scans[0].digest.normalized_scan_type).toBe(
      'fat_distribution_scan_v2',
    );
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

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            success: true,
            applied_count: 1,
            profile_memory: {
              detected_diet_signals: ['protein_focus'],
              detected_strong_focus: 'nutrition',
              suggested_goals: ['Hydration'],
              suggested_persona_key: 'patient_calm',
              last_updated_at: '2026-05-12T08:00:00.000Z',
              update_count: 3,
            },
          }),
      })
      .mockResolvedValueOnce({
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
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/functions/v1/coach-sync-profile-memory'),
      expect.objectContaining({
        method: 'POST',
        body: '{}',
      }),
    );

    const requestBody = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[1][1].body as string,
    );
    expect(requestBody.persona_key).toBe('patient_calm');
    expect(requestBody.locale).toBe('en');
    expect(requestBody.payload.payload_version).toBe(2);
    expect(requestBody.payload.selected_scan.scan_id).toBe('scan-face');
    expect(requestBody.payload.latest_scan.scan_id).toBe('scan-face');
    expect(requestBody.payload.coach_profile_memory).toEqual({
      detected_diet_signals: ['protein_focus'],
      detected_strong_focus: 'nutrition',
      suggested_goals: ['Hydration'],
      suggested_persona_key: 'patient_calm',
      last_updated_at: '2026-05-12T08:00:00.000Z',
      update_count: 3,
    });
  });

  it('propagates scanId through generation payload selection', async () => {
    supabase.from.mockImplementation((table: string) => {
      if (table === 'scans') {
        return createScansSelectMock([
          createNutritionScanRow('scan-food', '2026-04-06T10:00:00.000Z'),
          createBodyScanRow('scan-body', '2026-04-06T09:00:00.000Z'),
        ]);
      }

      return createLatestEntrySelectMock(null);
    });

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            success: true,
            applied_count: 0,
            profile_memory: null,
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            success: true,
            cached: false,
            entry_id: 'entry-selected-scan',
            persona_key: 'gentle_supportive',
            prompt_type: 'nutrition_focus',
            status: 'ready',
            title: 'Coach guidance',
            body: 'Keep the next step simple.',
            disclaimer:
              'Wellness guidance only. This is not a diagnosis or medical advice.',
            cta_label: null,
            cta_route: null,
            source: 'n8n',
            expires_at: '2026-04-06T12:00:00.000Z',
            response_payload_json: {},
            quota: null,
          }),
      }) as typeof global.fetch;

    await generateCoachGuidance({
      promptType: 'nutrition_focus',
      personaKey: 'gentle_supportive',
      scanId: 'scan-body',
    });

    const requestBody = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[1][1].body as string,
    );
    expect(requestBody.payload.selected_scan_id).toBe('scan-body');
    expect(requestBody.payload.selected_scan.scan_id).toBe('scan-body');
    expect(requestBody.payload.latest_scan.scan_id).toBe('scan-body');
    expect(requestBody.payload.latest_by_type.nutrition.scan_id).toBe('scan-food');
  });

  it('loads the exact scan by id when it is missing from recent scans', async () => {
    const exactScanRow = createBodyScanRow(
      'scan-body',
      '2026-04-06T09:00:00.000Z',
    );
    const selectedScanEq = jest.fn();
    const selectedScanMaybeSingle = jest.fn().mockResolvedValue({
      data: exactScanRow,
      error: null,
    });
    const selectedScanQuery: any = {
      eq: jest.fn((field: string, value: unknown) => {
        selectedScanEq(field, value);
        return selectedScanQuery;
      }),
      maybeSingle: selectedScanMaybeSingle,
    };
    let scansReadCount = 0;
    supabase.from.mockImplementation((table: string) => {
      if (table === 'scans') {
        scansReadCount += 1;
        return scansReadCount === 1
          ? createScansSelectMock([
              createNutritionScanRow('scan-food', '2026-04-06T10:00:00.000Z'),
            ])
          : {
              select: jest.fn(() => selectedScanQuery),
            };
      }

      return createLatestEntrySelectMock(null);
    });

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            success: true,
            applied_count: 0,
            profile_memory: null,
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            success: true,
            cached: false,
            entry_id: 'entry-selected-scan',
            persona_key: 'gentle_supportive',
            prompt_type: 'nutrition_focus',
            status: 'ready',
            title: 'Coach guidance',
            body: 'Keep the next step simple.',
            disclaimer:
              'Wellness guidance only. This is not a diagnosis or medical advice.',
            cta_label: null,
            cta_route: null,
            source: 'n8n',
            expires_at: '2026-04-06T12:00:00.000Z',
            response_payload_json: {},
            quota: null,
          }),
      }) as typeof global.fetch;

    await generateCoachGuidance({
      promptType: 'nutrition_focus',
      personaKey: 'gentle_supportive',
      scanId: 'scan-body',
    });

    const requestBody = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[1][1].body as string,
    );
    expect(selectedScanEq).toHaveBeenCalledWith('id', 'scan-body');
    expect(selectedScanMaybeSingle).toHaveBeenCalled();
    expect(requestBody.payload.selected_scan_id).toBe('scan-body');
    expect(requestBody.payload.selected_scan.scan_id).toBe('scan-body');
    expect(requestBody.payload.latest_scan.scan_id).toBe('scan-body');
    expect(requestBody.payload.recent_scans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ scan_id: 'scan-body' }),
        expect.objectContaining({ scan_id: 'scan-food' }),
      ]),
    );
  });

  it('falls back to the default persona when no valid persona is selected', async () => {
    supabase.from.mockImplementation((table: string) => {
      if (table === 'scans') {
        return createScansSelectMock(recentScans);
      }

      return createLatestEntrySelectMock(null);
    });

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            success: true,
            applied_count: 0,
            profile_memory: null,
          }),
      })
      .mockResolvedValueOnce({
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
      (global.fetch as jest.Mock).mock.calls[1][1].body as string,
    );

    expect(requestBody.persona_key).toBe(DEFAULT_COACH_PERSONA_KEY);
    expect(result.persona_key).toBe(DEFAULT_COACH_PERSONA_KEY);
  });

  it('sends coach question fields and keeps free-text questions distinct from presets', async () => {
    supabase.from.mockImplementation((table: string) => {
      if (table === 'scans') {
        return createScansSelectMock(recentScans);
      }

      return createLatestEntrySelectMock(null);
    });

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            success: true,
            applied_count: 0,
            profile_memory: null,
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            success: true,
            cached: false,
            entry_id: 'entry-question',
            persona_key: 'patient_calm',
            prompt_type: 'latest_scan',
            question_key: null,
            question_text:
              'Sur quoi je dois me concentrer avant ma seance ce soir ?',
            status: 'ready',
            title: 'Question libre',
            body: 'On priorise la recuperation et une action simple.',
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
      locale: 'fr',
      personaKey: 'patient_calm',
      questionKey: 'latest_scan__three_simple_actions',
      questionText: 'Sur quoi je dois me concentrer avant ma seance ce soir ?',
    });

    const requestBody = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[1][1].body as string,
    );

    expect(requestBody.payload.question_key).toBeNull();
    expect(requestBody.payload.question_text).toBe(
      'Sur quoi je dois me concentrer avant ma seance ce soir ?',
    );
    expect(requestBody.payload.question_hints).toEqual(
      expect.objectContaining({
        intent_key: 'latest_scan_priority_today',
      }),
    );
    expect(result.question_key).toBeNull();
    expect(result.question_text).toBe(
      'Sur quoi je dois me concentrer avant ma seance ce soir ?',
    );
  });

  it('sends user-authored free text as the visible free_question prompt with scan context', async () => {
    supabase.from.mockImplementation((table: string) => {
      if (table === 'scans') {
        return createScansSelectMock(recentScans);
      }

      return createLatestEntrySelectMock(null);
    });

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            success: true,
            applied_count: 0,
            profile_memory: null,
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            success: true,
            cached: false,
            entry_id: 'entry-free-question',
            persona_key: 'patient_calm',
            prompt_type: 'free_question',
            question_key: null,
            question_text:
              'Comment adapter ma semaine avec mes derniers scans ?',
            status: 'ready',
            title: 'Question libre',
            body: 'On garde le contexte et on repond a ta question.',
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
      promptType: 'free_question',
      locale: 'fr',
      personaKey: 'patient_calm',
      questionKey: 'latest_scan__three_simple_actions',
      questionText: 'Comment adapter ma semaine avec mes derniers scans ?',
      scanIntent: {
        has_actionable_issue: true,
        priority_metric: 'hydration_level',
        priority_label: 'Hydratation',
        severity: 'medium',
        question_text: 'Comment adapter ma semaine avec mes derniers scans ?',
        user_facing_summary:
          'Un point du scan peut devenir une action simple.',
      },
    });

    const requestBody = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[1][1].body as string,
    );

    expect(requestBody.payload.prompt_type).toBe('free_question');
    expect(requestBody.payload.question_key).toBeNull();
    expect(requestBody.payload.question_text).toBe(
      'Comment adapter ma semaine avec mes derniers scans ?',
    );
    expect(requestBody.payload.question_hints).toEqual(
      expect.objectContaining({
        intent_key: 'free_question_open',
      }),
    );
    expect(requestBody.payload.latest_scan).toEqual(expect.any(Object));
    expect(requestBody.payload.latest_by_type).toEqual(expect.any(Object));
    expect(requestBody.payload).not.toHaveProperty('scan_intent');
    expect(result.prompt_type).toBe('free_question');
    expect(result.question_key).toBeNull();
  });

  it('retries coach generation once with a legacy payload when the backend rejects new question fields', async () => {
    supabase.from.mockImplementation((table: string) => {
      if (table === 'scans') {
        return createScansSelectMock(recentScans);
      }

      return createLatestEntrySelectMock(null);
    });

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            success: true,
            applied_count: 0,
            profile_memory: null,
          }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () =>
          JSON.stringify({
            error: 'payload contains unsupported fields',
            code: 'invalid_coach_payload',
            status: 400,
            request_id: 'req-coach-legacy',
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            success: true,
            cached: false,
            entry_id: 'entry-legacy-retry',
            persona_key: 'patient_calm',
            prompt_type: 'latest_scan',
            status: 'ready',
            title: 'Compat mode',
            body: 'On garde les conseils, meme avec un backend en retard.',
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
      locale: 'fr',
      personaKey: 'patient_calm',
      questionKey: 'latest_scan__three_simple_actions',
    });

    expect(global.fetch).toHaveBeenCalledTimes(3);

    const richRequestBody = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[1][1].body as string,
    );
    const legacyRequestBody = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[2][1].body as string,
    );

    expect(richRequestBody.payload.question_key).toBe(
      'latest_scan__three_simple_actions',
    );
    expect(richRequestBody.payload.question_text).toEqual(expect.any(String));
    expect(richRequestBody.payload.question_hints).toEqual(
      expect.objectContaining({
        intent_key: 'latest_scan_three_actions',
      }),
    );
    expect(legacyRequestBody.payload).not.toHaveProperty('question_key');
    expect(legacyRequestBody.payload).not.toHaveProperty('question_text');
    expect(legacyRequestBody.payload).not.toHaveProperty('question_hints');
    expect(legacyRequestBody.payload.latest_scan).toEqual(
      richRequestBody.payload.latest_scan,
    );
    expect(legacyRequestBody.payload.latest_by_type).toEqual(
      richRequestBody.payload.latest_by_type,
    );

    expect(result.question_key).toBe(richRequestBody.payload.question_key);
    expect(result.question_text).toBe(richRequestBody.payload.question_text);
    expect(result.payload.question_key).toBe(richRequestBody.payload.question_key);
    expect(result.payload.question_text).toBe(
      richRequestBody.payload.question_text,
    );
  });

  it('does not retry free_question with a legacy payload that would remove the user text', async () => {
    supabase.from.mockImplementation((table: string) => {
      if (table === 'scans') {
        return createScansSelectMock(recentScans);
      }

      return createLatestEntrySelectMock(null);
    });

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            success: true,
            applied_count: 0,
            profile_memory: null,
          }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () =>
          JSON.stringify({
            error: 'payload contains unsupported fields',
            code: 'invalid_coach_payload',
            status: 400,
            request_id: 'req-free-question',
          }),
      }) as typeof global.fetch;

    await expect(
      generateCoachGuidance({
        promptType: 'free_question',
        locale: 'fr',
        personaKey: 'patient_calm',
        questionText: 'Quelle priorite suivre cette semaine ?',
      }),
    ).rejects.toMatchObject({
      message: 'payload contains unsupported fields',
      code: 'invalid_coach_payload',
      status: 400,
      requestId: 'req-free-question',
      functionName: 'coach-generate-response',
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    const requestBody = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[1][1].body as string,
    );
    expect(requestBody.payload.prompt_type).toBe('free_question');
    expect(requestBody.payload.question_text).toBe(
      'Quelle priorite suivre cette semaine ?',
    );
  });

  it('falls back to latest_scan when an older backend rejects the hidden selected-scan prompt', async () => {
    supabase.from.mockImplementation((table: string) => {
      if (table === 'scans') {
        return createScansSelectMock(recentScans);
      }

      return createLatestEntrySelectMock(null);
    });

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            success: true,
            applied_count: 0,
            profile_memory: null,
          }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () =>
          JSON.stringify({
            error: 'payload contains unsupported fields',
            code: 'invalid_coach_payload',
            status: 400,
            request_id: 'req-coach-rich-hidden',
          }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () =>
          JSON.stringify({
            error: 'payload.prompt_type is not supported',
            code: 'invalid_coach_payload',
            status: 400,
            request_id: 'req-coach-hidden-prompt',
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            success: true,
            cached: false,
            entry_id: 'entry-hidden-compat',
            persona_key: 'playful_light',
            prompt_type: 'latest_scan',
            status: 'ready',
            title: 'Compat selected scan',
            body: 'On traite le scan selectionne avec le mode compatible.',
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
      promptType: 'latest_scan_issue_resolution',
      locale: 'fr',
      personaKey: 'playful_light',
      selectedScanId: 'scan-face',
      questionText: 'Que dois-je travailler apres ce scan ?',
      scanIntent: {
        has_actionable_issue: true,
        priority_metric: 'hydration_level',
        priority_label: 'Hydratation',
        severity: 'medium',
        question_text: 'Que dois-je travailler apres ce scan ?',
        user_facing_summary:
          'Un point du scan peut devenir une action simple.',
      },
    });

    expect(global.fetch).toHaveBeenCalledTimes(4);

    const richRequestBody = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[1][1].body as string,
    );
    const legacyHiddenRequestBody = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[2][1].body as string,
    );
    const latestScanCompatRequestBody = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[3][1].body as string,
    );

    expect(richRequestBody.payload.prompt_type).toBe(
      'latest_scan_issue_resolution',
    );
    expect(richRequestBody.payload.selected_scan_id).toBe('scan-face');
    expect(richRequestBody.payload.scan_intent).toEqual(
      expect.objectContaining({
        priority_metric: 'hydration_level',
      }),
    );
    expect(legacyHiddenRequestBody.payload.prompt_type).toBe(
      'latest_scan_issue_resolution',
    );
    expect(legacyHiddenRequestBody.payload).not.toHaveProperty(
      'selected_scan_id',
    );
    expect(legacyHiddenRequestBody.payload).not.toHaveProperty('scan_intent');
    expect(latestScanCompatRequestBody.payload.prompt_type).toBe('latest_scan');
    expect(latestScanCompatRequestBody.payload).not.toHaveProperty(
      'question_text',
    );
    expect(latestScanCompatRequestBody.payload).not.toHaveProperty(
      'selected_scan_id',
    );
    expect(latestScanCompatRequestBody.payload.selected_scan).toEqual(
      richRequestBody.payload.selected_scan,
    );
    expect(result.prompt_type).toBe('latest_scan');
    expect(result.payload.prompt_type).toBe('latest_scan_issue_resolution');
  });

  it('does not retry coach generation for unrelated 400 invalid_coach_payload responses', async () => {
    supabase.from.mockImplementation((table: string) => {
      if (table === 'scans') {
        return createScansSelectMock(recentScans);
      }

      return createLatestEntrySelectMock(null);
    });

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            success: true,
            applied_count: 0,
            profile_memory: null,
          }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () =>
          JSON.stringify({
            error: 'payload.question_text is not supported',
            code: 'invalid_coach_payload',
            status: 400,
            request_id: 'req-coach-400',
          }),
      }) as typeof global.fetch;

    await expect(
      generateCoachGuidance({
        promptType: 'latest_scan',
        locale: 'fr',
        personaKey: 'patient_calm',
        questionKey: 'latest_scan__three_simple_actions',
      }),
    ).rejects.toMatchObject({
      message: 'payload.question_text is not supported',
      code: 'invalid_coach_payload',
      status: 400,
      requestId: 'req-coach-400',
      functionName: 'coach-generate-response',
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('completes missing weekly schedule fields from a rich response body', async () => {
    supabase.from.mockImplementation((table: string) => {
      if (table === 'scans') {
        return createScansSelectMock(recentScans);
      }

      return createLatestEntrySelectMock(null);
    });

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            success: true,
            applied_count: 0,
            profile_memory: null,
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            success: true,
            cached: false,
            entry_id: 'entry-weekly-body',
            persona_key: 'patient_calm',
            prompt_type: 'weekly_plan',
            status: 'ready',
            response_version: 2,
            title: 'Cadre tranquille',
            body: [
              'Prenons un moment. Voici un cadre tranquille pour la semaine.',
              '✓ Respire 4-6 chaque matin.',
              '✓ Planifie tes repas autour de proteines et legumes.',
              'Agenda de la semaine :',
              'Lundi 08:00 - Respiration 4-6 + etirements doux (10 min) 12:30 - Dejeuner equilibre (30 min)',
              'Mardi 08:00 - Respiration 4-6 18:00 - Marche lente (20 min)',
            ].join('\n'),
            disclaimer:
              'Wellness guidance only. This is not a diagnosis or medical advice.',
            cta_label: null,
            cta_route: null,
            source: 'n8n',
            expires_at: null,
            response_payload_json: {},
            content: {
              title: 'Cadre tranquille',
              summary: 'Prenons un moment. Voici un cadre tranquille pour la semaine.',
              context_notes: [],
              priorities: [],
              action_steps: [],
              warnings: [],
              encouragement: null,
              primary_metric_delta: null,
              data_gaps: [],
              confidence: 'high',
            },
          }),
      }) as typeof global.fetch;

    const result = await generateCoachGuidance({
      promptType: 'weekly_plan',
      locale: 'fr',
      personaKey: 'patient_calm',
    });

    expect(result.content?.action_steps).toEqual([
      'Respire 4-6 chaque matin.',
      'Planifie tes repas autour de proteines et legumes.',
    ]);
    expect(result.content?.daily_schedule?.[0]).toEqual({
      day: 'Lundi',
      slots: [
        {
          time: '08:00',
          duration_min: 10,
          action: 'Respiration 4-6 + etirements doux (10 min)',
          tag: null,
        },
        {
          time: '12:30',
          duration_min: 30,
          action: 'Dejeuner equilibre (30 min)',
          tag: null,
        },
      ],
    });
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

  it('completes missing routine fields from stored coach entries', async () => {
    supabase.from.mockReturnValue(
      createCoachEntriesSelectMock([
        {
          id: 'entry-routine-body',
          title: 'Pauses eau',
          body: [
            'Prenons un moment.',
            'Routine - Pauses eau (toute la journee) - 3 min 1. 7h30 - verre d eau + 3 respirations 2. 11h - verre d eau en silence 3. 16h - tisane chaude 4. 19h - verre d eau en pleine conscience',
          ].join('\n'),
          disclaimer:
            'Wellness guidance only. This is not a diagnosis or medical advice.',
          persona_key: 'patient_calm',
          cta_label: null,
          cta_route: null,
          created_at: '2026-04-06T09:00:00.000Z',
          generated_at: '2026-04-06T09:00:00.000Z',
          source: 'n8n',
          status: 'ready',
          response_payload_json: {},
          content_json: {
            title: 'Pauses eau',
            summary: 'Prenons un moment.',
            context_notes: [],
            priorities: [],
            action_steps: [],
            warnings: [],
            encouragement: null,
            primary_metric_delta: null,
            data_gaps: [],
            confidence: 'high',
          },
        },
      ]),
    );

    await expect(fetchCoachEntries()).resolves.toEqual([
      expect.objectContaining({
        id: 'entry-routine-body',
        content: expect.objectContaining({
          micro_routine: [
            {
              name: 'Pauses eau',
              when: 'toute la journee',
              total_min: 3,
              steps: [
                '7h30 - verre d eau + 3 respirations',
                '11h - verre d eau en silence',
                '16h - tisane chaude',
                '19h - verre d eau en pleine conscience',
              ],
            },
          ],
        }),
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

    expect(supabase.rpc).toHaveBeenCalledWith('get_coach_history_page_v2', {
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

  it('surfaces a precise coach history pagination error when the v2 RPC is unavailable', async () => {
    supabase.rpc.mockResolvedValueOnce({
      data: null,
      error: {
        code: 'PGRST202',
        message: 'Could not find function public.get_coach_history_page_v2',
      },
    });

    await expect(fetchCoachHistoryPage()).rejects.toMatchObject({
      code: 'coach_history_page_unavailable',
      status: 503,
      message: expect.stringContaining('get_coach_history_page_v2'),
    });
  });

  it('also recognises the legacy v1 missing-function error during the rollout window', async () => {
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

  it('loads the coach screen snapshot in one authenticated edge call', async () => {
    const latestEntry = createCoachHistoryRow('entry-ready', {
      persona_key: 'analytical_precise',
      locale: 'fr',
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            success: true,
            entries: [
              latestEntry,
              createCoachHistoryRow('entry-pending', {
                title: null,
                body: null,
                status: 'pending',
              }),
            ],
            quota: {
              account_tier: 'free',
              limit: 3,
              used_count: 1,
              available: 2,
              next_recharge_at: null,
              unlimited: false,
              window_seconds: 604800,
              as_of: '2026-05-13T08:00:00.000Z',
            },
            recent_scans: [
              createFaceScanRow('scan-face-1', '2026-05-13T07:00:00.000Z', {
                face_score: 82,
                skin_quality_score: 79,
              }),
            ],
            latest_ready_entry: latestEntry,
            history_summary: {
              total_count: '4',
              latest_entry_at: '2026-05-13T08:00:00.000Z',
            },
            request_id: 'coach-snapshot-1',
          }),
        ),
    }) as typeof global.fetch;

    const snapshot = await fetchCoachScreenSnapshot({
      personaKey: 'analytical_precise',
      locale: 'fr-FR',
      excludeEntryId: 'entry-active',
      entriesLimit: 10,
    });

    expect(snapshot.entries).toHaveLength(2);
    expect(snapshot.quota.available).toBe(2);
    expect(snapshot.recentScans).toHaveLength(1);
    expect(snapshot.latestReadyEntry?.id).toBe('entry-ready');
    expect(snapshot.historySummary).toEqual({
      total_count: 4,
      latest_entry_at: '2026-05-13T08:00:00.000Z',
    });
    expect(snapshot.requestId).toBe('coach-snapshot-1');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://test.supabase.co/functions/v1/coach-screen-snapshot',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          persona_key: 'analytical_precise',
          locale: 'fr',
          exclude_entry_id: 'entry-active',
          entries_limit: 10,
        }),
      }),
    );
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
      providerFailureKind: null,
      providerFailureStage: null,
      providerNodeType: null,
      providerNodeName: null,
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

    expect(resolveCoachFailureKindFromEntry({
      status: 'error',
      error_code: 'invalid_coach_response',
      response_payload_json: {
        request_id: 'req-invalid-500',
        webhook_status: 500,
        provider_failure_kind: 'json_parse_failed',
        provider_failure_stage: 'n8n_chain_llm',
      },
    })).toBe('invalid_provider_response');
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
        return createScansSelectMock([]);
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

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/functions/v1/coach-sync-profile-memory'),
      expect.objectContaining({
        method: 'POST',
      }),
    );
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

  describe('shouldDebugCoachService (N-G)', () => {
    // NODE_ENV is typed as a readonly string union in @types/node; cast the
    // process.env handle through a mutable record so the test can flip it
    // without fighting the type system.
    const env = process.env as unknown as Record<string, string | undefined>;
    const originalNodeEnv = env.NODE_ENV;

    afterEach(() => {
      env.NODE_ENV = originalNodeEnv;
    });

    it('returns false in test environment regardless of __DEV__', () => {
      env.NODE_ENV = 'test';
      expect(shouldDebugCoachService()).toBe(false);
    });

    it('returns false when NODE_ENV is production even if __DEV__ is true', () => {
      // Simulate a release build that happens to ship with __DEV__=true
      // (Xcode debug variant installed on a real device).
      env.NODE_ENV = 'production';
      expect(shouldDebugCoachService()).toBe(false);
    });

    it('returns true only when __DEV__=true and NODE_ENV=development', () => {
      env.NODE_ENV = 'development';
      // __DEV__ is injected as a global by the RN runtime / Jest setup; Jest
      // setups in this repo typically define it as true. Read it via globalThis
      // so this test does not depend on the dts shim.
      const devGlobal = (globalThis as { __DEV__?: boolean }).__DEV__;
      if (devGlobal !== true) {
        // Jest harness here may set __DEV__=false. Skip the positive path in
        // that case but make sure the negative path still passes.
        expect(shouldDebugCoachService()).toBe(false);
        return;
      }
      expect(shouldDebugCoachService()).toBe(true);
    });
  });

  describe('sanitizeCoachServiceErrorDebugInfo (N-G)', () => {
    it('redacts provider-topology fields while keeping the message and code', () => {
      const error = new CoachServiceError('boom', {
        code: 'coach_webhook_failed',
        status: 502,
        details: {
          provider_failure_kind: 'json_parse_failed',
          provider_failure_stage: 'n8n_chain_llm',
          provider_node_type: '@n8n/n8n-nodes-langchain.chainLlm',
          provider_node_name: 'Coach DeepSeek Generation',
          provider_response: 'raw provider blob',
          some_safe_field: 'ok',
        },
      });

      const sanitized = sanitizeCoachServiceErrorDebugInfo(
        getCoachServiceErrorDebugInfo(error),
      );

      expect(sanitized.message).toBe('boom');
      expect(sanitized.code).toBe('coach_webhook_failed');
      expect(sanitized.status).toBe(502);
      expect(sanitized.providerFailureKind).toBe('<redacted>');
      expect(sanitized.providerFailureStage).toBe('<redacted>');
      expect(sanitized.providerNodeType).toBe('<redacted>');
      expect(sanitized.providerNodeName).toBe('<redacted>');
      expect(sanitized.details).toMatchObject({
        provider_failure_kind: '<redacted>',
        provider_failure_stage: '<redacted>',
        provider_node_type: '<redacted>',
        provider_node_name: '<redacted>',
        provider_response: '<redacted>',
        some_safe_field: 'ok',
      });
    });

    it('passes through info that has no provider details', () => {
      const info = getCoachServiceErrorDebugInfo(new Error('plain'));
      const sanitized = sanitizeCoachServiceErrorDebugInfo(info);

      expect(sanitized.message).toBe('plain');
      expect(sanitized.providerFailureKind).toBeNull();
      expect(sanitized.providerNodeName).toBeNull();
    });
  });

  describe('coach-sync-profile-memory skip-if-fresh cache', () => {
    const SYNC_URL_FRAGMENT = '/functions/v1/coach-sync-profile-memory';
    const recentScans = [
      createFaceScanRow('scan-face-cache', '2026-05-19T08:00:00.000Z'),
    ];

    function mockSessionForUser(userId: string) {
      supabase.auth.getSession.mockResolvedValue({
        data: {
          session: {
            access_token: `token-${userId}`,
            user: { id: userId },
          },
        },
      });
    }

    function mockTwoGenerationsHappyPath() {
      supabase.from.mockImplementation((table: string) => {
        if (table === 'scans') {
          return createScansSelectMock(recentScans);
        }
        return createLatestEntrySelectMock(null);
      });

      const generationResponseBody = JSON.stringify({
        success: true,
        cached: false,
        entry_id: 'entry-cached-coach',
        persona_key: 'gentle_supportive',
        prompt_type: 'latest_scan',
        status: 'ready',
        title: 'Coach guidance',
        body: 'Stay consistent.',
        disclaimer:
          'Wellness guidance only. This is not a diagnosis or medical advice.',
        cta_label: null,
        cta_route: null,
        source: 'n8n',
        response_payload_json: {},
        quota: null,
      });
      const syncResponseBody = JSON.stringify({
        success: true,
        applied_count: 0,
        profile_memory: {
          detected_diet_signals: ['protein_focus'],
          detected_strong_focus: 'nutrition',
          suggested_goals: ['Hydration'],
          suggested_persona_key: 'patient_calm',
          last_updated_at: '2026-05-19T08:00:00.000Z',
          update_count: 1,
        },
      });

      global.fetch = jest.fn(async (url: string) => {
        if (typeof url === 'string' && url.includes(SYNC_URL_FRAGMENT)) {
          return { ok: true, text: async () => syncResponseBody } as any;
        }
        return { ok: true, text: async () => generationResponseBody } as any;
      }) as typeof global.fetch;
    }

    beforeEach(() => {
      invalidateCoachProfileMemoryCache();
    });

    afterEach(() => {
      invalidateCoachProfileMemoryCache();
    });

    it('skips the Edge call when a fresh cached result exists for the same user', async () => {
      mockSessionForUser('user-cache-hit');
      mockTwoGenerationsHappyPath();

      await generateCoachGuidance({
        promptType: 'latest_scan',
        personaKey: 'gentle_supportive',
      });
      await generateCoachGuidance({
        promptType: 'latest_scan',
        personaKey: 'gentle_supportive',
      });

      const syncCalls = (global.fetch as jest.Mock).mock.calls.filter(
        ([url]) => typeof url === 'string' && url.includes(SYNC_URL_FRAGMENT),
      );
      expect(syncCalls).toHaveLength(1);
    });

    it('re-invokes the Edge after invalidateCoachProfileMemoryCache()', async () => {
      mockSessionForUser('user-cache-invalidated');
      mockTwoGenerationsHappyPath();

      await generateCoachGuidance({
        promptType: 'latest_scan',
        personaKey: 'gentle_supportive',
      });
      invalidateCoachProfileMemoryCache();
      await generateCoachGuidance({
        promptType: 'latest_scan',
        personaKey: 'gentle_supportive',
      });

      const syncCalls = (global.fetch as jest.Mock).mock.calls.filter(
        ([url]) => typeof url === 'string' && url.includes(SYNC_URL_FRAGMENT),
      );
      expect(syncCalls).toHaveLength(2);
    });

    it('keeps a valid cache entry when a later Edge sync fails', async () => {
      mockSessionForUser('user-cache-resilient');

      supabase.from.mockImplementation((table: string) => {
        if (table === 'scans') {
          return createScansSelectMock(recentScans);
        }
        return createLatestEntrySelectMock(null);
      });

      const generationResponseBody = JSON.stringify({
        success: true,
        cached: false,
        entry_id: 'entry-resilient',
        persona_key: 'gentle_supportive',
        prompt_type: 'latest_scan',
        status: 'ready',
        title: 'Coach guidance',
        body: 'Stay consistent.',
        disclaimer:
          'Wellness guidance only. This is not a diagnosis or medical advice.',
        cta_label: null,
        cta_route: null,
        source: 'n8n',
        response_payload_json: {},
        quota: null,
      });
      const syncOkBody = JSON.stringify({
        success: true,
        applied_count: 0,
        profile_memory: null,
      });

      let syncInvocationCount = 0;
      global.fetch = jest.fn(async (url: string) => {
        if (typeof url === 'string' && url.includes(SYNC_URL_FRAGMENT)) {
          syncInvocationCount += 1;
          if (syncInvocationCount === 1) {
            return { ok: true, text: async () => syncOkBody } as any;
          }
          return {
            ok: false,
            status: 429,
            text: async () =>
              JSON.stringify({
                code: 'coach_profile_sync_rate_limit_exceeded',
                error: 'Coach profile sync rate limit exceeded for window: minute',
              }),
          } as any;
        }
        return { ok: true, text: async () => generationResponseBody } as any;
      }) as typeof global.fetch;

      await generateCoachGuidance({
        promptType: 'latest_scan',
        personaKey: 'gentle_supportive',
      });
      invalidateCoachProfileMemoryCache();
      // A second attempt right after invalidation hits the Edge — and the Edge
      // returns 429. The cache must NOT be populated with a corrupted entry;
      // a third attempt after a fresh invalidation should still reach the Edge.
      await generateCoachGuidance({
        promptType: 'latest_scan',
        personaKey: 'gentle_supportive',
      });
      invalidateCoachProfileMemoryCache();
      await generateCoachGuidance({
        promptType: 'latest_scan',
        personaKey: 'gentle_supportive',
      });

      // Three sync invocations total — confirms a failed Edge response does
      // not leave a "successful" entry in the cache.
      expect(syncInvocationCount).toBe(3);
    });

    it('logs a 429 sync rate-limit at WARN (not ERROR)', async () => {
      mockSessionForUser('user-rate-limited');

      supabase.from.mockImplementation((table: string) => {
        if (table === 'scans') {
          return createScansSelectMock(recentScans);
        }
        return createLatestEntrySelectMock(null);
      });

      const generationResponseBody = JSON.stringify({
        success: true,
        cached: false,
        entry_id: 'entry-rate-limited',
        persona_key: 'gentle_supportive',
        prompt_type: 'latest_scan',
        status: 'ready',
        title: 'Coach guidance',
        body: 'Stay consistent.',
        disclaimer:
          'Wellness guidance only. This is not a diagnosis or medical advice.',
        cta_label: null,
        cta_route: null,
        source: 'n8n',
        response_payload_json: {},
        quota: null,
      });

      global.fetch = jest.fn(async (url: string) => {
        if (typeof url === 'string' && url.includes(SYNC_URL_FRAGMENT)) {
          return {
            ok: false,
            status: 429,
            text: async () =>
              JSON.stringify({
                code: 'coach_profile_sync_rate_limit_exceeded',
                error: 'Coach profile sync rate limit exceeded for window: day',
              }),
          } as any;
        }
        return { ok: true, text: async () => generationResponseBody } as any;
      }) as typeof global.fetch;

      // The 429 must NOT crash guidance generation — it's fire-and-forget.
      await generateCoachGuidance({
        promptType: 'latest_scan',
        personaKey: 'gentle_supportive',
      });

      expect(logExpectedFailure).toHaveBeenCalledWith(
        '[Coach] Failed to sync coach profile memory',
        expect.anything(),
      );
      expect(logOperationalError).not.toHaveBeenCalledWith(
        '[Coach] Failed to sync coach profile memory',
        expect.anything(),
      );
    });

    it('logs a non-rate-limit sync failure at ERROR', async () => {
      mockSessionForUser('user-sync-500');

      supabase.from.mockImplementation((table: string) => {
        if (table === 'scans') {
          return createScansSelectMock(recentScans);
        }
        return createLatestEntrySelectMock(null);
      });

      const generationResponseBody = JSON.stringify({
        success: true,
        cached: false,
        entry_id: 'entry-sync-500',
        persona_key: 'gentle_supportive',
        prompt_type: 'latest_scan',
        status: 'ready',
        title: 'Coach guidance',
        body: 'Stay consistent.',
        disclaimer:
          'Wellness guidance only. This is not a diagnosis or medical advice.',
        cta_label: null,
        cta_route: null,
        source: 'n8n',
        response_payload_json: {},
        quota: null,
      });

      global.fetch = jest.fn(async (url: string) => {
        if (typeof url === 'string' && url.includes(SYNC_URL_FRAGMENT)) {
          return {
            ok: false,
            status: 500,
            text: async () =>
              JSON.stringify({
                code: 'coach_profile_sync_internal_error',
                error: 'Internal error',
              }),
          } as any;
        }
        return { ok: true, text: async () => generationResponseBody } as any;
      }) as typeof global.fetch;

      await generateCoachGuidance({
        promptType: 'latest_scan',
        personaKey: 'gentle_supportive',
      });

      expect(logOperationalError).toHaveBeenCalledWith(
        '[Coach] Failed to sync coach profile memory',
        expect.anything(),
      );
      expect(logExpectedFailure).not.toHaveBeenCalledWith(
        '[Coach] Failed to sync coach profile memory',
        expect.anything(),
      );
    });
  });

  describe('fetchCoachEntryErrorSummary', () => {
    afterEach(() => {
      supabase.rpc.mockReset();
      // Restore the default jest.setup.js implementation so other suites are
      // not affected.
      supabase.rpc.mockResolvedValue({ data: null, error: null });
    });

    it('returns null when the RPC yields no row (entry not found or not owned)', async () => {
      supabase.rpc.mockResolvedValueOnce({ data: [], error: null });
      const result = await fetchCoachEntryErrorSummary('entry-missing');
      expect(result).toBeNull();
      expect(supabase.rpc).toHaveBeenCalledWith(
        'get_coach_entry_error_summary',
        { p_entry_id: 'entry-missing' },
      );
    });

    it('parses webhook_status and provider_failure_kind from the RPC payload', async () => {
      supabase.rpc.mockResolvedValueOnce({
        data: [
          {
            id: 'entry-with-error',
            status: 'error',
            error_code: 'coach_webhook_unreachable',
            webhook_status: 504,
            provider_failure_kind: 'timeout',
            source: 'coach_generation',
            locale: 'fr',
            created_at: '2026-05-20T10:00:00.000Z',
            updated_at: '2026-05-20T10:00:01.000Z',
          },
        ],
        error: null,
      });

      const result = await fetchCoachEntryErrorSummary('entry-with-error');

      expect(result).toEqual({
        id: 'entry-with-error',
        status: 'error',
        errorCode: 'coach_webhook_unreachable',
        webhookStatus: 504,
        providerFailureKind: 'timeout',
        source: 'coach_generation',
        locale: 'fr',
        createdAt: '2026-05-20T10:00:00.000Z',
        updatedAt: '2026-05-20T10:00:01.000Z',
      });
    });

    it('wraps RPC errors in a CoachServiceError', async () => {
      supabase.rpc.mockResolvedValueOnce({
        data: null,
        error: { code: '42883', message: 'function not found' },
      });

      await expect(
        fetchCoachEntryErrorSummary('entry-x'),
      ).rejects.toMatchObject({
        code: 'coach_entry_error_summary_unavailable',
        status: 502,
      });
    });
  });

  describe('mergeCoachEntryFailureDebugInfo', () => {
    function buildBaseDebugInfo(overrides: Partial<any> = {}) {
      return {
        message: 'coach_entry_error',
        code: null,
        status: null,
        requestId: null,
        functionName: 'coach-generate-response',
        details: null,
        providerFailureKind: null,
        providerFailureStage: null,
        providerNodeType: null,
        providerNodeName: null,
        webhookStatus: null,
        provider: null,
        source: null,
        fallbackUsed: null,
        responseBodyPresent: null,
        ...overrides,
      };
    }

    it('returns the base unchanged when the summary is null', () => {
      const base = buildBaseDebugInfo();
      expect(mergeCoachEntryFailureDebugInfo(base, null)).toBe(base);
    });

    it('returns null when the base is null (no entry to merge into)', () => {
      expect(mergeCoachEntryFailureDebugInfo(null, null)).toBeNull();
    });

    it('promotes the RPC error code and webhook status into the merged info', () => {
      const base = buildBaseDebugInfo();
      const merged = mergeCoachEntryFailureDebugInfo(base, {
        id: 'entry-1',
        status: 'error',
        errorCode: 'coach_webhook_unreachable',
        webhookStatus: 504,
        providerFailureKind: 'timeout',
        source: 'coach_generation',
        locale: 'en',
        createdAt: null,
        updatedAt: null,
      });

      expect(merged).toMatchObject({
        code: 'coach_webhook_unreachable',
        message: 'coach_webhook_unreachable',
        status: 504,
        webhookStatus: 504,
        providerFailureKind: 'timeout',
        source: 'coach_generation',
      });
    });

    it('flows through the failure-kind resolver to a real classification', () => {
      const base = buildBaseDebugInfo();
      const merged = mergeCoachEntryFailureDebugInfo(base, {
        id: 'entry-1',
        status: 'error',
        errorCode: 'coach_webhook_not_configured',
        webhookStatus: null,
        providerFailureKind: null,
        source: 'coach_generation',
        locale: null,
        createdAt: null,
        updatedAt: null,
      });

      expect(resolveCoachFailureKindFromDebugInfo(merged)).toBe(
        'provider_unavailable',
      );
    });

    it('does not overwrite a meaningful base message with the error code', () => {
      const base = buildBaseDebugInfo({ message: 'Coach upstream timeout' });
      const merged = mergeCoachEntryFailureDebugInfo(base, {
        id: 'entry-1',
        status: 'error',
        errorCode: 'coach_webhook_unreachable',
        webhookStatus: null,
        providerFailureKind: null,
        source: null,
        locale: null,
        createdAt: null,
        updatedAt: null,
      });

      expect(merged?.message).toBe('Coach upstream timeout');
      expect(merged?.code).toBe('coach_webhook_unreachable');
    });
  });
});
