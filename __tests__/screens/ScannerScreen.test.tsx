import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert, Platform, StyleSheet } from 'react-native';
import ScannerScreen from '@/screens/ScannerScreen';
import { paywallSession } from '@/utils/paywallSession';
import { ApiError } from '@/services/api';
import { SPACING } from '@/constants/theme';

// Mock expo-camera
const mockUseCameraPermissions = jest.fn();
const mockTakePictureAsync = jest.fn();
const mockCameraViewProps: { current: Record<string, any> | null } = { current: null };
const mockCameraGuideProps: { current: Record<string, any> | null } = { current: null };
const mockManipulateAsync = jest.fn();
const mockShowAlert = jest.fn();
const mockScheduleSuperScanReset = jest.fn();
const mockNextScanTimerProps: any[] = [];
const mockUseSafeAreaInsets = jest.fn(() => ({ top: 0, bottom: 0, left: 0, right: 0 }));
jest.mock('expo-camera', () => ({
  CameraView: (() => {
    const React = require('react');
    const { View } = require('react-native');

    const MockCameraView = React.forwardRef((props: any, ref: any) => {
      mockCameraViewProps.current = props;
      React.useImperativeHandle(ref, () => ({
        takePictureAsync: mockTakePictureAsync,
      }));

      return React.createElement(View, { testID: 'mock-camera-view' });
    });

    MockCameraView.displayName = 'MockCameraView';
    return MockCameraView;
  })(),
  CameraType: {},
  useCameraPermissions: () => mockUseCameraPermissions(),
}));

// Mock expo-image-picker
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
}));

// Mock expo-image-manipulator
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: (...args: any[]) => mockManipulateAsync(...args),
  FlipType: {
    Horizontal: 'horizontal',
    Vertical: 'vertical',
  },
  SaveFormat: {
    JPEG: 'jpeg',
    PNG: 'png',
    WEBP: 'webp',
  },
}));

// Mock expo-router
const mockPush = jest.fn();
let latestFocusEffectCallback: (() => void) | undefined;
const mockUseFocusEffect = jest.fn((callback: () => void) => {
  latestFocusEffectCallback = callback;
});
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    back: jest.fn(),
  }),
  useFocusEffect: (callback: () => void) => mockUseFocusEffect(callback),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => mockUseSafeAreaInsets(),
}));

// Mock lucide-react-native icons
jest.mock('lucide-react-native', () => ({
  Camera: 'Camera',
  FlipHorizontal: 'FlipHorizontal',
  Image: 'Image',
  Crown: 'Crown',
  Gift: 'Gift',
  WifiOff: 'WifiOff',
  RefreshCw: 'RefreshCw',
  RefreshCcw: 'RefreshCcw',
  Compass: 'Compass',
  ShieldCheck: 'ShieldCheck',
  Sparkles: 'Sparkles',
  X: 'X',
  Check: 'Check',
}));

// Mock useAuth
const mockUserProfile = jest.fn();
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    userProfile: mockUserProfile(),
  }),
}));

jest.mock('@/hooks/useCustomAlert', () => ({
  useCustomAlert: () => ({
    showAlert: mockShowAlert,
    alertElement: null,
  }),
}));

// Mock NotificationContext
jest.mock('@/contexts/NotificationContext', () => ({
  useNotificationContext: () => ({
    unreadCount: 0,
    notifications: [],
    markAsRead: jest.fn(),
    refreshNotifications: jest.fn(),
    scheduleSuperScanReset: mockScheduleSuperScanReset,
  }),
}));

// Mock useAllScanEligibility hook (shared scan eligibility state)
const mockScanEligibilityData = jest.fn();
const mockScanEligibilityErrors = jest.fn();
const mockScanEligibilityLoadingByType = jest.fn();
const mockEligibilityLoading = jest.fn();
const mockHasConnectivityError = jest.fn();
const mockHasBlockingEligibilityError = jest.fn();
const mockIsAuthReady = jest.fn();
const mockCanQueryEligibility = jest.fn();
const mockRefetchAll = jest.fn();
const mockRefetchScanType = jest.fn();
jest.mock('@/hooks/queries', () => ({
  useAllScanEligibility: () => ({
    data: mockScanEligibilityData(),
    errors: mockScanEligibilityErrors(),
    loadingByScanType: mockScanEligibilityLoadingByType(),
    isLoading: mockEligibilityLoading(),
    isError: Object.keys(mockScanEligibilityErrors() || {}).length > 0,
    isAuthReady: mockIsAuthReady(),
    canQuery: mockCanQueryEligibility(),
    hasConnectivityError: mockHasConnectivityError(),
    hasBlockingEligibilityError: mockHasBlockingEligibilityError(),
    refetchAll: mockRefetchAll,
    refetchScanType: mockRefetchScanType,
  }),
}));

// Mock components
jest.mock('@/components/Button', () => ({
  Button: ({ title, onPress, disabled }: any) => {
    const { TouchableOpacity, Text } = require('react-native');
    return (
      <TouchableOpacity onPress={onPress} disabled={disabled} testID="button">
        <Text>{title}</Text>
      </TouchableOpacity>
    );
  },
}));

jest.mock('@/components/LoadingSpinner', () => ({
  LoadingSpinner: () => {
    const { View, Text } = require('react-native');
    return <View testID="loading-spinner"><Text>Loading...</Text></View>;
  },
}));

jest.mock('@/components/CameraGuide', () => ({
  CameraGuide: (props: any) => {
    const { View } = require('react-native');
    mockCameraGuideProps.current = props;

    return <View testID="mock-camera-guide" />;
  },
}));

jest.mock('@/components/ContextualPaywall', () => ({
  ContextualPaywall: ({ visible, title, subtitle, description }: any) => {
    if (!visible) {
      return null;
    }

    const { View, Text } = require('react-native');

    return (
      <View testID="contextual-paywall">
        <Text>{title}</Text>
        {subtitle ? <Text>{subtitle}</Text> : null}
        {description ? <Text>{description}</Text> : null}
      </View>
    );
  },
}));

jest.mock('@/components/NextScanTimer', () => ({
  NextScanTimer: (props: any) => {
    const { Text } = require('react-native');
    mockNextScanTimerProps.push(props);
    const compactTime = props.padHours ? '05h 42m' : '23h 59m';
    const chipCompactTime = '23h59';
    return (
      <Text testID="next-scan-timer">
        {props.mode === 'scannerChipCompact'
          ? chipCompactTime
          : props.mode === 'scannerCompact'
          ? `${props.scanLabel ? `${props.scanLabel} ` : ''}${compactTime}`
          : `${props.scanLabel || 'Timer'} default`}
      </Text>
    );
  },
}));

// Mock Alert
const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => { });
const originalPlatform = Platform.OS;
const reactNativeModule =
  jest.requireActual<typeof import('react-native')>('react-native');
const useWindowDimensionsSpy = jest.spyOn(
  reactNativeModule,
  'useWindowDimensions',
);

describe('ScannerScreen', () => {
  const defaultEligibility = {
    allowed: true,
    current_count: 0,
    limit: 1,
    welcome_credits: 0,
    message: 'Scan disponible',
  };

  beforeEach(() => {
    jest.clearAllMocks();
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
    mockUseSafeAreaInsets.mockReturnValue({ top: 0, bottom: 0, left: 0, right: 0 });
    paywallSession.reset();
    mockTakePictureAsync.mockResolvedValue({ uri: 'file:///captured-photo.jpg' });
    mockManipulateAsync.mockResolvedValue({ uri: 'file:///mirrored-photo.jpg', width: 100, height: 200 });
    mockCameraViewProps.current = null;
    mockCameraGuideProps.current = null;
    mockNextScanTimerProps.length = 0;
    latestFocusEffectCallback = undefined;
    mockUserProfile.mockReturnValue({ account_tier: 'free' });
    mockScheduleSuperScanReset.mockResolvedValue(undefined);
    // Mock all scan types with default eligibility
    mockScanEligibilityData.mockReturnValue({
      body: defaultEligibility,
      health: defaultEligibility,
      nutrition: defaultEligibility,
      super: defaultEligibility,
    });
    mockScanEligibilityErrors.mockReturnValue({});
    mockScanEligibilityLoadingByType.mockReturnValue({
      body: false,
      health: false,
      nutrition: false,
      super: false,
    });
    mockEligibilityLoading.mockReturnValue(false);
    mockHasConnectivityError.mockReturnValue(false);
    mockHasBlockingEligibilityError.mockReturnValue(false);
    mockIsAuthReady.mockReturnValue(true);
    mockCanQueryEligibility.mockReturnValue(true);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('camera permissions', () => {
    it('shows loading spinner when permission is undefined', async () => {
      mockUseCameraPermissions.mockReturnValue([undefined, jest.fn()]);

      render(<ScannerScreen />);

      expect(screen.getByTestId('loading-spinner')).toBeTruthy();
    });

    it('shows permission request UI when not granted', async () => {
      mockUseCameraPermissions.mockReturnValue([
        { granted: false },
        jest.fn(),
      ]);

      render(<ScannerScreen />);

      // Wait for the eligibility check to complete (sets loading to false)
      await waitFor(() => {
        expect(screen.getByText(/Nous avons besoin d'acc/)).toBeTruthy();
      });
      expect(screen.getByText('Autoriser')).toBeTruthy();
    });

    it('calls requestPermission when Autoriser button is pressed', async () => {
      const mockRequestPermission = jest.fn();
      mockUseCameraPermissions.mockReturnValue([
        { granted: false },
        mockRequestPermission,
      ]);

      render(<ScannerScreen />);

      await waitFor(() => {
        expect(screen.getByText('Autoriser')).toBeTruthy();
      });

      fireEvent.press(screen.getByText('Autoriser'));

      expect(mockRequestPermission).toHaveBeenCalled();
    });
  });

  describe('scan type selection', () => {
    beforeEach(() => {
      mockUseCameraPermissions.mockReturnValue([
        { granted: true },
        jest.fn(),
      ]);
    });

    it('renders all scan type buttons', async () => {
      render(<ScannerScreen />);

      await waitFor(() => {
        expect(screen.getByText(/Visage/)).toBeTruthy();
        expect(screen.getByText('Corps')).toBeTruthy();
        expect(screen.getByText('Nutrition')).toBeTruthy();
      });
    });

    it('disables scan type buttons when limit is reached', async () => {
      const limitReachedEligibility = {
        allowed: false,
        current_count: 1,
        limit: 1,
        welcome_credits: 0,
        next_available_date: Date.now() + 86400000,
        message: 'Limite atteinte',
      };
      mockScanEligibilityData.mockReturnValue({
        body: limitReachedEligibility,
        health: limitReachedEligibility,
        nutrition: limitReachedEligibility,
        super: limitReachedEligibility,
      });

      render(<ScannerScreen />);

      await waitFor(() => {
        expect(screen.getByText(/Visage/)).toBeTruthy();
      });

      // Button should be disabled when allowed is false and no welcome credits
      // Pressing a disabled button doesn't trigger the handler
      fireEvent.press(screen.getByText(/Visage/));

      // No alert is expected because the button is disabled
      expect(alertSpy).not.toHaveBeenCalled();
    });

    it('renders the unavailable timer inline inside the scan box and removes the old limit label', async () => {
      const limitReachedEligibility = {
        allowed: false,
        current_count: 1,
        limit: 1,
        welcome_credits: 0,
        next_available_date: Date.now() + 86400000,
        message: 'Limite atteinte',
      };
      mockScanEligibilityData.mockReturnValue({
        body: defaultEligibility,
        health: limitReachedEligibility,
        nutrition: defaultEligibility,
        super: defaultEligibility,
      });

      render(<ScannerScreen />);

      await waitFor(() => {
        expect(screen.getByText(/Visage/)).toBeTruthy();
      });

      expect(screen.getByText('23h59')).toBeTruthy();
      expect(screen.queryByText(/Recharge dans/)).toBeNull();
      expect(screen.getByText('0/1')).toBeTruthy();
      expect(screen.queryByText('scan_limits.week_1')).toBeNull();
    });

    it('shows the recharge timer on a premium 2/3 quota while keeping the card selectable', async () => {
      mockUserProfile.mockReturnValue({ account_tier: 'premium' });
      const partialPremiumEligibility = {
        allowed: true,
        current_count: 1,
        limit: 3,
        remaining: 2,
        welcome_credits: 0,
        next_recharge_at: Date.now() + 23 * 60 * 60 * 1000,
        message: 'Scan disponible',
      };
      mockScanEligibilityData.mockReturnValue({
        body: defaultEligibility,
        health: partialPremiumEligibility,
        nutrition: defaultEligibility,
        super: { ...defaultEligibility, limit: 1 },
      });

      render(<ScannerScreen />);

      await waitFor(() => {
        expect(screen.getByText('2/3')).toBeTruthy();
      });

      expect(screen.getByText('23h59')).toBeTruthy();
      expect(screen.queryByText(/Recharge dans|\+1 dans/)).toBeNull();
      fireEvent.press(screen.getByText(/Visage/));
      expect(mockShowAlert).not.toHaveBeenCalled();
    });

    it('shows the recharge timer on a premium 1/3 quota', async () => {
      mockUserProfile.mockReturnValue({ account_tier: 'premium' });
      const partialPremiumEligibility = {
        allowed: true,
        current_count: 2,
        limit: 3,
        remaining: 1,
        welcome_credits: 0,
        next_recharge_at: Date.now() + 15 * 60 * 60 * 1000,
        message: 'Scan disponible',
      };
      mockScanEligibilityData.mockReturnValue({
        body: defaultEligibility,
        health: defaultEligibility,
        nutrition: partialPremiumEligibility,
        super: { ...defaultEligibility, limit: 1 },
      });

      render(<ScannerScreen />);

      await waitFor(() => {
        expect(screen.getByText('1/3')).toBeTruthy();
      });

      expect(screen.getByText('23h59')).toBeTruthy();
      expect(screen.queryByText(/Recharge dans|\+1 dans/)).toBeNull();
    });

    it('shows the recharge timer on a premium exhausted 0/3 quota', async () => {
      mockUserProfile.mockReturnValue({ account_tier: 'premium' });
      const exhaustedPremiumEligibility = {
        allowed: false,
        current_count: 3,
        limit: 3,
        remaining: 0,
        welcome_credits: 0,
        next_available_date: Date.now() + 10 * 60 * 60 * 1000,
        next_recharge_at: Date.now() + 10 * 60 * 60 * 1000,
        message: 'Limite atteinte',
      };
      mockScanEligibilityData.mockReturnValue({
        body: exhaustedPremiumEligibility,
        health: defaultEligibility,
        nutrition: defaultEligibility,
        super: { ...defaultEligibility, limit: 1 },
      });

      render(<ScannerScreen />);

      await waitFor(() => {
        expect(screen.getByText('0/3')).toBeTruthy();
      });

      expect(screen.getByText('23h59')).toBeTruthy();
      expect(screen.queryByText(/Recharge dans|\+1 dans/)).toBeNull();
    });

    it('shows the recharge timer on exhausted premium Super Scan 0/1', async () => {
      mockUserProfile.mockReturnValue({ account_tier: 'premium' });
      const exhaustedSuperEligibility = {
        allowed: false,
        current_count: 1,
        limit: 1,
        remaining: 0,
        welcome_credits: 0,
        next_available_date: Date.now() + 10 * 60 * 60 * 1000,
        next_recharge_at: Date.now() + 10 * 60 * 60 * 1000,
        message: 'Limite atteinte',
      };
      mockScanEligibilityData.mockReturnValue({
        body: defaultEligibility,
        health: defaultEligibility,
        nutrition: defaultEligibility,
        super: exhaustedSuperEligibility,
      });

      render(<ScannerScreen />);

      await waitFor(() => {
        expect(screen.getByText('0/1')).toBeTruthy();
      });

      expect(screen.getByText('23h59')).toBeTruthy();
      expect(screen.queryByText(/Recharge dans/)).toBeNull();
    });

    it('refetches on timer completion without locally allowing a blocked scan', async () => {
      const nextRechargeAt = Date.now() + 1000;
      const limitReachedEligibility = {
        allowed: false,
        current_count: 1,
        limit: 1,
        remaining: 0,
        welcome_credits: 0,
        next_available_date: nextRechargeAt,
        next_recharge_at: nextRechargeAt,
        message: 'Limite atteinte',
      };
      mockScanEligibilityData.mockReturnValue({
        body: defaultEligibility,
        health: limitReachedEligibility,
        nutrition: defaultEligibility,
        super: defaultEligibility,
      });

      render(<ScannerScreen />);

      await waitFor(() => {
        expect(screen.getByText('23h59')).toBeTruthy();
      });

      await act(async () => {
        mockNextScanTimerProps[0].onTimerComplete();
        await Promise.resolve();
      });

      expect(mockRefetchScanType).toHaveBeenCalledWith('health');
      expect(mockRefetchAll).not.toHaveBeenCalled();

      fireEvent.press(screen.getByText(/Visage/));
      fireEvent.press(screen.getByTestId('scanner-capture-button'));

      expect(mockTakePictureAsync).not.toHaveBeenCalled();
      expect(mockShowAlert).toHaveBeenCalledWith(
        'Type de scan requis',
        'Veuillez sélectionner un type de scan.',
        undefined,
        undefined,
        expect.objectContaining({ variant: 'info' })
      );
    });

    it('shows the full free daily quota when a scan is available', async () => {
      render(<ScannerScreen />);

      await waitFor(() => {
        const countElements = screen.getAllByText('1/1');
        expect(countElements.length).toBeGreaterThan(0);
      });

      expect(screen.queryByTestId('next-scan-timer')).toBeNull();
    });

    it('shows premium 3/3 without a recharge timer when the quota is full', async () => {
      mockUserProfile.mockReturnValue({ account_tier: 'premium' });
      const fullPremiumEligibility = {
        allowed: true,
        current_count: 0,
        limit: 3,
        available: 3,
        welcome_credits: 0,
        message: 'Scan disponible',
      };
      mockScanEligibilityData.mockReturnValue({
        body: fullPremiumEligibility,
        health: fullPremiumEligibility,
        nutrition: fullPremiumEligibility,
        super: { ...defaultEligibility, limit: 1, available: 1 },
      });

      render(<ScannerScreen />);

      await waitFor(() => {
        const countElements = screen.getAllByText('3/3');
        expect(countElements.length).toBeGreaterThan(0);
      });

      expect(screen.queryByTestId('next-scan-timer')).toBeNull();
    });

    it('renders admin quotas numerically and never falls back to infinity', async () => {
      mockUserProfile.mockReturnValue({ account_tier: 'admin' });
      const adminEligibility = {
        allowed: true,
        current_count: 0,
        limit: 20,
        remaining: 20,
        welcome_credits: 0,
        message: 'Admin',
      };
      mockScanEligibilityData.mockReturnValue({
        body: adminEligibility,
        health: adminEligibility,
        nutrition: adminEligibility,
        super: adminEligibility,
      });

      render(<ScannerScreen />);

      await waitFor(() => {
        const countElements = screen.getAllByText('20/20');
        expect(countElements.length).toBeGreaterThan(0);
      });

      expect(screen.queryByText('\u221E')).toBeNull();
      expect(screen.queryByText('...')).toBeNull();
    });

    it('resolves legacy French limit messages without exposing missing translation fallbacks', async () => {
      paywallSession.markPaywallShown();

      const legacyDailyLimit = {
        allowed: false,
        current_count: 1,
        limit: 1,
        welcome_credits: 0,
        next_available_date: Date.now() + 23 * 60 * 60 * 1000 + 60 * 1000,
        message: 'Limite quotidienne atteinte (1 scan). Prochain scan disponible dans',
      };
      mockScanEligibilityData.mockReturnValue({
        body: legacyDailyLimit,
        health: defaultEligibility,
        nutrition: defaultEligibility,
        super: defaultEligibility,
      });

      render(<ScannerScreen />);

      await waitFor(() => {
        expect(screen.getByText('Corps')).toBeTruthy();
      });

      fireEvent.press(screen.getByText('Corps'));

      await waitFor(() => {
        expect(mockShowAlert).toHaveBeenCalled();
      });

      const alertBody = mockShowAlert.mock.calls.at(-1)?.[1];

      expect(alertBody).toContain('Limite quotidienne atteinte (1 scan). Prochain scan disponible dans 23 heures');
      expect(alertBody).toContain('Passez en Premium pour scanner sans limite');
      expect(alertBody).not.toContain('[missing');
    });

    it('uses message_key interpolation for the paywall title and subtitle when a limit is reached', async () => {
      const keyedDailyLimit = {
        allowed: false,
        current_count: 1,
        limit: 1,
        welcome_credits: 0,
        next_available_date: Date.now() + 23 * 60 * 60 * 1000 + 60 * 1000,
        message: 'Limite quotidienne atteinte (1 scan). Prochain scan disponible dans',
        message_key: 'scan_limits.msg_daily_reached_1_with_time',
      };
      mockScanEligibilityData.mockReturnValue({
        body: defaultEligibility,
        health: keyedDailyLimit,
        nutrition: defaultEligibility,
        super: defaultEligibility,
      });

      render(<ScannerScreen />);

      await waitFor(() => {
        expect(screen.getByText(/Visage/)).toBeTruthy();
      });

      fireEvent.press(screen.getByText(/Visage/));

      await waitFor(() => {
        expect(screen.getByTestId('contextual-paywall')).toBeTruthy();
      });

      expect(screen.getByText('Votre prochain scan est disponible dans 23 heures')).toBeTruthy();
      expect(screen.getByText('Passez en Premium pour scanner sans limite')).toBeTruthy();
    });
  });

  describe('welcome credits', () => {
    beforeEach(() => {
      mockUseCameraPermissions.mockReturnValue([
        { granted: true },
        jest.fn(),
      ]);
    });

    it('shows welcome credits banner when available', async () => {
      const withWelcomeCredits = {
        allowed: true,
        current_count: 0,
        limit: 1,
        welcome_credits: 1,
      };
      mockScanEligibilityData.mockReturnValue({
        body: withWelcomeCredits,
        health: withWelcomeCredits,
        nutrition: withWelcomeCredits,
        super: withWelcomeCredits,
      });

      render(<ScannerScreen />);

      await waitFor(() => {
        expect(screen.getAllByTestId('welcome-gift').length).toBeGreaterThan(0);
      });
    });

    it('allows scan selection with welcome credits even if not otherwise allowed', async () => {
      const notAllowedButWithCredits = {
        allowed: false,
        current_count: 1,
        limit: 1,
        welcome_credits: 1,
      };
      mockScanEligibilityData.mockReturnValue({
        body: notAllowedButWithCredits,
        health: notAllowedButWithCredits,
        nutrition: notAllowedButWithCredits,
        super: notAllowedButWithCredits,
      });

      render(<ScannerScreen />);

      await waitFor(() => {
        expect(screen.getByText(/Visage/)).toBeTruthy();
      });

      fireEvent.press(screen.getByText(/Visage/));

      // Should not show alert because welcome credits are available
      expect(alertSpy).not.toHaveBeenCalled();
    });
  });



  describe('capture actions', () => {
    beforeEach(() => {
      mockUseCameraPermissions.mockReturnValue([
        { granted: true },
        jest.fn(),
      ]);
    });

    it('passes mirror false to CameraView', async () => {
      render(<ScannerScreen />);

      await waitFor(() => {
        expect(screen.getByTestId('mock-camera-view')).toBeTruthy();
      });

      expect(mockCameraViewProps.current?.mirror).toBe(false);
      expect(mockCameraViewProps.current?.facing).toBe('back');
    });

    it('renders a passive single guide overlay when a scan type is selected', async () => {
      render(<ScannerScreen />);

      await waitFor(() => {
        expect(screen.getByText(/Visage/)).toBeTruthy();
      });

      fireEvent.press(screen.getByText(/Visage/));

      expect(mockCameraGuideProps.current).toEqual(
        expect.objectContaining({
          scanType: 'health',
          visible: true,
        })
      );
      expect(screen.getByTestId('scanner-focus-overlay').props.pointerEvents).toBe('none');
    });

    it('shows alert when trying to capture without selecting scan type', async () => {
      render(<ScannerScreen />);

      await waitFor(() => {
        expect(screen.getByText(/Visage/)).toBeTruthy();
      });

      fireEvent.press(screen.getByTestId('scanner-capture-button'));

      expect(mockShowAlert).toHaveBeenCalledWith(
        'Type de scan requis',
        'Veuillez sélectionner un type de scan.',
        undefined,
        undefined,
        expect.objectContaining({ variant: 'info' })
      );
    });

    it('checks eligibility before proceeding with scan', async () => {
      // Default eligibility is already set in beforeEach
      render(<ScannerScreen />);

      await waitFor(() => {
        expect(screen.getByText(/Visage/)).toBeTruthy();
      });

      // Select a scan type
      fireEvent.press(screen.getByText(/Visage/));

      // Eligibility data is already loaded from the hook mock
      // The scan type should be selectable
      expect(alertSpy).not.toHaveBeenCalled();
    });

    it('allows selecting scan type when eligibility check passes', async () => {
      // Default eligibility is already set in beforeEach
      render(<ScannerScreen />);

      await waitFor(() => {
        expect(screen.getByText(/Visage/)).toBeTruthy();
      });

      // Select a scan type - should work without showing an alert
      fireEvent.press(screen.getByText(/Visage/));

      // No alert should be shown for an allowed scan type
      expect(alertSpy).not.toHaveBeenCalled();
    });

    it('allows scan when welcome credits are available', async () => {
      const withWelcomeCredits = {
        allowed: false,
        current_count: 1,
        limit: 1,
        welcome_credits: 1,
      };
      mockScanEligibilityData.mockReturnValue({
        body: withWelcomeCredits,
        health: withWelcomeCredits,
        nutrition: withWelcomeCredits,
        super: withWelcomeCredits,
      });

      render(<ScannerScreen />);

      await waitFor(() => {
        expect(screen.getByText(/Visage/)).toBeTruthy();
      });

      // Select scan type - should work because of welcome credits
      fireEvent.press(screen.getByText(/Visage/));

      // Should NOT show limit alert
      expect(alertSpy).not.toHaveBeenCalledWith(
        'Limite atteinte',
        expect.any(String),
        expect.any(Array)
      );
    });

    it('captures immediately and opens the preview on the back camera', async () => {
      const Haptics = require('expo-haptics');

      render(<ScannerScreen />);

      await waitFor(() => {
        expect(screen.getByText(/Visage/)).toBeTruthy();
      });

      fireEvent.press(screen.getByText(/Visage/));
      await act(async () => {
        fireEvent.press(screen.getByTestId('scanner-capture-button'));
        await Promise.resolve();
      });

      expect(screen.queryByText('Analyse biometrique en cours...')).toBeNull();

      await waitFor(() => {
        expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
        expect(mockTakePictureAsync).toHaveBeenCalled();
      });

      const captureOptions = mockTakePictureAsync.mock.calls[0][0];
      expect(captureOptions).toEqual({ quality: 1 });
      expect(captureOptions.skipProcessing).toBeUndefined();
      expect(mockManipulateAsync).not.toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/scan-preview',
        params: {
          imageUri: 'file:///captured-photo.jpg',
          scanType: 'health',
        },
      });
    });

    it('flips the captured image on the front camera before opening the preview', async () => {
      mockTakePictureAsync.mockResolvedValue({ uri: 'file:///front-camera-photo.jpg' });
      mockManipulateAsync.mockResolvedValue({ uri: 'file:///front-camera-photo-fixed.jpg', width: 100, height: 200 });

      render(<ScannerScreen />);

      await waitFor(() => {
        expect(screen.getByTestId('scanner-flip-camera-button')).toBeTruthy();
      });

      fireEvent.press(screen.getByTestId('scanner-flip-camera-button'));

      await waitFor(() => {
        expect(mockCameraViewProps.current?.facing).toBe('front');
      });

      expect(mockCameraViewProps.current?.mirror).toBe(false);

      fireEvent.press(screen.getByText(/Visage/));
      await act(async () => {
        fireEvent.press(screen.getByTestId('scanner-capture-button'));
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(mockManipulateAsync).toHaveBeenCalledWith(
          'file:///front-camera-photo.jpg',
          [{ flip: 'horizontal' }],
          {
            compress: 1,
            format: 'jpeg',
          }
        );
        expect(mockPush).toHaveBeenCalledWith({
          pathname: '/scan-preview',
          params: {
            imageUri: 'file:///front-camera-photo-fixed.jpg',
            scanType: 'health',
          },
        });
      });
    });

    it('stays on the scanner and shows the existing photo error when front camera normalization fails', async () => {
      mockTakePictureAsync.mockResolvedValue({ uri: 'file:///front-camera-photo.jpg' });
      mockManipulateAsync.mockRejectedValue(new Error('flip failed'));

      render(<ScannerScreen />);

      await waitFor(() => {
        expect(screen.getByTestId('scanner-flip-camera-button')).toBeTruthy();
      });

      fireEvent.press(screen.getByTestId('scanner-flip-camera-button'));
      fireEvent.press(screen.getByText(/Visage/));
      await act(async () => {
        fireEvent.press(screen.getByTestId('scanner-capture-button'));
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(mockManipulateAsync).toHaveBeenCalled();
      });

      expect(mockPush).not.toHaveBeenCalled();
      expect(mockShowAlert).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        undefined,
        undefined,
        expect.objectContaining({ variant: 'warning' })
      );
    });
  });

  describe('image picker', () => {
    beforeEach(() => {
      mockUseCameraPermissions.mockReturnValue([
        { granted: true },
        jest.fn(),
      ]);
    });

    it('requires scan type selection before picking image', async () => {
      const ImagePicker = require('expo-image-picker');

      render(<ScannerScreen />);

      await waitFor(() => {
        expect(screen.getByText(/Visage/)).toBeTruthy();
      });

      // Image picker should not be called without scan type selection
      expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
    });

    it('does not flip images coming from the gallery', async () => {
      const ImagePicker = require('expo-image-picker');
      ImagePicker.launchImageLibraryAsync.mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///gallery-photo.jpg' }],
      });

      render(<ScannerScreen />);

      await waitFor(() => {
        expect(screen.getByText(/Visage/)).toBeTruthy();
      });

      fireEvent.press(screen.getByText(/Visage/));
      fireEvent.press(screen.getByTestId('scanner-gallery-button'));

      await waitFor(() => {
        expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalled();
      });

      expect(mockManipulateAsync).not.toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/scan-preview',
        params: {
          imageUri: 'file:///gallery-photo.jpg',
          scanType: 'health',
        },
      });
    });

    it('schedules the Super Scan reset once when gallery is tapped rapidly', async () => {
      const ImagePicker = require('expo-image-picker');
      let resolvePicker: ((value: { canceled: boolean; assets: Array<{ uri: string }> }) => void) | null = null;
      ImagePicker.launchImageLibraryAsync.mockReturnValue(
        new Promise((resolve) => {
          resolvePicker = resolve;
        })
      );

      render(<ScannerScreen />);

      await waitFor(() => {
        expect(screen.getByText('Super')).toBeTruthy();
      });

      fireEvent.press(screen.getByText('Super'));

      fireEvent.press(screen.getByTestId('scanner-gallery-button'));
      fireEvent.press(screen.getByTestId('scanner-gallery-button'));

      expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolvePicker?.({
          canceled: false,
          assets: [{ uri: 'file:///super-gallery-photo.jpg' }],
        });
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(mockScheduleSuperScanReset).toHaveBeenCalledTimes(1);
        expect(mockPush).toHaveBeenCalledWith({
          pathname: '/scan-preview',
          params: {
            imageUri: 'file:///super-gallery-photo.jpg',
            scanType: 'super',
          },
        });
      });
    });
  });

  describe('scan eligibility refresh', () => {
    beforeEach(() => {
      mockUseCameraPermissions.mockReturnValue([
        { granted: true },
        jest.fn(),
      ]);
    });

    it('refreshes eligibility when screen gains focus', async () => {
      render(<ScannerScreen />);

      await waitFor(() => {
        expect(screen.getByText(/Visage/)).toBeTruthy();
      });

      expect(mockUseFocusEffect).toHaveBeenCalled();
      await act(async () => {
        latestFocusEffectCallback?.();
        await Promise.resolve();
      });
      expect(mockRefetchAll).toHaveBeenCalledTimes(1);
    });

    it('does not refetch eligibility on focus before auth is ready', async () => {
      mockIsAuthReady.mockReturnValue(false);
      mockCanQueryEligibility.mockReturnValue(false);

      render(<ScannerScreen />);

      await waitFor(() => {
        expect(screen.getByText(/Visage/)).toBeTruthy();
      });

      await act(async () => {
        latestFocusEffectCallback?.();
        await Promise.resolve();
      });

      expect(mockRefetchAll).not.toHaveBeenCalled();
    });

    it('displays updated eligibility counts', async () => {
      const countEligibility = {
        allowed: true,
        current_count: 2,
        limit: 3,
        welcome_credits: 0,
      };
      mockScanEligibilityData.mockReturnValue({
        body: countEligibility,
        health: countEligibility,
        nutrition: countEligibility,
        super: countEligibility,
      });

      render(<ScannerScreen />);

      // With current_count=2 and limit=3, remaining is 1. We expect 1/3
      await waitFor(() => {
        const countElements = screen.getAllByText('1/3');
        expect(countElements.length).toBeGreaterThan(0);
      });
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      mockUseCameraPermissions.mockReturnValue([
        { granted: true },
        jest.fn(),
      ]);
    });

    it('handles eligibility check error gracefully', async () => {
      // Simulate error state from the hook
      mockScanEligibilityData.mockReturnValue(null);

      render(<ScannerScreen />);

      // Should still render without crashing
      await waitFor(() => {
        expect(screen.getByText(/Visage/)).toBeTruthy();
      }, { timeout: 3000 });

      // Wait for all state updates to settle
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });
    });

    it('shows explicit loading text instead of dots for unresolved scan quotas', async () => {
      mockScanEligibilityData.mockReturnValue({
        body: defaultEligibility,
        nutrition: defaultEligibility,
        super: defaultEligibility,
      });
      mockScanEligibilityLoadingByType.mockReturnValue({
        body: false,
        health: true,
        nutrition: false,
        super: false,
      });

      render(<ScannerScreen />);

      await waitFor(() => {
        expect(screen.getByText('Chargement...')).toBeTruthy();
      });

      expect(screen.queryByText('...')).toBeNull();
    });

    it('shows scan types even when eligibility data is unavailable', async () => {
      // Simulate partial data (some scan types missing)
      mockScanEligibilityData.mockReturnValue({
        body: null,
        health: defaultEligibility,
        nutrition: defaultEligibility,
        super: defaultEligibility,
      });

      render(<ScannerScreen />);

      await waitFor(() => {
        expect(screen.getByText(/Visage/)).toBeTruthy();
        expect(screen.getByText('Corps')).toBeTruthy();
        expect(screen.getByText('Nutrition')).toBeTruthy();
        expect(screen.getByText('Données indispo.')).toBeTruthy();
      }, { timeout: 3000 });

      // Wait for all state updates to settle
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });
    });

    it('shows explicit unavailable text instead of dots when a scan quota fails', async () => {
      mockScanEligibilityData.mockReturnValue({
        body: defaultEligibility,
        nutrition: defaultEligibility,
        super: defaultEligibility,
      });
      mockScanEligibilityErrors.mockReturnValue({
        health: new ApiError('schema mismatch', 'DATABASE'),
      });

      render(<ScannerScreen />);

      await waitFor(() => {
        expect(screen.getByText('Erreur quota')).toBeTruthy();
      });

      expect(screen.queryByText('...')).toBeNull();
    });

    it('does not show the connectivity banner for auth hydration or auth errors', async () => {
      jest.useFakeTimers();
      mockScanEligibilityData.mockReturnValue({});
      mockScanEligibilityErrors.mockReturnValue({
        health: new ApiError('api_errors.unauthorized', 'AUTH'),
      });
      mockIsAuthReady.mockReturnValue(false);
      mockCanQueryEligibility.mockReturnValue(false);
      mockHasConnectivityError.mockReturnValue(false);

      render(<ScannerScreen />);

      act(() => {
        jest.advanceTimersByTime(1000);
      });

      expect(
        screen.queryByText('Connexion instable. Appuyez pour réessayer.'),
      ).toBeNull();
    });

    it('does not show the connectivity banner for non-network eligibility failures', async () => {
      jest.useFakeTimers();
      mockScanEligibilityData.mockReturnValue({});
      mockScanEligibilityErrors.mockReturnValue({
        health: new ApiError('schema mismatch', 'DATABASE'),
      });
      mockHasConnectivityError.mockReturnValue(false);

      render(<ScannerScreen />);

      act(() => {
        jest.advanceTimersByTime(1000);
      });

      expect(
        screen.queryByText('Connexion instable. Appuyez pour réessayer.'),
      ).toBeNull();
    });

    it('shows the connectivity banner only after the debounce for real network failures', async () => {
      jest.useFakeTimers();
      mockScanEligibilityData.mockReturnValue({});
      mockScanEligibilityErrors.mockReturnValue({
        health: new ApiError('Network request failed', 'NETWORK'),
      });
      mockHasConnectivityError.mockReturnValue(true);

      render(<ScannerScreen />);

      expect(
        screen.queryByText('Connexion instable. Appuyez pour réessayer.'),
      ).toBeNull();

      act(() => {
        jest.advanceTimersByTime(799);
      });
      expect(
        screen.queryByText('Connexion instable. Appuyez pour réessayer.'),
      ).toBeNull();

      act(() => {
        jest.advanceTimersByTime(1);
      });

      expect(
        screen.getByText('Connexion instable. Appuyez pour réessayer.'),
      ).toBeTruthy();
    });

    it('anchors compact Android overlays to safe areas instead of fixed offsets', async () => {
      jest.useFakeTimers();
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
      mockScanEligibilityData.mockReturnValue({});
      mockScanEligibilityErrors.mockReturnValue({
        health: new ApiError('Network request failed', 'NETWORK'),
      });
      mockHasConnectivityError.mockReturnValue(true);

      render(<ScannerScreen />);

      act(() => {
        jest.advanceTimersByTime(800);
      });

      const controlsStyle = StyleSheet.flatten(
        screen.getByTestId('scanner-controls-overlay').props.style,
      );
      const selectorStyle = StyleSheet.flatten(
        screen.getByTestId('scanner-scan-type-selector').props.style,
      );
      const bannerStyle = StyleSheet.flatten(
        screen.getByTestId('scanner-network-banner').props.style,
      );

      expect(controlsStyle.bottom).toBe(SPACING.sm + SPACING.md);
      expect(selectorStyle.bottom).toBe(
        SPACING.sm + SPACING.md + 76 + SPACING.md,
      );
      expect(bannerStyle.top).toBe(24 + SPACING.md);
    });

    it('shows a precise alert when the tapped scan type has a non-network eligibility error', async () => {
      mockScanEligibilityData.mockReturnValue({
        body: defaultEligibility,
        nutrition: defaultEligibility,
        super: defaultEligibility,
      });
      mockScanEligibilityErrors.mockReturnValue({
        health: new ApiError('api_errors.unauthorized', 'AUTH'),
      });

      render(<ScannerScreen />);

      await waitFor(() => {
        expect(screen.getByText(/Visage/)).toBeTruthy();
      });

      fireEvent.press(screen.getByText(/Visage/));

      expect(mockShowAlert).toHaveBeenCalledWith(
        'Vérification du scan impossible',
        'Votre session a expiré. Reconnectez-vous puis réessayez.',
        expect.any(Array),
        undefined,
        expect.objectContaining({ variant: 'warning' }),
      );
    });

    it('keeps successful scan types usable when another eligibility query fails', async () => {
      mockScanEligibilityData.mockReturnValue({
        body: defaultEligibility,
        nutrition: defaultEligibility,
        super: defaultEligibility,
      });
      mockScanEligibilityErrors.mockReturnValue({
        health: new ApiError('schema mismatch', 'DATABASE'),
      });

      render(<ScannerScreen />);

      await waitFor(() => {
        expect(screen.getByText('Corps')).toBeTruthy();
      });

      fireEvent.press(screen.getByText('Corps'));

      await act(async () => {
        fireEvent.press(screen.getByTestId('scanner-capture-button'));
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith({
          pathname: '/scan-preview',
          params: {
            imageUri: 'file:///captured-photo.jpg',
            scanType: 'body',
          },
        });
      });
    });
  });
});
