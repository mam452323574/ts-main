import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { render } from '@testing-library/react-native';

import ScanResultScreen from '@/screens/ScanResultScreen';
import SuperScanResultScreen from '@/screens/SuperScanResultScreen';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@/i18n/config';
import { i18n, loadLocalesForTests } from '@/i18n/translations';

const currentScenario = {
  locale: 'en',
  width: 390,
  params: {} as Record<string, string>,
  userProfile: { account_tier: 'free' as 'free' | 'premium' | 'admin' } as
    | { account_tier: 'free' | 'premium' | 'admin' }
    | null,
  authLoading: false,
};

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockDismissAll = jest.fn();
const mockCanDismiss = jest.fn(() => false);
const mockUsePremiumPotential = jest.fn();
const mockUseFeatureFlags = jest.fn();
const useWindowDimensionsSpy = jest.spyOn(
  require('react-native'),
  'useWindowDimensions',
);

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    dismissAll: mockDismissAll,
    canDismiss: mockCanDismiss,
  }),
  useLocalSearchParams: () => currentScenario.params,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  }),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    userProfile: currentScenario.userProfile,
    loading: currentScenario.authLoading,
  }),
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      primary: '#007AFF',
      accentGreen: '#34C759',
      warning: '#FF9500',
      error: '#FF3B30',
      success: '#34C759',
      gold: '#FFD700',
      cardBackground: '#FFFFFF',
      background: '#F2F2F7',
      primaryText: '#1D1D1F',
      gray: '#8E8E93',
      grayLight: '#F2F2F7',
      grayMedium: '#A0A0A0',
      lightGray: '#D1D1D6',
      primaryLight: '#E3F2FF',
      white: '#FFFFFF',
    },
    isDark: false,
  }),
}));

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    locale: currentScenario.locale,
    t: (key: string, options?: Record<string, unknown>) => {
      const { i18n: runtimeI18n } = require('@/i18n/translations');
      return String(runtimeI18n.t(key, options));
    },
    changeLanguage: jest.fn(),
  }),
}));

jest.mock('@/constants/premiumFields', () => ({
  isFieldLocked: (_category: string, _field: string, isPremium: boolean) =>
    !isPremium,
}));

jest.mock('@/hooks/queries', () => ({
  usePremiumPotential: (...args: any[]) => mockUsePremiumPotential(...args),
  useFeatureFlags: (...args: any[]) => mockUseFeatureFlags(...args),
}));
jest.mock('@/hooks/queries/usePremiumPotential', () => ({
  usePremiumPotential: (...args: any[]) => mockUsePremiumPotential(...args),
}));
jest.mock('@/hooks/queries/useFeatureFlags', () => ({
  useFeatureFlags: (...args: any[]) => mockUseFeatureFlags(...args),
}));

jest.mock('@/components/ModalHandle', () => ({
  ModalHandle: () => null,
}));

jest.mock('@/components/UrgencyModal', () => ({
  UrgencyModal: () => null,
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children, ...props }: any) => {
    const ReactLocal = require('react');
    const { View: RNView } = require('react-native');
    return ReactLocal.createElement(RNView, props, children);
  },
}));

jest.mock('expo-blur', () => ({
  BlurView: ({ children, ...props }: any) => {
    const ReactLocal = require('react');
    const { View: RNView } = require('react-native');
    return ReactLocal.createElement(RNView, props, children);
  },
}));

jest.mock('react-native-chart-kit', () => ({
  LineChart: () => {
    const ReactLocal = require('react');
    const { View: RNView } = require('react-native');
    return ReactLocal.createElement(RNView, { testID: 'mock-line-chart' });
  },
}));

jest.mock('react-native-svg', () => ({
  __esModule: true,
  default: 'Svg',
  Circle: 'Circle',
  Line: 'Line',
  Path: 'Path',
}));

jest.mock('lucide-react-native', () => {
  const ReactLocal = require('react');
  const { Text: RNText } = require('react-native');
  const makeIcon = (label: string) => (props: any) =>
    ReactLocal.createElement(RNText, props, label);

  return new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (prop === '__esModule') {
          return true;
        }

        return makeIcon(String(prop));
      },
    },
  );
});

const locales = SUPPORTED_LOCALES;
const widths = [320, 360, 390, 430] as const;

const makeFaceResult = () => ({
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
});

const makeBodyResult = () => ({
  schema_version: 3,
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
});

const makeNutritionResult = () => ({
  schema_version: 3,
  scan_type: 'nutrition',
  plate_health_score: 75,
  calories_estimate: 620,
  verdict_key: 'balanced',
  protein_grams: 28,
  carbs_grams: 44,
  fat_grams: 18,
  satiety_index: 8,
  ingredient_quality_key: 'ultra_processed',
  glycemic_index_key: 'high',
  main_vitamin_keys: ['vitamin_a', 'vitamin_c', 'omega_3'],
});

const makeSuperResult = (overrides: Partial<any> = {}) => ({
  schema_version: 3,
  scan_type: 'super_health_v2',
  global_risk_score: 62,
  urgency_flag: false,
  summary_key: 'medical_attention',
  disclaimer_key: 'general',
  detected_conditions: Array.from({ length: 4 }, (_, index) => ({
    condition_key: 'unknown',
    category_key: 'general',
    probability: 82 - index,
    severity_key: 'moderate',
    explanation_key: 'unknown',
    advice_key: 'unknown',
  })),
  ...overrides,
});

const makeFatDistributionResult = () => ({
  scan_type: 'fat_distribution_scan_v2',
  global_body_fat_estimate_percent: 24,
  global_facial_fat_estimate_percent: 18,
  global_water_retention_estimate_percent: 16,
  analysis_summary: 'Rétention visible mais contrôlée',
  dominant_storage_pattern: 'Rétention d’eau modérée',
  areas_analysis: [
    {
      area_name: 'Joues',
      subcutaneous_fat_percent: 22,
      water_retention_percent: 16,
      definition_percent: 58,
      dominant_type: 'Rétention d’eau',
      confidence: 82,
      explanation: 'Signal hydrique localisé.',
      actionable_advice: 'Hydratation régulière.',
    },
  ],
  priority_zones: ['Rétention d’eau'],
  disclaimer_text: 'Résultat informatif uniquement.',
});

const flattenText = (value: any): string => {
  if (Array.isArray(value)) {
    return value.map(flattenText).join('');
  }

  if (value === null || typeof value === 'undefined') {
    return '';
  }

  return String(value);
};

const expectNoMissingTranslationSentinel = (
  screen: ReturnType<typeof render>,
) => {
  const texts = screen
    .UNSAFE_getAllByType(Text)
    .map((node) => flattenText(node.props.children).trim())
    .filter(Boolean);

  const joined = texts.join(' | ');
  expect(joined).not.toContain('[missing');
  expect(joined).not.toContain('translation missing');
  expect(joined).not.toContain('__result_translation_missing__');
};

describe('Result screen compact locale matrix', () => {
  beforeAll(async () => {
    await loadLocalesForTests();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockCanDismiss.mockReturnValue(false);
    currentScenario.authLoading = false;
    currentScenario.userProfile = { account_tier: 'free' };
    mockUseFeatureFlags.mockReturnValue({
      data: { social_enabled: false },
      isLoading: false,
      error: null,
    });
    mockUsePremiumPotential.mockReturnValue({
      data: {
        currentScan: null,
        historicalAverage30d: 72,
        scanCountTotal: 5,
        recentScoreHistory: [],
      },
      isLoading: false,
      error: null,
    });
  });

  afterEach(() => {
    i18n.locale = DEFAULT_LOCALE;
  });

  it.each(
    locales.flatMap((locale) =>
      widths.flatMap((width) =>
        (['free', 'premium', 'admin'] as const).flatMap((tier) =>
          (
            [
              ['face', makeFaceResult()],
              ['body', makeBodyResult()],
              ['nutrition', makeNutritionResult()],
            ] as const
          ).map(([scanType, payload]) => [locale, width, tier, scanType, payload] as const),
        ),
      ),
    ),
  )(
    'renders %s %spx %s %s scan results without translation fallbacks',
    (locale, width, tier, _scanType, payload) => {
      currentScenario.locale = locale;
      currentScenario.width = width;
      currentScenario.userProfile = { account_tier: tier };
      currentScenario.params = { analysisData: JSON.stringify(payload) };
      i18n.locale = locale;
      useWindowDimensionsSpy.mockReturnValue({
        width,
        height: 844,
        scale: 3,
        fontScale: 1,
      });

      const screen = render(<ScanResultScreen />);

      expectNoMissingTranslationSentinel(screen);
      expect(screen.getByTestId('scan-result-share-button')).toBeTruthy();
      expect(screen.getByTestId('trajectory-preview-card')).toBeTruthy();
      expect(screen.getByTestId('trajectory-preview-title')).toHaveTextContent(
        i18n.t('common.results.trajectory_preview.title'),
      );

      if (tier === 'free') {
        expect(screen.getByTestId('trajectory-preview-cta')).toBeTruthy();
        expect(screen.queryByTestId('trajectory-preview-checkpoints')).toBeNull();
        expect(screen.queryAllByTestId('metric-card-premium-tag').length).toBeGreaterThan(0);
      } else {
        expect(screen.queryByTestId('trajectory-preview-cta')).toBeNull();
        expect(screen.getByTestId('trajectory-preview-checkpoints')).toBeTruthy();
        expect(screen.queryAllByTestId('metric-card-premium-tag')).toHaveLength(0);
      }
    },
  );

  it.each(
    locales.flatMap((locale) =>
      widths.flatMap((width) =>
        (
          [
            ['free', { account_tier: 'free' as const }, false, makeSuperResult()],
            ['premium', { account_tier: 'premium' as const }, false, makeSuperResult()],
            ['admin', { account_tier: 'admin' as const }, false, makeSuperResult()],
            ['loading', null, true, makeSuperResult()],
          ] as const
        ).map(([variant, profile, authLoading, payload]) => [
          locale,
          width,
          variant,
          profile,
          authLoading,
          payload,
        ] as const),
      ),
    ),
  )(
    'renders %s %spx super scan %s without translation fallbacks',
    (locale, width, variant, profile, authLoading, payload) => {
      currentScenario.locale = locale;
      currentScenario.width = width;
      currentScenario.userProfile = profile;
      currentScenario.authLoading = authLoading;
      currentScenario.params = { analysisData: JSON.stringify(payload) };
      i18n.locale = locale;
      useWindowDimensionsSpy.mockReturnValue({
        width,
        height: 844,
        scale: 3,
        fontScale: 1,
      });

      const screen = render(<SuperScanResultScreen />);

      expectNoMissingTranslationSentinel(screen);
      expect(screen.getByTestId('super-scan-share-button')).toBeTruthy();
      expect(screen.getByTestId('super-scan-back-button')).toBeTruthy();
      expect(screen.getByTestId('trajectory-preview-card')).toBeTruthy();

      if (variant === 'free') {
        expect(screen.getByTestId('trajectory-preview-cta')).toBeTruthy();
        expect(screen.getAllByText(i18n.t('condition_card.unlock')).length).toBeGreaterThan(0);
      }

      if (variant === 'premium' || variant === 'admin') {
        expect(screen.queryByTestId('trajectory-preview-cta')).toBeNull();
        expect(screen.getByTestId('trajectory-preview-checkpoints')).toBeTruthy();
        expect(screen.queryByText(i18n.t('condition_card.unlock'))).toBeNull();
      }

      if (variant === 'loading') {
        expect(screen.queryByTestId('trajectory-preview-cta')).toBeNull();
        expect(screen.queryByTestId('trajectory-preview-checkpoints')).toBeNull();
        expect(screen.getAllByText(i18n.t('condition_card.loading.explanation')).length).toBeGreaterThan(0);
      }
    },
  );

  it('rerenders the trajectory block with the active locale copy', () => {
    currentScenario.locale = 'en';
    currentScenario.width = 360;
    currentScenario.userProfile = { account_tier: 'premium' };
    currentScenario.params = { analysisData: JSON.stringify(makeFaceResult()) };
    i18n.locale = 'en';
    useWindowDimensionsSpy.mockReturnValue({
      width: 360,
      height: 844,
      scale: 3,
      fontScale: 1,
    });
    mockUsePremiumPotential.mockReturnValue({
      data: {
        currentScan: null,
        historicalAverage30d: 74,
        scanCountTotal: 4,
        recentScoreHistory: [
          { date: '2026-03-10', score: 70 },
          { date: '2026-03-18', score: 73 },
          { date: '2026-03-25', score: 75 },
        ],
      },
      isLoading: false,
      error: null,
    });

    const screen = render(<ScanResultScreen />);
    expect(screen.getByTestId('trajectory-preview-title')).toHaveTextContent(
      '30-day projection',
    );

    currentScenario.locale = 'fr';
    i18n.locale = 'fr';
    screen.rerender(<ScanResultScreen />);

    expect(screen.getByTestId('trajectory-preview-title')).toHaveTextContent(
      'Projection 30 jours',
    );
    expect(screen.queryByText('30-day projection')).toBeNull();
  });

  it.each([320, 360, 390] as const)(
    'keeps key French result labels on wide mobile rows at %spx',
    (width) => {
      currentScenario.locale = 'fr';
      currentScenario.width = width;
      currentScenario.userProfile = { account_tier: 'premium' };
      currentScenario.authLoading = false;
      i18n.locale = 'fr';
      useWindowDimensionsSpy.mockReturnValue({
        width,
        height: 844,
        scale: 3,
        fontScale: 1,
      });

      currentScenario.params = { analysisData: JSON.stringify(makeFaceResult()) };
      const faceScreen = render(<ScanResultScreen />);
      const faceHeroBodyStyle = StyleSheet.flatten(
        faceScreen.getByTestId('result-hero-body').props.style,
      );
      const faceQuickStatStyle = StyleSheet.flatten(
        faceScreen.getAllByTestId('result-quick-stat-card')[0].props.style,
      );
      const hydrationGridStyle = StyleSheet.flatten(
        faceScreen.getByTestId('scan-result-metric-grid-item-hydration').props.style,
      );

      expect(faceScreen.getAllByText('Score visage').length).toBeGreaterThan(0);
      expect(faceScreen.getByText('Forme visage')).toBeTruthy();
      expect(faceScreen.getByText('Hydratation')).toBeTruthy();
      expect(faceScreen.getByText('Symétrie')).toBeTruthy();
      expect(faceHeroBodyStyle.flexDirection).toBe('column');
      expect(faceQuickStatStyle.flexBasis).toBe('100%');
      expect(hydrationGridStyle.flexBasis).toBe('100%');
      faceScreen.unmount();

      currentScenario.params = { analysisData: JSON.stringify(makeNutritionResult()) };
      const nutritionScreen = render(<ScanResultScreen />);
      const nutritionQuickStatStyle = StyleSheet.flatten(
        nutritionScreen.getAllByTestId('result-quick-stat-card')[0].props.style,
      );
      const satietyGridStyle = StyleSheet.flatten(
        nutritionScreen.getByTestId('scan-result-metric-grid-item-satiety').props.style,
      );
      const vitaminsSectionStyle = StyleSheet.flatten(
        nutritionScreen.getByTestId('nutrition-long-section-vitamins').props.style,
      );

      expect(nutritionScreen.getAllByText('Score nutrition').length).toBeGreaterThan(0);
      expect(nutritionScreen.getByText('Calories')).toBeTruthy();
      expect(nutritionScreen.getByText('Verdict')).toBeTruthy();
      expect(nutritionScreen.getByText('Satiété')).toBeTruthy();
      expect(nutritionScreen.getByText(/^Vitamines/)).toBeTruthy();
      expect(nutritionQuickStatStyle.flexBasis).toBe('100%');
      expect(satietyGridStyle.flexBasis).toBe('100%');
      expect(vitaminsSectionStyle.width).toBe('100%');
      nutritionScreen.unmount();

      currentScenario.params = {
        analysisData: JSON.stringify(makeFatDistributionResult()),
      };
      const superScreen = render(<SuperScanResultScreen />);
      const waterRetentionGridStyle = StyleSheet.flatten(
        superScreen.getByTestId('super-scan-fat-metric-grid-item-water_retention')
          .props.style,
      );
      const waterRetentionTileStyle = StyleSheet.flatten(
        superScreen.getByTestId('super-scan-area-card-0-water-retention-tile')
          .props.style,
      );

      expect(superScreen.getAllByText('Rétention d’eau').length).toBeGreaterThan(0);
      expect(waterRetentionGridStyle.flexBasis).toBe('100%');
      expect(waterRetentionTileStyle.flexBasis).toBe('100%');
    },
  );

  it.each([
    ['de', 'Kohlenhydrate'],
    ['es', 'Carbohidratos'],
  ] as const)(
    'keeps long macro labels intact in %s on compact nutrition results',
    (locale, expectedLabel) => {
      currentScenario.locale = locale;
      currentScenario.width = 360;
      currentScenario.userProfile = { account_tier: 'free' };
      currentScenario.params = {
        analysisData: JSON.stringify({
          ...makeNutritionResult(),
          ingredient_quality_key: 'natural',
        }),
      };
      i18n.locale = locale;
      useWindowDimensionsSpy.mockReturnValue({
        width: 360,
        height: 844,
        scale: 3,
        fontScale: 1,
      });

      const screen = render(<ScanResultScreen />);
      const macroLabel = screen.getByTestId('scan-result-macro-label-carbs');
      const macroItemStyle = StyleSheet.flatten(
        screen.getByTestId('scan-result-macro-item-carbs').props.style,
      );

      expect(macroLabel).toHaveTextContent(expectedLabel);
      expect(macroLabel.props.numberOfLines).toBe(2);
      expect(macroLabel.props.adjustsFontSizeToFit).toBe(true);
      expect(macroLabel.props.minimumFontScale).toBe(0.82);
      expect(macroLabel.props.textBreakStrategy).toBe('simple');
      expect(macroItemStyle.flexBasis).toBe('100%');
      expect(macroItemStyle.minWidth).toBe(0);
      expect(screen.getByTestId('scan-result-macro-icon-carbs')).toBeTruthy();
    },
  );

  it('keeps localized single-word nutrition values shrink-to-fit without translation fallbacks', () => {
    currentScenario.locale = 'fr';
    currentScenario.width = 360;
    currentScenario.userProfile = { account_tier: 'free' };
    currentScenario.params = {
      analysisData: JSON.stringify({
        ...makeNutritionResult(),
        ingredient_quality_key: 'natural',
      }),
    };
    i18n.locale = 'fr';
    useWindowDimensionsSpy.mockReturnValue({
      width: 360,
      height: 844,
      scale: 3,
      fontScale: 1,
    });

    const screen = render(<ScanResultScreen />);
    const qualityValue = screen.getByText('Naturelle');

    expect(qualityValue.props.adjustsFontSizeToFit).toBe(true);
    expect(qualityValue.props.minimumFontScale).toBe(0.82);
    expect(qualityValue.props.numberOfLines).toBe(1);
    expect(qualityValue.props.textBreakStrategy).toBe('simple');
    expectNoMissingTranslationSentinel(screen);
  });

  it.each(['fr', 'en'] as const)(
    'renders preserved nutrition fallback copy instead of unknown labels in %s',
    (locale) => {
      currentScenario.locale = locale;
      currentScenario.width = 390;
      currentScenario.userProfile = { account_tier: 'premium' };
      currentScenario.params = {
        analysisData: JSON.stringify({
          ...makeNutritionResult(),
          verdict_key: 'energisant_mais_gras',
          verdict_fallback_text: 'Énergisant mais gras',
          ingredient_quality_key: 'mystery_grade',
          ingredient_quality_fallback_text: 'Chef special',
          glycemic_index_key: 'slow_release',
          glycemic_index_fallback_text: 'Slow release',
          main_vitamin_keys: ['unknown'],
          main_vitamins_fallback_text: 'Vitamin P',
        }),
      };
      i18n.locale = locale;
      useWindowDimensionsSpy.mockReturnValue({
        width: 390,
        height: 844,
        scale: 3,
        fontScale: 1,
      });

      const screen = render(<ScanResultScreen />);

      expectNoMissingTranslationSentinel(screen);
      expect(screen.getByText('Énergisant mais gras')).toBeTruthy();
      expect(screen.getByText('Chef special')).toBeTruthy();
      expect(screen.getByText('Slow release')).toBeTruthy();
      expect(screen.getByText('Vitamin P')).toBeTruthy();
      expect(screen.queryByText(i18n.t('verdicts.unknown'))).toBeNull();
      expect(
        screen.queryByText(i18n.t('qualitative_levels.glycemic_index.unknown'))
      ).toBeNull();
      expect(
        screen.queryByText(i18n.t('qualitative_levels.ingredient_quality.unknown'))
      ).toBeNull();
      expect(screen.queryByText(i18n.t('scan.nutrition.vitamins.unknown'))).toBeNull();
    },
  );

  it('renders controlled unknown copy for unsupported super scan catalog keys', () => {
    currentScenario.locale = 'fr';
    currentScenario.width = 390;
    currentScenario.userProfile = { account_tier: 'premium' };
    currentScenario.params = {
      analysisData: JSON.stringify(
        makeSuperResult({
          summary_key: 'rare_summary',
          disclaimer_key: 'rare_disclaimer',
          detected_conditions: Array.from({ length: 4 }, (_, index) => ({
              condition_key: 'rare_condition',
              category_key: 'rare_category',
              probability: 77 - index,
              severity_key: 'moderate',
              explanation_key: 'rare_explanation',
              advice_key: 'rare_advice',
          })),
        })
      ),
    };
    i18n.locale = 'fr';
    useWindowDimensionsSpy.mockReturnValue({
      width: 390,
      height: 844,
      scale: 3,
      fontScale: 1,
    });

    const screen = render(<SuperScanResultScreen />);

    expectNoMissingTranslationSentinel(screen);
    expect(screen.getByText(i18n.t('scan.super.summaries.unknown'))).toBeTruthy();
    expect(
      screen.getByText(i18n.t('scan.super.disclaimers.unknown'))
    ).toBeTruthy();
    expect(
      screen.getAllByText(i18n.t('scan.super.conditions.unknown.label')).length
    ).toBeGreaterThan(0);
    expect(screen.getByText(i18n.t('scan.super.categories.unknown'))).toBeTruthy();
    expect(
      screen.getByText(i18n.t('scan.super.explanations.unknown'))
    ).toBeTruthy();
    expect(screen.getByText(i18n.t('scan.super.advice.unknown'))).toBeTruthy();
  });
});
