import {
  getResultIconDescriptor,
  resolveSuperCategoryIconToken,
  RESULT_SUPER_CATEGORY_ICON_TOKENS,
} from '@/utils/resultIconCatalog';
import { buildScanResultViewModel } from '@/utils/resultViewModels';

const t = (scope: string, options?: Record<string, unknown>) =>
  scope.replace(/%\{(\w+)\}/g, (_match, key) =>
    String(options?.[key] ?? `%{${key}}`),
  );

describe('result icon catalog', () => {
  it('resolves every icon token emitted by the result view models', () => {
    const faceViewModel = buildScanResultViewModel({
      analysisData: {
        schema_version: 3,
        scan_type: 'face',
        face_score: 75,
        perceived_age: 29,
        face_shape_key: 'oval',
        symmetry_percentage: 82,
        fatigue_level: 24,
        hydration_level: 68,
        photogenic_score: 8,
        skin_quality_score: 71,
        energy_score: 7,
        collagen_level: 64,
      },
      t,
      locale: 'en',
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
      locale: 'en',
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
        ingredient_quality_key: 'natural',
        main_vitamin_keys: ['vitamin_a', 'vitamin_c'],
      },
      t,
      locale: 'en',
      premiumRenderState: 'unlocked',
      resolveFaceGlowScore: () => 0,
    });

    const emittedTokens = [
      faceViewModel.scanType,
      ...faceViewModel.quickStats.map((item) => item.icon),
      ...faceViewModel.metrics.map((item) => item.icon),
      ...faceViewModel.premiumMetrics.map((item) => item.icon),
      bodyViewModel.scanType,
      ...bodyViewModel.quickStats.map((item) => item.icon),
      ...bodyViewModel.metrics.map((item) => item.icon),
      ...bodyViewModel.premiumMetrics.map((item) => item.icon),
      nutritionViewModel.scanType,
      ...nutritionViewModel.quickStats.map((item) => item.icon),
      ...(nutritionViewModel.macros?.items.map((item) => item.icon) ?? []),
      ...nutritionViewModel.metrics.map((item) => item.icon),
      ...nutritionViewModel.premiumMetrics.map((item) => item.icon),
    ];

    emittedTokens.forEach((token) => {
      expect(getResultIconDescriptor(token)).toBeTruthy();
    });
  });

  it('keeps every supported super category mapped and normalizes category fallbacks', () => {
    RESULT_SUPER_CATEGORY_ICON_TOKENS.forEach((token) => {
      expect(getResultIconDescriptor(token)).toBeTruthy();
    });

    expect(resolveSuperCategoryIconToken('Metabolic')).toBe('metabolic');
    expect(resolveSuperCategoryIconToken('posture')).toBe('posture');
    expect(resolveSuperCategoryIconToken('mystery_signal')).toBe('unknown');
  });
});
