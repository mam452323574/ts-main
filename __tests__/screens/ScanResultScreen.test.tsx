import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import ScanResultScreen from '@/screens/ScanResultScreen';
import { i18n, loadLocalesForTests } from '@/i18n/translations';
import { resolveFaceGlowScore } from '@/utils/faceGlow';
import { getResultScreenGradient } from '@/utils/resultLayout';
import { buildScanResultViewModel } from '@/utils/resultViewModels';
import {
  resolveResultItemTheme,
  resolveScanTypeTheme,
} from '@/utils/resultVisualTheme';
import { FONT_WEIGHTS, SIZES, SPACING, withAlpha } from '@/constants/theme';

const baseMockThemeColors = {
  primary: '#007AFF',
  accentGreen: '#34C759',
  success: '#34C759',
  warning: '#FF9500',
  error: '#FF3B30',
  gold: '#FFD700',
  secondary: '#5856D6',
  cardBackground: '#FFFFFF',
  background: '#F2F2F7',
  primaryText: '#1D1D1F',
  gray: '#8E8E93',
  grayLight: '#F8F8FA',
  grayMedium: '#C7C7CC',
  lightGray: '#E5E5EA',
  darkGray: '#424242',
  primaryLight: '#E3F2FF',
  white: '#FFFFFF',
};
const mockThemeColors = { ...baseMockThemeColors };
let mockIsDark = false;

const expectCompactResultTitle = (style: unknown) => {
  expect(StyleSheet.flatten(style)).toEqual(
    expect.objectContaining({
      fontSize: SIZES.text20,
      lineHeight: 24,
      fontWeight: FONT_WEIGHTS.bold,
      textAlign: 'center',
      includeFontPadding: false,
    }),
  );
};

const expectCompactResultTopChrome = (
  style: unknown,
  _isDark: boolean,
) => {
  expect(StyleSheet.flatten(style)).toEqual(
    expect.objectContaining({
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.sm,
      backgroundColor: '#000000',
      borderBottomWidth: 0,
      borderBottomColor: 'transparent',
    }),
  );
};

const toResultScrimGradient = (gradient: readonly [string, string, string]) =>
  gradient.map((color, index) =>
    withAlpha(color, index === 0 ? 0.72 : index === 1 ? 0.64 : 0.78),
  );

const expectFixedResultScrollContent = (style: unknown) => {
  const flattened = StyleSheet.flatten(style) as any;

  expect(flattened).toEqual(
    expect.objectContaining({
      flexGrow: 1,
    }),
  );
  expect(flattened.justifyContent).toBeUndefined();
  expect(flattened.paddingTop).toBeUndefined();
  expect(flattened.paddingBottom).toBeUndefined();
};

const expectFixedResultSurface = (style: unknown) => {
  const flattened = StyleSheet.flatten(style) as any;

  expect(flattened).toEqual(
    expect.objectContaining({
      flex: 1,
      width: '100%',
      alignSelf: 'stretch',
      marginHorizontal: 0,
      paddingHorizontal: 0,
      paddingBottom: 0,
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
      overflow: 'hidden',
      borderTopWidth: StyleSheet.hairlineWidth,
    }),
  );
  expect(flattened.borderRadius).toBeUndefined();
  expect(flattened.borderWidth).toBeUndefined();
  expect(flattened.marginTop).toBeGreaterThan(0);
  expect(flattened.borderTopLeftRadius).toBeGreaterThan(0);
  expect(flattened.borderTopRightRadius).toBe(flattened.borderTopLeftRadius);
};

const expectStableInternalScroll = (scroll: any) => {
  expect(scroll.props.bounces).toBe(false);
  expect(scroll.props.alwaysBounceVertical).toBe(false);
  expect(scroll.props.overScrollMode).toBe('never');
  expect(StyleSheet.flatten(scroll.props.style)).toEqual(
    expect.objectContaining({ flex: 1 }),
  );
  expectFixedResultScrollContent(scroll.props.contentContainerStyle);
};

type ResultSegmentIndex = {
  source: 'quickStats' | 'metrics';
  index: number;
};

const mockPush = jest.fn();
const mockCanDismiss = jest.fn();
const mockDismissAll = jest.fn();
const mockReplace = jest.fn();
const mockParams = jest.fn();
const mockUsePremiumPotential = jest.fn();
const mockUseFeatureFlags = jest.fn();
const mockShowAlert = jest.fn();
const mockResolveAvatarUrl = jest.fn();
const mockSaveShareStorySocialComposerDraft = jest.fn();
let mockUserProfile: any = { account_tier: 'free' };
let mockAuthLoading = false;

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    canDismiss: mockCanDismiss,
    dismissAll: mockDismissAll,
    replace: mockReplace,
  }),
  useLocalSearchParams: () => mockParams(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  }),
}));

jest.mock('react-native-svg', () => ({
  __esModule: true,
  default: 'Svg',
  Circle: 'Circle',
  Line: 'Line',
  Path: 'Path',
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    userProfile: mockUserProfile,
    loading: mockAuthLoading,
  }),
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: mockThemeColors,
    isDark: mockIsDark,
  }),
}));

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    locale: require('@/i18n/translations').i18n.locale,
    t: (key: string, options?: Record<string, unknown>) =>
      String(require('@/i18n/translations').i18n.t(key, options)),
  }),
}));

jest.mock('@/constants/premiumFields', () => ({
  isFieldLocked: (_category: string, _field: string, isPremium: boolean) =>
    !isPremium,
}));

jest.mock('@/components/ModalHandle', () => ({
  ModalHandle: () => null,
}));

jest.mock('@/components/RadialScoreGauge', () => ({
  RadialScoreGauge: ({ label }: any) => {
    const ReactLocal = require('react');
    const { Text: RNText } = require('react-native');
    return ReactLocal.createElement(RNText, null, label);
  },
}));

jest.mock('@/components/MetricCard', () => ({
  MetricCard: ({ title, value, premiumRenderState, theme }: any) => {
    const ReactLocal = require('react');
    const { Text: RNText } = require('react-native');
    return ReactLocal.createElement(
      RNText,
      { testID: `metric-card-${title}` },
      `${title}:${premiumRenderState ?? 'unlocked'}:${theme?.accentColor ?? 'none'}:${value}`,
    );
  },
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

jest.mock('@/hooks/useCustomAlert', () => ({
  useCustomAlert: () => ({
    alertElement: null,
    showAlert: (...args: unknown[]) => mockShowAlert(...args),
  }),
}));

jest.mock('@/services/avatar', () => ({
  resolveAvatarUrl: (...args: unknown[]) => mockResolveAvatarUrl(...args),
}));

jest.mock('@/services/socialDraftStore', () => ({
  saveShareStorySocialComposerDraft: (...args: unknown[]) =>
    mockSaveShareStorySocialComposerDraft(...args),
}));

jest.mock('@/components/TrajectoryPreviewCard', () => ({
  TrajectoryPreviewCard: ({ model, onPress }: any) => {
    const ReactLocal = require('react');
    const {
      Text: RNText,
      TouchableOpacity: RNTouchableOpacity,
      View: RNView,
    } = require('react-native');
    return ReactLocal.createElement(
      RNView,
      { testID: 'trajectory-preview-card' },
      ReactLocal.createElement(RNText, { testID: 'trajectory-premium-state' }, model.premiumRenderState),
      ReactLocal.createElement(RNText, null, model.hookLabel),
      model.ctaLabel && onPress
        ? ReactLocal.createElement(
            RNTouchableOpacity,
            { onPress, testID: 'trajectory-preview-cta' },
            ReactLocal.createElement(RNText, null, model.ctaLabel),
          )
        : null,
    );
  },
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
});

const makeNutritionResult = () => ({
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

const collectTestIds = (node: any, acc: string[] = []): string[] => {
  if (!node) {
    return acc;
  }

  if (Array.isArray(node)) {
    node.forEach((child) => collectTestIds(child, acc));
    return acc;
  }

  if (node.props?.testID) {
    acc.push(node.props.testID);
  }

  if (Array.isArray(node.children)) {
    node.children.forEach((child: any) => collectTestIds(child, acc));
  }

  return acc;
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getResultItemLabel = (item: { label?: string; title?: string }) =>
  item.label ?? item.title ?? '';

describe('ScanResultScreen', () => {
  beforeAll(async () => {
    await loadLocalesForTests();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(mockThemeColors, baseMockThemeColors);
    mockIsDark = false;
    i18n.locale = 'en';
    mockUserProfile = { account_tier: 'free' };
    mockAuthLoading = false;
    mockCanDismiss.mockReturnValue(false);
    mockUseFeatureFlags.mockReturnValue({
      data: {
        social_enabled: false,
      },
      isFetching: false,
    });
    mockResolveAvatarUrl.mockResolvedValue(null);
    mockSaveShareStorySocialComposerDraft.mockResolvedValue({
      id: 'draft-community-1',
    });
    mockUsePremiumPotential.mockReturnValue({
      data: {
        currentScan: null,
        historicalAverage30d: 71,
        scanCountTotal: 4,
        recentScoreHistory: [],
      },
      isLoading: false,
      error: null,
    });
  });

  it('does not let the new super scan payload render on the generic result screen', () => {
    mockParams.mockReturnValue({
      analysisData: JSON.stringify({
        scan_type: 'fat_distribution_scan_v2',
        global_body_fat_estimate_percent: 24.1,
        global_facial_fat_estimate_percent: 16.2,
        global_water_retention_estimate_percent: 11.3,
        analysis_summary: 'Abdominal storage remains dominant',
        dominant_storage_pattern: 'central',
        areas_analysis: [],
        priority_zones: [],
        disclaimer_text: 'Indicative only',
      }),
    });

    const { getByText, getByTestId, queryByTestId } = render(<ScanResultScreen />);

    expect(getByText(i18n.t('common.results.no_data'))).toBeTruthy();
    expect(getByTestId('scan-result-background-layer').props.colors).toEqual(
      toResultScrimGradient(
        getResultScreenGradient({
          colors: mockThemeColors as any,
          isDark: false,
        }),
      ),
    );
    expect(getByTestId('scan-result-sheet')).toBeTruthy();
    expectCompactResultTitle(
      getByTestId('scan-result-screen-header').props.style,
    );
    expect(getByTestId('scan-result-top-chrome')).toBeTruthy();
    expect(queryByTestId('scan-result-top-chrome-handle')).toBeNull();
    expect(queryByTestId('scan-result-close-button')).toBeNull();
    expect(queryByTestId('trajectory-preview-card')).toBeNull();
  });

  it('renders the compact result top chrome inside the scroll flow', () => {
    mockParams.mockReturnValue({
      analysisData: JSON.stringify(makeFaceResult()),
    });

    const rendered = render(<ScanResultScreen />);
    const testIds = collectTestIds(rendered.toJSON());

    expectCompactResultTitle(
      rendered.getByTestId('scan-result-screen-header').props.style,
    );
    expectCompactResultTopChrome(
      rendered.getByTestId('scan-result-top-chrome').props.style,
      false,
    );
    expect(rendered.queryByTestId('scan-result-top-chrome-handle')).toBeNull();
    expect(rendered.queryByTestId('scan-result-close-button')).toBeNull();
    expect(testIds.indexOf('scan-result-scroll')).toBeLessThan(
      testIds.indexOf('scan-result-top-chrome'),
    );
    expect(testIds.indexOf('scan-result-top-chrome')).toBeLessThan(
      testIds.indexOf('result-hero-surface'),
    );
  });

  it('uses a transparent container, translucent scrim, and sheet over the scanner backdrop', () => {
    Object.assign(mockThemeColors, {
      background: '#000000',
      cardBackground: '#121212',
      surfaceElevated: '#1C1C1E',
      surfaceMuted: '#242426',
      primaryText: '#F7F7F7',
      gray: '#8E8E93',
    });
    mockIsDark = true;
    mockParams.mockReturnValue({
      analysisData: JSON.stringify(makeFaceResult()),
    });
    const faceTheme = resolveScanTypeTheme('face', mockThemeColors as any, true);
    const expectedGradient = getResultScreenGradient({
      colors: mockThemeColors as any,
      isDark: true,
      accentColor: faceTheme.accentColor,
    });

    const { getByTestId, queryByTestId } = render(<ScanResultScreen />);
    const containerStyle = StyleSheet.flatten(
      getByTestId('scan-result-screen').props.style,
    );
    const sheetStyle = StyleSheet.flatten(
      getByTestId('scan-result-sheet').props.style,
    );
    const scroll = getByTestId('scan-result-scroll');

    expect(containerStyle.backgroundColor).toBe('transparent');
    expect(getByTestId('scan-result-background-layer').props.colors).toEqual(
      toResultScrimGradient(expectedGradient),
    );
    expectStableInternalScroll(scroll);
    expectFixedResultSurface(sheetStyle);
    expectCompactResultTopChrome(
      getByTestId('scan-result-top-chrome').props.style,
      true,
    );
    expect(queryByTestId('scan-result-top-chrome-handle')).toBeNull();
    expectCompactResultTitle(getByTestId('scan-result-screen-header').props.style);
    expect(sheetStyle.marginTop).toBe(SPACING.md);
    expect(sheetStyle.backgroundColor).not.toBe('#000000');
  });

  it('shows the locked trajectory card for free results', () => {
    mockParams.mockReturnValue({
      analysisData: JSON.stringify(makeFaceResult()),
    });

    const { getByTestId, getAllByText } = render(<ScanResultScreen />);

    expect(getByTestId('trajectory-preview-card')).toBeTruthy();
    expect(getByTestId('trajectory-premium-state')).toHaveTextContent('locked');
    expect(getAllByText(/:locked:/).length).toBeGreaterThan(0);
  });

  it('promotes the coach next-step CTA near the top and navigates with auto submit', () => {
    mockParams.mockReturnValue({
      analysisData: JSON.stringify({
        ...makeBodyResult(),
        posture_score: 3.2,
      }),
      scanId: 'scan-body-123',
    });

    const rendered = render(<ScanResultScreen />);
    const testIds = collectTestIds(rendered.toJSON());

    expect(rendered.getByTestId('scan-result-coach-final-cta-question-preview')).toBeTruthy();
    expect(testIds).toContain('trajectory-preview-card');
    expect(testIds.indexOf('scan-result-coach-cta')).toBeGreaterThan(
      testIds.indexOf('result-hero-surface'),
    );
    expect(testIds.indexOf('scan-result-coach-cta')).toBeLessThan(
      testIds.indexOf('trajectory-preview-card'),
    );
    expect(testIds.indexOf('scan-result-coach-final-cta')).toBeGreaterThan(
      testIds.indexOf('trajectory-preview-card'),
    );

    fireEvent.press(rendered.getByTestId('scan-result-coach-cta-button'));

    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/coach',
        params: expect.objectContaining({
          source: 'scan_result',
          autoSubmit: '1',
          scanId: 'scan-body-123',
          scanType: 'body',
          promptType: 'latest_scan_issue_resolution',
          fallbackPromptType: 'latest_scan',
          priorityMetric: 'posture_score',
          scanIntent: expect.any(String),
        }),
      }),
    );
    const pushedParams = mockPush.mock.calls[0][0].params;
    expect(JSON.parse(decodeURIComponent(pushedParams.scanIntent))).toMatchObject({
      scan_id: 'scan-body-123',
      scan_type: 'body',
      priority_metric: 'posture_score',
      prompt_type: 'latest_scan_issue_resolution',
      fallback_prompt_type: 'latest_scan',
    });
  });

  it('renders a discreet analysis quality badge when scan confidence is limited', () => {
    mockParams.mockReturnValue({
      analysisData: JSON.stringify({
        ...makeFaceResult(),
        analysis_meta: {
          confidence_score: 78,
          image_quality_score: 42,
          metric_coverage_score: 88,
          limitation_flags: ['blur'],
        },
      }),
    });

    const { getByText } = render(<ScanResultScreen />);

    expect(getByText('Image quality limited')).toBeTruthy();
  });

  it('keeps result chrome sourced from common.results instead of legacy scan_result', () => {
    const translations = i18n.translations as Record<string, any>;
    const previousCommonTitle = translations.en.common.results.title;
    const previousScanResultTitle = translations.en.scan_result?.title;

    try {
      translations.en.common.results.title = 'Canonical results title';
      translations.en.scan_result = translations.en.scan_result ?? {};
      translations.en.scan_result.title = 'Legacy scan result title';
      i18n.locale = 'en';
      mockParams.mockReturnValue({
        analysisData: JSON.stringify(makeFaceResult()),
      });

      const { getAllByText, queryByText } = render(<ScanResultScreen />);

      expect(getAllByText('Canonical results title').length).toBeGreaterThan(0);
      expect(queryByText('Legacy scan result title')).toBeNull();
    } finally {
      translations.en.common.results.title = previousCommonTitle;
      if (previousScanResultTitle === undefined) {
        delete translations.en.scan_result.title;
      } else {
        translations.en.scan_result.title = previousScanResultTitle;
      }
    }
  });

  it.each(['premium', 'admin'] as const)(
    'shows unlocked trajectory and metrics for %s users',
    (accountTier) => {
      mockUserProfile = { account_tier: accountTier };
      mockParams.mockReturnValue({
        analysisData: JSON.stringify(makeFaceResult()),
      });

      const { getByTestId, queryByTestId, getByText } = render(<ScanResultScreen />);

      expect(getByTestId('trajectory-premium-state')).toHaveTextContent('unlocked');
      expect(queryByTestId('trajectory-preview-cta')).toBeNull();
      expect(getByText(new RegExp(`^${i18n.t('common.metrics.skin_quality')}:unlocked:`))).toBeTruthy();
    },
  );

  it('keeps the trajectory visible and neutral while auth is loading', () => {
    mockUserProfile = null;
    mockAuthLoading = true;
    mockParams.mockReturnValue({
      analysisData: JSON.stringify(makeFaceResult()),
    });

    const { getByTestId, queryByTestId, getByText } = render(<ScanResultScreen />);

    expect(getByTestId('trajectory-premium-state')).toHaveTextContent('loading');
    expect(queryByTestId('trajectory-preview-cta')).toBeNull();
    expect(getByText(new RegExp(`^${i18n.t('common.metrics.skin_quality')}:loading:`))).toBeTruthy();
  });

  it('keeps the face CTA on the scan accent while passing the tightened semantic metric accents', () => {
    mockUserProfile = { account_tier: 'premium' };
    const analysisData = makeFaceResult();
    mockParams.mockReturnValue({
      analysisData: JSON.stringify(analysisData),
    });

    const viewModel = buildScanResultViewModel({
      analysisData: analysisData as any,
      locale: i18n.locale,
      premiumRenderState: 'unlocked',
      resolveFaceGlowScore,
      t: (key: string, options?: Record<string, unknown>) =>
        String(i18n.t(key, options)),
    });
    const fatigueMetric = viewModel.metrics.find(
      (item) => item.title === String(i18n.t('common.metrics.fatigue')),
    );
    const hydrationMetric = viewModel.metrics.find(
      (item) => item.title === String(i18n.t('common.metrics.hydration')),
    );

    const fatigueTheme = resolveResultItemTheme({
      colors: mockThemeColors as any,
      isDark: false,
      theme: fatigueMetric?.theme,
    });
    const hydrationTheme = resolveResultItemTheme({
      colors: mockThemeColors as any,
      isDark: false,
      theme: hydrationMetric?.theme,
    });
    const faceTheme = resolveScanTypeTheme('face', mockThemeColors as any, false);

    const { getByTestId } = render(<ScanResultScreen />);
    const shareButtonStyle = StyleSheet.flatten(
      getByTestId('scan-result-share-button').props.style,
    );

    expect(shareButtonStyle.borderColor).toBe(faceTheme.accentColor);
    expect(fatigueTheme.accentColor).not.toBe(hydrationTheme.accentColor);
    expect(
      flattenText(
        getByTestId(`metric-card-${String(i18n.t('common.metrics.fatigue'))}`).props
          .children,
      ),
    ).toContain(
      `${String(i18n.t('common.metrics.fatigue'))}:unlocked:${fatigueTheme.accentColor}:`,
    );
    expect(
      flattenText(
        getByTestId(`metric-card-${String(i18n.t('common.metrics.hydration'))}`).props
          .children,
      ),
    ).toContain(
      `${String(i18n.t('common.metrics.hydration'))}:unlocked:${hydrationTheme.accentColor}:`,
    );
  });

  it('keeps the unlocked trajectory visible when premium potential data is unavailable', () => {
    mockUserProfile = { account_tier: 'premium' };
    mockUsePremiumPotential.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Fetch error'),
    });
    mockParams.mockReturnValue({
      analysisData: JSON.stringify(makeFaceResult()),
    });

    const { getByTestId, queryByTestId } = render(<ScanResultScreen />);

    expect(getByTestId('trajectory-premium-state')).toHaveTextContent('unlocked');
    expect(queryByTestId('trajectory-preview-cta')).toBeNull();
  });

  it('maps face scans to the premium potential health query and forwards scanId', () => {
    mockParams.mockReturnValue({
      analysisData: JSON.stringify(makeFaceResult()),
      scanId: 'scan-123',
    });

    render(<ScanResultScreen />);

    expect(mockUsePremiumPotential).toHaveBeenCalledWith(
      'health',
      'scan-123',
      true,
    );
  });

  it('routes the locked trajectory CTA directly to premium upgrade', () => {
    mockParams.mockReturnValue({
      analysisData: JSON.stringify(makeFaceResult()),
    });

    const { getByTestId } = render(<ScanResultScreen />);

    fireEvent.press(getByTestId('trajectory-preview-cta'));

    expect(mockPush).toHaveBeenCalledWith('/premium-upgrade');
  });

  it('routes the share CTA with normalized analysis data', () => {
    mockParams.mockReturnValue({
      analysisData: JSON.stringify(makeFaceResult()),
      imageUri: 'file:///scan.jpg',
      scanId: 'scan-123',
    });

    const { getByTestId } = render(<ScanResultScreen />);

    fireEvent.press(getByTestId('scan-result-share-button'));

    expect(mockPush).toHaveBeenCalledTimes(1);
    const pushedRoute = mockPush.mock.calls[0][0];

    expect(pushedRoute).toMatchObject({
      pathname: '/share-story',
      params: {
        imageUri: 'file:///scan.jpg',
        scanId: 'scan-123',
      },
    });
    expect(JSON.parse(pushedRoute.params.analysisData)).toMatchObject({
      schema_version: 4,
      scan_type: 'face',
      face_shape_key: 'oval',
    });
  });

  it('opens a chooser for social-enabled scans and keeps external sharing on the preview route', () => {
    mockUseFeatureFlags.mockReturnValue({
      data: {
        social_enabled: true,
      },
      isFetching: false,
    });
    mockParams.mockReturnValue({
      analysisData: JSON.stringify(makeFaceResult()),
      imageUri: 'file:///scan.jpg',
      scanId: 'scan-123',
    });

    const { getByTestId } = render(<ScanResultScreen />);

    fireEvent.press(getByTestId('scan-result-share-button'));

    expect(mockPush).not.toHaveBeenCalled();
    expect(mockShowAlert).toHaveBeenCalledWith(
      i18n.t('share_story.chooser.title'),
      i18n.t('share_story.chooser.message'),
      expect.any(Array),
      undefined,
      expect.objectContaining({ variant: 'info' }),
    );

    const chooserButtons = mockShowAlert.mock.calls[0][2] as Array<{
      text: string;
      onPress?: () => void;
    }>;
    const externalButton = chooserButtons.find(
      (button) => button.text === i18n.t('share_story.chooser.external_action'),
    );

    externalButton?.onPress?.();

    expect(mockPush).toHaveBeenCalledTimes(1);
    const pushedRoute = mockPush.mock.calls[0][0];

    expect(pushedRoute).toMatchObject({
      pathname: '/share-story',
      params: {
        imageUri: 'file:///scan.jpg',
        scanId: 'scan-123',
      },
    });
    expect(JSON.parse(pushedRoute.params.analysisData)).toMatchObject({
      schema_version: 4,
      scan_type: 'face',
      face_shape_key: 'oval',
    });
  });

  it('routes the community chooser action through the typed social draft handoff', async () => {
    mockUseFeatureFlags.mockReturnValue({
      data: {
        social_enabled: true,
      },
      isFetching: false,
    });
    mockParams.mockReturnValue({
      analysisData: JSON.stringify(makeFaceResult()),
      imageUri: 'file:///scan.jpg',
      scanId: 'scan-123',
    });

    const { getByTestId } = render(<ScanResultScreen />);

    fireEvent.press(getByTestId('scan-result-share-button'));

    const chooserButtons = mockShowAlert.mock.calls[0][2] as Array<{
      text: string;
      onPress?: () => void;
    }>;
    const communityButton = chooserButtons.find(
      (button) => button.text === i18n.t('share_story.chooser.community_action'),
    );

    await act(async () => {
      communityButton?.onPress?.();
    });

    await waitFor(() => {
      expect(mockSaveShareStorySocialComposerDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          scanId: 'scan-123',
          payload: expect.objectContaining({
            variant: 'face',
            heroImageUri: 'file:///scan.jpg',
            score: 75,
          }),
        }),
      );
    });

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/social-compose',
      params: {
        draftId: 'draft-community-1',
      },
    });
  });

  it('uses a shrink-to-fit share CTA label without forcing the text to stretch', () => {
    mockParams.mockReturnValue({
      analysisData: JSON.stringify(makeFaceResult()),
    });

    const { getByText } = render(<ScanResultScreen />);
    const shareLabel = getByText(i18n.t('share_story.actions.share_score'));
    const shareLabelStyle = StyleSheet.flatten(shareLabel.props.style);

    expect(shareLabel.props.adjustsFontSizeToFit).toBe(true);
    expect(shareLabel.props.minimumFontScale).toBe(0.84);
    expect(shareLabel.props.numberOfLines).toBe(2);
    expect(shareLabelStyle.flexShrink).toBe(1);
    expect(shareLabelStyle.flex).toBeUndefined();
  });

  it.each([
    {
      name: 'face',
      makeAnalysisData: makeFaceResult,
      firstSegmentIndex: { source: 'quickStats', index: 0 },
      secondSegmentIndex: { source: 'metrics', index: 2 },
    },
    {
      name: 'body',
      makeAnalysisData: makeBodyResult,
      firstSegmentIndex: { source: 'quickStats', index: 1 },
      secondSegmentIndex: { source: 'metrics', index: 1 },
    },
    {
      name: 'nutrition',
      makeAnalysisData: makeNutritionResult,
      firstSegmentIndex: { source: 'quickStats', index: 1 },
      secondSegmentIndex: { source: 'metrics', index: 0 },
    },
  ] as const)('does not render metric-only hero summaries for $name scans', ({
    makeAnalysisData,
    firstSegmentIndex,
    secondSegmentIndex,
  }) => {
    const analysisData = makeAnalysisData();
    mockParams.mockReturnValue({
      analysisData: JSON.stringify(analysisData),
    });

    const viewModel = buildScanResultViewModel({
      analysisData: analysisData as any,
      locale: i18n.locale,
      premiumRenderState: 'locked',
      resolveFaceGlowScore,
      t: (key: string, options?: Record<string, unknown>) =>
        String(i18n.t(key, options)),
    });
    const firstIndex = firstSegmentIndex as ResultSegmentIndex;
    const secondIndex = secondSegmentIndex as ResultSegmentIndex;
    const firstSegment = (
      firstIndex.source === 'quickStats'
        ? viewModel.quickStats[firstIndex.index]
        : viewModel.metrics[firstIndex.index]
    )!;
    const secondSegment = (
      secondIndex.source === 'quickStats'
        ? viewModel.quickStats[secondIndex.index]
        : viewModel.metrics[secondIndex.index]
    )!;
    const firstSegmentLabel = getResultItemLabel(firstSegment);
    const secondSegmentLabel = getResultItemLabel(secondSegment);
    const redundantSummary = `${firstSegmentLabel}: ${firstSegment.value} · ${secondSegmentLabel}: ${secondSegment.value}`;

    const { getByText, queryByText } = render(<ScanResultScreen />);

    expect(queryByText(redundantSummary)).toBeNull();
    expect(getByText(firstSegmentLabel)).toBeTruthy();
    expect(getByText(firstSegment.value)).toBeTruthy();
    expect(
      getByText(new RegExp(`^${escapeRegExp(secondSegmentLabel)}:`)),
    ).toBeTruthy();
    expect(queryByText(String(i18n.t('common.results.key_insight_label')))).toBeNull();
  });

  it('keeps the hero quick stats ahead of trajectory, details, deep analysis, and actions', () => {
    const analysisData = makeFaceResult();
    mockParams.mockReturnValue({
      analysisData: JSON.stringify(analysisData),
    });

    const viewModel = buildScanResultViewModel({
      analysisData: analysisData as any,
      locale: i18n.locale,
      premiumRenderState: 'locked',
      resolveFaceGlowScore,
      t: (key: string, options?: Record<string, unknown>) =>
        String(i18n.t(key, options)),
    });

    const { UNSAFE_getAllByType, queryByText } = render(<ScanResultScreen />);
    const allTextValues = UNSAFE_getAllByType(Text).map((node) =>
      flattenText(node.props.children),
    );
    const heroQuickStatIndex = allTextValues.indexOf(viewModel.quickStats[0]?.label ?? '');
    const scoreLabelIndex = allTextValues.indexOf(viewModel.scoreLabel);
    const trajectoryIndex = allTextValues.indexOf('locked');
    const detailsIndex = allTextValues.indexOf(
      String(i18n.t('common.results.details_title')),
    );
    const deepAnalysisIndex = allTextValues.indexOf(
      String(i18n.t('common.results.deep_analysis_label')),
    );
    const backIndex = allTextValues.indexOf(String(i18n.t('common.home_back')));
    const shareIndex = allTextValues.indexOf(
      String(i18n.t('share_story.actions.share_score')),
    );

    expect(queryByText(String(i18n.t('common.results.quick_stats_label')))).toBeNull();
    expect(queryByText(String(i18n.t('common.results.key_insight_label')))).toBeNull();
    expect(scoreLabelIndex).toBeGreaterThan(-1);
    expect(heroQuickStatIndex).toBeGreaterThan(scoreLabelIndex);
    expect(trajectoryIndex).toBeGreaterThan(heroQuickStatIndex);
    expect(detailsIndex).toBeGreaterThan(trajectoryIndex);
    expect(deepAnalysisIndex).toBeGreaterThan(detailsIndex);
    expect(backIndex).toBeGreaterThan(deepAnalysisIndex);
    expect(shareIndex).toBeGreaterThan(backIndex);
  });

  it('uses the reusable abstract hero backdrop instead of the captured image', () => {
    mockParams.mockReturnValue({
      analysisData: JSON.stringify(makeFaceResult()),
      imageUri: 'file:///scan.jpg',
    });

    const { getByTestId } = render(<ScanResultScreen />);

    expect(getByTestId('result-hero-abstract-backdrop')).toBeTruthy();
  });

  it('keeps the back CTA wired to the existing close behavior', () => {
    mockParams.mockReturnValue({
      analysisData: JSON.stringify(makeFaceResult()),
    });

    const { getByTestId } = render(<ScanResultScreen />);

    fireEvent.press(getByTestId('scan-result-back-button'));

    expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
  });

  it('renders the trajectory teaser before the first premium metric', () => {
    mockParams.mockReturnValue({
      analysisData: JSON.stringify(makeFaceResult()),
    });

    const { UNSAFE_getAllByType } = render(<ScanResultScreen />);
    const allTextValues = UNSAFE_getAllByType(Text).map((node) =>
      flattenText(node.props.children),
    );
    const teaserIndex = allTextValues.indexOf('locked');
    const firstPremiumMetricIndex = allTextValues.findIndex((value) =>
      value.startsWith(`${i18n.t('common.metrics.skin_quality')}:locked:`),
    );

    expect(teaserIndex).toBeGreaterThan(-1);
    expect(firstPremiumMetricIndex).toBeGreaterThan(-1);
    expect(teaserIndex).toBeLessThan(firstPremiumMetricIndex);
  });

  it('renders the nutrition macro icons from the centralized icon catalog', () => {
    mockParams.mockReturnValue({
      analysisData: JSON.stringify(makeNutritionResult()),
    });

    const { getByTestId } = render(<ScanResultScreen />);

    expect(getByTestId('scan-result-macro-icon-proteins')).toBeTruthy();
    expect(getByTestId('scan-result-macro-icon-carbs')).toBeTruthy();
    expect(getByTestId('scan-result-macro-icon-fats')).toBeTruthy();
  });

  it('renders long nutrition content in full-width expandable sections', () => {
    mockUserProfile = { account_tier: 'premium' };
    const longRecommendation =
      'Add a larger vegetable portion, keep the protein source visible, and pair the starch with fiber. '.repeat(
        4,
      );
    mockParams.mockReturnValue({
      analysisData: JSON.stringify({
        ...makeNutritionResult(),
        main_vitamins_fallback_text:
          'Vitamin A and vitamin C appear prominent, with minerals likely coming from colorful vegetables.',
        recommendations: longRecommendation,
      }),
    });

    const { getByTestId, queryByTestId } = render(<ScanResultScreen />);

    expect(queryByTestId('scan-result-premium-metric-grid-item-vitamins')).toBeNull();
    expect(getByTestId('nutrition-long-section-vitamins')).toBeTruthy();
    expect(getByTestId('nutrition-long-section-recommendations')).toBeTruthy();
    expect(getByTestId('nutrition-long-section-body-recommendations').props.numberOfLines).toBe(4);

    fireEvent.press(getByTestId('nutrition-long-section-toggle-recommendations'));

    expect(
      getByTestId('nutrition-long-section-body-recommendations').props.numberOfLines,
    ).toBeUndefined();
  });
});
