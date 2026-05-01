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
  detected_conditions: [
    {
      condition_key: 'unknown',
      category_key: 'general',
      probability: 82,
      severity_key: 'moderate',
      explanation_key: 'unknown',
      advice_key: 'unknown',
    },
  ],
  ...overrides,
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
      expect(macroLabel.props.adjustsFontSizeToFit).toBeUndefined();
      expect(macroLabel.props.minimumFontScale).toBeUndefined();
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

    expect(qualityValue.props.adjustsFontSizeToFit).toBeUndefined();
    expect(qualityValue.props.minimumFontScale).toBeUndefined();
    expect(qualityValue.props.numberOfLines).toBe(2);
    expect(qualityValue.props.textBreakStrategy).toBe('simple');
    expectNoMissingTranslationSentinel(screen);
  });

  it('renders controlled unknown copy for unsupported nutrition keys while preserving approved aliases', () => {
    currentScenario.locale = 'fr';
    currentScenario.width = 390;
    currentScenario.userProfile = { account_tier: 'premium' };
    currentScenario.params = {
      analysisData: JSON.stringify({
        ...makeNutritionResult(),
        verdict_key: 'energisant_mais_gras',
        ingredient_quality_key: 'mystery_grade',
        glycemic_index_key: 'slow_release',
        main_vitamin_keys: ['niacine'],
      }),
    };
    i18n.locale = 'fr';
    useWindowDimensionsSpy.mockReturnValue({
      width: 390,
      height: 844,
      scale: 3,
      fontScale: 1,
    });

    const screen = render(<ScanResultScreen />);

    expectNoMissingTranslationSentinel(screen);
    expect(screen.getAllByText(i18n.t('verdicts.unknown')).length).toBeGreaterThan(
      0
    );
    expect(
      screen.getAllByText(i18n.t('qualitative_levels.glycemic_index.unknown'))
        .length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(i18n.t('qualitative_levels.ingredient_quality.unknown'))
        .length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(i18n.t('scan.nutrition.vitamins.vitamin_b3')).length
    ).toBeGreaterThan(0);
  });

  it('renders controlled unknown copy for unsupported super scan catalog keys', () => {
    currentScenario.locale = 'fr';
    currentScenario.width = 390;
    currentScenario.userProfile = { account_tier: 'premium' };
    currentScenario.params = {
      analysisData: JSON.stringify(
        makeSuperResult({
          summary_key: 'rare_summary',
          disclaimer_key: 'rare_disclaimer',
          detected_conditions: [
            {
              condition_key: 'rare_condition',
              category_key: 'rare_category',
              probability: 77,
              severity_key: 'moderate',
              explanation_key: 'rare_explanation',
              advice_key: 'rare_advice',
            },
          ],
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
      screen.getByText(i18n.t('scan.super.conditions.unknown.label'))
    ).toBeTruthy();
    expect(screen.getByText(i18n.t('scan.super.categories.unknown'))).toBeTruthy();
    expect(
      screen.getByText(i18n.t('scan.super.explanations.unknown'))
    ).toBeTruthy();
    expect(screen.getByText(i18n.t('scan.super.advice.unknown'))).toBeTruthy();
  });
});
