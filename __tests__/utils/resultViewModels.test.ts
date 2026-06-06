import {
  buildResultTrajectoryViewModel,
  buildFatDistributionSuperScanResultViewModel,
  buildLegacySuperScanResultViewModel,
  buildScanResultViewModel,
  buildSuperScanResultViewModel,
} from '@/utils/resultViewModels';

const createTranslator =
  (translations: Record<string, string>) =>
  (scope: string, options?: Record<string, unknown>) => {
    const template = translations[scope] ?? scope;
    return template.replace(/%\{(\w+)\}/g, (_match, key) =>
      String(options?.[key] ?? `%{${key}}`),
    );
  };

describe('result view models', () => {
  const t = createTranslator({
    'scan.face.type_label': 'Analisis facial',
    'scan.body.type_label': 'Analisis corporal',
    'scan.nutrition.type_label': 'Analisis nutricional',
    'scan.face.score_label': 'Puntuacion facial',
    'scan.body.score_label': 'Puntuacion corporal',
    'scan.nutrition.score_label': 'Puntuacion nutricional',
    'scan.super.score_label': 'Riesgo global',
    'scan.nutrition.macros_title': 'Macros',
    'common.metrics.perceived_age': 'Edad percibida',
    'common.metrics.face_shape': 'Forma facial',
    'common.metrics.symmetry': 'Simetria',
    'common.metrics.fatigue': 'Fatiga',
    'common.metrics.hydration': 'Hidratacion',
    'common.metrics.photogenic': 'Fotogenia',
    'common.metrics.skin_quality': 'Piel',
    'common.metrics.skin_clarity': 'Claridad',
    'common.metrics.skin_clarity_signal': 'Piel limpia',
    'common.metrics.skin_evenness': 'Tono uniforme',
    'common.metrics.skin_evenness_signal': 'Tono uniforme',
    'common.metrics.under_eye_shadow': 'Ojeras',
    'common.metrics.under_eye_freshness_signal': 'Mirada descansada',
    'common.metrics.pore_visibility': 'Poros',
    'common.metrics.complexion_redness': 'Rojeces',
    'common.metrics.sleep_quality': 'Sueno',
    'common.metrics.glow': 'Energia',
    'common.metrics.collagen': 'Colageno',
    'common.metrics.fatigue_signal': 'Senal de fatiga',
    'common.metrics.body_type': 'Tipo corporal',
    'common.metrics.muscle_mass': 'Masa muscular',
    'common.metrics.waist': 'Cintura',
    'common.metrics.strength': 'Fuerza',
    'common.metrics.bmi': 'IMC',
    'common.metrics.metabolic_age': 'Edad metabolica',
    'common.metrics.body_fat': 'Grasa corporal',
    'common.metrics.facial_fat': 'Grasa facial',
    'common.metrics.water_retention': 'Retencion de agua',
    'common.metrics.definition': 'Definicion',
    'common.metrics.confidence': 'Confianza',
    'common.metrics.dominant_type': 'Tipo dominante',
    'common.metrics.posture': 'Postura',
    'common.metrics.calories': 'Calorias',
    'common.metrics.verdict': 'Veredicto',
    'common.metrics.proteins': 'Proteinas',
    'common.metrics.carbs': 'Carbohidratos',
    'common.metrics.fats': 'Grasas',
    'common.metrics.fiber': 'Fibra',
    'common.metrics.sugar': 'Azucar',
    'common.metrics.processing_level': 'Procesamiento',
    'common.metrics.sodium_level': 'Sodio',
    'common.metrics.meal_balance': 'Equilibrio',
    'common.metrics.inflammation_index': 'Inflamacion',
    'common.metrics.color_diversity': 'Colores',
    'common.metrics.vegetable_ratio': 'Vegetales',
    'common.metrics.protein_visibility': 'Proteina visible',
    'common.metrics.whole_grain': 'Integral',
    'common.metrics.meal_freshness': 'Frescura',
    'common.metrics.satiety': 'Saciedad',
    'common.metrics.ingredient_quality': 'Ingredientes',
    'common.metrics.glycemic_index': 'Indice glucemico',
    'common.metrics.vitamins': 'Vitaminas',
    'scan.nutrition.long_sections.vitamins': 'Vitaminas y micronutrientes',
    'scan.nutrition.long_sections.micronutrients': 'Micronutrientes',
    'scan.nutrition.long_sections.nutrition_points': 'Puntos nutricionales',
    'scan.nutrition.long_sections.recommendations': 'Recomendaciones',
    'scan.nutrition.long_sections.dietary_details': 'Detalles alimentarios',
    'scan.nutrition.long_sections.plate_analysis': 'Analisis del plato',
    'scan.nutrition.long_sections.estimated_composition': 'Composicion estimada',
    'scan.nutrition.long_sections.expand': 'Ver mas',
    'scan.nutrition.long_sections.collapse': 'Ver menos',
    'qualitative_levels.body_type.athletic': 'Atletico',
    'qualitative_levels.muscle_mass.balanced': 'Equilibrada',
    'qualitative_levels.ingredient_quality.processed': 'Procesado',
    'qualitative_levels.glycemic_index.high': 'Alto',
    'qualitative_levels.severity.low': 'Baja',
    'qualitative_levels.severity.moderate': 'Media',
    'qualitative_levels.severity.high': 'Alta',
    'qualitative_levels.skin_clarity_signal.low': 'A reforzar',
    'qualitative_levels.skin_clarity_signal.moderate': 'En progreso',
    'qualitative_levels.skin_clarity_signal.high': 'Muy limpia',
    'qualitative_levels.skin_evenness_signal.low': 'A armonizar',
    'qualitative_levels.skin_evenness_signal.moderate': 'Equilibrado',
    'qualitative_levels.skin_evenness_signal.high': 'Muy uniforme',
    'qualitative_levels.under_eye_freshness_signal.low': 'Muy fresca',
    'qualitative_levels.under_eye_freshness_signal.moderate': 'Descansada',
    'qualitative_levels.under_eye_freshness_signal.high': 'A refrescar',
    'verdicts.balanced': 'Comida equilibrada',
    'scan.nutrition.vitamins.vitamin_a': 'Vitamina A',
    'scan.nutrition.vitamins.vitamin_c': 'Vitamina C',
    'scan.nutrition.vitamins.unknown': 'Desconocido',
    'scan.super.summaries.medical_attention': 'Atencion medica recomendada',
    'scan.super.disclaimers.medical_not_diagnosis': 'No es un diagnostico medico.',
    'scan.super.summaries.unknown': 'Necesita revision',
    'scan.super.disclaimers.unknown': 'Resultado solo informativo.',
    'scan.super.fat_distribution.subcutaneous_fat': 'Grasa subcutanea',
    'scan.super.fat_distribution.unnamed_area': 'Zona %{index}',
    'common.results.trajectory_preview.title': 'Proyeccion 30 dias',
    'common.results.trajectory_preview.eyebrow.generic': 'Potencial',
    'common.results.trajectory_preview.eyebrow.estimated': 'Estimada',
    'common.results.trajectory_preview.eyebrow.loading': 'Sincronizando',
    'common.results.trajectory_preview.badge.locked': 'PREMIUM',
    'common.results.trajectory_preview.badge.unlocked': 'ACTIVA',
    'common.results.trajectory_preview.badge.loading': 'ACTUALIZANDO',
    'common.results.trajectory_preview.headline.locked.default': 'Desbloquea tu proyeccion a 30 dias.',
    'common.results.trajectory_preview.headline.locked.super': 'Desbloquea tu trayectoria de riesgo a 30 dias.',
    'common.results.trajectory_preview.headline.unlocked.default':
      'A este ritmo, %{label} podria llegar a %{score} en 30 dias.',
    'common.results.trajectory_preview.headline.unlocked.super':
      'A este ritmo, el riesgo global podria bajar a %{score} en 30 dias.',
    'common.results.trajectory_preview.headline.loading': 'Preparando tu proyeccion a 30 dias.',
    'common.results.trajectory_preview.subtitle.locked': 'Premium revela la curva de 30 dias.',
    'common.results.trajectory_preview.subtitle.unlocked.with_history':
      'Basada en este escaneo y en tu tendencia reciente.',
    'common.results.trajectory_preview.subtitle.unlocked.without_history':
      'Basada en este escaneo y en un ritmo de progreso realista.',
    'common.results.trajectory_preview.subtitle.loading':
      'Tu vista premium se actualizara en un momento.',
    'common.results.trajectory_preview.note': 'Estimacion orientativa, no consejo medico.',
    'common.results.trajectory_preview.cta': 'Desbloquear mi proyeccion',
    'common.results.trajectory_preview.checkpoints.today': 'Hoy',
    'common.results.trajectory_preview.checkpoints.day_15': 'Dia 15',
    'common.results.trajectory_preview.checkpoints.day_30': 'Dia 30',
    'metric_card.blurred_text': '••••••',
    'metric_card.loading_value': '...',
  });

  it('keeps premium nutrition metrics locked for free users', () => {
    const viewModel = buildScanResultViewModel({
      analysisData: {
        schema_version: 3,
        scan_type: 'nutrition',
        plate_health_score: 82,
        calories_estimate: 410,
        protein_grams: 28,
        carbs_grams: 33,
        fat_grams: 14,
        verdict_key: 'balanced',
        glycemic_index_key: 'high',
        satiety_index: 8,
        ingredient_quality_key: 'processed',
        main_vitamin_keys: ['vitamin_a', 'vitamin_c'],
      },
      t,
      locale: 'es',
      premiumRenderState: 'locked',
      resolveFaceGlowScore: () => 0,
    });

    expect(viewModel.quickStats[1]).toMatchObject({
      span: 'full',
      value: 'Comida equilibrada',
      valueVariant: 'text',
    });
    expect(viewModel.quickStats[1].theme.tone).toBe('emerald');
    expect(viewModel.macros?.items.map((item) => item.theme.tone)).toEqual([
      'emerald',
      'amber',
      'rose',
    ]);
    // Macros (protéines/glucides/lipides) ouvertes en gratuit depuis 2026-05.
    expect(viewModel.macros?.items.map((item) => item.value)).toEqual([
      '28 g',
      '33 g',
      '14 g',
    ]);
    expect(
      viewModel.macros?.items.every((item) => item.premiumRenderState === 'unlocked'),
    ).toBe(true);
    expect(viewModel.metrics[0]).toMatchObject({
      premiumRenderState: 'locked',
      value: '••••••',
    });
    expect(viewModel.metrics[1].value).toBe('Procesado');
    expect(viewModel.metrics[1].theme.tone).toBe('coral');
    expect(viewModel.premiumMetrics[0]).toMatchObject({
      premiumRenderState: 'locked',
      value: '••••••',
    });
    expect(viewModel.premiumMetrics[0].theme.tone).toBe('coral');
    expect(viewModel.premiumMetrics).toHaveLength(1);
    expect(viewModel.nutritionLongSections?.[0]).toMatchObject({
      id: 'vitamins',
      premiumRenderState: 'locked',
      body: '••••••',
    });
    expect(viewModel.nutritionLongSections?.[0].theme.tone).toBe('blue');
  });

  it('moves unlocked nutrition vitamins and long details into full-width sections', () => {
    const viewModel = buildScanResultViewModel({
      analysisData: {
        schema_version: 4,
        scan_type: 'nutrition',
        plate_health_score: 82,
        calories_estimate: 410,
        protein_grams: 28,
        carbs_grams: 33,
        fat_grams: 14,
        verdict_key: 'balanced',
        glycemic_index_key: 'high',
        satiety_index: 8,
        ingredient_quality_key: 'processed',
        main_vitamin_keys: ['vitamin_a', 'vitamin_c'],
        main_vitamins_fallback_text:
          'Vitaminas A y C visibles, con apoyo de antioxidantes y minerales de los vegetales.',
        recommendations:
          'Aumenta la fibra con una porcion extra de verduras y mantén una fuente de proteina clara.',
      },
      t,
      locale: 'es',
      premiumRenderState: 'unlocked',
      resolveFaceGlowScore: () => 0,
    });

    expect(viewModel.premiumMetrics.map((metric) => metric.icon)).toEqual([
      'glycemic',
    ]);
    expect(viewModel.nutritionLongSections?.map((section) => section.id)).toEqual([
      'vitamins',
      'recommendations',
    ]);
    expect(viewModel.nutritionLongSections?.[0]).toMatchObject({
      title: 'Vitaminas y micronutrientes',
      body:
        'Vitaminas A y C visibles, con apoyo de antioxidantes y minerales de los vegetales.',
      tags: ['Vitamina A', 'Vitamina C'],
      premiumRenderState: 'unlocked',
    });
    expect(viewModel.nutritionLongSections?.[1]).toMatchObject({
      title: 'Recomendaciones',
      body:
        'Aumenta la fibra con una porcion extra de verduras y mantén una fuente de proteina clara.',
    });
  });

  it('prefers preserved raw fallback text over unknown nutrition labels', () => {
    const viewModel = buildScanResultViewModel({
      analysisData: {
        schema_version: 4,
        scan_type: 'nutrition',
        plate_health_score: 82,
        calories_estimate: 410,
        protein_grams: 28,
        carbs_grams: 33,
        fat_grams: 14,
        verdict_key: 'mystery_verdict',
        verdict_fallback_text: 'Energisant mais gras',
        glycemic_index_key: 'slow_release',
        glycemic_index_fallback_text: 'Slow release',
        satiety_index: 8,
        ingredient_quality_key: 'farm_fresh',
        ingredient_quality_fallback_text: 'Farm fresh',
        main_vitamin_keys: ['unknown'],
        main_vitamins_fallback_text: 'Vitamin P',
      } as any,
      t,
      locale: 'es',
      premiumRenderState: 'unlocked',
      resolveFaceGlowScore: () => 0,
    });

    expect(viewModel.quickStats[1].value).toBe('Energisant mais gras');
    expect(viewModel.metrics[1].value).toBe('Farm fresh');
    expect(viewModel.premiumMetrics[0].value).toBe('Slow release');
    expect(viewModel.nutritionLongSections?.[0]?.body).toBe('Vitamin P');
  });

  it('renders a dash when qualitative fallback text is unavailable', () => {
    const faceViewModel = buildScanResultViewModel({
      analysisData: {
        schema_version: 4,
        scan_type: 'face',
        face_score: 75,
        perceived_age: 29,
        face_shape_key: 'mystery_shape',
        symmetry_percentage: 82,
        fatigue_level: 24,
        hydration_level: 68,
        photogenic_score: 8,
        skin_quality_score: 71,
        energy_score: 7,
        collagen_level: 64,
      } as any,
      t,
      locale: 'es',
      premiumRenderState: 'unlocked',
      resolveFaceGlowScore: () => 0,
    });
    const bodyViewModel = buildScanResultViewModel({
      analysisData: {
        schema_version: 4,
        scan_type: 'body',
        body_score: 75,
        body_type_key: 'mystery_type',
        muscle_mass_key: 'mystery_mass',
        waist_estimation_cm: 79,
        strength_index: 73,
        bmi_estimate: 22.1,
        metabolic_age: 28,
        body_fat_percentage: 18,
        posture_score: 8,
        body_symmetry: 77,
      } as any,
      t,
      locale: 'es',
      premiumRenderState: 'unlocked',
      resolveFaceGlowScore: () => 0,
    });
    const nutritionViewModel = buildScanResultViewModel({
      analysisData: {
        schema_version: 4,
        scan_type: 'nutrition',
        plate_health_score: 82,
        calories_estimate: 410,
        protein_grams: 28,
        carbs_grams: 33,
        fat_grams: 14,
        verdict_key: 'mystery_verdict',
        glycemic_index_key: 'slow_release',
        satiety_index: 8,
        ingredient_quality_key: 'farm_fresh',
        main_vitamin_keys: ['unknown'],
      } as any,
      t,
      locale: 'es',
      premiumRenderState: 'unlocked',
      resolveFaceGlowScore: () => 0,
    });

    expect(faceViewModel.quickStats[1].value).toBe('-');
    expect(bodyViewModel.quickStats[0].value).toBe('-');
    expect(bodyViewModel.quickStats[1].value).toBe('-');
    expect(nutritionViewModel.quickStats[1].value).toBe('-');
    expect(nutritionViewModel.metrics[1].value).toBe('-');
    expect(nutritionViewModel.premiumMetrics[0].value).toBe('-');
    expect(nutritionViewModel.nutritionLongSections).toEqual([]);
  });

  it('keeps premium nutrition long sections neutral while auth is loading', () => {
    const viewModel = buildScanResultViewModel({
      analysisData: {
        schema_version: 3,
        scan_type: 'nutrition',
        plate_health_score: 82,
        calories_estimate: 410,
        protein_grams: 28,
        carbs_grams: 33,
        fat_grams: 14,
        verdict_key: 'balanced',
        glycemic_index_key: 'high',
        satiety_index: 8,
        ingredient_quality_key: 'processed',
        main_vitamin_keys: ['vitamin_a', 'vitamin_c'],
      },
      t,
      locale: 'es',
      premiumRenderState: 'loading',
      resolveFaceGlowScore: () => 0,
    });

    expect(viewModel.premiumMetrics.every((metric) => metric.value === '...')).toBe(
      true,
    );
    expect(
      viewModel.premiumMetrics.every((metric) => metric.premiumRenderState === 'loading'),
    ).toBe(true);
    expect(viewModel.nutritionLongSections?.[0]).toMatchObject({
      id: 'vitamins',
      premiumRenderState: 'loading',
      body: '...',
    });
  });

  it('keeps premium nutrition metrics neutral while auth is loading', () => {
    const viewModel = buildScanResultViewModel({
      analysisData: {
        schema_version: 3,
        scan_type: 'nutrition',
        plate_health_score: 82,
        calories_estimate: 410,
        protein_grams: 28,
        carbs_grams: 33,
        fat_grams: 14,
        verdict_key: 'balanced',
        glycemic_index_key: 'high',
        satiety_index: 8,
        ingredient_quality_key: 'processed',
        main_vitamin_keys: ['vitamin_a', 'vitamin_c'],
      },
      t,
      locale: 'es',
      premiumRenderState: 'loading',
      resolveFaceGlowScore: () => 0,
    });

    expect(viewModel.premiumMetrics.every((metric) => metric.value === '...')).toBe(
      true,
    );
    expect(
      viewModel.premiumMetrics.every((metric) => metric.premiumRenderState === 'loading'),
    ).toBe(true);
  });

  it('builds body quick stats from canonical normalized keys', () => {
    const viewModel = buildScanResultViewModel({
      analysisData: {
        schema_version: 3,
        scan_type: 'body',
        body_score: 77,
        body_fat_percentage: 18,
        muscle_mass_key: 'balanced',
        body_type_key: 'athletic',
        posture_score: 7,
        waist_estimation_cm: 79,
        strength_index: 73,
        body_symmetry: 77,
        bmi_estimate: 22.1,
        metabolic_age: 28,
      },
      t,
      locale: 'es',
      premiumRenderState: 'unlocked',
      resolveFaceGlowScore: () => 0,
    });

    expect(viewModel.quickStats[0].value).toBe('Atletico');
    expect(viewModel.quickStats[1].value).toBe('Equilibrada');
    expect(viewModel.metrics[1].theme.tone).toBe('emerald');
    expect(viewModel.premiumMetrics[0].theme.tone).toBe('amber');
    expect(viewModel.premiumMetrics[0].premiumRenderState).toBe('unlocked');
  });

  it('assigns explicit icon tokens for face, body, and nutrition results', () => {
    const faceViewModel = buildScanResultViewModel({
      analysisData: {
        schema_version: 3,
        scan_type: 'face',
        face_score: 78,
        perceived_age: 28,
        face_shape_key: 'oval',
        symmetry_percentage: 82,
        fatigue_level: 24,
        hydration_level: 68,
        photogenic_score: 8,
        skin_quality_score: 74,
        energy_score: 7,
        collagen_level: 66,
      },
      t,
      locale: 'es',
      premiumRenderState: 'unlocked',
      resolveFaceGlowScore: () => 7,
    });

    const bodyViewModel = buildScanResultViewModel({
      analysisData: {
        schema_version: 3,
        scan_type: 'body',
        body_score: 77,
        body_fat_percentage: 18,
        muscle_mass_key: 'balanced',
        body_type_key: 'athletic',
        posture_score: 7,
        waist_estimation_cm: 79,
        strength_index: 73,
        body_symmetry: 77,
        bmi_estimate: 22.1,
        metabolic_age: 28,
      },
      t,
      locale: 'es',
      premiumRenderState: 'unlocked',
      resolveFaceGlowScore: () => 0,
    });

    const nutritionViewModel = buildScanResultViewModel({
      analysisData: {
        schema_version: 3,
        scan_type: 'nutrition',
        plate_health_score: 82,
        calories_estimate: 410,
        protein_grams: 28,
        carbs_grams: 33,
        fat_grams: 14,
        verdict_key: 'balanced',
        glycemic_index_key: 'high',
        satiety_index: 8,
        ingredient_quality_key: 'processed',
        main_vitamin_keys: ['vitamin_a', 'vitamin_c'],
      },
      t,
      locale: 'es',
      premiumRenderState: 'unlocked',
      resolveFaceGlowScore: () => 0,
    });

    expect(faceViewModel.quickStats.map((item) => item.icon)).toEqual([
      'perceived_age',
      'face_shape',
    ]);
    expect(faceViewModel).not.toHaveProperty('heroInsight');
    expect(faceViewModel).not.toHaveProperty('keyInsight');
    expect(faceViewModel.metrics.map((item) => item.theme.tone)).toEqual([
      'blue',
      'slate',
      'blue',
      'gold',
    ]);
    expect(faceViewModel.premiumMetrics.map((item) => item.icon)).toEqual([
      'skin_quality',
      'glow',
      'collagen',
    ]);
    expect(faceViewModel.premiumMetrics.map((item) => item.theme.tone)).toEqual([
      'blue',
      'gold',
      'blue',
    ]);
    expect(bodyViewModel.quickStats.map((item) => item.icon)).toEqual([
      'body_type',
      'muscle_mass',
    ]);
    expect(bodyViewModel).not.toHaveProperty('heroInsight');
    expect(bodyViewModel).not.toHaveProperty('keyInsight');
    // `posture` est désormais une métrique gratuite (déplacée vers `metrics`).
    expect(bodyViewModel.premiumMetrics.map((item) => item.icon)).toEqual([
      'body_fat',
      'body_symmetry',
    ]);
    expect(bodyViewModel.metrics.map((item) => item.icon)).toEqual([
      'waist',
      'strength',
      'bmi',
      'metabolic_age',
      'posture',
    ]);
    expect(nutritionViewModel.quickStats.map((item) => item.icon)).toEqual([
      'calories',
      'verdict',
    ]);
    expect(nutritionViewModel).not.toHaveProperty('heroInsight');
    expect(nutritionViewModel).not.toHaveProperty('keyInsight');
    expect(nutritionViewModel.macros?.items.map((item) => item.icon)).toEqual([
      'proteins',
      'carbs',
      'fats',
    ]);
    expect(nutritionViewModel.metrics.map((item) => item.icon)).toEqual([
      'satiety',
      'ingredients',
    ]);
    expect(nutritionViewModel.premiumMetrics.map((item) => item.icon)).toEqual([
      'glycemic',
    ]);
    expect(nutritionViewModel.nutritionLongSections?.map((item) => item.icon)).toEqual([
      'vitamins',
    ]);
    expect(nutritionViewModel.quickStats.map((item) => item.theme.tone)).toEqual([
      'amber',
      'emerald',
    ]);
    expect(nutritionViewModel.metrics.map((item) => item.theme.tone)).toEqual([
      'emerald',
      'coral',
    ]);
    expect(nutritionViewModel.premiumMetrics.map((item) => item.theme.tone)).toEqual([
      'coral',
    ]);
    expect(nutritionViewModel.nutritionLongSections?.[0].theme.tone).toBe('blue');
  });

  it('adds up to five available extended face metrics to the visible analysis grid', () => {
    const viewModel = buildScanResultViewModel({
      analysisData: {
        schema_version: 4,
        scan_type: 'face',
        face_score: 78,
        perceived_age: 28,
        face_shape_key: 'oval',
        symmetry_percentage: 82,
        fatigue_level: 24,
        hydration_level: 68,
        photogenic_score: 8,
        skin_quality_score: 74,
        energy_score: 7,
        collagen_level: 66,
        skin_clarity_score: 79,
        skin_evenness_score: 72,
        under_eye_shadow_score: 31,
        pore_visibility_score: 44,
        complexion_redness_score: 27,
        perceived_sleep_quality: 63,
      },
      t,
      locale: 'es',
      premiumRenderState: 'unlocked',
      resolveFaceGlowScore: () => 7,
    });

    expect(viewModel.metrics.map((item) => item.icon)).toEqual([
      'symmetry',
      'fatigue',
      'hydration',
      'photogenic',
      'skin_clarity',
      'skin_evenness',
      'under_eye_shadow',
      'pore_visibility',
      'complexion_redness',
      'sleep_quality',
    ]);
    expect(viewModel.metrics.slice(4).map((item) => item.value)).toEqual([
      '79/100',
      '72/100',
      '31/100',
      '44/100',
      '27/100',
      '63/100',
    ]);
    expect(viewModel.metrics.slice(4).every((item) => item.titleMaxLines === 1)).toBe(
      true,
    );
  });

  it('shows numeric fatigue + glow-up scores to free face users (rééquilibrage 2026-05-27)', () => {
    const viewModel = buildScanResultViewModel({
      analysisData: {
        schema_version: 4,
        scan_type: 'face',
        face_score: 78,
        perceived_age: 28,
        face_shape_key: 'oval',
        symmetry_percentage: 82,
        fatigue_level: 72,
        hydration_level: 68,
        photogenic_score: 8,
        skin_quality_score: 74,
        energy_score: 7,
        collagen_level: 66,
        skin_clarity_score: 80,
        skin_evenness_score: 62,
        under_eye_shadow_score: 31,
        pore_visibility_score: 44,
      },
      t,
      locale: 'es',
      premiumRenderState: 'locked',
      resolveFaceGlowScore: () => 7,
    });

    // fatigue_level affiché chiffré (au lieu d'un label `Élevée`/`Modérée`).
    expect(viewModel.metrics.find((item) => item.icon === 'fatigue')).toMatchObject({
      value: '72/100',
      valueVariant: 'fraction',
    });
    // skin_clarity / skin_evenness / under_eye_shadow affichés chiffrés.
    expect(
      viewModel.metrics.find((item) => item.icon === 'skin_clarity'),
    ).toMatchObject({ value: '80/100', valueVariant: 'fraction' });
    expect(
      viewModel.metrics.find((item) => item.icon === 'skin_evenness'),
    ).toMatchObject({ value: '62/100', valueVariant: 'fraction' });
    expect(
      viewModel.metrics.find((item) => item.icon === 'under_eye_shadow'),
    ).toMatchObject({ value: '31/100', valueVariant: 'fraction' });
    // Plus aucun label qualitatif `*_signal` ne remplace ces chiffres.
    expect(
      viewModel.metrics.filter((item) => item.id.endsWith('_signal')),
    ).toHaveLength(0);
    // Les vrais champs premium-locked (skin_quality, glow, collagen, pores)
    //   restent masqués pour le gratuit.
    expect(
      viewModel.metrics.find((item) => item.icon === 'pore_visibility'),
    ).toMatchObject({
      premiumRenderState: 'locked',
      value: '••••••',
    });
    expect(viewModel.premiumMetrics.map((item) => item.icon)).toEqual([
      'skin_quality',
      'glow',
      'collagen',
    ]);
    expect(
      viewModel.premiumMetrics.every((item) => item.value === '••••••'),
    ).toBe(true);
  });

  it('omits free glow-up metrics when extended face data is missing or invalid', () => {
    const viewModel = buildScanResultViewModel({
      analysisData: {
        schema_version: 4,
        scan_type: 'face',
        face_score: 78,
        perceived_age: 28,
        face_shape_key: 'oval',
        symmetry_percentage: 82,
        fatigue_level: 24,
        hydration_level: 68,
        photogenic_score: 8,
        skin_quality_score: 74,
        energy_score: 7,
        collagen_level: 66,
        skin_clarity_score: null,
        skin_evenness_score: undefined,
        under_eye_shadow_score: 'invalid',
      } as any,
      t,
      locale: 'es',
      premiumRenderState: 'locked',
      resolveFaceGlowScore: () => 7,
    });

    // Pas de cartes vides : les 3 métriques skin_* / under_eye sont absentes
    //   du viewModel quand la valeur IA est manquante.
    expect(
      viewModel.metrics
        .map((item) => item.icon)
        .filter((icon) =>
          ['skin_clarity', 'skin_evenness', 'under_eye_shadow'].includes(icon),
        ),
    ).toEqual([]);
    // fatigue reste affiché car la valeur (24) est valide.
    expect(viewModel.metrics.find((item) => item.icon === 'fatigue')).toMatchObject({
      value: '24/100',
    });
  });

  it('keeps detailed extended face metrics neutral while auth is loading', () => {
    const viewModel = buildScanResultViewModel({
      analysisData: {
        schema_version: 4,
        scan_type: 'face',
        face_score: 78,
        perceived_age: 28,
        face_shape_key: 'oval',
        symmetry_percentage: 82,
        fatigue_level: 24,
        hydration_level: 68,
        photogenic_score: 8,
        skin_quality_score: 74,
        energy_score: 7,
        collagen_level: 66,
        skin_clarity_score: 79,
        skin_evenness_score: 62,
        under_eye_shadow_score: 31,
      },
      t,
      locale: 'es',
      premiumRenderState: 'loading',
      resolveFaceGlowScore: () => 7,
    });

    expect(
      viewModel.metrics.some((item) => item.id === 'skin_clarity_signal'),
    ).toBe(false);
    // Depuis 2026-05-27, skin_clarity/skin_evenness/under_eye_shadow ne sont
    //   plus premium-gated : leur valeur chiffrée s'affiche directement, y
    //   compris pendant le chargement auth (la valeur est juste celle de l'IA).
    expect(
      viewModel.metrics
        .filter((item) =>
          ['skin_clarity', 'skin_evenness', 'under_eye_shadow'].includes(item.icon),
        )
        .map((item) => ({ state: item.premiumRenderState, value: item.value })),
    ).toEqual([
      { state: undefined, value: '79/100' },
      { state: undefined, value: '62/100' },
      { state: undefined, value: '31/100' },
    ]);
  });

  it('shows numeric recovery_readiness to free body users (rééquilibrage 2026-05-27)', () => {
    const viewModel = buildScanResultViewModel({
      analysisData: {
        schema_version: 4,
        scan_type: 'body',
        body_score: 75,
        body_type_key: 'athletic',
        muscle_mass_key: 'balanced',
        waist_estimation_cm: 79,
        strength_index: 73,
        bmi_estimate: 22.1,
        metabolic_age: 28,
        body_fat_percentage: 18,
        posture_score: 8,
        body_symmetry: 77,
        recovery_readiness_score: 68,
      } as any,
      t,
      locale: 'es',
      premiumRenderState: 'locked',
      resolveFaceGlowScore: () => 0,
    });

    // La valeur chiffrée IA est affichée pour le gratuit (pas un label).
    expect(
      viewModel.metrics.find((item) => item.id === 'recovery_readiness'),
    ).toMatchObject({
      value: '68/100',
      valueVariant: 'fraction',
    });
    // Plus de label qualitatif `recovery_signal`.
    expect(
      viewModel.metrics.some((item) => item.id === 'recovery_signal'),
    ).toBe(false);
    // Les autres premium body (body_fat, strength, etc.) restent lockés.
    expect(
      viewModel.metrics.find((item) => item.icon === 'strength'),
    ).toMatchObject({ premiumRenderState: 'locked', value: '••••••' });
    expect(viewModel.premiumMetrics.map((item) => item.icon)).toEqual([
      'body_fat',
      'body_symmetry',
    ]);
  });

  it('shows numeric meal_balance to free nutrition users (rééquilibrage 2026-05-27)', () => {
    const viewModel = buildScanResultViewModel({
      analysisData: {
        schema_version: 4,
        scan_type: 'nutrition',
        plate_health_score: 82,
        calories_estimate: 410,
        protein_grams: 28,
        carbs_grams: 33,
        fat_grams: 14,
        verdict_key: 'balanced',
        glycemic_index_key: 'high',
        satiety_index: 8,
        ingredient_quality_key: 'processed',
        main_vitamin_keys: ['vitamin_a', 'vitamin_c'],
        meal_balance_score: 71,
      } as any,
      t,
      locale: 'es',
      premiumRenderState: 'locked',
      resolveFaceGlowScore: () => 0,
    });

    expect(
      viewModel.metrics.find((item) => item.id === 'meal_balance'),
    ).toMatchObject({
      value: '71/100',
      valueVariant: 'fraction',
    });
    expect(
      viewModel.metrics.some((item) => item.id === 'meal_balance_signal'),
    ).toBe(false);
    // meal_balance n'apparaît plus dans premiumMetrics (déplacé dans metrics).
    expect(
      viewModel.premiumMetrics.some((item) => item.id === 'meal_balance'),
    ).toBe(false);
    // satiety_index reste premium-locked.
    expect(
      viewModel.metrics.find((item) => item.icon === 'satiety'),
    ).toMatchObject({ premiumRenderState: 'locked', value: '••••••' });
  });

  it('renders the same numeric values to premium users without regression', () => {
    const viewModel = buildScanResultViewModel({
      analysisData: {
        schema_version: 4,
        scan_type: 'face',
        face_score: 78,
        perceived_age: 28,
        face_shape_key: 'oval',
        symmetry_percentage: 82,
        fatigue_level: 72,
        hydration_level: 68,
        photogenic_score: 8,
        skin_quality_score: 74,
        energy_score: 7,
        collagen_level: 66,
        skin_clarity_score: 80,
        skin_evenness_score: 62,
        under_eye_shadow_score: 31,
      } as any,
      t,
      locale: 'es',
      premiumRenderState: 'unlocked',
      resolveFaceGlowScore: () => 7,
    });

    // Premium voit les mêmes chiffres que le gratuit pour ces 4 métriques.
    expect(viewModel.metrics.find((item) => item.icon === 'fatigue')).toMatchObject({
      value: '72/100',
    });
    expect(
      viewModel.metrics.find((item) => item.icon === 'skin_clarity'),
    ).toMatchObject({ value: '80/100' });
    expect(
      viewModel.metrics.find((item) => item.icon === 'skin_evenness'),
    ).toMatchObject({ value: '62/100' });
    expect(
      viewModel.metrics.find((item) => item.icon === 'under_eye_shadow'),
    ).toMatchObject({ value: '31/100' });
    // Premium voit aussi les vrais champs premium.
    expect(
      viewModel.premiumMetrics.every((item) => item.premiumRenderState === 'unlocked'),
    ).toBe(true);
  });

  it('localizes super scan summary and disclaimer while keeping normalized conditions sorted', () => {
    const viewModel = buildSuperScanResultViewModel({
      analysisData: {
        schema_version: 3,
        scan_type: 'super_health_v2',
        global_risk_score: 61,
        urgency_flag: true,
        summary_key: 'medical_attention',
        disclaimer_key: 'medical_not_diagnosis',
        detected_conditions: [
          {
            condition_key: 'cond_low',
            probability: 20,
            category_key: 'general',
            severity_key: 'low',
            explanation_key: 'cond_low',
            advice_key: 'cond_low',
          },
          {
            condition_key: 'cond_high',
            probability: 82,
            category_key: 'general',
            severity_key: 'high',
            explanation_key: 'cond_high',
            advice_key: 'cond_high',
          },
          {
            condition_key: 'cond_mod',
            probability: 48,
            category_key: 'general',
            severity_key: 'moderate',
            explanation_key: 'cond_mod',
            advice_key: 'cond_mod',
          },
        ],
      },
      t,
    });

    expect(viewModel.analysisSummary).toBe('Atencion medica recomendada');
    expect(viewModel.disclaimerText).toBe('No es un diagnostico medico.');
    expect(viewModel.conditions.map((condition) => condition.condition_key)).toEqual([
      'cond_high',
      'cond_mod',
      'cond_low',
    ]);
  });

  it('falls back to controlled unknown copy for untranslated super scan keys', () => {
    const viewModel = buildSuperScanResultViewModel({
      analysisData: {
        schema_version: 3,
        scan_type: 'super_health_v2',
        global_risk_score: 44,
        urgency_flag: false,
        summary_key: 'unmapped_summary',
        disclaimer_key: 'unmapped_disclaimer',
        detected_conditions: [],
      },
      t,
    });

    expect(viewModel.analysisSummary).toBe('Necesita revision');
    expect(viewModel.disclaimerText).toBe('Resultado solo informativo.');
  });

  it('prefers preserved free-text super scan content over generic fallback translations', () => {
    const viewModel = buildSuperScanResultViewModel({
      analysisData: {
        schema_version: 3,
        scan_type: 'super_health_v2',
        global_risk_score: 44,
        urgency_flag: false,
        summary_key: 'unknown',
        summary_fallback_text: 'Detailed webhook text should be rendered first',
        disclaimer_key: 'unknown',
        disclaimer_fallback_text: 'Custom provider disclaimer',
        detected_conditions: [],
      },
      t,
    });

    expect(viewModel.analysisSummary).toBe(
      'Detailed webhook text should be rendered first',
    );
    expect(viewModel.analysisSummarySource).toBe('summary_fallback_text');
    expect(viewModel.disclaimerText).toBe('Custom provider disclaimer');
    expect(viewModel.disclaimerSource).toBe('disclaimer_fallback_text');
  });

  it('builds an explicit legacy super scan vm without changing condition sorting', () => {
    const viewModel = buildLegacySuperScanResultViewModel({
      analysisData: {
        schema_version: 3,
        scan_type: 'super_health_v2',
        global_risk_score: 44,
        urgency_flag: false,
        summary_key: 'medical_attention',
        disclaimer_key: 'medical_not_diagnosis',
        detected_conditions: [
          {
            condition_key: 'cond_low',
            probability: 20,
            category_key: 'general',
            severity_key: 'low',
            explanation_key: 'cond_low',
            advice_key: 'cond_low',
          },
          {
            condition_key: 'cond_high',
            probability: 82,
            category_key: 'general',
            severity_key: 'high',
            explanation_key: 'cond_high',
            advice_key: 'cond_high',
          },
        ],
      },
      t,
    });

    expect(viewModel.kind).toBe('legacy');
    expect(viewModel.conditions.map((condition) => condition.condition_key)).toEqual([
      'cond_high',
      'cond_low',
    ]);
  });

  it('builds a dedicated fat distribution vm with readable metrics and normalized confidence', () => {
    const viewModel = buildFatDistributionSuperScanResultViewModel({
      analysisData: {
        scan_type: 'fat_distribution_scan_v2',
        global_body_fat_estimate_percent: 24.6,
        global_facial_fat_estimate_percent: 18,
        global_water_retention_estimate_percent: 11,
        analysis_summary: 'Distribucion de grasa centrada en abdomen y rostro.',
        dominant_storage_pattern: 'Retencion moderada con acumulacion subcutanea.',
        priority_zones: ['Abdomen', 'Cara inferior'],
        areas_analysis: [
          {
            area_name: 'Abdomen',
            subcutaneous_fat_percent: 31,
            water_retention_percent: 14,
            definition_percent: 46,
            dominant_type: 'Subcutanea',
            confidence: 0.84,
            explanation: 'La acumulacion es mas visible en la zona media.',
            actionable_advice: 'Prioriza descanso, deficit ligero y pasos diarios.',
          },
        ],
        disclaimer_text: 'Resultado orientativo.',
      },
      t,
      locale: 'es',
    });

    expect(viewModel.kind).toBe('fat_distribution');
    expect(viewModel.primaryMetrics.map((metric) => metric.id)).toEqual([
      'body_fat',
      'facial_fat',
      'water_retention',
    ]);
    expect(viewModel.priorityZones).toEqual(['Abdomen', 'Cara inferior']);
    expect(viewModel.areas[0]).toMatchObject({
      areaName: 'Abdomen',
      dominantType: 'Subcutanea',
      subcutaneousFatPercent: '31%',
      waterRetentionPercent: '14%',
      definitionPercent: '46%',
      confidencePercent: '84%',
      explanation: 'La acumulacion es mas visible en la zona media.',
      actionableAdvice: 'Prioriza descanso, deficit ligero y pasos diarios.',
    });
  });

  it('keeps the fat distribution vm stable when global metrics are null and arrays are empty', () => {
    const viewModel = buildFatDistributionSuperScanResultViewModel({
      analysisData: {
        scan_type: 'fat_distribution_scan_v2',
        global_body_fat_estimate_percent: null,
        global_facial_fat_estimate_percent: null,
        global_water_retention_estimate_percent: 0,
        analysis_summary: '',
        dominant_storage_pattern: '',
        priority_zones: [],
        areas_analysis: [],
        disclaimer_text: '',
      },
      t,
      locale: 'es',
    });

    expect(viewModel.primaryMetrics).toEqual([
      expect.objectContaining({
        id: 'water_retention',
        value: '0%',
      }),
    ]);
    expect(viewModel.priorityZones).toEqual([]);
    expect(viewModel.areas).toEqual([]);
    expect(viewModel.analysisSummary).toBe('-');
    expect(viewModel.dominantStoragePattern).toBe('-');
    expect(viewModel.disclaimerText).toBe('-');
  });

  it('builds an unlocked face trajectory from current score and history', () => {
    const viewModel = buildResultTrajectoryViewModel({
      analysisData: {
        schema_version: 3,
        scan_type: 'face',
        face_score: 78,
        perceived_age: 28,
        face_shape_key: 'oval',
        symmetry_percentage: 82,
        fatigue_level: 24,
        hydration_level: 68,
        photogenic_score: 8,
        skin_quality_score: 74,
        energy_score: 7,
        collagen_level: 66,
      },
      t,
      locale: 'es',
      premiumRenderState: 'unlocked',
      historicalAverage30d: 72,
      recentScoreHistory: [
        { date: '2026-03-10', score: 70 },
        { date: '2026-03-18', score: 74 },
        { date: '2026-03-25', score: 76 },
      ],
      currentScanDate: '2026-03-27T09:00:00.000Z',
    });

    expect(viewModel.shouldRender).toBe(true);
    expect(viewModel.premiumRenderState).toBe('unlocked');
    expect(viewModel.badgeLabel).toBe('ACTIVA');
    expect(viewModel.hookLabel).toBe('Estimada');
    expect(viewModel.series[viewModel.series.length - 1]).toBeGreaterThan(
      viewModel.series[0],
    );
    expect(viewModel.headline).toContain('podria llegar a');
    expect(viewModel.subtitle).toBe(
      'Basada en este escaneo y en tu tendencia reciente.',
    );
    expect(viewModel.footnote).toBe('Estimacion orientativa, no consejo medico.');
    expect(viewModel.checkpoints).toHaveLength(3);
  });

  it('builds a locked nutrition trajectory with teaser copy only', () => {
    const viewModel = buildResultTrajectoryViewModel({
      analysisData: {
        schema_version: 3,
        scan_type: 'nutrition',
        plate_health_score: 64,
        calories_estimate: 410,
        protein_grams: 28,
        carbs_grams: 33,
        fat_grams: 14,
        verdict_key: 'balanced',
        glycemic_index_key: 'high',
        satiety_index: 8,
        ingredient_quality_key: 'processed',
        main_vitamin_keys: ['vitamin_a', 'vitamin_c'],
      },
      t,
      locale: 'es',
      premiumRenderState: 'locked',
      historicalAverage30d: null,
      recentScoreHistory: [],
      currentScanDate: '2026-03-27T09:00:00.000Z',
    });

    expect(viewModel.premiumRenderState).toBe('locked');
    expect(viewModel.badgeLabel).toBe('PREMIUM');
    expect(viewModel.hookLabel).toBe('Potencial');
    expect(viewModel.ctaLabel).toBe('Desbloquear mi proyeccion');
    expect(viewModel.footnote).toBeUndefined();
    expect(viewModel.checkpoints).toEqual([]);
    expect(viewModel.subtitle).toBe('Premium revela la curva de 30 dias.');
  });

  it('builds a neutral loading trajectory without checkpoints or cta', () => {
    const viewModel = buildResultTrajectoryViewModel({
      analysisData: {
        schema_version: 3,
        scan_type: 'body',
        body_score: 81,
        body_fat_percentage: 18,
        muscle_mass_key: 'balanced',
        body_type_key: 'athletic',
        posture_score: 7,
        waist_estimation_cm: 79,
        strength_index: 73,
        body_symmetry: 77,
        bmi_estimate: 22.1,
        metabolic_age: 28,
      },
      t,
      locale: 'es',
      premiumRenderState: 'loading',
      historicalAverage30d: null,
      recentScoreHistory: [],
      currentScanDate: '2026-03-27T09:00:00.000Z',
    });

    expect(viewModel.premiumRenderState).toBe('loading');
    expect(viewModel.hookLabel).toBe('Sincronizando');
    expect(viewModel.badgeLabel).toBe('ACTUALIZANDO');
    expect(viewModel.subtitle).toBe('Tu vista premium se actualizara en un momento.');
    expect(viewModel.ctaLabel).toBeUndefined();
    expect(viewModel.footnote).toBeUndefined();
    expect(viewModel.checkpoints).toEqual([]);
    expect(new Set(viewModel.series).size).toBe(1);
  });

  it('builds a super trajectory with rising chart values and falling displayed risk', () => {
    const viewModel = buildResultTrajectoryViewModel({
      analysisData: {
        schema_version: 3,
        scan_type: 'super_health_v2',
        global_risk_score: 58,
        urgency_flag: false,
        summary_key: 'medical_attention',
        disclaimer_key: 'medical_not_diagnosis',
        detected_conditions: [],
      },
      t,
      locale: 'es',
      premiumRenderState: 'unlocked',
      historicalAverage30d: 62,
      recentScoreHistory: [
        { date: '2026-03-01', score: 67 },
        { date: '2026-03-08', score: 64 },
        { date: '2026-03-16', score: 62 },
        { date: '2026-03-22', score: 60 },
      ],
      currentScanDate: '2026-03-27T09:00:00.000Z',
    });

    expect(viewModel.badgeLabel).toBe('ACTIVA');
    expect(viewModel.hookLabel).toBe('Estimada');
    expect(viewModel.headline).toContain('riesgo global');
    expect(viewModel.series[viewModel.series.length - 1]).toBeGreaterThan(
      viewModel.series[0],
    );
    expect(
      viewModel.points[viewModel.points.length - 1]?.displayValue,
    ).toBeLessThan(viewModel.points[0]?.displayValue ?? 100);
  });

  it('hides the trajectory when an unsupported fat distribution super payload leaks through', () => {
    const viewModel = buildResultTrajectoryViewModel({
      analysisData: {
        scan_type: 'fat_distribution_scan_v2',
      } as any,
      t,
      locale: 'es',
      premiumRenderState: 'locked',
      historicalAverage30d: null,
      recentScoreHistory: [],
      currentScanDate: '2026-03-27T09:00:00.000Z',
    });

    expect(viewModel.shouldRender).toBe(false);
    expect(viewModel.series).toEqual([]);
    expect(viewModel.points).toEqual([]);
  });
});
