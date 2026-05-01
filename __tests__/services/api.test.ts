import { ApiService } from '@/services/api';

// Mock expo-file-system/next
const mockBase64 = jest.fn();
jest.mock('expo-file-system/next', () => ({
  File: jest.fn().mockImplementation((uri: string) => ({
    uri,
    base64: () => mockBase64(),
  })),
}));

// Mock base64-arraybuffer
const mockDecode = jest.fn().mockReturnValue(new ArrayBuffer(100));
jest.mock('base64-arraybuffer', () => ({
  decode: (...args: any[]) => mockDecode(...args),
}));

// Mock supabase
const mockGetUser = jest.fn();
const mockGetSession = jest.fn();
const mockFrom = jest.fn();
const mockRpc = jest.fn();
const mockStorageUpload = jest.fn().mockResolvedValue({ error: null });
const mockStorageGetPublicUrl = jest.fn().mockReturnValue({
  data: { publicUrl: 'https://example.com/image.jpg' },
});
const mockStorageCreateSignedUrl = jest.fn().mockResolvedValue({
  data: { signedUrl: 'https://example.com/signed-image.jpg' },
  error: null,
});
const mockStorageFrom = jest.fn().mockReturnValue({
  upload: mockStorageUpload,
  getPublicUrl: mockStorageGetPublicUrl,
  createSignedUrl: mockStorageCreateSignedUrl,
});

jest.mock('@/services/supabase', () => ({
  supabase: {
    auth: {
      getUser: () => mockGetUser(),
      getSession: () => mockGetSession(),
    },
    from: (table: string) => mockFrom(table),
    rpc: (fn: string, args: Record<string, unknown>) => mockRpc(fn, args),
    storage: {
      from: (bucket: string) => mockStorageFrom(bucket),
    },
  },
}));

jest.mock('@/services/authenticatedStorage', () => {
  class AuthenticatedStorageSessionError extends Error {
    code: 'auth_session_required' | 'auth_session_mismatch';
    status = 401;
    constructor(message: string, options: { code: 'auth_session_required' | 'auth_session_mismatch' }) {
      super(message);
      this.name = 'AuthenticatedStorageSessionError';
      this.code = options.code;
    }
  }

  return {
    AuthenticatedStorageSessionError,
    requireCurrentSessionForUser: jest.fn((userId: string) =>
      Promise.resolve({
        access_token: 'test-token',
        user: { id: userId },
      }),
    ),
    uploadAuthenticatedStorageObject: jest.fn(async (options: { bucket: string; path: string; fileBody: ArrayBuffer; fileOptions?: unknown }) => {
      const supabaseModule = jest.requireMock('@/services/supabase') as {
        supabase: { storage?: { from?: jest.Mock } };
      };
      const result = await supabaseModule.supabase.storage
        ?.from?.(options.bucket)
        .upload(options.path, options.fileBody, options.fileOptions);
      return { error: result?.error ?? null };
    }),
    removeAuthenticatedStorageObject: jest.fn(() => Promise.resolve({ error: null })),
  };
});

// Mock expo-constants
jest.mock('expo-constants', () => ({
  expoConfig: {
    extra: {
      EXPO_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
    },
  },
}));

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

const createGamificationRpcResponse = (
  scanCount: number,
  overrides: Record<string, unknown> = {}
) => ({
  data: {
    scan_count: scanCount,
    mascot_stage: null,
    mascot_filename: null,
    mascot_image_url: null,
    ...overrides,
  },
  error: null,
});

const mockGamificationState = (
  scanCount: number,
  overrides: Record<string, unknown> = {}
) => {
  mockRpc.mockReturnValue({
    maybeSingle: jest.fn().mockResolvedValue(
      createGamificationRpcResponse(scanCount, overrides)
    ),
  });
};

describe('ApiService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStorageUpload.mockResolvedValue({ error: null });
    mockStorageGetPublicUrl.mockReturnValue({
      data: { publicUrl: 'https://example.com/image.jpg' },
    });
    mockGamificationState(0);
  });

  describe('getDashboard', () => {
    const mockDashboardQueries = (globalScore: number | null) => {
      mockFrom.mockImplementation((table: string) => {
        if (table === 'user_current_global_score') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({
                  data: globalScore === null ? null : { global_score: globalScore },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      });
    };

    it('returns dashboard data for authenticated user', async () => {
      const mockUser = { id: 'user-123' };
      mockGetUser.mockResolvedValue({ data: { user: mockUser } });

      mockFrom.mockImplementation((table: string) => {
        if (table === 'user_current_global_score') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({
                  data: { global_score: 85 },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      });

      const result = await ApiService.getDashboard();

      expect(result.healthScore).toBe(85);
      expect(result.calories.current).toBe(0);
      expect(result.calories.goal).toBe(2000);
      expect(result.bodyfat).toBe(0);
      expect(result.gamification).toEqual({
        scanCount: 0,
        mascotStage: 0,
        mascotFilename: 'stade_0.png',
        mascotImageUrl:
          'https://test.supabase.co/storage/v1/object/public/gamification-assets/stade_0.png',
      });
    });

    it.each([
      [0, 0, 'stade_0.png'],
      [1, 1, 'stade_1.png'],
      [3, 2, 'stade_2.png'],
      [5, 3, 'stade_3.png'],
      [10, 4, 'stade_4.png'],
      [20, 5, 'stade_5.png'],
      [30, 6, 'stade_6.png'],
      [50, 7, 'stade_7.png'],
      [100, 8, 'stade_8.png'],
      [150, 9, 'stade_9.png'],
      [200, 10, 'stade_10.png'],
    ])(
      'maps scan_count %i to mascot stage %i and filename %s',
      async (scanCount, mascotStage, mascotFilename) => {
        mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } });
        mockDashboardQueries(85);
        mockGamificationState(scanCount);

        const result = await ApiService.getDashboard();

        expect(result.gamification).toEqual({
          scanCount,
          mascotStage,
          mascotFilename,
          mascotImageUrl: `https://test.supabase.co/storage/v1/object/public/gamification-assets/${mascotFilename}`,
        });
      }
    );

    it('canonicalizes a legacy empty mascot filename returned by the backend', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } });
      mockDashboardQueries(85);
      mockGamificationState(0, {
        mascot_stage: 0,
        mascot_filename: 'image_vide.png',
        mascot_image_url: 'https://test.supabase.co/storage/v1/object/public/gamification-assets/image_vide.png',
      });

      const result = await ApiService.getDashboard();

      expect(result.gamification).toEqual({
        scanCount: 0,
        mascotStage: 0,
        mascotFilename: 'stade_0.png',
        mascotImageUrl:
          'https://test.supabase.co/storage/v1/object/public/gamification-assets/image_vide.png',
      });
    });

    it('throws error when user is not authenticated', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      await expect(ApiService.getDashboard()).rejects.toThrow('api_errors.unauthorized');
    });

    it('returns default values when no health score exists', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } });
      mockRpc.mockReturnValue({
        maybeSingle: jest.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      });

      mockFrom.mockImplementation((table: string) => {
        if (table === 'user_current_global_score') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({
                  data: null,
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      });

      const result = await ApiService.getDashboard();

      expect(result.healthScore).toBe(0);
      expect(result.calories.current).toBe(0);
      expect(result.calories.goal).toBe(2000);
      expect(result.bodyfat).toBe(0);
      expect(result.gamification).toEqual({
        scanCount: 0,
        mascotStage: 0,
        mascotFilename: 'stade_0.png',
        mascotImageUrl:
          'https://test.supabase.co/storage/v1/object/public/gamification-assets/stade_0.png',
      });
    });

    it('falls back to default gamification and warns once when the RPC is missing from schema cache', async () => {
      // P2-C Phase 2 — `console.warn` direct migré vers `logOperationalError`
      // (qui appelle `console.error` après avoir filtré les champs sensibles).
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      try {
        mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } });
        mockDashboardQueries(85);
        mockRpc.mockReturnValue({
          maybeSingle: jest.fn().mockResolvedValue({
            data: null,
            error: {
              code: 'PGRST202',
              details:
                'Searched for the function public.get_user_gamification_state without parameters or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache.',
              hint: 'Perhaps you meant to call the function public.generate_verification_code',
              message:
                'Could not find the function public.get_user_gamification_state without parameters in the schema cache',
            },
          }),
        });

        const firstResult = await ApiService.getDashboard();
        const secondResult = await ApiService.getDashboard();

        expect(firstResult.gamification).toEqual({
          scanCount: 0,
          mascotStage: 0,
          mascotFilename: 'stade_0.png',
          mascotImageUrl:
            'https://test.supabase.co/storage/v1/object/public/gamification-assets/stade_0.png',
        });
        expect(secondResult.gamification).toEqual(firstResult.gamification);
        expect(errorSpy).toHaveBeenCalledTimes(1);
        expect(errorSpy).toHaveBeenCalledWith(
          '[API] Gamification RPC unavailable, falling back to default state',
          expect.objectContaining({
            code: 'PGRST202',
          }),
        );
      } finally {
        errorSpy.mockRestore();
      }
    });

  });

  describe('getAnalytics', () => {
    const mockUser = { id: 'user-123' };
    const mockHealthScores = [
      { date: '2024-01-01', score: 80, calories_current: 1800, calories_goal: 2000, bodyfat: 20, muscle: 40 },
      { date: '2024-01-02', score: 82, calories_current: 1900, calories_goal: 2000, bodyfat: 19, muscle: 41 },
    ];

    beforeEach(() => {
      mockGetUser.mockResolvedValue({ data: { user: mockUser } });
    });

    it('returns analytics for 7 days period', async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === 'health_scores') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                gte: jest.fn().mockReturnValue({
                  order: jest.fn().mockReturnValue({
                    limit: jest.fn().mockResolvedValue({
                      data: mockHealthScores,
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'scan_metrics') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                gte: jest.fn().mockReturnValue({
                  order: jest.fn().mockReturnValue({
                    limit: jest.fn().mockResolvedValue({
                      data: [
                        { recorded_at: '2024-01-01', scan_type: 'face', face_score: 80, skin_quality_score: 85 },
                        { recorded_at: '2024-01-01', scan_type: 'body', body_score: 80, body_fat_percentage: 20 },
                        { recorded_at: '2024-01-02', scan_type: 'face', face_score: 82, skin_quality_score: 86 },
                        { recorded_at: '2024-01-02', scan_type: 'body', body_score: 82, body_fat_percentage: 19 },
                        { recorded_at: '2024-01-03', scan_type: 'nutrition', plate_health_score: 85, calories_estimate: 600, protein_grams: 25 },
                      ],
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      });

      const result = await ApiService.getAnalytics('7days');

      expect(result.period).toBe('7days');
      expect(result.healthScoreHistory).toHaveLength(2);
      expect(result.calorieHistory).toHaveLength(2);
      expect(result.bodyCompositionHistory).toHaveLength(2);
      expect(result.nutritionHistory).toHaveLength(1);
      expect(result.nutritionHistory[0].nutritionScore).toBe(85);
    });

    it('returns analytics for 30 days period', async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === 'health_scores') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                gte: jest.fn().mockReturnValue({
                  order: jest.fn().mockReturnValue({
                    limit: jest.fn().mockResolvedValue({
                      data: mockHealthScores,
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'scan_metrics') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                gte: jest.fn().mockReturnValue({
                  order: jest.fn().mockReturnValue({
                    limit: jest.fn().mockResolvedValue({
                      data: [],
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      });

      const result = await ApiService.getAnalytics('30days');

      expect(result.period).toBe('30days');
    });

    it('returns empty arrays when no data', async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === 'health_scores' || table === 'scan_metrics') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                gte: jest.fn().mockReturnValue({
                  order: jest.fn().mockReturnValue({
                    limit: jest.fn().mockResolvedValue({
                      data: null,
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      });

      const result = await ApiService.getAnalytics('7days');

      expect(result.healthScoreHistory).toHaveLength(0);
      expect(result.calorieHistory).toHaveLength(0);
      expect(result.bodyCompositionHistory).toHaveLength(0);
    });

    it('throws error when user not authenticated', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      await expect(ApiService.getAnalytics('7days')).rejects.toThrow('api_errors.unauthorized');
    });
  });

  describe('saveMetricsToHistory', () => {
    const mockUser = { id: 'user-123' };

    beforeEach(() => {
      mockGetUser.mockResolvedValue({ data: { user: mockUser } });
    });

    it.each([
      [
        'health',
        {
          schema_version: 3,
          scan_type: 'face',
          face_score: 84,
          perceived_age: 29,
          skin_quality_score: 77,
          symmetry_percentage: 91,
          fatigue_level: 14,
          energy_score: 8,
          face_shape_key: 'oval',
          collagen_level: 68,
          hydration_level: 73,
          photogenic_score: 8,
        },
        {
          scan_type: 'face',
          face_score: 84,
          face_symmetry_percentage: 91,
          face_energy_score: 8,
          skin_quality_score: 77,
          fatigue_level: 14,
        },
      ],
      [
        'body',
        {
          schema_version: 3,
          scan_type: 'body',
          body_score: 79,
          body_fat_percentage: 19,
          muscle_mass_key: 'balanced',
          body_type_key: 'athletic',
          posture_score: 8,
          waist_estimation_cm: 81,
          strength_index: 72,
          body_symmetry: 85,
          bmi_estimate: 24,
          metabolic_age: 31,
        },
        {
          scan_type: 'body',
          body_score: 79,
          body_metabolic_age: 31,
          body_strength_index: 72,
          body_fat_percentage: 19,
          waist_estimation_cm: 81,
        },
      ],
      [
        'nutrition',
        {
          schema_version: 3,
          scan_type: 'nutrition',
          plate_health_score: 88,
          calories_estimate: 560,
          protein_grams: 24,
          carbs_grams: 36,
          fat_grams: 18,
          verdict_key: 'balanced',
          glycemic_index_key: 'low',
          satiety_index: 9,
          ingredient_quality_key: 'good',
          main_vitamin_keys: ['vitamin_a', 'vitamin_c'],
        },
        {
          scan_type: 'nutrition',
          plate_health_score: 88,
          nutrition_satiety_index: 9,
          calories_estimate: 560,
          protein_grams: 24,
        },
      ],
      [
        'super',
        {
          schema_version: 3,
          scan_type: 'super_health_v2',
          global_risk_score: 41,
          urgency_flag: false,
          summary_key: 'stable',
          detected_conditions: [],
          disclaimer_key: 'medical_not_diagnosis',
        },
        {
          scan_type: 'super',
          global_risk_score: 41,
        },
      ],
    ] as const)(
      'upserts %s metrics with scan_id conflict handling',
      async (scanType, analysisResult, expectedFields) => {
        const mockUpsert = jest.fn().mockResolvedValue({ error: null });
        mockFrom.mockImplementation((table: string) => {
          if (table === 'scan_metrics') {
            return {
              upsert: mockUpsert,
            };
          }

          return {};
        });

        await ApiService.saveMetricsToHistory(
          'scan-123',
          scanType,
          analysisResult as any,
          '2026-03-27T10:00:00.000Z'
        );

        expect(mockUpsert).toHaveBeenCalledWith(
          expect.objectContaining({
            user_id: 'user-123',
            scan_id: 'scan-123',
            recorded_at: '2026-03-27T10:00:00.000Z',
            ...expectedFields,
          }),
          { onConflict: 'scan_id' }
        );
      }
    );

    it('does not persist a fake global risk score for fat_distribution_scan_v2', async () => {
      const mockUpsert = jest.fn().mockResolvedValue({ error: null });
      mockFrom.mockImplementation((table: string) => {
        if (table === 'scan_metrics') {
          return {
            upsert: mockUpsert,
          };
        }

        return {};
      });

      await ApiService.saveMetricsToHistory(
        'scan-fat-super',
        'super',
        {
          scan_type: 'fat_distribution_scan_v2',
          regions: [],
        } as any,
        '2026-03-27T10:00:00.000Z'
      );

      expect(mockUpsert).not.toHaveBeenCalled();
    });

    it('uses glow aliases when energy_score is missing', async () => {
      const mockUpsert = jest.fn().mockResolvedValue({ error: null });
      mockFrom.mockImplementation((table: string) => {
        if (table === 'scan_metrics') {
          return {
            upsert: mockUpsert,
          };
        }

        return {};
      });

      await ApiService.saveMetricsToHistory(
        'scan-123',
        'health',
        {
          schema_version: 3,
          scan_type: 'face',
          face_score: 84,
          perceived_age: 29,
          skin_quality_score: 77,
          symmetry_percentage: 91,
          fatigue_level: 14,
          face_shape_key: 'oval',
          collagen_level: 68,
          hydration_level: 73,
          photogenic_score: 8,
          glow_index: 8,
        } as any,
        '2026-03-27T10:00:00.000Z'
      );

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-123',
          scan_id: 'scan-123',
          recorded_at: '2026-03-27T10:00:00.000Z',
          scan_type: 'face',
          face_energy_score: 8,
        }),
        { onConflict: 'scan_id' }
      );
    });
  });

  describe('getPremiumPotentialData', () => {
    it('maps the RPC response to PremiumPotentialInputs', async () => {
      const mockMaybeSingle = jest.fn().mockResolvedValue({
        data: {
          scan_type: 'health',
          current_scan: {
            id: 'scan-123',
            user_id: 'user-123',
            scan_type: 'health',
            image_url: 'https://example.com/scan.jpg',
            analyzed_at: '2026-03-27T09:00:00.000Z',
            created_at: '2026-03-27T08:00:00.000Z',
            analysis_result: { scan_type: 'face', face_score: 83, energy_score: 7 },
          },
          historical_average_30d: '78.5',
          scan_count_total: '12',
          recent_score_history: [
            { date: '2026-03-10', score: 74 },
            { date: '2026-03-19', score: 77 },
          ],
        },
        error: null,
      });

      mockRpc.mockReturnValue({
        maybeSingle: mockMaybeSingle,
      });

      const result = await ApiService.getPremiumPotentialData('health', 'scan-123');

      expect(mockRpc).toHaveBeenCalledWith('get_premium_potential_data', {
        p_scan_type: 'health',
        p_scan_id: 'scan-123',
      });
      expect(result).toEqual({
        scanType: 'health',
        currentScan: expect.objectContaining({ id: 'scan-123', scan_type: 'health' }),
        historicalAverage30d: 78.5,
        scanCountTotal: 12,
        recentScoreHistory: [
          { date: '2026-03-10', score: 74 },
          { date: '2026-03-19', score: 77 },
        ],
      });
    });

    it('returns a null-safe premium potential payload for unsupported new super scans', async () => {
      mockRpc.mockReturnValue({
        maybeSingle: jest.fn().mockResolvedValue({
          data: {
            scan_type: 'super',
            current_scan: {
              id: 'scan-super-fat',
              user_id: 'user-123',
              scan_type: 'super',
              image_url: 'https://example.com/scan-super.jpg',
              analyzed_at: '2026-03-27T09:00:00.000Z',
              created_at: '2026-03-27T08:00:00.000Z',
              analysis_result: {
                scan_type: 'fat_distribution_scan_v2',
                regions: [],
              },
            },
            historical_average_30d: '42',
            scan_count_total: '7',
            recent_score_history: [
              { date: '2026-03-10', score: 68 },
            ],
          },
          error: null,
        }),
      });

      const result = await ApiService.getPremiumPotentialData('super', 'scan-super-fat');

      expect(result).toEqual({
        scanType: 'super',
        currentScan: expect.objectContaining({ id: 'scan-super-fat', scan_type: 'super' }),
        historicalAverage30d: null,
        scanCountTotal: 7,
        recentScoreHistory: [],
      });
    });

    it('returns an empty premium potential payload when the RPC returns no row', async () => {
      mockRpc.mockReturnValue({
        maybeSingle: jest.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      });

      const result = await ApiService.getPremiumPotentialData('nutrition');

      expect(result).toEqual({
        scanType: 'nutrition',
        currentScan: null,
        historicalAverage30d: null,
        scanCountTotal: 0,
        recentScoreHistory: [],
      });
    });
  });

  describe('getRecipes', () => {
    it('returns recipes list', async () => {
      const mockRecipes = [{ id: 1, name: 'Recipe 1' }, { id: 2, name: 'Recipe 2' }];

      mockFrom.mockImplementation(() => ({
        select: jest.fn().mockReturnValue({
          order: jest.fn().mockResolvedValue({
            data: mockRecipes,
            error: null,
          }),
        }),
      }));

      const result = await ApiService.getRecipes();

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Recipe 1');
    });

    it('returns empty array when no recipes', async () => {
      mockFrom.mockImplementation(() => ({
        select: jest.fn().mockReturnValue({
          order: jest.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
        }),
      }));

      const result = await ApiService.getRecipes();

      expect(result).toHaveLength(0);
    });
  });

  describe('getExercises', () => {
    it('returns exercises list', async () => {
      const mockExercises = [{ id: 1, name: 'Exercise 1' }];

      mockFrom.mockImplementation(() => ({
        select: jest.fn().mockReturnValue({
          order: jest.fn().mockResolvedValue({
            data: mockExercises,
            error: null,
          }),
        }),
      }));

      const result = await ApiService.getExercises();

      expect(result).toHaveLength(1);
    });
  });

  describe('checkScanEligibility', () => {
    it('returns eligibility response when allowed', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      });

      const mockResponse = {
        success: true,
        allowed: true,
        message: 'Scan allowed',
        current_count: 1,
        limit: 3,
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await ApiService.checkScanEligibility('health');

      expect(result.allowed).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/functions/v1/check-and-record-scan'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ scan_type: 'health' }),
        })
      );
    });

    it('throws error when not authenticated', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null } });

      await expect(ApiService.checkScanEligibility('health')).rejects.toThrow('api_errors.unauthorized');
    });

    it('throws error on HTTP error', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      });

      mockFetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'Limit exceeded' }),
      });

      await expect(ApiService.checkScanEligibility('health')).rejects.toThrow('Limit exceeded');
    });
  });

  describe('checkScanEligibilityOnly', () => {
    it('sends checkOnly flag', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ allowed: true }),
      });

      await ApiService.checkScanEligibilityOnly('body');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ scan_type: 'body', check_only: true }),
        })
      );
    });

    it('preserves message_key from the checkOnly eligibility payload', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          allowed: false,
          message: 'Limite hebdomadaire atteinte. Prochain scan disponible dans',
          message_key: 'scan_limits.msg_weekly_reached_with_time',
          next_available_date: Date.now() + 86400000,
        }),
      });

      const result = await ApiService.checkScanEligibilityOnly('health');

      expect(result.message_key).toBe('scan_limits.msg_weekly_reached_with_time');
    });
  });

  describe('getNextAvailableScanDate', () => {
    it('returns next available date', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      });

      const nextDate = Date.now() + 86400000;
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ next_available_date: nextDate }),
      });

      const result = await ApiService.getNextAvailableScanDate('nutrition');

      expect(result).toBe(nextDate);
    });

    it('returns null on error', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null } });

      const result = await ApiService.getNextAvailableScanDate('health');

      expect(result).toBeNull();
    });

    it('returns null when no next_available_date', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const result = await ApiService.getNextAvailableScanDate('health');

      expect(result).toBeNull();
    });
  });

  describe('analyzeScan', () => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      });
    });

    it('delegates scan analysis to the authenticated backend function', async () => {
      const backendScan = {
        id: 'scan-123',
        schema_version: 3,
        scan_type: 'nutrition',
        plate_health_score: 90,
        calories_estimate: 520,
        protein_grams: 26,
        carbs_grams: 41,
        fat_grams: 14,
        verdict_key: 'balanced',
        glycemic_index_key: 'low',
        satiety_index: 8,
        ingredient_quality_key: 'natural',
        main_vitamin_keys: ['vitamin_a', 'vitamin_c'],
        created_at: '2026-03-27T09:00:00.000Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            scan: backendScan,
          }),
      });

      const result = await ApiService.analyzeScan(
        'scan-123',
        'nutrition',
        'fr'
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.supabase.co/functions/v1/analyze-scan',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
          body: JSON.stringify({
            scan_id: 'scan-123',
            scan_type: 'nutrition',
            language: 'fr',
          }),
        })
      );
      expect(result).toEqual(backendScan);
    });

    it('defaults scan analysis language to French when omitted', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            scan: { id: 'scan-123', scan_type: 'health' },
          }),
      });

      await ApiService.analyzeScan('scan-123', 'health');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.supabase.co/functions/v1/analyze-scan',
        expect.objectContaining({
          body: JSON.stringify({
            scan_id: 'scan-123',
            scan_type: 'health',
            language: 'fr',
          }),
        })
      );
    });

    it('throws error when no authenticated session is available', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null } });

      await expect(
        ApiService.analyzeScan(
          'scan-123',
          'health',
          'fr'
        )
      ).rejects.toThrow('api_errors.unauthorized');
    });

    it('throws an ApiError when the backend analysis endpoint fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: () =>
          Promise.resolve({
            error: 'Analysis service unavailable',
          }),
      });

      await expect(
        ApiService.analyzeScan(
          'scan-123',
          'body',
          'fr'
        )
      ).rejects.toThrow('Analysis service unavailable');
    });

    it('maps provider type mismatches to TYPE_MISMATCH errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 422,
        json: () =>
          Promise.resolve({
            error: 'Expected face analysis for health, received body',
            code: 'analysis_type_mismatch',
            request_id: 'req-type-mismatch',
          }),
      });

      await expect(
        ApiService.analyzeScan(
          'scan-123',
          'health',
          'fr'
        )
      ).rejects.toMatchObject({
        type: 'TYPE_MISMATCH',
        code: 'analysis_type_mismatch',
        status: 422,
        requestId: 'req-type-mismatch',
      });
    });

    it('surfaces missing webhook configuration as a 503 provider error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: () =>
          Promise.resolve({
            error: 'Scan analysis provider is not configured',
            code: 'scan_webhook_not_configured',
            request_id: 'req-webhook-missing',
          }),
      });

      await expect(
        ApiService.analyzeScan(
          'scan-123',
          'super',
          'fr'
        )
      ).rejects.toMatchObject({
        type: 'PROVIDER',
        code: 'scan_webhook_not_configured',
        status: 503,
        requestId: 'req-webhook-missing',
      });
    });

    it('maps storage lookup failures to UPLOAD errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () =>
          Promise.resolve({
            error: 'Scan image not found in storage',
            code: 'scan_image_not_found',
            request_id: 'req-image-missing',
          }),
      });

      await expect(
        ApiService.analyzeScan('scan-123', 'health', 'fr')
      ).rejects.toMatchObject({
        type: 'UPLOAD',
        code: 'scan_image_not_found',
        status: 500,
        requestId: 'req-image-missing',
      });
    });

    it('maps internal finalize failures to EDGE_FUNCTION errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () =>
          Promise.resolve({
            error: 'Failed to persist scan analysis',
            code: 'scan_persistence_failed',
            request_id: 'req-persist-failed',
          }),
      });

      await expect(
        ApiService.analyzeScan('scan-123', 'health', 'fr')
      ).rejects.toMatchObject({
        type: 'EDGE_FUNCTION',
        code: 'scan_persistence_failed',
        status: 500,
        requestId: 'req-persist-failed',
      });
    });

    it('classifies aborted function calls as TIMEOUT instead of NETWORK', async () => {
      mockFetch.mockImplementationOnce((_url: string, options?: RequestInit) => {
        const signal = options?.signal as AbortSignal | undefined;

        return new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            const abortError = new Error('The operation was aborted.') as Error & {
              name: string;
            };
            abortError.name = 'AbortError';
            reject(abortError);
          });
        });
      });

      await expect(
        ApiService.analyzeScan('scan-123', 'health', 'fr', { timeoutMs: 1 })
      ).rejects.toMatchObject({
        type: 'TIMEOUT',
        code: 'request_timeout',
        context: expect.objectContaining({
          stage: 'analysis',
          scanId: 'scan-123',
          scanType: 'health',
        }),
      });
    });

    it('throws when scan_id is missing or invalid', async () => {
      await expect(
        ApiService.analyzeScan('', 'body', 'fr')
      ).rejects.toThrow('api_errors.validation');
    });
  });

  describe('createScanWithAnalysis', () => {
    beforeEach(() => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } });
      mockGetSession.mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      });
    });

    it('returns the reserved scan and analysis error when backend analysis fails', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              allowed: true,
              scan_id: 'scan-123',
              welcome_credits: 0,
            }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          json: () =>
            Promise.resolve({
              error: 'Analysis service unavailable',
            }),
        });

      const result = await ApiService.createScanWithAnalysis('file:///test.jpg', 'health', 'fr');

      expect(result.scan).toEqual(
        expect.objectContaining({
          id: 'scan-123',
          user_id: 'user-123',
          scan_type: 'health',
          image_path: 'user-123/scans/scan-123.jpg',
          image_url: null,
        })
      );
      expect(result.analysisSucceeded).toBe(false);
      expect(result.analysisError?.message).toBe('Analysis service unavailable');
    });

    it('retries analysis once when the uploaded scan image is not yet visible to storage lookup', async () => {
      jest.useFakeTimers();

      const saveMetricsSpy = jest
        .spyOn(ApiService, 'saveMetricsToHistory')
        .mockResolvedValue(undefined);

      try {
        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: () =>
              Promise.resolve({
                allowed: true,
                scan_id: 'scan-321',
                welcome_credits: 0,
              }),
          })
          .mockResolvedValueOnce({
            ok: false,
            status: 404,
            json: () =>
              Promise.resolve({
                error: 'Uploaded scan image was not found at a supported storage path',
                code: 'scan_image_not_found',
                request_id: 'req-image-missing',
              }),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () =>
              Promise.resolve({
                success: true,
                scan: {
                  id: 'scan-321',
                  user_id: 'user-123',
                  scan_type: 'nutrition',
                  analyzed_at: '2026-04-12T10:00:00.000Z',
                  analysis_result: {
                    schema_version: 3,
                    scan_type: 'nutrition',
                    plate_health_score: 92,
                    calories_estimate: 640,
                    protein_grams: 30,
                  },
                  created_at: '2026-04-12T09:59:00.000Z',
                },
              }),
          });

        const resultPromise = ApiService.createScanWithAnalysis(
          'file:///camera/photo.jpg',
          'nutrition',
          'fr'
        );

        await Promise.resolve();
        await Promise.resolve();
        await jest.advanceTimersByTimeAsync(1000);

        const result = await resultPromise;

        expect(mockFetch).toHaveBeenCalledTimes(3);
        expect(mockFetch.mock.calls[0][0]).toBe(
          'https://test.supabase.co/functions/v1/check-and-record-scan'
        );
        expect(mockFetch.mock.calls[1][0]).toBe(
          'https://test.supabase.co/functions/v1/analyze-scan'
        );
        expect(mockFetch.mock.calls[2][0]).toBe(
          'https://test.supabase.co/functions/v1/analyze-scan'
        );
        expect(
          JSON.parse(String(mockFetch.mock.calls[1][1]?.body))
        ).toEqual({
          scan_id: 'scan-321',
          scan_type: 'nutrition',
          language: 'fr',
        });
        expect(
          JSON.parse(String(mockFetch.mock.calls[2][1]?.body))
        ).toEqual({
          scan_id: 'scan-321',
          scan_type: 'nutrition',
          language: 'fr',
        });
        expect(mockStorageUpload).toHaveBeenCalledTimes(1);
        expect(saveMetricsSpy).toHaveBeenCalledTimes(1);
        expect(result).toEqual({
          scan: expect.objectContaining({
            id: 'scan-321',
            analysis_result: expect.objectContaining({
              scan_type: 'nutrition',
              plate_health_score: 92,
            }),
          }),
          analysisSucceeded: true,
        });
      } finally {
        saveMetricsSpy.mockRestore();
        jest.useRealTimers();
      }
    });

    it('uploads image using ImageManipulator base64 and stores it under the canonical scan path', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              allowed: true,
              scan_id: 'scan-456',
              welcome_credits: 0,
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              scan: {
                id: 'scan-456',
                user_id: 'user-123',
                scan_type: 'body',
                analyzed_at: '2026-03-27T10:00:00.000Z',
                analysis_result: {
                  scan_type: 'body',
                  schema_version: 3,
                  body_score: 85,
                },
                created_at: '2026-03-27T09:00:00.000Z',
              },
            }),
        });

      const result = await ApiService.createScanWithAnalysis(
        'file:///camera/photo.jpg',
        'body',
        'fr'
      );

      expect(mockDecode).toHaveBeenCalledWith('test-base-64');
      expect(mockStorageFrom).toHaveBeenCalledWith('scan-images');
      expect(mockStorageUpload).toHaveBeenCalledWith(
        'user-123/scans/scan-456.jpg',
        expect.any(ArrayBuffer),
        expect.objectContaining({
          contentType: 'image/jpeg',
          upsert: false,
        })
      );
      expect(result.analysisSucceeded).toBe(true);
    });

    it('classifies storage upload failures as UPLOAD and rolls back the reserved scan', async () => {
      mockStorageUpload.mockResolvedValueOnce({
        error: {
          message: 'Storage down',
          code: 'storage_failure',
          statusCode: 500,
        },
      });
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              allowed: true,
              scan_id: 'scan-999',
              welcome_credits: 0,
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
            }),
        });

      await expect(
        ApiService.createScanWithAnalysis('file:///camera/photo.jpg', 'health', 'fr')
      ).rejects.toMatchObject({
        type: 'UPLOAD',
        message: 'Storage down',
        status: 500,
        context: expect.objectContaining({
          scan_id: 'scan-999',
          image_path: 'user-123/scans/scan-999.jpg',
          bucket: 'scan-images',
          stage: 'upload',
          scanType: 'health',
        }),
      });

      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'https://test.supabase.co/functions/v1/cancel-scan-reservation',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            scan_id: 'scan-999',
            scan_type: 'health',
          }),
        })
      );
    });

    it('persists normalized v3 analysis payloads through saveMetricsToHistory after backend finalization', async () => {
      const saveMetricsSpy = jest
        .spyOn(ApiService, 'saveMetricsToHistory')
        .mockResolvedValue(undefined);

      try {
        const normalizedAnalysisResult = {
          schema_version: 3,
          scan_type: 'nutrition',
          plate_health_score: 88,
          calories_estimate: 560,
          protein_grams: 24,
          carbs_grams: 36,
          fat_grams: 18,
          verdict_key: 'balanced',
          glycemic_index_key: 'low',
          satiety_index: 9,
          ingredient_quality_key: 'natural',
          main_vitamin_keys: ['vitamin_a', 'vitamin_c'],
        };

        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: () =>
              Promise.resolve({
                allowed: true,
                scan_id: 'scan-789',
                welcome_credits: 0,
              }),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () =>
              Promise.resolve({
                success: true,
                scan: {
                  id: 'scan-789',
                  user_id: 'user-123',
                  scan_type: 'nutrition',
                  analyzed_at: '2026-03-27T10:00:00.000Z',
                  analysis_result: normalizedAnalysisResult,
                  created_at: '2026-03-27T09:00:00.000Z',
                },
              }),
          });

        const result = await ApiService.createScanWithAnalysis(
          'file:///camera/photo.jpg',
          'nutrition',
          'fr'
        );

        expect(saveMetricsSpy).toHaveBeenCalledWith(
          'scan-789',
          'nutrition',
          expect.objectContaining(normalizedAnalysisResult),
          '2026-03-27T10:00:00.000Z'
        );
        expect(result).toEqual({
          scan: expect.objectContaining({
            id: 'scan-789',
            analysis_result: normalizedAnalysisResult,
          }),
          analysisSucceeded: true,
        });
      } finally {
        saveMetricsSpy.mockRestore();
      }
    });
  });
});
