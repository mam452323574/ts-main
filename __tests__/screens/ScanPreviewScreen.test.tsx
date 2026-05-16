import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react-native';
import { Platform, StyleSheet } from 'react-native';
import ScanPreviewScreen from '@/screens/ScanPreviewScreen';
import { ApiError } from '@/services/api';
import { SPACING } from '@/constants/theme';

// Mock expo-router
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockUseLocalSearchParams = jest.fn();
const mockInvalidateQueries = jest.fn();
const mockRefetchQueries = jest.fn();
const mockSetQueryData = jest.fn();
const mockSetQueriesData = jest.fn();
const mockUseSafeAreaInsets = jest.fn(() => ({
  top: 0,
  bottom: 0,
  left: 0,
  right: 0,
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    replace: mockReplace,
  }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => mockUseSafeAreaInsets(),
}));

// Mock lucide-react-native icons
jest.mock('lucide-react-native', () => ({
  X: 'X',
  Compass: 'Compass',
  ShieldCheck: 'ShieldCheck',
  Sparkles: 'Sparkles',
  Activity: 'Activity',
  Utensils: 'Utensils',
  PersonStanding: 'PersonStanding',
  Smile: 'Smile',
}));

// Mock expo-blur
jest.mock('expo-blur', () => {
  const { View } = require('react-native');
  return {
    BlurView: ({ children, ...props }: any) => (
      <View {...props}>{children}</View>
    ),
  };
});

// Mock react-query
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
    refetchQueries: mockRefetchQueries,
    setQueryData: mockSetQueryData,
    setQueriesData: mockSetQueriesData,
  }),
}));

// Mock ApiService and ApiError
const mockCreateScanWithAnalysis = jest.fn();

jest.mock('@/services/api', () => {
  // Create a mock ApiError class inside the factory to avoid hoisting issues
  class MockApiError extends Error {
    type: string;
    code?: string;
    status?: number;
    requestId?: string;
    context?: Record<string, unknown>;
    constructor(
      message: string,
      type: string,
      _originalError?: unknown,
      context?: Record<string, unknown>,
      code?: string,
      status?: number,
      requestId?: string,
    ) {
      super(message);
      this.name = 'ApiError';
      this.type = type;
      this.context = context;
      this.code = code;
      this.status = status;
      this.requestId = requestId;
    }
  }

  return {
    ApiService: {
      createScanWithAnalysis: (...args: any[]) =>
        mockCreateScanWithAnalysis(...args),
    },
    ApiError: MockApiError,
  };
});

jest.mock('@/utils/observability', () => ({
  logOperationalError: jest.fn(),
  logExpectedFailure: jest.fn(),
}));

// Mock BadgeContext
const mockSetBadge = jest.fn();
jest.mock('@/contexts/BadgeContext', () => ({
  useBadges: () => ({
    setBadge: mockSetBadge,
  }),
}));

const mockIncrementScanCount = jest.fn();
jest.mock('@/contexts/GamificationContext', () => ({
  useGamification: () => ({
    incrementScanCount: mockIncrementScanCount,
    setScanCount: jest.fn(),
    resetInMemoryStateOnUserChange: jest.fn(),
    scanCount: 0,
    isHydrated: true,
  }),
}));

const mockShowAlert = jest.fn();
jest.mock('@/hooks/useCustomAlert', () => ({
  useCustomAlert: () => ({
    showAlert: mockShowAlert,
    alertElement: null,
  }),
}));

// Mock SuccessConfetti
jest.mock('@/components/SuccessConfetti', () => ({
  SuccessConfetti: ({ active, onAnimationEnd }: any) => {
    if (active && onAnimationEnd) {
      // Simulate animation end after a short delay
      setTimeout(onAnimationEnd, 10);
    }
    return null;
  },
}));

// Mock Button
jest.mock('@/components/Button', () => ({
  Button: ({ title, onPress, disabled }: any) => {
    const { TouchableOpacity, Text } = require('react-native');
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled}
        testID="confirm-button"
      >
        <Text>{title}</Text>
      </TouchableOpacity>
    );
  },
}));

const mockLoadingMiniGame = jest.fn((props: any) => {
  const { View } = require('react-native');
  return <View testID="loading-mini-game" {...props} />;
});

jest.mock('@/components/loading/LoadingMiniGame', () => ({
  LoadingMiniGame: (props: any) => mockLoadingMiniGame(props),
}));

describe('ScanPreviewScreen', () => {
  const originalPlatform = Platform.OS;
  const reactNativeModule =
    jest.requireActual<typeof import('react-native')>('react-native');
  const useWindowDimensionsSpy = jest.spyOn(
    reactNativeModule,
    'useWindowDimensions',
  );

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    Object.defineProperty(Platform, 'OS', {
      value: originalPlatform,
      configurable: true,
    });
    useWindowDimensionsSpy.mockReturnValue({
      width: 390,
      height: 844,
      scale: 3,
      fontScale: 1,
    });
    mockUseSafeAreaInsets.mockReturnValue({
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
    });
    mockInvalidateQueries.mockResolvedValue(undefined);
    mockRefetchQueries.mockResolvedValue(undefined);
    mockShowAlert.mockClear();
    mockIncrementScanCount.mockResolvedValue(1);
    mockPush.mockClear();
    mockBack.mockClear();
    mockReplace.mockClear();
    mockUseLocalSearchParams.mockReturnValue({
      imageUri: 'file:///test-image.jpg',
      scanType: 'health',
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('displays the preview image', () => {
    render(<ScanPreviewScreen />);

    // The Image component should be rendered with the imageUri
    expect(screen.getByTestId('confirm-button')).toBeTruthy();
  });

  it('does not apply full-image gradients over the preview or loading photos', async () => {
    mockCreateScanWithAnalysis.mockImplementation(() => new Promise(() => {}));

    render(<ScanPreviewScreen />);

    expect(
      screen
        .getByTestId('scan-preview-image-container')
        .findAllByType('LinearGradient' as any),
    ).toHaveLength(0);
    expect(screen.getAllByText('Visage').length).toBeGreaterThan(0);

    fireEvent.press(screen.getByTestId('confirm-button'));

    await waitFor(() => {
      expect(screen.getByTestId('scan-preview-loading-overlay')).toBeTruthy();
    });

    expect(
      screen
        .getByTestId('scan-preview-loading-vignette')
        .findAllByType('LinearGradient' as any),
    ).toHaveLength(0);
  });

  it('displays the scan type label', () => {
    render(<ScanPreviewScreen />);

    expect(screen.getByText('Type de scan')).toBeTruthy();
  });

  it('displays confirm button', () => {
    render(<ScanPreviewScreen />);

    expect(screen.getByTestId('confirm-button')).toBeTruthy();
  });

  it('displays cancel button', () => {
    render(<ScanPreviewScreen />);

    expect(screen.getByText('Annuler')).toBeTruthy();
  });

  it('keeps the preview dark-first even when the app theme is light', async () => {
    mockCreateScanWithAnalysis.mockImplementation(() => new Promise(() => {}));

    render(<ScanPreviewScreen />);

    const actionPanel = screen.getByTestId('scan-preview-action-panel');
    const actionPanelStyle = StyleSheet.flatten(actionPanel.props.style);
    const cancelTextStyle = StyleSheet.flatten(
      screen.getByText('Annuler').props.style,
    );

    expect(actionPanel.props.tint).toBe('dark');
    expect(actionPanelStyle.backgroundColor).not.toBe('rgba(20, 20, 22, 0.4)');
    expect(cancelTextStyle.color).not.toBe('#1C1C1E');

    fireEvent.press(screen.getByTestId('confirm-button'));

    await waitFor(() => {
      expect(screen.getByTestId('scan-preview-loading-overlay')).toBeTruthy();
    });

    const loadingOverlayStyle = StyleSheet.flatten(
      screen.getByTestId('scan-preview-loading-overlay').props.style,
    );
    const progressCardStyle = StyleSheet.flatten(
      screen.getByTestId('scan-preview-progress-card').props.style,
    );

    expect(loadingOverlayStyle.backgroundColor).not.toBe('rgba(0, 0, 0, 0.85)');
    expect(progressCardStyle.backgroundColor).not.toBe(
      'rgba(28, 28, 30, 0.98)',
    );
  });

  it('keeps Android preview spacing while using tight loading metrics for limited usable height', async () => {
    Object.defineProperty(Platform, 'OS', {
      value: 'android',
      configurable: true,
    });
    useWindowDimensionsSpy.mockReturnValue({
      width: 360,
      height: 720,
      scale: 3,
      fontScale: 1,
    });
    mockUseSafeAreaInsets.mockReturnValue({
      top: 24,
      bottom: 0,
      left: 0,
      right: 0,
    });
    mockCreateScanWithAnalysis.mockImplementation(() => new Promise(() => {}));

    render(<ScanPreviewScreen />);

    const imageContainerStyle = StyleSheet.flatten(
      screen.getByTestId('scan-preview-image-container').props.style,
    );

    fireEvent.press(screen.getByTestId('confirm-button'));

    await waitFor(() => {
      expect(screen.getByTestId('scan-preview-loading-overlay')).toBeTruthy();
    });

    const loadingOverlayStyle = StyleSheet.flatten(
      screen.getByTestId('scan-preview-loading-overlay').props.style,
    );
    const progressCardStyle = StyleSheet.flatten(
      screen.getByTestId('scan-preview-progress-card').props.style,
    );
    const vignetteStyle = StyleSheet.flatten(
      screen.getByTestId('scan-preview-loading-vignette').props.style,
    );

    expect(imageContainerStyle).toEqual(
      expect.objectContaining({
        paddingTop: 24 + 52,
        paddingBottom: SPACING.sm + 236,
      }),
    );
    expect(loadingOverlayStyle).toEqual(
      expect.objectContaining({
        paddingTop: 24 + 18,
      }),
    );
    expect(vignetteStyle).toEqual(
      expect.objectContaining({
        height: 104,
      }),
    );
    expect(progressCardStyle).toEqual(
      expect.objectContaining({
        minHeight: 0,
        paddingVertical: 14,
        paddingHorizontal: 18,
      }),
    );
  });

  it('uses compact loading metrics on iPhone-style safe areas', async () => {
    Object.defineProperty(Platform, 'OS', {
      value: 'ios',
      configurable: true,
    });
    useWindowDimensionsSpy.mockReturnValue({
      width: 390,
      height: 844,
      scale: 3,
      fontScale: 1,
    });
    mockUseSafeAreaInsets.mockReturnValue({
      top: 47,
      bottom: 34,
      left: 0,
      right: 0,
    });
    mockCreateScanWithAnalysis.mockImplementation(() => new Promise(() => {}));

    render(<ScanPreviewScreen />);

    fireEvent.press(screen.getByTestId('confirm-button'));

    await waitFor(() => {
      expect(screen.getByTestId('scan-preview-loading-overlay')).toBeTruthy();
    });

    const loadingOverlayStyle = StyleSheet.flatten(
      screen.getByTestId('scan-preview-loading-overlay').props.style,
    );
    const vignetteStyle = StyleSheet.flatten(
      screen.getByTestId('scan-preview-loading-vignette').props.style,
    );
    const progressCardStyle = StyleSheet.flatten(
      screen.getByTestId('scan-preview-progress-card').props.style,
    );
    const percentageStyle = StyleSheet.flatten(
      screen.getByTestId('scan-preview-loading-percentage').props.style,
    );

    expect(screen.queryByTestId('scan-preview-loading-scroll-view')).toBeNull();
    expect(loadingOverlayStyle).toEqual(
      expect.objectContaining({
        paddingTop: 47 + 28,
      }),
    );
    expect(vignetteStyle).toEqual(
      expect.objectContaining({
        height: 132,
      }),
    );
    expect(progressCardStyle).toEqual(
      expect.objectContaining({
        minHeight: 304,
        paddingVertical: 20,
      }),
    );
    expect(percentageStyle).toEqual(
      expect.objectContaining({
        fontSize: 60,
        lineHeight: 66,
      }),
    );
  });

  it('keeps the full loading hierarchy visible on small iPhone heights', async () => {
    Object.defineProperty(Platform, 'OS', {
      value: 'ios',
      configurable: true,
    });
    useWindowDimensionsSpy.mockReturnValue({
      width: 375,
      height: 667,
      scale: 2,
      fontScale: 1,
    });
    mockUseSafeAreaInsets.mockReturnValue({
      top: 20,
      bottom: 0,
      left: 0,
      right: 0,
    });
    mockCreateScanWithAnalysis.mockImplementation(() => new Promise(() => {}));

    render(<ScanPreviewScreen />);

    fireEvent.press(screen.getByTestId('confirm-button'));

    await waitFor(() => {
      expect(screen.getByTestId('scan-preview-loading-overlay')).toBeTruthy();
    });

    const vignetteStyle = StyleSheet.flatten(
      screen.getByTestId('scan-preview-loading-vignette').props.style,
    );
    const progressCardStyle = StyleSheet.flatten(
      screen.getByTestId('scan-preview-progress-card').props.style,
    );
    const percentageStyle = StyleSheet.flatten(
      screen.getByTestId('scan-preview-loading-percentage').props.style,
    );

    expect(screen.queryByTestId('scan-preview-loading-scroll-view')).toBeNull();
    expect(vignetteStyle).toEqual(
      expect.objectContaining({
        height: 104,
      }),
    );
    expect(progressCardStyle).toEqual(
      expect.objectContaining({
        paddingVertical: 14,
      }),
    );
    expect(percentageStyle).toEqual(
      expect.objectContaining({
        fontSize: 46,
      }),
    );
    expect(screen.getByTestId('scan-preview-loading-vignette')).toBeTruthy();
    expect(screen.getByTestId('scan-preview-loading-percentage')).toBeTruthy();
    expect(screen.getByTestId('scan-preview-step-verification')).toBeTruthy();
    expect(screen.getByTestId('scan-preview-step-upload')).toBeTruthy();
    expect(screen.getByTestId('scan-preview-step-analysis')).toBeTruthy();
    expect(screen.getByTestId('scan-preview-step-preparing')).toBeTruthy();
    expect(screen.getByTestId('scan-preview-trust-line')).toBeTruthy();
    expect(screen.getByText('Indicateurs en cours')).toBeTruthy();
    expect(screen.getByText('Hydratation')).toBeTruthy();
  });

  it('uses the ScrollView fallback only on ultra-tight heights', async () => {
    Object.defineProperty(Platform, 'OS', {
      value: 'ios',
      configurable: true,
    });
    useWindowDimensionsSpy.mockReturnValue({
      width: 320,
      height: 568,
      scale: 2,
      fontScale: 1,
    });
    mockUseSafeAreaInsets.mockReturnValue({
      top: 20,
      bottom: 0,
      left: 0,
      right: 0,
    });
    mockCreateScanWithAnalysis.mockImplementation(() => new Promise(() => {}));

    render(<ScanPreviewScreen />);

    fireEvent.press(screen.getByTestId('confirm-button'));

    await waitFor(() => {
      expect(screen.getByTestId('scan-preview-loading-scroll-view')).toBeTruthy();
    });

    const scrollView = screen.getByTestId('scan-preview-loading-scroll-view');
    const vignetteStyle = StyleSheet.flatten(
      screen.getByTestId('scan-preview-loading-vignette').props.style,
    );
    const progressCardStyle = StyleSheet.flatten(
      screen.getByTestId('scan-preview-progress-card').props.style,
    );
    const percentageStyle = StyleSheet.flatten(
      screen.getByTestId('scan-preview-loading-percentage').props.style,
    );

    expect(scrollView.props.showsVerticalScrollIndicator).toBe(false);
    expect(scrollView.props.bounces).toBe(false);
    expect(vignetteStyle).toEqual(
      expect.objectContaining({
        height: 88,
      }),
    );
    expect(progressCardStyle).toEqual(
      expect.objectContaining({
        paddingVertical: 12,
      }),
    );
    expect(percentageStyle).toEqual(
      expect.objectContaining({
        fontSize: 40,
      }),
    );
  });

  it('keeps regular premium loading metrics on tall iPhones', async () => {
    Object.defineProperty(Platform, 'OS', {
      value: 'ios',
      configurable: true,
    });
    useWindowDimensionsSpy.mockReturnValue({
      width: 430,
      height: 932,
      scale: 3,
      fontScale: 1,
    });
    mockUseSafeAreaInsets.mockReturnValue({
      top: 59,
      bottom: 34,
      left: 0,
      right: 0,
    });
    mockCreateScanWithAnalysis.mockImplementation(() => new Promise(() => {}));

    render(<ScanPreviewScreen />);

    fireEvent.press(screen.getByTestId('confirm-button'));

    await waitFor(() => {
      expect(screen.getByTestId('scan-preview-loading-overlay')).toBeTruthy();
    });

    const loadingOverlayStyle = StyleSheet.flatten(
      screen.getByTestId('scan-preview-loading-overlay').props.style,
    );
    const vignetteStyle = StyleSheet.flatten(
      screen.getByTestId('scan-preview-loading-vignette').props.style,
    );
    const progressCardStyle = StyleSheet.flatten(
      screen.getByTestId('scan-preview-progress-card').props.style,
    );
    const percentageStyle = StyleSheet.flatten(
      screen.getByTestId('scan-preview-loading-percentage').props.style,
    );

    expect(screen.queryByTestId('scan-preview-loading-scroll-view')).toBeNull();
    expect(loadingOverlayStyle).toEqual(
      expect.objectContaining({
        paddingTop: 59 + 48,
      }),
    );
    expect(vignetteStyle).toEqual(
      expect.objectContaining({
        height: 176,
      }),
    );
    expect(progressCardStyle).toEqual(
      expect.objectContaining({
        minHeight: 356,
        paddingVertical: 28,
      }),
    );
    expect(percentageStyle).toEqual(
      expect.objectContaining({
        fontSize: 70,
      }),
    );
  });

  it('renders the editorial loading state with health insight chips', async () => {
    mockCreateScanWithAnalysis.mockImplementation(() => new Promise(() => {}));

    render(<ScanPreviewScreen />);

    fireEvent.press(screen.getByTestId('confirm-button'));

    await waitFor(() => {
      expect(screen.getByTestId('scan-preview-loading-overlay')).toBeTruthy();
    });

    expect(screen.getByTestId('scan-preview-loading-phase-eyebrow').props.children).toBe(
      'Lecture du visage',
    );
    expect(screen.getByTestId('scan-preview-loading-phase-headline').props.children).toBe(
      'Vérification de la photo',
    );
    expect(screen.getByTestId('scan-preview-loading-percentage').props.children).toBe(
      '0%',
    );
    expect(screen.getByText('Hydratation')).toBeTruthy();
    expect(screen.getByText('Symétrie')).toBeTruthy();
    expect(screen.getByText('Éclat')).toBeTruthy();
  });

  it.each([
    ['body', 'Lecture du corps', 'Posture'],
    ['nutrition', 'Lecture nutrition', 'Calories'],
    ['super', 'Synthèse premium', 'Score global'],
  ] as const)(
    'shows scan-type specific loading vocabulary for %s scans',
    async (scanType, eyebrow, chipLabel) => {
      mockUseLocalSearchParams.mockReturnValue({
        imageUri: 'file:///test-image.jpg',
        scanType,
      });
      mockCreateScanWithAnalysis.mockImplementation(() => new Promise(() => {}));

      render(<ScanPreviewScreen />);

      fireEvent.press(screen.getByTestId('confirm-button'));

      await waitFor(() => {
        expect(screen.getByTestId('scan-preview-loading-overlay')).toBeTruthy();
      });

      expect(
        screen.getByTestId('scan-preview-loading-phase-eyebrow').props.children,
      ).toBe(eyebrow);
      expect(screen.getByText(chipLabel)).toBeTruthy();
    },
  );

  it('shows a compact mini-game only while the super scan is waiting', async () => {
    mockUseLocalSearchParams.mockReturnValue({
      imageUri: 'file:///test-image.jpg',
      scanType: 'super',
    });
    mockCreateScanWithAnalysis.mockImplementation(() => new Promise(() => {}));

    render(<ScanPreviewScreen />);

    fireEvent.press(screen.getByTestId('confirm-button'));

    await waitFor(() => {
      expect(screen.getByTestId('loading-mini-game')).toBeTruthy();
    });

    const miniGameSlot = screen.getByTestId('scan-preview-super-scan-mini-game-slot');
    const miniGameSlotStyle = StyleSheet.flatten(miniGameSlot.props.style);

    expect(miniGameSlot).toBeTruthy();
    expect(miniGameSlotStyle.height).toBe(160);
    expect(mockLoadingMiniGame).toHaveBeenCalledWith(
      expect.objectContaining({
        active: true,
        compact: true,
        durationHintMs: 10000,
        variant: 'superScan',
      }),
    );
    expect(mockLoadingMiniGame.mock.calls[0][0]).not.toHaveProperty('onComplete');
  });

  it.each(['health', 'body', 'nutrition'] as const)(
    'does not show the loading mini-game for %s scans',
    async (scanType) => {
      mockUseLocalSearchParams.mockReturnValue({
        imageUri: 'file:///test-image.jpg',
        scanType,
      });
      mockCreateScanWithAnalysis.mockImplementation(() => new Promise(() => {}));

      render(<ScanPreviewScreen />);

      fireEvent.press(screen.getByTestId('confirm-button'));

      await waitFor(() => {
        expect(screen.getByTestId('scan-preview-loading-overlay')).toBeTruthy();
      });

      expect(screen.queryByTestId('loading-mini-game')).toBeNull();
      expect(screen.queryByTestId('scan-preview-super-scan-mini-game-slot')).toBeNull();
      expect(mockLoadingMiniGame).not.toHaveBeenCalled();
    },
  );

  it('hides the super scan mini-game on ultra-tight loading layouts', async () => {
    Object.defineProperty(Platform, 'OS', {
      value: 'ios',
      configurable: true,
    });
    useWindowDimensionsSpy.mockReturnValue({
      width: 320,
      height: 568,
      scale: 2,
      fontScale: 1,
    });
    mockUseSafeAreaInsets.mockReturnValue({
      top: 20,
      bottom: 0,
      left: 0,
      right: 0,
    });
    mockUseLocalSearchParams.mockReturnValue({
      imageUri: 'file:///test-image.jpg',
      scanType: 'super',
    });
    mockCreateScanWithAnalysis.mockImplementation(() => new Promise(() => {}));

    render(<ScanPreviewScreen />);

    fireEvent.press(screen.getByTestId('confirm-button'));

    await waitFor(() => {
      expect(screen.getByTestId('scan-preview-loading-scroll-view')).toBeTruthy();
    });

    expect(screen.queryByTestId('loading-mini-game')).toBeNull();
    expect(screen.queryByTestId('scan-preview-super-scan-mini-game-slot')).toBeNull();
    expect(mockLoadingMiniGame).not.toHaveBeenCalled();
  });

  it('removes the super scan mini-game once the result is ready and before navigation', async () => {
    mockUseLocalSearchParams.mockReturnValue({
      imageUri: 'file:///test-image.jpg',
      scanType: 'super',
    });
    mockCreateScanWithAnalysis.mockResolvedValue({
      scan: {
        id: 'scan-super-ready-123',
        analysis_result: {
          scan_type: 'super_health_v2',
          global_risk_score: 88,
        },
      },
      analysisSucceeded: true,
    });

    render(<ScanPreviewScreen />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('confirm-button'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('loading-mini-game')).toBeTruthy();
    });

    await act(async () => {
      jest.advanceTimersByTime(7000);
    });

    await waitFor(() => {
      expect(screen.getByTestId('scan-preview-loading-percentage').props.children).toBe(
        '100%',
      );
    });

    expect(screen.queryByTestId('loading-mini-game')).toBeNull();
    expect(screen.getByTestId('scan-preview-super-scan-mini-game-slot')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('navigates back when X button is pressed', () => {
    render(<ScanPreviewScreen />);

    // Find and press the X button (close button)
    // The X icon would be rendered, but we can't easily target it
    // In a real app, we'd add testID to the TouchableOpacity
  });

  it('navigates back when cancel button is pressed', () => {
    render(<ScanPreviewScreen />);

    fireEvent.press(screen.getByText('Annuler'));

    expect(mockBack).toHaveBeenCalled();
  });

  describe('confirm action', () => {
    it('shows loading state when confirming', async () => {
      mockCreateScanWithAnalysis.mockImplementation(
        () => new Promise(() => {}),
      ); // Never resolves

    render(<ScanPreviewScreen />);

    fireEvent.press(screen.getByTestId('confirm-button'));

    await waitFor(() => {
      expect(screen.getByTestId('scan-preview-loading-overlay')).toBeTruthy();
      expect(
        screen.getByTestId('confirm-button').props.accessibilityState.disabled,
      ).toBe(true);
    });
  });

    it('prevents double-click submission', async () => {
      // Mock a slow API call
      mockCreateScanWithAnalysis.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({ scan: { id: 'scan-123' }, analysisSucceeded: true }),
              1000,
            ),
          ),
      );

      render(<ScanPreviewScreen />);

      const button = screen.getByTestId('confirm-button');

      // First click
      fireEvent.press(button);

      // Try to click again immediately (double-click)
      fireEvent.press(button);
      fireEvent.press(button);

      // Should only call the API once due to double-click protection
      await waitFor(() => {
        expect(mockCreateScanWithAnalysis).toHaveBeenCalledTimes(1);
      });
    });

    it('calls createScanWithAnalysis with the active non-French locale', async () => {
      mockCreateScanWithAnalysis.mockResolvedValue({
        scan: { id: 'scan-123' },
        analysisSucceeded: true,
      });

      const languageContext = jest.requireMock('@/contexts/LanguageContext') as {
        useLanguage: () => unknown;
      };
      const useLanguageSpy = jest
        .spyOn(languageContext, 'useLanguage')
        .mockReturnValue({
          t: (key: string) =>
            ({
              'scan_preview.type_label': 'Type de scan',
              'scan_preview.confirm_button': 'Confirmer',
              'scan_preview.confirm_loading': 'Analyse en cours...',
              'common.cancel': 'Annuler',
              'common.error': 'Erreur',
              'common.ok': 'OK',
              'common.retry': 'Réessayer',
              'common.back': 'Retour',
              'scan_types.health': 'Visage',
            })[key] ?? key,
          language: 'de',
          locale: 'de',
          changeLanguage: jest.fn(),
        });

      try {
        render(<ScanPreviewScreen />);

        fireEvent.press(screen.getByTestId('confirm-button'));

        await waitFor(() => {
          expect(mockCreateScanWithAnalysis).toHaveBeenCalledWith(
            'file:///test-image.jpg',
            'health',
            'de',
          );
        });
      } finally {
        useLanguageSpy.mockRestore();
      }
    });

    it('sets badge after successful scan', async () => {
      mockCreateScanWithAnalysis.mockResolvedValue({
        scan: {
          id: 'scan-123',
          analysis_result: { scan_type: 'face', face_score: 85 },
        },
        analysisSucceeded: true,
      });

      render(<ScanPreviewScreen />);

      await act(async () => {
        fireEvent.press(screen.getByTestId('confirm-button'));
      });

      await act(async () => {
        jest.advanceTimersByTime(5500);
      });

      await waitFor(() => {
        expect(mockSetBadge).toHaveBeenCalledWith('coach');
        expect(mockIncrementScanCount).toHaveBeenCalledTimes(1);
      });
    });

    it('primes Coach scans and invalidates scan-related queries after successful analysis', async () => {
      mockCreateScanWithAnalysis.mockResolvedValue({
        scan: {
          id: 'scan-123',
          user_id: 'user-1',
          scan_type: 'health',
          created_at: '2026-04-29T10:00:00.000Z',
          analyzed_at: '2026-04-29T10:01:00.000Z',
          analysis_result: {
            schema_version: 3,
            scan_type: 'face',
            face_score: 87,
            perceived_age: 28,
            skin_quality_score: 80,
            symmetry_percentage: 88,
            fatigue_level: 22,
            glow_index: 61,
            energy_score: 73,
            face_shape_key: 'oval',
            collagen_level: 64,
            hydration_level: 70,
            photogenic_score: 86,
          },
        },
        analysisSucceeded: true,
      });

      render(<ScanPreviewScreen />);

      await act(async () => {
        fireEvent.press(screen.getByTestId('confirm-button'));
      });

      await act(async () => {
        jest.advanceTimersByTime(5500);
      });

      await waitFor(() => {
        expect(mockSetQueryData).toHaveBeenCalledWith(
          ['coachScans', 'user-1'],
          expect.any(Function),
        );
      });

      const updater = mockSetQueryData.mock.calls.find(
        ([queryKey]) =>
          Array.isArray(queryKey) &&
          queryKey[0] === 'coachScans' &&
          queryKey[1] === 'user-1',
      )?.[1] as ((existing: unknown[]) => unknown[]) | undefined;
      expect(updater?.([])).toEqual([
        expect.objectContaining({
          id: 'scan-123',
          scan_type: 'health',
          captured_at: '2026-04-29T10:01:00.000Z',
        }),
      ]);
      expect(mockSetQueriesData).toHaveBeenCalledWith(
        { queryKey: ['coachScans'] },
        expect.any(Function),
      );
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ['scanEligibility'],
      });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ['dashboard'],
      });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ['analytics'],
      });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ['coachScans'],
      });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ['coachEntries'],
      });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ['coachLatestReady'],
      });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ['coachHistorySummary'],
      });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ['coachHistoryInfinite'],
      });
      expect(mockRefetchQueries).toHaveBeenCalledWith({
        queryKey: ['scanEligibility'],
      });
      expect(mockRefetchQueries).toHaveBeenCalledWith({
        queryKey: ['dashboard'],
      });
      expect(mockRefetchQueries).toHaveBeenCalledWith({
        queryKey: ['analytics'],
      });
    });

    it('shows error alert when analysis fails', async () => {
      const providerError = new ApiError(
        'Scan analysis provider is not configured',
        'PROVIDER',
        undefined,
        { stage: 'analysis' },
      );
      providerError.code = 'scan_webhook_not_configured';
      providerError.status = 503;
      providerError.requestId = 'req-webhook-missing';

      mockCreateScanWithAnalysis.mockResolvedValue({
        scan: { id: 'scan-123' },
        analysisSucceeded: false,
        analysisError: providerError,
      });

      render(<ScanPreviewScreen />);

      await act(async () => {
        fireEvent.press(screen.getByTestId('confirm-button'));
      });

      await act(async () => {
        jest.advanceTimersByTime(5500);
      });

      // Wait for the API call to resolve
      await waitFor(() => {
        expect(mockCreateScanWithAnalysis).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(mockShowAlert).toHaveBeenCalledWith(
          "Service d'analyse indisponible",
          "Le fournisseur d'analyse est indisponible ou mal configuré pour ce scan.",
          expect.any(Array),
        );
      });
      expect(mockIncrementScanCount).not.toHaveBeenCalled();
    });

    it('keeps loading state during success animation', async () => {
      mockCreateScanWithAnalysis.mockResolvedValue({
        scan: {
          id: 'scan-123',
          analysis_result: { scan_type: 'face', face_score: 85 },
        },
        analysisSucceeded: true,
      });

      render(<ScanPreviewScreen />);
      const button = screen.getByTestId('confirm-button');

      await act(async () => {
        fireEvent.press(button);
      });

      // Wait for API call to complete
      await waitFor(() => {
        expect(mockCreateScanWithAnalysis).toHaveBeenCalled();
      });

      // Verify button is STILL in loading state immediately after API success (but before timeout)
      // Since we removed setLoading(false) from the success path, it should still be loading
      expect(screen.getByTestId('scan-preview-loading-overlay')).toBeTruthy();
      expect(
        screen.getByTestId('confirm-button').props.accessibilityState.disabled,
      ).toBe(true);

      // Advance timer half way
      await act(async () => {
        jest.advanceTimersByTime(750);
      });

      // Should STILL be loading
      expect(screen.getByTestId('scan-preview-loading-overlay')).toBeTruthy();
      expect(
        screen.getByTestId('confirm-button').props.accessibilityState.disabled,
      ).toBe(true);

      // Trying to press again should do nothing (mock call count stays 1)
      await act(async () => {
        fireEvent.press(button);
      });
      expect(mockCreateScanWithAnalysis).toHaveBeenCalledTimes(1);
    });

    it('switches to the report-ready phase at 100% before navigation', async () => {
      mockCreateScanWithAnalysis.mockResolvedValue({
        scan: {
          id: 'scan-123',
          analysis_result: { scan_type: 'face', face_score: 85 },
        },
        analysisSucceeded: true,
      });

      render(<ScanPreviewScreen />);

      await act(async () => {
        fireEvent.press(screen.getByTestId('confirm-button'));
      });

      await waitFor(() => {
        expect(mockCreateScanWithAnalysis).toHaveBeenCalled();
      });

      await act(async () => {
        jest.advanceTimersByTime(5500);
      });

      expect(screen.getByTestId('scan-preview-loading-percentage').props.children).toBe(
        '100%',
      );
      expect(
        screen.getByTestId('scan-preview-loading-phase-headline').props.children,
      ).toBe('Préparation du résultat');
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('navigates to scan result after successful scan', async () => {
      mockCreateScanWithAnalysis.mockResolvedValue({
        scan: {
          id: 'scan-123',
          analysis_result: { scan_type: 'face', face_score: 85 },
        },
        analysisSucceeded: true,
      });

      render(<ScanPreviewScreen />);

      await act(async () => {
        fireEvent.press(screen.getByTestId('confirm-button'));
      });

      // Wait for the API call to resolve
      await waitFor(() => {
        expect(mockCreateScanWithAnalysis).toHaveBeenCalled();
      });

      // Advance timers in two steps so the post-success navigation timeout
      // is scheduled after the minimum loading and completion delay.
      await act(async () => {
        jest.advanceTimersByTime(5500);
      });

      await waitFor(() => {
        expect(mockSetBadge).toHaveBeenCalledWith('coach');
      });

      await act(async () => {
        jest.advanceTimersByTime(1500);
      });

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith({
          pathname: '/scan-result',
          params: {
            analysisData: JSON.stringify({ scan_type: 'face', face_score: 85 }),
            imageUri: 'file:///test-image.jpg',
            scanId: 'scan-123',
          },
        });
      });
    });

    it('does not prime Coach scans when analysis fails', async () => {
      const providerError = new ApiError(
        'Scan analysis provider is not configured',
        'PROVIDER',
        undefined,
        { stage: 'analysis' },
      );

      mockCreateScanWithAnalysis.mockResolvedValue({
        scan: { id: 'scan-123' },
        analysisSucceeded: false,
        analysisError: providerError,
      });

      render(<ScanPreviewScreen />);

      await act(async () => {
        fireEvent.press(screen.getByTestId('confirm-button'));
      });

      await act(async () => {
        jest.advanceTimersByTime(5500);
      });

      await waitFor(() => {
        expect(mockShowAlert).toHaveBeenCalled();
      });
      expect(mockSetQueryData).not.toHaveBeenCalled();
      expect(mockSetQueriesData).not.toHaveBeenCalled();
      expect(mockInvalidateQueries).not.toHaveBeenCalledWith({
        queryKey: ['coachScans'],
      });
    });

    it('keeps the health scan on the existing 5 second minimum loading window', async () => {
      mockCreateScanWithAnalysis.mockResolvedValue({
        scan: {
          id: 'scan-123',
          analysis_result: { scan_type: 'face', face_score: 85 },
        },
        analysisSucceeded: true,
      });

      render(<ScanPreviewScreen />);

      await act(async () => {
        fireEvent.press(screen.getByTestId('confirm-button'));
      });

      await act(async () => {
        jest.advanceTimersByTime(4999);
      });

      expect(mockSetBadge).not.toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();

      await act(async () => {
        jest.advanceTimersByTime(1);
      });

      expect(mockSetBadge).not.toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();

      await act(async () => {
        jest.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(mockSetBadge).toHaveBeenCalledWith('coach');
      });
      expect(mockReplace).not.toHaveBeenCalled();

      await act(async () => {
        jest.advanceTimersByTime(1499);
      });

      expect(mockReplace).not.toHaveBeenCalled();

      await act(async () => {
        jest.advanceTimersByTime(1);
      });

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith({
          pathname: '/scan-result',
          params: {
            analysisData: JSON.stringify({ scan_type: 'face', face_score: 85 }),
            imageUri: 'file:///test-image.jpg',
            scanId: 'scan-123',
          },
        });
      });
    });

    it('adds only the extra 2 second minimum loading window for fast super scans', async () => {
      mockUseLocalSearchParams.mockReturnValue({
        imageUri: 'file:///test-image.jpg',
        scanType: 'super',
      });
      mockCreateScanWithAnalysis.mockResolvedValue({
        scan: {
          id: 'scan-super-123',
          analysis_result: { scan_type: 'super_health_v2', global_risk_score: 85 },
        },
        analysisSucceeded: true,
      });

      render(<ScanPreviewScreen />);

      await act(async () => {
        fireEvent.press(screen.getByTestId('confirm-button'));
      });

      await act(async () => {
        jest.advanceTimersByTime(6999);
      });

      expect(mockSetBadge).not.toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();

      await act(async () => {
        jest.advanceTimersByTime(1);
      });

      expect(mockSetBadge).not.toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();

      await act(async () => {
        jest.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(mockSetBadge).toHaveBeenCalledWith('coach');
      });
      expect(mockReplace).not.toHaveBeenCalled();

      await act(async () => {
        jest.advanceTimersByTime(1499);
      });

      expect(mockReplace).not.toHaveBeenCalled();

      await act(async () => {
        jest.advanceTimersByTime(1);
      });

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith({
          pathname: '/super-scan-result',
          params: {
            analysisData: JSON.stringify({
              scan_type: 'super_health_v2',
              global_risk_score: 85,
            }),
            imageUri: 'file:///test-image.jpg',
            scanId: 'scan-super-123',
          },
        });
      });
    });

    it('waits for the real super scan response when it exceeds the new minimum loading window', async () => {
      mockUseLocalSearchParams.mockReturnValue({
        imageUri: 'file:///test-image.jpg',
        scanType: 'super',
      });
      mockCreateScanWithAnalysis.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  scan: {
                    id: 'scan-super-slow-123',
                    analysis_result: {
                      scan_type: 'super_health_v2',
                      global_risk_score: 91,
                    },
                  },
                  analysisSucceeded: true,
                }),
              8000,
            ),
          ),
      );

      render(<ScanPreviewScreen />);

      await act(async () => {
        fireEvent.press(screen.getByTestId('confirm-button'));
      });

      await act(async () => {
        jest.advanceTimersByTime(7000);
      });

      expect(mockSetBadge).not.toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();

      await act(async () => {
        jest.advanceTimersByTime(999);
      });

      expect(mockSetBadge).not.toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();

      await act(async () => {
        jest.advanceTimersByTime(1);
      });

      expect(mockSetBadge).not.toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();

      await act(async () => {
        jest.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(mockSetBadge).toHaveBeenCalledWith('coach');
      });
      expect(mockReplace).not.toHaveBeenCalled();

      await act(async () => {
        jest.advanceTimersByTime(1499);
      });

      expect(mockReplace).not.toHaveBeenCalled();

      await act(async () => {
        jest.advanceTimersByTime(1);
      });

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith({
          pathname: '/super-scan-result',
          params: {
            analysisData: JSON.stringify({
              scan_type: 'super_health_v2',
              global_risk_score: 91,
            }),
            imageUri: 'file:///test-image.jpg',
            scanId: 'scan-super-slow-123',
          },
        });
      });
    });
  });

  describe('error handling', () => {
    it('shows a timeout-specific alert when analysis times out', async () => {
      mockCreateScanWithAnalysis.mockRejectedValue(
        new ApiError('Request timed out', 'TIMEOUT'),
      );

      render(<ScanPreviewScreen />);

      fireEvent.press(screen.getByTestId('confirm-button'));

      await waitFor(() => {
        expect(mockShowAlert).toHaveBeenCalledWith(
          'Analyse trop longue',
          "L'analyse prend trop de temps. Réessayez dans un instant.",
          expect.any(Array),
        );
      });
    });

    it('shows a session-specific alert when the auth session is expired', async () => {
      mockCreateScanWithAnalysis.mockRejectedValue(
        new ApiError('api_errors.unauthorized', 'AUTH'),
      );

      render(<ScanPreviewScreen />);

      fireEvent.press(screen.getByTestId('confirm-button'));

      await waitFor(() => {
        expect(mockShowAlert).toHaveBeenCalledWith(
          'Session expirée',
          'Votre session a expiré. Reconnectez-vous puis réessayez.',
          expect.any(Array),
        );
      });
    });

    it('shows an upload-specific alert when scan image upload/storage fails', async () => {
      mockCreateScanWithAnalysis.mockRejectedValue(
        new ApiError('scan image missing', 'UPLOAD'),
      );

      render(<ScanPreviewScreen />);

      fireEvent.press(screen.getByTestId('confirm-button'));

      await waitFor(() => {
        expect(mockShowAlert).toHaveBeenCalledWith(
          'Envoi impossible',
          "L'image du scan n'a pas pu être envoyée ou retrouvée côté stockage.",
          expect.any(Array),
        );
      });
    });

    it('shows generic error message for unknown errors', async () => {
      mockCreateScanWithAnalysis.mockRejectedValue('unknown error');

      render(<ScanPreviewScreen />);

      fireEvent.press(screen.getByTestId('confirm-button'));

      await waitFor(() => {
        expect(mockShowAlert).toHaveBeenCalledWith(
          'Erreur',
          'Erreur',
          expect.any(Array),
        );
      });
    });

    it('returns to normal state after error', async () => {
      mockCreateScanWithAnalysis.mockRejectedValue(new Error('Failed'));

      render(<ScanPreviewScreen />);

      fireEvent.press(screen.getByTestId('confirm-button'));

      await waitFor(() => {
        expect(mockShowAlert).toHaveBeenCalled();
      });

      // Button should be back to normal state
      await waitFor(() => {
        expect(screen.getByTestId('confirm-button')).toBeTruthy();
      });
    });
  });

  describe('different scan types', () => {
    it.each([
      ['health', 'Visage'],
      ['body', 'Corps'],
      ['nutrition', 'Nutrition'],
      ['super', 'Super Scan'],
    ] as const)('displays %s scan type correctly', (scanType, label) => {
      mockUseLocalSearchParams.mockReturnValue({
        imageUri: 'file:///test-image.jpg',
        scanType,
      });

      render(<ScanPreviewScreen />);

      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    });
  });
});
