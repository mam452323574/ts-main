import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import SuperScanResultScreen from '@/screens/SuperScanResultScreen';
import { i18n, loadLocalesForTests } from '@/i18n/translations';
import { resolveResultItemTheme } from '@/utils/resultVisualTheme';
import {
  resolveFatDistributionPrimaryMetricThemeSpec,
  resolveFatDistributionSuperScanPalette,
  resolveLegacySuperScanPalette,
} from '@/utils/superScanVisualTheme';
import { FONT_WEIGHTS, SIZES, SPACING, withAlpha } from '@/constants/theme';

const mockCanDismiss = jest.fn();
const mockDismissAll = jest.fn();
const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockParams = jest.fn();
const mockUsePremiumPotential = jest.fn();
const mockUseFeatureFlags = jest.fn();
const mockShowAlert = jest.fn();
const mockResolveAvatarUrl = jest.fn();
const mockSaveShareStorySocialComposerDraft = jest.fn();
let mockUserProfile: any = { account_tier: 'free' };
let mockAuthLoading = false;
const baseMockThemeColors = {
  primary: '#007AFF',
  primaryLight: '#E3F2FF',
  primaryDark: '#0056B3',
  secondary: '#5856D6',
  accentGreen: '#34C759',
  warning: '#FF9500',
  error: '#FF3B30',
  success: '#34C759',
  successLight: '#E8F9ED',
  gold: '#FFD700',
  goldLight: '#FFF8E1',
  cardBackground: '#FFFFFF',
  background: '#F2F2F7',
  primaryText: '#1D1D1F',
  secondaryText: '#FFFFFF',
  gray: '#8E8E93',
  grayLight: '#F8F8FA',
  grayMedium: '#C7C7CC',
  lightGray: '#E5E5EA',
  darkGray: '#424242',
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

jest.mock('expo-router', () => ({
  useRouter: () => ({
    canDismiss: mockCanDismiss,
    dismissAll: mockDismissAll,
    replace: mockReplace,
    push: mockPush,
  }),
  useLocalSearchParams: () => mockParams(),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    userProfile: mockUserProfile,
    loading: mockAuthLoading,
  }),
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

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: mockThemeColors,
    isDark: mockIsDark,
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  }),
}));

jest.mock('@/components/ModalHandle', () => ({
  ModalHandle: () => null,
}));

jest.mock('@/components/UrgencyModal', () => {
  const ReactLocal = require('react');
  const { Text } = require('react-native');
  return {
    UrgencyModal: ({ visible }: { visible: boolean }) =>
      visible
        ? ReactLocal.createElement(Text, { testID: 'urgency-modal' }, 'Urgency')
        : null,
  };
});

jest.mock('@/components/ConditionCard', () => {
  const ReactLocal = require('react');
  const { Text } = require('react-native');
  return {
    ConditionCard: ({ condition, premiumRenderState }: any) =>
      ReactLocal.createElement(
        Text,
        { testID: `condition-card-${condition.severity_key}-${condition.probability}` },
        `${condition.severity_key}:${premiumRenderState}`,
      ),
  };
});

jest.mock('@/components/TrajectoryPreviewCard', () => ({
  TrajectoryPreviewCard: ({ model, onPress, visualVariant }: any) => {
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
      ReactLocal.createElement(RNText, { testID: 'trajectory-visual-variant' }, visualVariant ?? 'default'),
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

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    locale: require('@/i18n/translations').i18n.locale,
    t: (key: string, options?: Record<string, unknown>) =>
      String(require('@/i18n/translations').i18n.t(key, options)),
  }),
}));

const makeResult = (overrides: Partial<any> = {}) => ({
  schema_version: 3,
  scan_type: 'super_health_v2',
  global_risk_score: 62,
  urgency_flag: false,
  summary_key: 'medical_attention',
  detected_conditions: [
    {
      condition_key: 'low',
      category_key: 'general',
      probability: 20,
      severity_key: 'low',
      explanation_key: 'low',
      advice_key: 'low',
    },
    {
      condition_key: 'high',
      category_key: 'general',
      probability: 81,
      severity_key: 'high',
      explanation_key: 'high',
      advice_key: 'high',
    },
    {
      condition_key: 'mod',
      category_key: 'general',
      probability: 48,
      severity_key: 'moderate',
      explanation_key: 'mod',
      advice_key: 'mod',
    },
  ],
  disclaimer_key: 'general',
  ...overrides,
});

const makeFatDistributionResult = (overrides: Partial<any> = {}) => ({
  scan_type: 'fat_distribution_scan_v2',
  global_body_fat_estimate_percent: 24.3,
  global_facial_fat_estimate_percent: 16.4,
  global_water_retention_estimate_percent: 11.2,
  analysis_summary: 'Central storage remains dominant overall',
  dominant_storage_pattern: 'central',
  areas_analysis: [],
  priority_zones: [],
  disclaimer_text: 'Indicative only',
  ...overrides,
});

describe('SuperScanResultScreen', () => {
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
      id: 'draft-super-community-1',
    });
    mockUsePremiumPotential.mockReturnValue({
      data: {
        currentScan: null,
        historicalAverage30d: 64,
        scanCountTotal: 4,
        recentScoreHistory: [
          { date: '2026-03-01', score: 68 },
          { date: '2026-03-10', score: 64 },
        ],
      },
      isLoading: false,
      error: null,
    });
  });

  it('renders fallback state when analysis data is missing', () => {
    mockParams.mockReturnValue({});

    const { getByText, getByTestId, queryByTestId } = render(<SuperScanResultScreen />);

    expect(getByTestId('super-scan-empty-state')).toBeTruthy();
    expect(getByTestId('super-scan-result-sheet')).toBeTruthy();
    expectCompactResultTitle(
      getByTestId('super-scan-result-screen-header').props.style,
    );
    expectCompactResultTopChrome(
      getByTestId('super-scan-result-top-chrome').props.style,
      false,
    );
    expect(queryByTestId('super-scan-result-top-chrome-handle')).toBeNull();
    expect(queryByTestId('super-scan-result-close-button')).toBeNull();
    expect(getByText(i18n.t('common.results.no_data'))).toBeTruthy();
    expect(getByText(i18n.t('common.home_back'))).toBeTruthy();
  });

  it('applies the danger premium palette to urgent legacy results', () => {
    mockParams.mockReturnValue({
      analysisData: JSON.stringify(
        makeResult({
          global_risk_score: 84,
          urgency_flag: true,
        }),
      ),
    });

    const { getByTestId, queryByTestId } = render(<SuperScanResultScreen />);
    const expectedPalette = resolveLegacySuperScanPalette({
      colors: mockThemeColors as any,
      isDark: false,
      globalRiskScore: 84,
      urgencyFlag: true,
    });

    expect(getByTestId('super-scan-background-layer').props.colors).toEqual(
      toResultScrimGradient(expectedPalette.backgroundGradient),
    );
    expect(getByTestId('super-scan-result-sheet')).toBeTruthy();
    expectCompactResultTitle(
      getByTestId('super-scan-result-screen-header').props.style,
    );
    expectCompactResultTopChrome(
      getByTestId('super-scan-result-top-chrome').props.style,
      false,
    );
    expect(queryByTestId('super-scan-result-top-chrome-handle')).toBeNull();
    expect(queryByTestId('super-scan-result-close-button')).toBeNull();
    expect(getByTestId('result-hero-surface')).toBeTruthy();
    expect(queryByTestId('super-scan-score-card')).toBeNull();
  });

  it('renders the super result top chrome inside the scroll flow over the scanner backdrop', () => {
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
      analysisData: JSON.stringify(
        makeResult({
          global_risk_score: 42,
          urgency_flag: false,
        }),
      ),
    });
    const expectedPalette = resolveLegacySuperScanPalette({
      colors: mockThemeColors as any,
      isDark: true,
      globalRiskScore: 42,
      urgencyFlag: false,
    });

    const rendered = render(<SuperScanResultScreen />);
    const testIds = collectTestIds(rendered.toJSON());
    const containerStyle = StyleSheet.flatten(
      rendered.getByTestId('super-scan-result-screen').props.style,
    );
    const sheetStyle = StyleSheet.flatten(
      rendered.getByTestId('super-scan-result-sheet').props.style,
    );
    const scroll = rendered.getByTestId('super-scan-result-scroll');

    expect(testIds.indexOf('super-scan-result-top-chrome')).toBeLessThan(
      testIds.indexOf('result-hero-surface'),
    );
    expect(testIds.indexOf('super-scan-result-scroll')).toBeLessThan(
      testIds.indexOf('super-scan-result-top-chrome'),
    );
    expect(containerStyle.backgroundColor).toBe('transparent');
    expect(rendered.getByTestId('super-scan-background-layer').props.colors).toEqual(
      toResultScrimGradient(expectedPalette.backgroundGradient),
    );
    expectStableInternalScroll(scroll);
    expectFixedResultSurface(sheetStyle);
    expectCompactResultTopChrome(
      rendered.getByTestId('super-scan-result-top-chrome').props.style,
      true,
    );
    expectCompactResultTitle(rendered.getByTestId('super-scan-result-screen-header').props.style);
    expect(rendered.queryByTestId('super-scan-result-top-chrome-handle')).toBeNull();
    expect(sheetStyle.marginTop).toBe(SPACING.md);
    expect(sheetStyle.backgroundColor).not.toBe('#000000');
  });

  it('applies the recovery premium palette to low-risk legacy results', () => {
    mockParams.mockReturnValue({
      analysisData: JSON.stringify(
        makeResult({
          global_risk_score: 22,
          urgency_flag: false,
        }),
      ),
    });

    const { getByTestId, queryByTestId } = render(<SuperScanResultScreen />);
    const expectedPalette = resolveLegacySuperScanPalette({
      colors: mockThemeColors as any,
      isDark: false,
      globalRiskScore: 22,
      urgencyFlag: false,
    });

    expect(getByTestId('super-scan-background-layer').props.colors).toEqual(
      toResultScrimGradient(expectedPalette.backgroundGradient),
    );
    expect(getByTestId('result-hero-surface')).toBeTruthy();
    expect(queryByTestId('super-scan-score-card')).toBeNull();
  });

  it('promotes the legacy super scan coach CTA and navigates with auto submit', () => {
    mockParams.mockReturnValue({
      analysisData: JSON.stringify(makeResult({ global_risk_score: 78 })),
      scanId: 'scan-super-cta',
    });

    const rendered = render(<SuperScanResultScreen />);
    const testIds = collectTestIds(rendered.toJSON());

    expect(rendered.getByTestId('super-scan-coach-cta-question-preview')).toBeTruthy();
    expect(testIds.indexOf('super-scan-coach-cta')).toBeGreaterThan(
      testIds.indexOf('result-hero-surface'),
    );
    expect(testIds.indexOf('super-scan-coach-cta')).toBeLessThan(
      testIds.indexOf('super-scan-priority-findings'),
    );

    fireEvent.press(rendered.getByTestId('super-scan-coach-cta-button'));

    // After the post-scan mapping fix: free user + super scan with actionable
    // risk priority → latest_scan top priority preset (premium would route to
    // risk_watch). The legacy 'latest_scan_issue_resolution' prompt_type is
    // preserved on the encoded scan_intent payload only.
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/coach',
        params: expect.objectContaining({
          source: 'scan_result',
          autoSubmit: '1',
          scanId: 'scan-super-cta',
          scanType: 'super',
          promptType: 'latest_scan',
          questionKey: 'latest_scan__top_priority_today',
          fallbackPromptType: 'latest_scan',
          scanIntent: expect.any(String),
        }),
      }),
    );
    const pushedParams = mockPush.mock.calls[0][0].params;
    expect(JSON.parse(decodeURIComponent(pushedParams.scanIntent))).toMatchObject({
      scan_id: 'scan-super-cta',
      scan_type: 'super',
      priority_metric: 'global_risk_score',
      prompt_type: 'latest_scan_issue_resolution',
      fallback_prompt_type: 'latest_scan',
    });
  });

  it('promotes the fat distribution coach CTA near the top and keeps auto submit', () => {
    mockUserProfile = { account_tier: 'premium' };
    mockParams.mockReturnValue({
      analysisData: JSON.stringify(makeFatDistributionResult()),
      scanId: 'scan-fat-cta',
    });

    const rendered = render(<SuperScanResultScreen />);
    const testIds = collectTestIds(rendered.toJSON());

    expect(rendered.getByTestId('super-scan-fat-coach-cta-question-preview')).toBeTruthy();
    expect(testIds.indexOf('super-scan-fat-coach-cta')).toBeGreaterThan(
      testIds.indexOf('result-hero-surface'),
    );
    expect(testIds.indexOf('super-scan-fat-coach-cta')).toBeLessThan(
      testIds.indexOf('super-scan-fat-main-metrics'),
    );

    fireEvent.press(rendered.getByTestId('super-scan-fat-coach-cta-button'));

    // Premium user + stable super scan (fat distribution layout): mapped to
    // trend_review__habits_to_continue (maintain experience, premium tier).
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/coach',
        params: expect.objectContaining({
          source: 'scan_result',
          autoSubmit: '1',
          scanId: 'scan-fat-cta',
          scanType: 'super',
          promptType: 'trend_review',
          questionKey: 'trend_review__habits_to_continue',
          fallbackPromptType: 'latest_scan',
          scanIntent: expect.any(String),
        }),
      }),
    );
  });

  it('renders the new fat distribution format with a dedicated UI and no legacy affordances', () => {
    mockUserProfile = { account_tier: 'premium' };
    mockParams.mockReturnValue({
      analysisData: JSON.stringify(
        makeFatDistributionResult({
          priority_zones: ['Abdomen', 'Lower face'],
          areas_analysis: [
            {
              area_name: 'Abdomen',
              subcutaneous_fat_percent: 31,
              water_retention_percent: 14,
              definition_percent: 46,
              dominant_type: 'Subcutaneous',
              confidence: 0.84,
              explanation: 'Storage is more visible through the midsection.',
              actionable_advice: 'Keep steps high and recovery steady.',
            },
          ],
        }),
      ),
    });

    const { getByTestId, getByText, queryByTestId } = render(
      <SuperScanResultScreen />,
    );

    expect(getByTestId('super-scan-fat-summary')).toHaveTextContent(
      'Central storage remains dominant overall',
    );
    expect(getByTestId('super-scan-fat-main-metrics')).toBeTruthy();
    expect(getByTestId('super-scan-fat-metric-body_fat')).toBeTruthy();
    expect(getByTestId('super-scan-fat-metric-facial_fat')).toBeTruthy();
    expect(getByTestId('super-scan-fat-metric-water_retention')).toBeTruthy();
    expect(getByTestId('super-scan-fat-priority-zone-0')).toHaveTextContent(
      'Abdomen',
    );
    expect(getByTestId('super-scan-area-card-0')).toBeTruthy();
    expect(getByText('Storage is more visible through the midsection.')).toBeTruthy();
    expect(queryByTestId('trajectory-preview-card')).toBeNull();
    expect(queryByTestId('super-scan-share-button')).toBeNull();
    expect(queryByTestId('super-scan-conditions')).toBeNull();
    expect(queryByTestId('super-scan-score-value')).toBeNull();
  });

  it('locks fat distribution zones and area details for free users', () => {
    mockParams.mockReturnValue({
      analysisData: JSON.stringify(
        makeFatDistributionResult({
          priority_zones: ['Abdomen'],
          areas_analysis: [
            {
              area_name: 'Abdomen',
              subcutaneous_fat_percent: 31,
              water_retention_percent: 14,
              definition_percent: 46,
              dominant_type: 'Subcutaneous',
              confidence: 0.84,
              explanation: 'Storage is more visible through the midsection.',
              actionable_advice: 'Keep steps high and recovery steady.',
            },
          ],
        }),
      ),
    });

    const { getAllByText, getByTestId, queryByTestId, queryByText } = render(
      <SuperScanResultScreen />,
    );

    expect(getByTestId('super-scan-fat-priority-zones-premium')).toBeTruthy();
    expect(getAllByText('Area analysis').length).toBeGreaterThan(0);
    expect(queryByTestId('super-scan-fat-priority-zone-0')).toBeNull();
    expect(queryByText('Abdomen')).toBeNull();
    expect(queryByText('Storage is more visible through the midsection.')).toBeNull();
  });

  it('applies the aqua palette and emphasizes water retention when it is globally dominant', () => {
    mockUserProfile = { account_tier: 'premium' };
    mockParams.mockReturnValue({
      analysisData: JSON.stringify(
        makeFatDistributionResult({
          global_body_fat_estimate_percent: 12.5,
          global_facial_fat_estimate_percent: 10.1,
          global_water_retention_estimate_percent: 18.8,
        }),
      ),
    });

    const { getByTestId } = render(<SuperScanResultScreen />);
    const expectedPalette = resolveFatDistributionSuperScanPalette({
      colors: mockThemeColors as any,
      isDark: false,
      bodyFat: 12.5,
      facialFat: 10.1,
      waterRetention: 18.8,
    });
    const expectedMetricTheme = resolveResultItemTheme({
      colors: mockThemeColors as any,
      isDark: false,
      theme: resolveFatDistributionPrimaryMetricThemeSpec({
        metricId: 'water_retention',
        highlightedMetricId: 'water_retention',
      }),
    });
    const waterMetricStyle = StyleSheet.flatten(
      getByTestId('super-scan-fat-metric-water_retention').props.style,
    );

    expect(getByTestId('super-scan-background-layer').props.colors).toEqual(
      toResultScrimGradient(expectedPalette.backgroundGradient),
    );
    expect(waterMetricStyle.backgroundColor).toBe(
      expectedMetricTheme.cardBackgroundColor,
    );
    expect(waterMetricStyle.borderColor).toBe(
      expectedMetricTheme.cardBorderColor,
    );
  });

  it('applies the contour palette and emphasizes body fat when it is globally dominant', () => {
    mockUserProfile = { account_tier: 'premium' };
    mockParams.mockReturnValue({
      analysisData: JSON.stringify(
        makeFatDistributionResult({
          global_body_fat_estimate_percent: 27.1,
          global_facial_fat_estimate_percent: 16.4,
          global_water_retention_estimate_percent: 9.8,
        }),
      ),
    });

    const { getByTestId } = render(<SuperScanResultScreen />);
    const expectedPalette = resolveFatDistributionSuperScanPalette({
      colors: mockThemeColors as any,
      isDark: false,
      bodyFat: 27.1,
      facialFat: 16.4,
      waterRetention: 9.8,
    });
    const expectedMetricTheme = resolveResultItemTheme({
      colors: mockThemeColors as any,
      isDark: false,
      theme: resolveFatDistributionPrimaryMetricThemeSpec({
        metricId: 'body_fat',
        highlightedMetricId: 'body_fat',
      }),
    });
    const bodyFatMetricStyle = StyleSheet.flatten(
      getByTestId('super-scan-fat-metric-body_fat').props.style,
    );

    expect(getByTestId('super-scan-background-layer').props.colors).toEqual(
      toResultScrimGradient(expectedPalette.backgroundGradient),
    );
    expect(bodyFatMetricStyle.backgroundColor).toBe(
      expectedMetricTheme.cardBackgroundColor,
    );
    expect(bodyFatMetricStyle.borderColor).toBe(
      expectedMetricTheme.cardBorderColor,
    );
  });

  it('keeps the fat distribution screen stable with null metrics and empty arrays', () => {
    mockUserProfile = { account_tier: 'premium' };
    mockParams.mockReturnValue({
      analysisData: JSON.stringify(
        makeFatDistributionResult({
          global_body_fat_estimate_percent: null,
          global_facial_fat_estimate_percent: null,
          analysis_summary: null,
          dominant_storage_pattern: null,
          priority_zones: [],
          areas_analysis: [],
          disclaimer_text: null,
        }),
      ),
    });

    const { getByTestId, queryByTestId } = render(<SuperScanResultScreen />);

    expect(queryByTestId('super-scan-fat-summary')).toBeNull();
    expect(queryByTestId('super-scan-fat-metric-body_fat')).toBeNull();
    expect(queryByTestId('super-scan-fat-metric-facial_fat')).toBeNull();
    expect(getByTestId('super-scan-fat-priority-zones-empty')).toBeTruthy();
    expect(getByTestId('super-scan-fat-areas-empty')).toBeTruthy();
    expect(queryByTestId('super-scan-share-button')).toBeNull();
    expect(queryByTestId('trajectory-preview-card')).toBeNull();
  });

  it('renders a controlled summary fallback and translated disclaimer text', () => {
    mockParams.mockReturnValue({
      analysisData: JSON.stringify(makeResult()),
    });

    const { getByText } = render(<SuperScanResultScreen />);

    expect(getByText(i18n.t('scan.super.summaries.medical_attention'))).toBeTruthy();
    expect(getByText(i18n.t('scan.super.disclaimers.general'))).toBeTruthy();
  });

  it('keeps the Super Scan summary without duplicating the top finding rollup', () => {
    mockParams.mockReturnValue({
      analysisData: JSON.stringify(makeResult()),
    });

    const { getAllByText, getByText, queryByText } = render(<SuperScanResultScreen />);
    const duplicatedFindingRollup = `${String(
      i18n.t('scan.super.conditions.unknown.label'),
    )} · ${String(i18n.t('qualitative_levels.severity.high'))} · 81%`;

    expect(getByText(i18n.t('scan.super.summaries.medical_attention'))).toBeTruthy();
    expect(queryByText(duplicatedFindingRollup)).toBeNull();
    expect(getByText(i18n.t('scan.super.conditions_label'))).toBeTruthy();
    expect(queryByText('81%')).toBeNull();
    expect(getAllByText(i18n.t('metric_card.premium_label')).length).toBeGreaterThan(0);
  });

  it('renders preserved webhook free text ahead of generic super scan fallbacks', () => {
    mockParams.mockReturnValue({
      analysisData: JSON.stringify(
        makeResult({
          summary_key: 'unknown',
          summary_fallback_text: 'Detailed webhook analysis that should stay visible',
          disclaimer_key: 'unknown',
          disclaimer_fallback_text: 'Provider disclaimer kept verbatim',
        }),
      ),
    });

    const { getByText, queryByText } = render(<SuperScanResultScreen />);

    expect(
      getByText('Detailed webhook analysis that should stay visible'),
    ).toBeTruthy();
    expect(getByText('Provider disclaimer kept verbatim')).toBeTruthy();
    expect(queryByText(i18n.t('scan.super.summaries.unknown'))).toBeNull();
  });

  it('renders direct provider payload text when scan_type is present but analysis_summary is absent', () => {
    mockParams.mockReturnValue({
      analysisData: JSON.stringify({
        scan_type: 'super_health_v2',
        global_risk_score: 54,
        urgency_flag: false,
        analysis: 'Detailed provider analysis rendered from the raw payload',
        status: 'À surveiller',
        detected_conditions: [],
        disclaimer: 'Provider disclaimer alias rendered from the raw payload',
      }),
    });

    const { getByText, queryByText } = render(<SuperScanResultScreen />);

    expect(
      getByText('Detailed provider analysis rendered from the raw payload'),
    ).toBeTruthy();
    expect(
      getByText('Provider disclaimer alias rendered from the raw payload'),
    ).toBeTruthy();
    expect(queryByText(i18n.t('scan.super.summaries.unknown'))).toBeNull();
  });

  it('renders nested provider payload text from result containers for historical scans', () => {
    mockParams.mockReturnValue({
      analysisData: JSON.stringify({
        scan_type: 'super_health_v2',
        result: {
          global_risk_score: 46,
          urgency_flag: false,
          analysis: 'Nested provider analysis rendered from the raw payload',
          disclaimer_text: 'Nested provider disclaimer rendered from the raw payload',
          detected_conditions: [],
        },
      }),
    });

    const { getByText, queryByText } = render(<SuperScanResultScreen />);

    expect(
      getByText('Nested provider analysis rendered from the raw payload'),
    ).toBeTruthy();
    expect(
      getByText('Nested provider disclaimer rendered from the raw payload'),
    ).toBeTruthy();
    expect(queryByText(i18n.t('scan.super.summaries.unknown'))).toBeNull();
  });

  it('renders the locked trajectory and locked condition cards for free users', () => {
    mockParams.mockReturnValue({
      analysisData: JSON.stringify(makeResult()),
    });

    const { getByTestId, getByText } = render(<SuperScanResultScreen />);

    expect(getByTestId('trajectory-preview-card')).toBeTruthy();
    expect(getByTestId('trajectory-premium-state')).toHaveTextContent('locked');
    expect(getByTestId('trajectory-visual-variant')).toHaveTextContent(
      'super-scan-premium',
    );
    expect(getByText('high:locked')).toBeTruthy();
    expect(getByText('moderate:locked')).toBeTruthy();
    expect(getByText('low:locked')).toBeTruthy();
  });

  it.each(['premium', 'admin'] as const)(
    'renders the unlocked trajectory and condition cards for %s users',
    (accountTier) => {
      mockUserProfile = { account_tier: accountTier };
      mockParams.mockReturnValue({
        analysisData: JSON.stringify(makeResult()),
      });

      const { getByTestId, queryByTestId, getByText } = render(
        <SuperScanResultScreen />,
      );

      expect(getByTestId('trajectory-premium-state')).toHaveTextContent('unlocked');
      expect(queryByTestId('trajectory-preview-cta')).toBeNull();
      expect(getByText('high:unlocked')).toBeTruthy();
    },
  );

  it('renders a neutral loading state when auth is unresolved', () => {
    mockUserProfile = null;
    mockAuthLoading = true;
    mockParams.mockReturnValue({
      analysisData: JSON.stringify(makeResult()),
    });

    const { getByTestId, queryByTestId, getByText } = render(
      <SuperScanResultScreen />,
    );

    expect(getByTestId('trajectory-premium-state')).toHaveTextContent('loading');
    expect(queryByTestId('trajectory-preview-cta')).toBeNull();
    expect(getByText('high:loading')).toBeTruthy();
  });

  it('keeps the premium trajectory card visible when premium potential data is unavailable', () => {
    mockUserProfile = { account_tier: 'premium' };
    mockUsePremiumPotential.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Fetch error'),
    });
    mockParams.mockReturnValue({
      analysisData: JSON.stringify(makeResult()),
    });

    const { getByTestId, queryByTestId } = render(<SuperScanResultScreen />);

    expect(getByTestId('trajectory-premium-state')).toHaveTextContent('unlocked');
    expect(queryByTestId('trajectory-preview-cta')).toBeNull();
  });

  it('renders RAS card when no detected condition is returned', () => {
    mockParams.mockReturnValue({
      analysisData: JSON.stringify(makeResult({ detected_conditions: [] })),
    });

    const { getByTestId, getByText } = render(<SuperScanResultScreen />);

    expect(getByTestId('super-scan-ras')).toBeTruthy();
    expect(getByText(i18n.t('scan.super.ras_title'))).toBeTruthy();
  });

  it('shows urgency modal when urgency flag is true', () => {
    mockParams.mockReturnValue({
      analysisData: JSON.stringify(makeResult({ urgency_flag: true })),
    });

    const { getByTestId } = render(<SuperScanResultScreen />);

    expect(getByTestId('urgency-modal')).toBeTruthy();
  });

  it('keeps back button and routes to tabs when modal cannot dismiss', () => {
    mockParams.mockReturnValue({
      analysisData: JSON.stringify(makeResult()),
    });

    const { getByTestId } = render(<SuperScanResultScreen />);

    fireEvent.press(getByTestId('super-scan-back-button'));

    expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
    expect(mockDismissAll).not.toHaveBeenCalled();
  });

  it('routes the share CTA with normalized analysis data', () => {
    mockParams.mockReturnValue({
      analysisData: JSON.stringify(makeResult()),
      imageUri: 'file:///super.jpg',
      scanId: 'scan-super-1',
    });

    const { getByTestId } = render(<SuperScanResultScreen />);

    fireEvent.press(getByTestId('super-scan-share-button'));

    expect(mockPush).toHaveBeenCalledTimes(1);
    const pushedRoute = mockPush.mock.calls[0][0];

    expect(pushedRoute).toMatchObject({
      pathname: '/share-story',
      params: {
        imageUri: 'file:///super.jpg',
        scanId: 'scan-super-1',
      },
    });
    const normalizedPayload = JSON.parse(pushedRoute.params.analysisData);

    expect(normalizedPayload).toMatchObject({
      schema_version: 3,
      scan_type: 'super_health_v2',
      summary_key: 'medical_attention',
      disclaimer_key: 'general',
    });
    expect(normalizedPayload.detected_conditions).toHaveLength(3);
  });

  it('opens the share chooser when social sharing is enabled and keeps the external route intact', () => {
    mockUseFeatureFlags.mockReturnValue({
      data: {
        social_enabled: true,
      },
      isFetching: false,
    });
    mockParams.mockReturnValue({
      analysisData: JSON.stringify(makeResult()),
      imageUri: 'file:///super.jpg',
      scanId: 'scan-super-1',
    });

    const { getByTestId } = render(<SuperScanResultScreen />);

    fireEvent.press(getByTestId('super-scan-share-button'));

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
        imageUri: 'file:///super.jpg',
        scanId: 'scan-super-1',
      },
    });
    expect(JSON.parse(pushedRoute.params.analysisData)).toMatchObject({
      schema_version: 3,
      scan_type: 'super_health_v2',
      summary_key: 'medical_attention',
      disclaimer_key: 'general',
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
      analysisData: JSON.stringify(makeResult()),
      imageUri: 'file:///super.jpg',
      scanId: 'scan-super-1',
    });

    const { getByTestId } = render(<SuperScanResultScreen />);

    fireEvent.press(getByTestId('super-scan-share-button'));

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
          scanId: 'scan-super-1',
          payload: expect.objectContaining({
            variant: 'super',
            heroImageUri: 'file:///super.jpg',
            score: 62,
          }),
        }),
      );
    });

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/social-compose',
      params: {
        draftId: 'draft-super-community-1',
      },
    });
  });

  it('uses a shrink-to-fit share CTA label without forcing the text to stretch', () => {
    mockParams.mockReturnValue({
      analysisData: JSON.stringify(makeResult()),
    });

    const { getByText } = render(<SuperScanResultScreen />);
    const shareLabel = getByText(i18n.t('share_story.actions.share_report'));
    const shareLabelStyle = StyleSheet.flatten(shareLabel.props.style);

    expect(shareLabel.props.adjustsFontSizeToFit).toBe(true);
    expect(shareLabel.props.minimumFontScale).toBe(0.84);
    expect(shareLabel.props.numberOfLines).toBe(2);
    expect(shareLabelStyle.flexShrink).toBe(1);
    expect(shareLabelStyle.flex).toBeUndefined();
  });

  it('routes the locked trajectory CTA to premium upgrade', () => {
    mockParams.mockReturnValue({
      analysisData: JSON.stringify(makeResult()),
    });

    const { getByTestId } = render(<SuperScanResultScreen />);

    fireEvent.press(getByTestId('trajectory-preview-cta'));

    expect(mockPush).toHaveBeenCalledWith('/premium-upgrade');
  });
});
