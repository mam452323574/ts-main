import {
  PREMIUM_LOCKED_FIELDS,
  PREMIUM_LOCKED_ANALYTICS_METRIC_MAP,
  PREMIUM_LOCKED_ANALYTICS_METRIC_IDS,
  PREMIUM_LOCKED_ANALYTICS_HISTORY_FIELDS,
  isFieldLocked,
  isAnalyticsMetricLocked,
} from '@/constants/premiumFields';

describe('isFieldLocked', () => {
  it('retourne false pour un user premium peu importe le champ', () => {
    expect(isFieldLocked('face', 'collagen_level', true)).toBe(false);
    expect(isFieldLocked('body', 'body_fat_percentage', true)).toBe(false);
    expect(isFieldLocked('nutrition', 'protein_grams', true)).toBe(false);
  });

  it('retourne true pour les champs verrouillés en gratuit', () => {
    expect(isFieldLocked('face', 'collagen_level', false)).toBe(true);
    expect(isFieldLocked('body', 'body_fat_percentage', false)).toBe(true);
    expect(isFieldLocked('nutrition', 'satiety_index', false)).toBe(true);
  });

  it('laisse les macros nutrition (protéines/glucides/lipides) ouvertes en gratuit', () => {
    expect(isFieldLocked('nutrition', 'protein_grams', false)).toBe(false);
    expect(isFieldLocked('nutrition', 'carbs_grams', false)).toBe(false);
    expect(isFieldLocked('nutrition', 'fat_grams', false)).toBe(false);
  });

  it('retourne false pour les champs non listés', () => {
    expect(isFieldLocked('face', 'hydration_level', false)).toBe(false);
    expect(isFieldLocked('body', 'bmi', false)).toBe(false);
    expect(isFieldLocked('face', 'inconnu_xyz', false)).toBe(false);
  });
});

describe('isAnalyticsMetricLocked', () => {
  it('retourne false pour un user premium peu importe la métrique', () => {
    expect(isAnalyticsMetricLocked('health', 'collagen', true)).toBe(false);
    expect(isAnalyticsMetricLocked('body', 'body_fat', true)).toBe(false);
    expect(isAnalyticsMetricLocked('nutrition', 'protein', true)).toBe(false);
  });

  it('verrouille collagen/energy/skin_quality côté health pour un gratuit', () => {
    expect(isAnalyticsMetricLocked('health', 'collagen', false)).toBe(true);
    expect(isAnalyticsMetricLocked('health', 'energy', false)).toBe(true);
    expect(isAnalyticsMetricLocked('health', 'skin_quality', false)).toBe(true);
  });

  it('laisse les métriques gratuites accessibles aux comptes gratuits', () => {
    expect(isAnalyticsMetricLocked('health', 'score', false)).toBe(false);
    expect(isAnalyticsMetricLocked('health', 'hydration', false)).toBe(false);
    expect(isAnalyticsMetricLocked('health', 'symmetry', false)).toBe(false);
    expect(isAnalyticsMetricLocked('body', 'score', false)).toBe(false);
    // `posture` est gratuit côté scan result (cf. PREMIUM_LOCKED_FIELDS.body)
    // donc aussi gratuit côté Analytics pour rester cohérent.
    expect(isAnalyticsMetricLocked('body', 'posture', false)).toBe(false);
    expect(isAnalyticsMetricLocked('nutrition', 'score', false)).toBe(false);
    expect(isAnalyticsMetricLocked('nutrition', 'calories', false)).toBe(false);
  });

  it('verrouille les 4 métriques body premium', () => {
    expect(isAnalyticsMetricLocked('body', 'body_fat', false)).toBe(true);
    expect(isAnalyticsMetricLocked('body', 'strength', false)).toBe(true);
    expect(isAnalyticsMetricLocked('body', 'symmetry', false)).toBe(true);
    expect(isAnalyticsMetricLocked('body', 'metabolic_age', false)).toBe(true);
  });

  it('verrouille satiety mais laisse protein/carbs/fats accessibles côté nutrition', () => {
    expect(isAnalyticsMetricLocked('nutrition', 'satiety', false)).toBe(true);
    expect(isAnalyticsMetricLocked('nutrition', 'protein', false)).toBe(false);
    expect(isAnalyticsMetricLocked('nutrition', 'carbs', false)).toBe(false);
    expect(isAnalyticsMetricLocked('nutrition', 'fats', false)).toBe(false);
  });

  it('retourne false pour une métrique inconnue', () => {
    expect(isAnalyticsMetricLocked('health', 'metric_inconnue', false)).toBe(false);
  });
});

describe('cohérence entre PREMIUM_LOCKED_ANALYTICS_METRIC_MAP et ses dérivés', () => {
  it('PREMIUM_LOCKED_ANALYTICS_METRIC_IDS est exactement la liste des `id` du map', () => {
    expect(PREMIUM_LOCKED_ANALYTICS_METRIC_IDS.health).toEqual(
      PREMIUM_LOCKED_ANALYTICS_METRIC_MAP.health.map((m) => m.id),
    );
    expect(PREMIUM_LOCKED_ANALYTICS_METRIC_IDS.body).toEqual(
      PREMIUM_LOCKED_ANALYTICS_METRIC_MAP.body.map((m) => m.id),
    );
    expect(PREMIUM_LOCKED_ANALYTICS_METRIC_IDS.nutrition).toEqual(
      PREMIUM_LOCKED_ANALYTICS_METRIC_MAP.nutrition.map((m) => m.id),
    );
  });

  it('PREMIUM_LOCKED_ANALYTICS_HISTORY_FIELDS est exactement la liste des `historyField` du map', () => {
    expect(PREMIUM_LOCKED_ANALYTICS_HISTORY_FIELDS.health).toEqual(
      PREMIUM_LOCKED_ANALYTICS_METRIC_MAP.health.map((m) => m.historyField),
    );
    expect(PREMIUM_LOCKED_ANALYTICS_HISTORY_FIELDS.body).toEqual(
      PREMIUM_LOCKED_ANALYTICS_METRIC_MAP.body.map((m) => m.historyField),
    );
    expect(PREMIUM_LOCKED_ANALYTICS_HISTORY_FIELDS.nutrition).toEqual(
      PREMIUM_LOCKED_ANALYTICS_METRIC_MAP.nutrition.map((m) => m.historyField),
    );
  });
});

describe('cohérence anti-fuite scan→analytics', () => {
  // Chaque métrique Analytics premium doit avoir une contrepartie dans
  // PREMIUM_LOCKED_FIELDS sous une forme snake_case équivalente. Cette table
  // explicite documente le pont entre les deux conventions.
  const SCAN_FIELD_BY_ANALYTICS_ID: Record<string, { scanType: 'face' | 'body' | 'nutrition'; fieldKey: string }> = {
    skin_quality: { scanType: 'face', fieldKey: 'skin_quality_score' },
    energy: { scanType: 'face', fieldKey: 'energy_score' },
    collagen: { scanType: 'face', fieldKey: 'collagen_level' },
    body_fat: { scanType: 'body', fieldKey: 'body_fat_percentage' },
    strength: { scanType: 'body', fieldKey: 'strength_index' },
    posture: { scanType: 'body', fieldKey: 'posture_score' },
    symmetry: { scanType: 'body', fieldKey: 'body_symmetry' },
    metabolic_age: { scanType: 'body', fieldKey: 'metabolic_age' },
    // protein / carbs / fats sont gratuits côté scan result depuis 2026-05,
    //   donc aussi gratuits côté Analytics — ils ne figurent plus dans
    //   PREMIUM_LOCKED_ANALYTICS_METRIC_MAP.nutrition et ne participent plus
    //   au mapping de cohérence anti-fuite.
    satiety: { scanType: 'nutrition', fieldKey: 'satiety_index' },
  };

  const allLockedIds = [
    ...PREMIUM_LOCKED_ANALYTICS_METRIC_MAP.health.map((m) => m.id),
    ...PREMIUM_LOCKED_ANALYTICS_METRIC_MAP.body.map((m) => m.id),
    ...PREMIUM_LOCKED_ANALYTICS_METRIC_MAP.nutrition.map((m) => m.id),
  ];

  it('chaque métrique Analytics premium est aussi verrouillée dans le scan result correspondant', () => {
    for (const analyticsId of allLockedIds) {
      const counterpart = SCAN_FIELD_BY_ANALYTICS_ID[analyticsId];
      expect(counterpart).toBeDefined();
      expect(
        PREMIUM_LOCKED_FIELDS[counterpart.scanType].includes(counterpart.fieldKey),
      ).toBe(true);
    }
  });
});
