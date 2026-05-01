import {
  localizeNutritionVitaminKeys,
  localizeQualitativeLevel,
  localizeSuperScanAdviceKey,
  localizeSuperScanCategoryKey,
  localizeSuperScanConditionLabel,
  localizeSuperScanExplanationKey,
  localizeSuperScanSummaryKey,
  localizeVerdict,
} from '@/utils/resultLocalization';

const createTranslator =
  (translations: Record<string, string>) =>
  (scope: string, options?: Record<string, unknown>) =>
    translations[scope] ?? String(options?.defaultValue ?? scope);

const createMissingSentinelTranslator =
  (locale: string, translations: Record<string, string>) =>
  (scope: string) =>
    translations[scope] ?? `[missing "${locale}.${scope}" translation]`;

describe('result localization', () => {
  const englishTranslator = createTranslator({
    'qualitative_levels.ingredient_quality.processed': 'Processed',
    'qualitative_levels.ingredient_quality.ultra_processed': 'Ultra-processed',
    'qualitative_levels.ingredient_quality.unknown': 'Unknown',
    'qualitative_levels.face_shape.oval': 'Oval',
    'qualitative_levels.body_type.inverted_triangle': 'Inverted triangle',
    'qualitative_levels.glycemic_index.high': 'High',
    'qualitative_levels.severity.high': 'High',
    'verdicts.smoothie_ideal': 'Ideal for smoothies',
    'verdicts.unknown': 'Unknown',
    'scan.nutrition.vitamins.vitamin_a': 'Vitamin A',
    'scan.nutrition.vitamins.vitamin_b': 'Vitamin B',
    'scan.nutrition.vitamins.vitamin_c': 'Vitamin C',
    'scan.nutrition.vitamins.unknown': 'Unknown',
    'scan.super.summaries.medical_attention': 'Medical follow-up recommended',
    'scan.super.summaries.unknown': 'Needs review',
    'scan.super.conditions.unknown.label': 'Unknown finding',
    'scan.super.categories.unknown': 'Other',
    'scan.super.explanations.unknown': 'Details unavailable.',
    'scan.super.advice.unknown': 'Advice unavailable.',
  });

  const frenchTranslator = createTranslator({
    'qualitative_levels.ingredient_quality.processed': 'Transforme',
    'qualitative_levels.ingredient_quality.ultra_processed': 'Ultra-transforme',
    'qualitative_levels.ingredient_quality.unknown': 'Inconnue',
    'qualitative_levels.face_shape.oval': 'Ovale',
    'qualitative_levels.body_type.inverted_triangle': 'Triangle inverse',
    'qualitative_levels.glycemic_index.high': 'Eleve',
    'qualitative_levels.severity.high': 'Elevee',
    'verdicts.smoothie_ideal': 'Ideal pour smoothie',
    'verdicts.unknown': 'Inconnu',
    'scan.nutrition.vitamins.vitamin_a': 'Vitamine A',
    'scan.nutrition.vitamins.vitamin_b': 'Vitamine B',
    'scan.nutrition.vitamins.vitamin_c': 'Vitamine C',
    'scan.nutrition.vitamins.unknown': 'Inconnue',
    'scan.super.summaries.medical_attention': 'Une verification medicale est conseillee',
    'scan.super.summaries.unknown': 'A surveiller',
    'scan.super.conditions.unknown.label': 'Signal non identifie',
    'scan.super.categories.unknown': 'Autre',
    'scan.super.explanations.unknown': 'Plus de details ne sont pas encore disponibles.',
    'scan.super.advice.unknown': 'Surveillez vos symptomes et demandez un avis si besoin.',
  });
  const frenchMissingSentinelTranslator = createMissingSentinelTranslator('fr', {
    'qualitative_levels.glycemic_index.unknown': 'Inconnu',
    'verdicts.unknown': 'Inconnu',
    'scan.nutrition.vitamins.unknown': 'Inconnue',
    'scan.super.summaries.unknown': 'A surveiller',
    'scan.super.conditions.unknown.label': 'Signal non identifie',
  });

  it('maps canonical qualitative keys directly to local translations', () => {
    expect(localizeQualitativeLevel('ingredient_quality', 'processed', englishTranslator)).toBe(
      'Processed'
    );
    expect(
      localizeQualitativeLevel('ingredient_quality', 'ultra_processed', frenchTranslator)
    ).toBe('Ultra-transforme');
    expect(localizeQualitativeLevel('face_shape', 'oval', frenchTranslator)).toBe('Ovale');
  });

  it('normalizes canonical keys before translating them', () => {
    expect(localizeQualitativeLevel('body_type', 'Inverted Triangle', englishTranslator)).toBe(
      'Inverted triangle'
    );
    expect(localizeQualitativeLevel('glycemic_index', 'HIGH', frenchTranslator)).toBe('Eleve');
  });

  it('falls back to generic unknown text instead of humanizing internal keys', () => {
    expect(localizeQualitativeLevel('ingredient_quality', 'farm_fresh', englishTranslator)).toBe(
      'Unknown'
    );
    expect(localizeVerdict('chef_special', frenchTranslator)).toBe('Inconnu');
  });

  it('treats i18n-js [missing ...] sentinels as missing translations at helper level', () => {
    expect(localizeVerdict('energisant_mais_gras', frenchMissingSentinelTranslator)).toBe(
      'Inconnu'
    );
    expect(
      localizeQualitativeLevel(
        'glycemic_index',
        'slow_release',
        frenchMissingSentinelTranslator
      )
    ).toBe('Inconnu');
    expect(
      localizeNutritionVitaminKeys(['niacine'], frenchMissingSentinelTranslator, {
        locale: 'fr',
      })
    ).toBe('Inconnue');
    expect(
      localizeSuperScanSummaryKey('rare_flag', frenchMissingSentinelTranslator)
    ).toBe('A surveiller');
    expect(
      localizeSuperScanConditionLabel('rare_flag', frenchMissingSentinelTranslator)
    ).toBe('Signal non identifie');
  });

  it('localizes verdicts and super scan summaries through dedicated namespaces', () => {
    expect(localizeVerdict('smoothie_ideal', frenchTranslator)).toBe('Ideal pour smoothie');
    expect(localizeSuperScanSummaryKey('medical_attention', englishTranslator)).toBe(
      'Medical follow-up recommended'
    );
  });

  it('falls back to controlled super scan placeholders for unknown catalog keys', () => {
    expect(localizeSuperScanConditionLabel('rare_flag', englishTranslator)).toBe('Unknown finding');
    expect(localizeSuperScanCategoryKey('rare_flag', englishTranslator)).toBe('Other');
    expect(localizeSuperScanExplanationKey('rare_flag', englishTranslator)).toBe(
      'Details unavailable.'
    );
    expect(localizeSuperScanAdviceKey('rare_flag', englishTranslator)).toBe(
      'Advice unavailable.'
    );
  });

  it('localizes vitamin lists from canonical vitamin keys and generic unknown fallback', () => {
    const localized = localizeNutritionVitaminKeys(['vitamin_a', 'vitamin_c'], englishTranslator, {
      locale: 'en',
    });

    expect(localized).toContain('Vitamin A');
    expect(localized).toContain('Vitamin C');
    expect(localizeNutritionVitaminKeys(['vitamin_b'], englishTranslator, { locale: 'en' })).toBe(
      'Vitamin B'
    );
    expect(localizeNutritionVitaminKeys(['vitamin_b'], frenchTranslator, { locale: 'fr' })).toBe(
      'Vitamine B'
    );

    expect(localizeNutritionVitaminKeys(['vitamin_x'], englishTranslator, { locale: 'en' })).toBe(
      'Unknown'
    );
  });

  it('localizes severity labels with normalized lowercase keys', () => {
    expect(localizeQualitativeLevel('severity', 'high', englishTranslator)).toBe('High');
    expect(localizeQualitativeLevel('severity', 'HIGH', frenchTranslator)).toBe('Elevee');
  });
});
