/**
 * Premium Fields Configuration
 * Defines which result fields are teased but locked for free users.
 */

export type PremiumGatedScanType = 'body' | 'face' | 'nutrition';

export const PREMIUM_LOCKED_FIELDS: Record<PremiumGatedScanType, string[]> = {
  body: [
    'strength_index',
    'metabolic_age',
    'body_fat_percentage',
    // 'posture_score' — ouvert en gratuit (rééquilibrage produit 2026-05).
    //   Le compte gratuit voit la posture chiffrée + son label qualitatif.
    'body_symmetry',
    'muscle_definition_score',
    'midsection_definition_score',
    'shoulder_alignment_score',
    // 'recovery_readiness_score' — ouvert en gratuit (rééquilibrage produit
    //   2026-05-27) : la valeur chiffrée IA est désormais visible, sans label
    //   qualitatif intermédiaire ("Élevée/Modérée/Faible").
    'upper_body_definition_score',
    'lower_body_definition_score',
    'arm_definition_score',
    'v_taper_score',
    'body_tension_indicator_score',
  ],
  face: [
    // 'fatigue_level' — ouvert en gratuit (rééquilibrage produit 2026-05-27) :
    //   la valeur chiffrée IA est désormais visible (ex. `72/100`).
    'photogenic_score',
    'skin_quality_score',
    'energy_score',
    'collagen_level',
    // 'skin_clarity_score', 'skin_evenness_score', 'under_eye_shadow_score'
    //   — ouverts en gratuit (rééquilibrage produit 2026-05-27) :
    //   les valeurs chiffrées IA remplacent les labels qualitatifs
    //   ("Peau nette / Teint uniforme / Regard reposé").
    'under_eye_volume_score',
    'eye_openness_score',
    'complexion_redness_score',
    'pore_visibility_score',
    // 'skin_radiance_score' — ouvert en gratuit (rééquilibrage produit 2026-05).
    //   Hook conversion fort autour de la notion d'éclat sans révéler les autres
    //   métriques avancées (skin_quality, collagen, energy, etc.).
    'lip_dryness_score',
    'forehead_smoothness_score',
    't_zone_oiliness_score',
    'perceived_stress_level',
    'perceived_sleep_quality',
  ],
  nutrition: [
    // 'protein_grams', 'carbs_grams', 'fat_grams' — ouverts en gratuit
    //   (rééquilibrage produit 2026-05). Les trois macros principales sont
    //   visibles sur le scan result et dans les courbes Analytics.
    //   `satiety_index` et les autres champs nutrition premium restent lockés.
    'satiety_index',
    'glycemic_index_label',
    'glycemic_index_key',
    'main_vitamins',
    'main_vitamin_keys',
    'micronutrients',
    'nutrition_points',
    'recommendations',
    'dietary_details',
    'plate_analysis',
    'estimated_composition',
    'fiber_grams_estimate',
    'sugar_grams_estimate',
    'processing_level_score',
    'hydration_contribution_score',
    'sodium_level_score',
    // 'meal_balance_score' — ouvert en gratuit (rééquilibrage produit
    //   2026-05-27) : la valeur chiffrée IA remplace le label qualitatif.
    'inflammation_index_score',
    'color_diversity_score',
    'vegetable_portion_ratio',
    'protein_visibility_score',
    'whole_grain_indicator_score',
    'meal_freshness_score',
  ],
};

export const PREMIUM_LOCKED_SUPER_SCAN_FIELDS = [
  'condition_probability',
  'condition_explanation',
  'condition_advice',
  'fat_distribution_primary_metrics',
  'fat_distribution_priority_zones',
  'fat_distribution_area_details',
] as const;

export const PREMIUM_LOCKED_FRIDGE_SECTIONS = [
  'why',
  'ingredients',
  'nutrition',
  'preparation',
  'advice',
  'additions',
  'substitutions',
  'caution',
] as const;

/**
 * Check if a specific field should be locked for the current user.
 */
export const isFieldLocked = (
  scanType: PremiumGatedScanType,
  fieldKey: string,
  isPremium: boolean,
): boolean => {
  if (isPremium) {
    return false;
  }

  return PREMIUM_LOCKED_FIELDS[scanType]?.includes(fieldKey) ?? false;
};

/**
 * Groupes de courbes affichés dans `AnalyticsScreen` (un sélecteur de métriques
 * par groupe).
 */
export type PremiumAnalyticsGroup = 'health' | 'body' | 'nutrition';

/**
 * Mapping unique entre :
 * - `id` UI : tel qu'utilisé dans `HEALTH_CHART_METRICS`, `BODY_CHART_METRICS`
 *   et `NUTRITION_CHART_METRICS` (`screens/AnalyticsScreen.tsx`) pour les
 *   onglets de sélection de métrique.
 * - `historyField` : nom camelCase tel que présent dans `BodyScoreHistoryItem`,
 *   `FaceScoreHistoryItem` et `NutritionHistoryItem` (`types/index.ts`) et donc
 *   dans le payload `AnalyticsData` retourné par `services/api.ts:getAnalytics`.
 *
 * Cette source unique alimente :
 * - le gating UI (`isAnalyticsMetricLocked`)
 * - la sanitation backend de défense en profondeur dans
 *   `services/api.ts:sanitizeAnalyticsForFreeTier`
 *
 * Le vrai gating serveur reste à faire (RPC `get_analytics_trends` qui filtre
 * selon `user_profiles.account_tier`) ; tant qu'il n'existe pas, la sanitation
 * client est notre dernier rempart contre la fuite scan→analytics.
 *
 * Cohérence requise : chaque entrée doit pointer vers un `fieldKey` présent
 * dans `PREMIUM_LOCKED_FIELDS` ci-dessus (cf. test de cohérence dans
 * `__tests__/constants/premiumFields.test.ts`).
 */
export const PREMIUM_LOCKED_ANALYTICS_METRIC_MAP: Record<
  PremiumAnalyticsGroup,
  ReadonlyArray<{ id: string; historyField: string }>
> = {
  health: [
    { id: 'skin_quality', historyField: 'skinQualityScore' },
    { id: 'energy', historyField: 'energyScore' },
    { id: 'collagen', historyField: 'collagenLevel' },
  ],
  body: [
    { id: 'body_fat', historyField: 'bodyFatPercentage' },
    { id: 'strength', historyField: 'strengthIndex' },
    // `posture` retiré ici en cohérence avec le retrait de `posture_score` de
    //   PREMIUM_LOCKED_FIELDS.body (la posture est désormais gratuite côté scan
    //   result + côté Analytics).
    { id: 'symmetry', historyField: 'bodySymmetry' },
    { id: 'metabolic_age', historyField: 'metabolicAge' },
  ],
  nutrition: [
    // `protein` / `carbs` / `fats` retirés ici en cohérence avec le retrait
    //   des `*_grams` de PREMIUM_LOCKED_FIELDS.nutrition (macros gratuites côté
    //   scan result + côté Analytics).
    { id: 'satiety', historyField: 'satietyIndex' },
  ],
};

/**
 * IDs UI verrouillés par groupe — dérivé de `PREMIUM_LOCKED_ANALYTICS_METRIC_MAP`.
 * Consommé par `isAnalyticsMetricLocked`.
 */
export const PREMIUM_LOCKED_ANALYTICS_METRIC_IDS: Record<
  PremiumAnalyticsGroup,
  readonly string[]
> = {
  health: PREMIUM_LOCKED_ANALYTICS_METRIC_MAP.health.map((m) => m.id),
  body: PREMIUM_LOCKED_ANALYTICS_METRIC_MAP.body.map((m) => m.id),
  nutrition: PREMIUM_LOCKED_ANALYTICS_METRIC_MAP.nutrition.map((m) => m.id),
};

/**
 * Champs `historyField` (camelCase) verrouillés par groupe — dérivé du même
 * mapping. Consommé par `sanitizeAnalyticsForFreeTier` dans `services/api.ts`.
 */
export const PREMIUM_LOCKED_ANALYTICS_HISTORY_FIELDS: Record<
  PremiumAnalyticsGroup,
  readonly string[]
> = {
  health: PREMIUM_LOCKED_ANALYTICS_METRIC_MAP.health.map((m) => m.historyField),
  body: PREMIUM_LOCKED_ANALYTICS_METRIC_MAP.body.map((m) => m.historyField),
  nutrition: PREMIUM_LOCKED_ANALYTICS_METRIC_MAP.nutrition.map((m) => m.historyField),
};

/**
 * Vérifie si une métrique du sélecteur Analytics est verrouillée pour
 * l'utilisateur courant.
 */
export const isAnalyticsMetricLocked = (
  group: PremiumAnalyticsGroup,
  metricId: string,
  isPremium: boolean,
): boolean => {
  if (isPremium) {
    return false;
  }

  return PREMIUM_LOCKED_ANALYTICS_METRIC_IDS[group]?.includes(metricId) ?? false;
};
