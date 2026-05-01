import {
  buildShareStoryPayload,
  buildShareStoryRouteParams,
  parseShareStoryPayload,
  parseShareableAnalysisData,
} from '@/utils/shareStory';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@/i18n/config';
import { i18n, loadLocalesForTests } from '@/i18n/translations';

const supportedShareLocales = SUPPORTED_LOCALES;

const getNestedValue = (object: Record<string, any>, path: string) =>
  path.split('.').reduce<any>((current, key) => current?.[key], object);

const requiredSharePayloadPaths = [
  'scan.face.type_label',
  'scan.body.type_label',
  'scan.nutrition.type_label',
  'scan.super.type_label',
  'common.metrics.score',
  'share_story.metrics.risk',
  'share_story.metrics.perceived_age',
  'share_story.metrics.symmetry',
  'share_story.metrics.energy',
  'common.metrics.metabolic_age',
  'common.metrics.strength',
  'common.metrics.calories',
  'common.metrics.satiety',
  'common.metrics.ingredient_quality',
  'share_story.metrics.urgency',
  'share_story.metrics.conditions',
  'common.results.attention',
  'share_story.badge.report',
  'scan.super.urgency.high',
  'share_story.urgency.normal',
];

describe('shareStory payload builder', () => {
  beforeAll(async () => {
    await loadLocalesForTests();
  });

  afterEach(() => {
    i18n.locale = DEFAULT_LOCALE;
  });

  it('formats normalized face metrics with years, percent and glow score label', () => {
    const translator = (scope: string, options?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        'scan.face.type_label': 'Analyse visage',
        'common.metrics.score': 'Score',
        'share_story.metrics.perceived_age': 'Âge perçu',
        'share_story.metrics.symmetry': 'Symétrie',
        'share_story.metrics.energy': 'Énergie',
        'common.years_short': 'ans',
      };

      return translations[scope] ?? String(options?.defaultValue ?? scope);
    };

    const payload = buildShareStoryPayload({
      analysisData: {
        schema_version: 3,
        scan_type: 'face',
        face_score: 82,
        perceived_age: 22,
        skin_quality_score: 71,
        symmetry_percentage: 75,
        fatigue_level: 40,
        energy_score: 7,
        face_shape_key: 'oval',
        collagen_level: 66,
        hydration_level: 61,
        photogenic_score: 8,
      },
      imageUri: 'file:///face.jpg',
      t: translator,
      locale: 'fr',
    })!;

    expect(payload.variant).toBe('face');
    expect(payload.metrics).toEqual([
      {
        label: 'Âge perçu',
        value: '22 ans',
        valueVariant: 'numeric',
        labelMaxLines: 2,
        valueMaxLines: 1,
      },
      {
        label: 'Symétrie',
        value: '75%',
        valueVariant: 'numeric',
        labelMaxLines: 1,
        valueMaxLines: 1,
      },
      {
        label: 'Énergie',
        value: '60',
        valueVariant: 'numeric',
        labelMaxLines: 1,
        valueMaxLines: 1,
      },
    ]);
  });

  it.each([
    ['fr', 'Transformée'],
    ['en', 'Processed'],
    ['de', 'Verarbeitet'],
    ['it', 'Processata'],
    ['es', 'Procesada'],
    ['pt', 'Processada'],
  ] as const)('localizes nutrition quality from canonical keys in %s', (locale, expectedQuality) => {
    i18n.locale = locale;

    const payload = buildShareStoryPayload({
      analysisData: {
        schema_version: 3,
        scan_type: 'nutrition',
        plate_health_score: 77,
        calories_estimate: 25,
        protein_grams: 3,
        carbs_grams: 4,
        fat_grams: 1,
        verdict_key: 'balanced',
        glycemic_index_key: 'low',
        satiety_index: 8,
        ingredient_quality_key: 'processed',
        main_vitamin_keys: ['vitamin_a'],
      },
      imageUri: 'file:///meal.jpg',
      t: (scope, options) => i18n.t(scope, options) as string,
      locale,
    })!;

    expect(payload.variant).toBe('nutrition');
    expect(payload.metrics[2]).toEqual({
      label: expect.any(String),
      value: expectedQuality,
      valueVariant: 'text',
      labelMaxLines: 1,
      valueMaxLines: 2,
    });
  });

  it('formats super scan metrics with /100 risk, urgency and condition count', () => {
    const translator = (scope: string, options?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        'scan.super.type_label': 'Super Scan',
        'share_story.metrics.risk': 'Risque',
        'share_story.metrics.urgency': 'Urgence',
        'share_story.metrics.conditions': 'Conditions',
        'share_story.urgency.normal': 'Stable',
        'share_story.badge.report': 'Rapport IA',
      };

      return translations[scope] ?? String(options?.defaultValue ?? scope);
    };

    const payload = buildShareStoryPayload({
      analysisData: {
        schema_version: 3,
        scan_type: 'super_health_v2',
        global_risk_score: 0,
        urgency_flag: false,
        summary_key: 'stable',
        detected_conditions: [],
        disclaimer_key: 'medical_not_diagnosis',
      },
      imageUri: 'file:///super.jpg',
      t: translator,
      locale: 'fr',
    })!;

    expect(payload.variant).toBe('super');
    expect(payload.metrics).toEqual([
      {
        label: 'Risque',
        value: '0/100',
        valueVariant: 'fraction',
        labelMaxLines: 1,
        valueMaxLines: 1,
      },
      {
        label: 'Urgence',
        value: 'Stable',
        valueVariant: 'text',
        labelMaxLines: 1,
        valueMaxLines: 2,
      },
      {
        label: 'Conditions',
        value: '0',
        valueVariant: 'numeric',
        labelMaxLines: 2,
        valueMaxLines: 1,
      },
    ]);
  });

  it.each([
    ['fr', { scoreLabel: 'Risque', urgencyValue: 'Élevée', badge: 'Attention' }],
    ['en', { scoreLabel: 'Risk', urgencyValue: 'High', badge: 'Attention' }],
    ['de', { scoreLabel: 'Risiko', urgencyValue: 'Hoch', badge: 'Achtung' }],
    ['it', { scoreLabel: 'Rischio', urgencyValue: 'Alta', badge: 'Attenzione' }],
    ['es', { scoreLabel: 'Riesgo', urgencyValue: 'Alta', badge: 'Atención' }],
    ['pt', { scoreLabel: 'Risco', urgencyValue: 'Alta', badge: 'Atenção' }],
  ] as const)('localizes super scan share copy in %s', (locale, expected) => {
    i18n.locale = locale;

    const payload = buildShareStoryPayload({
      analysisData: {
        schema_version: 3,
        scan_type: 'super_health_v2',
        global_risk_score: 82,
        urgency_flag: true,
        summary_key: 'medical_attention',
        detected_conditions: [],
        disclaimer_key: 'medical_not_diagnosis',
      },
      imageUri: 'file:///super.jpg',
      t: (scope, options) => i18n.t(scope, options) as string,
      locale,
    })!;

    expect(payload.scoreLabel).toBe(expected.scoreLabel);
    expect(payload.statusBadgeLabel).toBe(expected.badge);
    expect(payload.metrics[1]).toMatchObject({
      value: expected.urgencyValue,
      valueVariant: 'text',
    });
  });

  it('returns null for fat_distribution_scan_v2 to avoid misleading super stories', () => {
    const payload = buildShareStoryPayload({
      analysisData: {
        scan_type: 'fat_distribution_scan_v2',
      } as any,
      imageUri: 'file:///super.jpg',
      t: (scope) => scope,
      locale: 'fr',
    });

    expect(payload).toBeNull();
  });

  it.each(supportedShareLocales)(
    'defines the shared result labels needed by share payloads in %s',
    (locale) => {
      const localeTranslations = ((i18n as any).translations?.[locale] ?? {}) as Record<
        string,
        any
      >;

      requiredSharePayloadPaths.forEach((path) => {
        expect(getNestedValue(localeTranslations, path)).toEqual(expect.any(String));
      });
    }
  );

  it('normalizes legacy serialized analysis data before building stories', () => {
    expect(
      parseShareableAnalysisData(
        JSON.stringify({
          scan_type: 'face',
          face_score: 83,
          perceived_age: 22,
          skin_quality_score: 70,
          symmetry_percentage: 90,
          fatigue_level: 18,
          glowScore: '8',
          face_shape: 'Oval',
          collagen_level: 65,
          hydration_level: 80,
          photogenic_score: 9,
        })
      )
    ).toMatchObject({
      schema_version: 3,
      scan_type: 'face',
      face_score: 83,
      face_shape_key: 'oval',
      glow_index: 8,
    });

    expect(parseShareableAnalysisData('invalid-json')).toBeNull();
  });

  it('parses only valid share-story payload contracts', () => {
    expect(
      parseShareStoryPayload({
        variant: 'body',
        variantLabel: 'Body',
        score: 88,
        scoreLabel: 'Body score',
        heroImageUri: 'file:///scan-result.jpg',
        metrics: [
          {
            label: 'Symmetry',
            value: '91',
            valueVariant: 'numeric',
            labelMaxLines: 1,
            valueMaxLines: 1,
          },
        ],
        accentColor: '#000000',
        footerBrand: 'HEALTH SCAN',
        footerCta: 'Track your progress',
      }),
    ).toEqual(
      expect.objectContaining({
        variant: 'body',
        heroImageUri: 'file:///scan-result.jpg',
      }),
    );

    expect(
      parseShareStoryPayload({
        variant: 'body',
        score: 88,
      }),
    ).toBeNull();
  });

  it('strips unsafe share-story hero image URIs', () => {
    const basePayload = {
      variant: 'body',
      variantLabel: 'Body',
      score: 88,
      scoreLabel: 'Body score',
      metrics: [
        {
          label: 'Symmetry',
          value: '91',
          valueVariant: 'numeric',
          labelMaxLines: 1,
          valueMaxLines: 1,
        },
      ],
      accentColor: '#000000',
      footerBrand: 'HEALTH SCAN',
      footerCta: '',
    };

    expect(
      parseShareStoryPayload({
        ...basePayload,
        heroImageUri: 'data:image/svg+xml,<svg></svg>',
      })?.heroImageUri,
    ).toBeNull();
    expect(
      parseShareStoryPayload({
        ...basePayload,
        heroImageUri: 'https://tracker.example.com/story.jpg',
      })?.heroImageUri,
    ).toBeNull();
    expect(
      parseShareStoryPayload({
        ...basePayload,
        heroImageUri:
          'https://test.supabase.co/storage/v1/object/sign/avatars/me/avatar.jpg?token=abc',
      })?.heroImageUri,
    ).toBe(
      'https://test.supabase.co/storage/v1/object/sign/avatars/me/avatar.jpg?token=abc',
    );
  });

  it('builds normalized share-story route params from a scan result', () => {
    expect(
      buildShareStoryRouteParams({
        analysisData: {
          schema_version: 3,
          scan_type: 'face',
          face_score: 82,
          perceived_age: 22,
          skin_quality_score: 71,
          symmetry_percentage: 75,
          fatigue_level: 40,
          energy_score: 7,
          face_shape_key: 'oval',
          collagen_level: 66,
          hydration_level: 61,
          photogenic_score: 8,
        },
        imageUri: 'file:///face.jpg',
        scanId: 'scan-route-1',
      }),
    ).toEqual({
      analysisData: expect.any(String),
      imageUri: 'file:///face.jpg',
      scanId: 'scan-route-1',
    });
  });
});
