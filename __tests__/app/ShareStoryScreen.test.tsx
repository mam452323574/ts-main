import React from 'react';
import * as ReactNative from 'react-native';
import { StyleSheet, Text } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import ShareStoryScreen from '@/app/share-story';
import { SUPPORTED_LOCALES } from '@/i18n/config';
import { i18n, loadLocalesForTests } from '@/i18n/translations';

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockParams = jest.fn();
const mockShowAlert = jest.fn();
const mockUseFeatureFlags = jest.fn();
const mockSaveSocialComposerDraft = jest.fn();
let mockUserProfile: any = { account_tier: 'free', avatar_url: null };

function setWindowDimensions(width: number, height: number) {
  (ReactNative.Dimensions as any).set({
    window: { width, height, scale: 1, fontScale: 1 },
    screen: { width, height, scale: 1, fontScale: 1 },
  });
}

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

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    push: mockPush,
  }),
  useLocalSearchParams: () => mockParams(),
}));

jest.mock('@/hooks/queries', () => ({
  useFeatureFlags: () => mockUseFeatureFlags(),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    userProfile: mockUserProfile,
  }),
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#F2F2F7',
      cardBackground: '#FFFFFF',
      primaryText: '#1D1D1F',
      white: '#FFFFFF',
      gray: '#8E8E93',
      primary: '#007AFF',
    },
    isDark: false,
  }),
}));

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    locale: require('@/i18n/translations').i18n.locale,
    t: (key: string, options?: Record<string, unknown>) =>
      String(require('@/i18n/translations').i18n.t(key, options)),
  }),
}));

jest.mock('@/hooks/useCustomAlert', () => ({
  useCustomAlert: () => ({
    showAlert: mockShowAlert,
    alertElement: null,
  }),
}));

jest.mock('@/services/socialDraftStore', () => ({
  saveSocialComposerDraft: (...args: unknown[]) => mockSaveSocialComposerDraft(...args),
}));

jest.mock('react-native-svg', () => {
  const ReactLocal = require('react');
  const { View } = require('react-native');
  const MockSvgComponent = ({ children, ...props }: any) =>
    ReactLocal.createElement(View, props, children);

  return {
    __esModule: true,
    default: MockSvgComponent,
    Circle: MockSvgComponent,
    Defs: MockSvgComponent,
    LinearGradient: MockSvgComponent,
    Stop: MockSvgComponent,
  };
});

const mockFaceResult = {
  scan_type: 'face',
  face_score: 83,
  perceived_age: 27,
  skin_quality_score: 76,
  symmetry_percentage: 91,
  fatigue_level: 18,
  energy_score: 7,
  face_shape: 'Oval',
  collagen_level: 70,
  hydration_level: 82,
  photogenic_score: 9,
};

const mockBodyResult = {
  scan_type: 'body',
  body_score: 81,
  metabolic_age: 31,
  strength_index: 85,
  body_symmetry: 88,
  body_fat_percentage: 18,
  posture_score: 8,
  bmi_estimate: 22.1,
  waist_estimation_cm: 79,
  muscle_mass_label: 'Balanced',
  body_type: 'Athletic',
};

const mockNutritionResult = {
  scan_type: 'nutrition',
  plate_health_score: 75,
  calories_estimate: 410,
  protein_grams: 22,
  carbs_grams: 31,
  fat_grams: 11,
  glycemic_index_label: 'Low',
  satiety_index: 8,
  ingredient_quality: 'Ultra naturelle et locale',
  main_vitamins: 'A, C',
  short_verdict: 'Solide',
};

const mockSuperScanResult = {
  scan_type: 'super_health_v2',
  global_risk_score: 70,
  urgency_flag: true,
  analysis_summary: 'Suivi recommande',
  detected_conditions: [
    {
      condition_name: 'Inflammation',
      category: 'Metabolique',
      probability: 82,
      severity: 'Moderee',
      explanation: 'Inflammation a surveiller',
      actionable_advice: 'Consulter un professionnel si besoin',
    },
  ],
  disclaimer_text: 'Resultat indicatif',
};

describe('ShareStoryScreen', () => {
  const mockedCaptureRef = captureRef as jest.Mock;
  const mockedShareAsync = Sharing.shareAsync as jest.Mock;

  beforeAll(async () => {
    await loadLocalesForTests();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    i18n.locale = 'fr';
    mockUserProfile = { account_tier: 'free', avatar_url: null };
    mockUseFeatureFlags.mockReturnValue({
      data: {
        social_enabled: false,
        coach_enabled: false,
        entry_offer_enabled: false,
        social_comments_enabled: false,
      },
      isFetching: false,
    });
    mockSaveSocialComposerDraft.mockResolvedValue({
      id: 'draft-social-1',
    });
    setWindowDimensions(390, 844);
    mockParams.mockReturnValue({
      analysisData: JSON.stringify(mockFaceResult),
      imageUri: 'file:///scan.jpg',
    });
  });

  it('renders the preview header and share card without the old technical caption', () => {
    const { getByTestId, getByText, queryByTestId, queryByText } = render(
      <ShareStoryScreen />,
    );

    expect(getByTestId('share-story-header-title')).toHaveTextContent(
      i18n.t('share_story.header.title'),
    );
    expect(getByTestId('share-story-share-button')).toBeTruthy();
    expect(queryByTestId('share-story-loader')).toBeNull();
    expect(getByText('83')).toBeTruthy();
    expect(getByText('HEALTH SCAN')).toBeTruthy();
    expect(getByText('27 ans')).toBeTruthy();
    expect(queryByText('Apercu 9:16 pret a partager.')).toBeNull();
    expect(queryByText('Scan reality. Stop guessing.')).toBeNull();
  });

  it('uses the active locale for header actions and share labels', () => {
    i18n.locale = 'en';
    mockParams.mockReturnValue({
      analysisData: JSON.stringify({
        ...mockNutritionResult,
        ingredient_quality: 'Processed',
      }),
      imageUri: 'file:///meal.jpg',
    });

    const { getByTestId, getByText } = render(<ShareStoryScreen />);

    expect(getByTestId('share-story-header-title')).toHaveTextContent('Preview');
    expect(getByText('Share')).toBeTruthy();
    expect(getByText('Nutrition scan')).toBeTruthy();
    expect(getByText('Score')).toBeTruthy();
  });

  it('keeps the super scan risk metric compact on a single line', () => {
    mockParams.mockReturnValue({
      analysisData: JSON.stringify(mockSuperScanResult),
      imageUri: 'file:///super.jpg',
    });

    const { getByTestId } = render(<ShareStoryScreen />);
    const riskValue = getByTestId('share-story-super-risk-value');
    const riskValueStyle = StyleSheet.flatten(riskValue.props.style);

    expect(riskValue).toHaveTextContent('70/100');
    expect(riskValue.props.numberOfLines).toBe(1);
    expect(riskValue.props.adjustsFontSizeToFit).toBe(true);
    expect(riskValue.props.minimumFontScale).toBe(0.82);
    expect(riskValueStyle.fontSize).toBeGreaterThan(18);
  });

  it('renders long nutrition metric values with the text-safe overflow rules and normalized local labels', () => {
    mockParams.mockReturnValue({
      analysisData: JSON.stringify(mockNutritionResult),
      imageUri: 'file:///meal.jpg',
    });

    const { getByTestId, getByText, queryByText } = render(<ShareStoryScreen />);
    const caloriesValue = getByTestId('share-story-metric-value-0');
    const qualityValue = getByTestId('share-story-metric-value-2');
    const caloriesValueStyle = StyleSheet.flatten(caloriesValue.props.style);
    const qualityValueStyle = StyleSheet.flatten(qualityValue.props.style);

    expect(getByText('410')).toBeTruthy();
    expect(getByText('8/10')).toBeTruthy();
    expect(String(qualityValue.props.children)).not.toBe('Unknown');
    expect(queryByText('Unknown')).toBeNull();
    expect(qualityValue.props.numberOfLines).toBe(2);
    expect(qualityValue.props.adjustsFontSizeToFit).toBeUndefined();
    expect(qualityValue.props.minimumFontScale).toBeUndefined();
    expect(qualityValue.props.android_hyphenationFrequency).toBe('none');
    expect(qualityValue.props.lineBreakStrategyIOS).toBe('standard');
    expect(qualityValue.props.textBreakStrategy).toBe('simple');
    expect(qualityValueStyle.alignSelf).toBe('stretch');
    expect(qualityValueStyle.fontSize).toBeLessThan(caloriesValueStyle.fontSize);
  });

  it('aligns the primary score row on the baseline without a suffix offset hack', () => {
    const { getByTestId } = render(<ShareStoryScreen />);
    const scoreRow = getByTestId('share-story-score-row');
    const scoreSuffix = getByTestId('share-story-score-suffix');
    const suffixStyle = StyleSheet.flatten(scoreSuffix.props.style);

    expect(scoreRow).toHaveStyle({ alignItems: 'baseline' });
    expect(suffixStyle.marginBottom).toBeUndefined();
    expect(suffixStyle.lineHeight).toBeLessThan(
      StyleSheet.flatten(getByTestId('share-story-primary-score').props.style)
        .lineHeight,
    );
  });

  it.each([
    [320, 560],
    [336, 640],
    [360, 740],
    [390, 844],
    [430, 932],
  ])('sizes the 9:16 preview from the available viewport at %ipx', (width, height) => {
    setWindowDimensions(width, height);

    const { getByTestId } = render(<ShareStoryScreen />);
    const captureFrameStyle = StyleSheet.flatten(
      getByTestId('share-story-capture-frame').props.style,
    );

    expect(captureFrameStyle.width).toBeLessThanOrEqual(width - 32);
    expect(captureFrameStyle.height).toBeCloseTo(
      captureFrameStyle.width * (16 / 9),
      5,
    );
    expect(captureFrameStyle.height).toBeLessThan(height);
  });

  it.each(['free', 'premium', 'admin'] as const)(
    'renders the share card consistently for %s accounts',
    (accountTier) => {
      mockUserProfile = { account_tier: accountTier, avatar_url: null };

      const { getByTestId, getByText } = render(<ShareStoryScreen />);

      expect(getByTestId('share-story-card')).toBeTruthy();
      expect(getByText('HEALTH SCAN')).toBeTruthy();
      expect(getByTestId('share-story-share-button')).toBeTruthy();
    },
  );

  it.each(
    SUPPORTED_LOCALES.flatMap((locale) =>
      ([320, 336, 360, 390, 430] as const).flatMap((width) =>
        (
          [
            ['face', mockFaceResult, 'file:///face.jpg'],
            ['body', mockBodyResult, 'file:///body.jpg'],
            ['nutrition', mockNutritionResult, 'file:///meal.jpg'],
            ['super', mockSuperScanResult, 'file:///super.jpg'],
          ] as const
        ).map(([variant, payload, imageUri]) => [
          locale,
          width,
          variant,
          payload,
          imageUri,
        ] as const),
      ),
    ),
  )(
    'renders %s %spx %s share preview without translation fallbacks',
    (locale, width, _variant, payload, imageUri) => {
      i18n.locale = locale;
      setWindowDimensions(width, 844);
      mockParams.mockReturnValue({
        analysisData: JSON.stringify(payload),
        imageUri,
      });

      const screen = render(<ShareStoryScreen />);

      expectNoMissingTranslationSentinel(screen);
      expect(screen.getByTestId('share-story-header-title')).toHaveTextContent(
        i18n.t('share_story.header.title'),
      );
      expect(screen.getByTestId('share-story-share-button')).toBeTruthy();
      expect(screen.getByTestId('share-story-capture-frame')).toBeTruthy();
      expect(screen.getByText('HEALTH SCAN')).toBeTruthy();
    },
  );

  it('waits for the preview image before capturing and sharing', async () => {
    const screen = render(<ShareStoryScreen />);

    fireEvent.press(screen.getByTestId('share-story-share-button'));
    expect(mockedCaptureRef).not.toHaveBeenCalled();

    fireEvent(screen.getByTestId('share-story-hero-image'), 'loadEnd');
    fireEvent.press(screen.getByTestId('share-story-share-button'));

    await waitFor(() => {
      expect(mockedCaptureRef).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          format: 'png',
          quality: 1,
          width: 1080,
          height: 1920,
        }),
      );
    });

    expect(mockedShareAsync).toHaveBeenCalledWith(
      'file:///tmp/share-story.png',
      expect.objectContaining({ mimeType: 'image/png' }),
    );
  });

  it('maps export errors to localized product copy instead of showing raw technical messages', async () => {
    mockedCaptureRef.mockRejectedValueOnce(new Error('Permission denied by OS'));
    const screen = render(<ShareStoryScreen />);

    fireEvent(screen.getByTestId('share-story-hero-image'), 'loadEnd');
    fireEvent.press(screen.getByTestId('share-story-share-button'));

    await waitFor(() => {
      expect(mockShowAlert).toHaveBeenCalledWith(
        String(i18n.t('share_story.error.title')),
        String(i18n.t('share_story.error.permission_message')),
        [{ text: String(i18n.t('common.ok')) }],
      );
    });

    expect(mockShowAlert.mock.calls[0]?.[1]).not.toContain('Permission denied');
  });

  it('keeps the preview focused on external sharing even when social is enabled upstream', () => {
    mockUseFeatureFlags.mockReturnValue({
      data: {
        social_enabled: true,
        coach_enabled: false,
        entry_offer_enabled: false,
        social_comments_enabled: true,
      },
      isFetching: false,
    });
    mockParams.mockReturnValue({
      analysisData: JSON.stringify(mockNutritionResult),
      imageUri: 'file:///meal.jpg',
      scanId: 'scan-42',
    });

    const screen = render(<ShareStoryScreen />);

    expect(screen.getByTestId('share-story-share-button')).toBeTruthy();
    expect(screen.queryByTestId('share-story-post-to-social-button')).toBeNull();
    expect(mockSaveSocialComposerDraft).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
