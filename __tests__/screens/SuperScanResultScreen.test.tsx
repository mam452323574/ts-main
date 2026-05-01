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
const mockThemeColors = {
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
    isDark: false,
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

    const { getByText, getByTestId } = render(<SuperScanResultScreen />);

    expect(getByTestId('super-scan-empty-state')).toBeTruthy();
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

    const { getByTestId } = render(<SuperScanResultScreen />);
    const expectedPalette = resolveLegacySuperScanPalette({
      colors: mockThemeColors as any,
      isDark: false,
      globalRiskScore: 84,
      urgencyFlag: true,
    });
    const scoreCardStyle = StyleSheet.flatten(
      getByTestId('super-scan-score-card').props.style,
    );

    expect(getByTestId('super-scan-background-layer').props.colors).toEqual(
      expectedPalette.backgroundGradient,
    );
    expect(getByTestId('super-scan-score-card').props.colors).toEqual(
      expectedPalette.heroGradient,
    );
    expect(scoreCardStyle.borderColor).toBe(expectedPalette.heroBorderColor);
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

    const { getByTestId } = render(<SuperScanResultScreen />);
    const expectedPalette = resolveLegacySuperScanPalette({
      colors: mockThemeColors as any,
      isDark: false,
      globalRiskScore: 22,
      urgencyFlag: false,
    });

    expect(getByTestId('super-scan-background-layer').props.colors).toEqual(
      expectedPalette.backgroundGradient,
    );
    expect(getByTestId('super-scan-score-card').props.colors).toEqual(
      expectedPalette.heroGradient,
    );
  });

  it('renders the new fat distribution format with a dedicated UI and no legacy affordances', () => {
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

  it('applies the aqua palette and emphasizes water retention when it is globally dominant', () => {
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
      expectedPalette.backgroundGradient,
    );
    expect(waterMetricStyle.backgroundColor).toBe(
      expectedMetricTheme.cardBackgroundColor,
    );
    expect(waterMetricStyle.borderColor).toBe(
      expectedMetricTheme.cardBorderColor,
    );
  });

  it('applies the contour palette and emphasizes body fat when it is globally dominant', () => {
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
      expectedPalette.backgroundGradient,
    );
    expect(bodyFatMetricStyle.backgroundColor).toBe(
      expectedMetricTheme.cardBackgroundColor,
    );
    expect(bodyFatMetricStyle.borderColor).toBe(
      expectedMetricTheme.cardBorderColor,
    );
  });

  it('keeps the fat distribution screen stable with null metrics and empty arrays', () => {
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

    expect(getByTestId('super-scan-fat-summary')).toBeTruthy();
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
