import type {
  AnalyticsData,
  BodyScoreHistoryItem,
  FaceScoreHistoryItem,
  NutritionHistoryItem,
  SuperScanHistoryItem,
} from '@/types';

const mockMaybeSingle: jest.Mock = jest.fn();
const mockEq: jest.Mock = jest.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockSelect: jest.Mock = jest.fn(() => ({ eq: mockEq }));
const mockFrom: jest.Mock = jest.fn((_table: string) => ({ select: mockSelect }));
const mockGetUser: jest.Mock = jest.fn();

jest.mock('@/services/supabase', () => ({
  supabase: {
    auth: { getUser: () => mockGetUser() },
    from: (table: string) => mockFrom(table),
  },
}));

import { ApiService, ApiError, loadAccountTierForAnalytics, sanitizeAnalyticsForFreeTier } from '@/services/api';

const makeAnalyticsFixture = (): AnalyticsData => ({
  period: '7days',
  healthScoreHistory: [{ date: '2026-05-20', value: 80 }],
  calorieHistory: [],
  bodyCompositionHistory: [],
  bodyScoreHistory: [
    {
      date: '2026-05-20',
      bodyScore: 75,
      bodyFatPercentage: 18,
      strengthIndex: 72,
      postureScore: 65,
      bodySymmetry: 80,
      metabolicAge: 31,
    } satisfies BodyScoreHistoryItem,
  ],
  faceScoreHistory: [
    {
      date: '2026-05-20',
      faceScore: 88,
      skinQualityScore: 70,
      symmetryPercentage: 92,
      energyScore: 60,
      hydrationLevel: 55,
      collagenLevel: 48,
    } satisfies FaceScoreHistoryItem,
  ],
  nutritionHistory: [
    {
      date: '2026-05-20',
      caloriesEstimate: 620,
      proteinGrams: 35,
      carbsGrams: 72,
      fatGrams: 18,
      satietyIndex: 65,
      nutritionScore: 78,
    } satisfies NutritionHistoryItem,
  ],
  superScanHistory: [],
});

describe('sanitizeAnalyticsForFreeTier', () => {
  it('met à zéro les métriques premium body sans toucher aux gratuites', () => {
    const sanitized = sanitizeAnalyticsForFreeTier(makeAnalyticsFixture());
    const body = sanitized.bodyScoreHistory[0];

    expect(body.bodyScore).toBe(75); // conservé (gratuit)
    expect(body.bodyFatPercentage).toBe(0);
    expect(body.strengthIndex).toBe(0);
    expect(body.metabolicAge).toBe(0);
    // posture est désormais gratuit côté scan result (cf. PREMIUM_LOCKED_FIELDS.body)
    // donc également gratuit dans le payload Analytics.
    expect(body.postureScore).toBe(65);
    expect(body.bodySymmetry).toBe(0);
  });

  it('met à zéro skinQualityScore, energyScore, collagenLevel mais conserve faceScore/symmetry/hydration', () => {
    const sanitized = sanitizeAnalyticsForFreeTier(makeAnalyticsFixture());
    const face = sanitized.faceScoreHistory[0];

    expect(face.faceScore).toBe(88);
    expect(face.symmetryPercentage).toBe(92); // hors premiumFields face
    expect(face.hydrationLevel).toBe(55); // hors premiumFields face
    expect(face.skinQualityScore).toBe(0);
    expect(face.energyScore).toBe(0);
    expect(face.collagenLevel).toBe(0);
  });

  it('met à zéro satiety mais conserve calories, score et les 3 macros', () => {
    const sanitized = sanitizeAnalyticsForFreeTier(makeAnalyticsFixture());
    const nutrition = sanitized.nutritionHistory[0];

    expect(nutrition.caloriesEstimate).toBe(620);
    expect(nutrition.nutritionScore).toBe(78);
    // Macros (protéines/glucides/lipides) ouvertes en gratuit depuis 2026-05.
    expect(nutrition.proteinGrams).toBe(35);
    expect(nutrition.carbsGrams).toBe(72);
    expect(nutrition.fatGrams).toBe(18);
    expect(nutrition.satietyIndex).toBe(0);
  });

  it('ne mute pas la donnée source (immutable)', () => {
    const source = makeAnalyticsFixture();
    const sourceBodyRef = source.bodyScoreHistory[0];
    sanitizeAnalyticsForFreeTier(source);

    expect(sourceBodyRef.bodyFatPercentage).toBe(18);
    expect(sourceBodyRef.strengthIndex).toBe(72);
  });

  it('préserve la période et les arrays vides legacy', () => {
    const sanitized = sanitizeAnalyticsForFreeTier(makeAnalyticsFixture());

    expect(sanitized.period).toBe('7days');
    expect(sanitized.calorieHistory).toEqual([]);
    expect(sanitized.bodyCompositionHistory).toEqual([]);
    expect(sanitized.superScanHistory).toEqual([]);
  });

  it('vide superScanHistory pour un compte gratuit (super scan = entièrement premium)', () => {
    const fixtureWithSuper: AnalyticsData = {
      ...makeAnalyticsFixture(),
      superScanHistory: [
        { date: '2026-05-20', globalRiskScore: 42 } satisfies SuperScanHistoryItem,
        { date: '2026-05-21', globalRiskScore: 38 } satisfies SuperScanHistoryItem,
      ],
    };

    const sanitized = sanitizeAnalyticsForFreeTier(fixtureWithSuper);

    expect(sanitized.superScanHistory).toEqual([]);
    // La source n'est pas mutée (immutabilité, comme les autres histories).
    expect(fixtureWithSuper.superScanHistory).toHaveLength(2);
    expect(fixtureWithSuper.superScanHistory[0].globalRiskScore).toBe(42);
  });

  // Garde-fou fail-closed : si SuperScanHistoryItem s'enrichit (condition_*, fat_*),
  // tout champ premium futur doit rester invisible côté gratuit. Le sanitize
  // renvoie un tableau vide quoi qu'il arrive, donc aucun champ ne peut fuiter.
  it('vide superScanHistory même quand les items contiennent des champs premium additionnels', () => {
    const fixtureWithEnrichedSuper: AnalyticsData = {
      ...makeAnalyticsFixture(),
      superScanHistory: [
        {
          date: '2026-05-22',
          globalRiskScore: 51,
          // Champs hypothétiques (cast pour simuler une évolution de schéma) :
          // ils ne doivent jamais apparaître dans le payload gratuit.
          condition_probability: 0.72,
          fat_distribution_priority_zones: ['abdomen', 'hips'],
        } as unknown as SuperScanHistoryItem,
      ],
    };

    const sanitized = sanitizeAnalyticsForFreeTier(fixtureWithEnrichedSuper);

    expect(sanitized.superScanHistory).toEqual([]);
    expect(sanitized.superScanHistory).toHaveLength(0);
  });
});

describe('loadAccountTierForAnalytics', () => {
  beforeEach(() => {
    mockFrom.mockClear();
    mockSelect.mockClear();
    mockEq.mockClear();
    mockMaybeSingle.mockReset();
  });

  it('retourne le tier renvoyé par user_profiles', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { account_tier: 'premium' }, error: null });

    const tier = await loadAccountTierForAnalytics('user-1');

    expect(tier).toBe('premium');
    expect(mockFrom).toHaveBeenCalledWith('user_profiles');
    expect(mockSelect).toHaveBeenCalledWith('account_tier');
    expect(mockEq).toHaveBeenCalledWith('id', 'user-1');
  });

  it('accepte admin comme tier valide', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { account_tier: 'admin' }, error: null });
    expect(await loadAccountTierForAnalytics('u')).toBe('admin');
  });

  it('dégrade vers free si la lecture renvoie une erreur (fail-closed)', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'rls denied' } });
    expect(await loadAccountTierForAnalytics('u')).toBe('free');
  });

  it('dégrade vers free si la lecture renvoie null', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await loadAccountTierForAnalytics('u')).toBe('free');
  });

  it('dégrade vers free si la valeur retournée est inconnue', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { account_tier: 'enterprise' }, error: null });
    expect(await loadAccountTierForAnalytics('u')).toBe('free');
  });

  it('dégrade vers free si supabase throw', async () => {
    mockMaybeSingle.mockRejectedValue(new Error('network'));
    expect(await loadAccountTierForAnalytics('u')).toBe('free');
  });
});

describe('ApiService.getAnalytics premium period gating', () => {
  beforeEach(() => {
    mockFrom.mockClear();
    mockSelect.mockClear();
    mockEq.mockClear();
    mockMaybeSingle.mockReset();
    mockGetUser.mockReset();
  });

  it('throw ApiError pour un compte gratuit qui demande 3months', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-free' } } });
    mockMaybeSingle.mockResolvedValue({ data: { account_tier: 'free' }, error: null });

    await expect(ApiService.getAnalytics('3months')).rejects.toBeInstanceOf(ApiError);
    await expect(ApiService.getAnalytics('3months')).rejects.toMatchObject({
      type: 'AUTH',
      message: 'analytics.premium_period_locked',
    });
  });

  it('throw ApiError pour un compte gratuit qui demande 1year', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-free' } } });
    mockMaybeSingle.mockResolvedValue({ data: { account_tier: 'free' }, error: null });

    await expect(ApiService.getAnalytics('1year')).rejects.toBeInstanceOf(ApiError);
  });

  it('ne fetche jamais scan_metrics quand le throw se déclenche', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-free' } } });
    mockMaybeSingle.mockResolvedValue({ data: { account_tier: 'free' }, error: null });

    await expect(ApiService.getAnalytics('3months')).rejects.toThrow();

    // Seul `user_profiles` doit avoir été consulté (le tier check).
    const tablesQueried = mockFrom.mock.calls.map((call) => call[0]);
    expect(tablesQueried).toEqual(['user_profiles']);
    expect(tablesQueried).not.toContain('scan_metrics');
    expect(tablesQueried).not.toContain('health_scores');
  });
});
