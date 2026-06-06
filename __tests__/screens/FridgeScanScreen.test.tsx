import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Platform, StyleSheet } from 'react-native';

import FridgeScanScreen from '@/screens/FridgeScanScreen';
import { ApiError } from '@/services/api';
import { SPACING } from '@/constants/theme';
import { resolveChefFlowVisualTheme } from '@/utils/scanFlowVisualTheme';

const mockUseCameraPermissions = jest.fn();
const mockTakePictureAsync = jest.fn();
const mockLaunchImageLibraryAsync = jest.fn();
const mockShowAlert = jest.fn();
const mockSubmitFridgeScanCapture = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn(() => true);
const mockCameraViewProps: { current: Record<string, any> | null } = { current: null };
let mockShouldMountError = false;
const mockUseSafeAreaInsets = jest.fn(() => ({
  top: 0,
  bottom: 0,
  left: 0,
  right: 0,
}));
const mockLightThemeColors = {
  background: '#F5F6FA',
  cardBackground: '#FFFFFF',
  surfaceMuted: '#F7F8FC',
  surfaceAccent: '#EAF3FF',
  primaryText: '#1C1C1E',
  secondaryText: '#6E6E73',
  textMuted: '#6E6E73',
  accentGreen: '#34C759',
  accent: '#007AFF',
  lightGray: '#E3E7EF',
  gray: '#6E6E73',
  grayLight: '#F7F8FC',
  grayMedium: '#D5DBE7',
  darkGray: '#3B3F4A',
  borderSubtle: '#E3E7EF',
  borderStrong: '#D5DBE7',
  primary: '#007AFF',
  primaryLight: '#EAF3FF',
  primaryDark: '#0056B3',
  secondary: '#5856D6',
  white: '#FFFFFF',
  error: '#FF3B30',
  success: '#34C759',
  successLight: '#E8F9ED',
  warning: '#FF9500',
  gold: '#FFD700',
  goldLight: '#FFF8E1',
};
let mockTheme = {
  colors: { ...mockLightThemeColors },
  isDark: false,
};
let mockAuthState = {
  userProfile: { account_tier: 'premium' },
  loading: false,
};

function createFridgeScanApiError(options: {
  message: string;
  type: ConstructorParameters<typeof ApiError>[1];
  code?: string;
  status?: number;
  requestId?: string;
  context?: Record<string, unknown>;
  originalError?: unknown;
}) {
  const error = new ApiError(
    options.message,
    options.type,
    options.originalError,
    options.context,
  );
  error.code = options.code;
  error.status = options.status;
  error.requestId = options.requestId;
  return error;
}

jest.mock('expo-camera', () => ({
  CameraView: (() => {
    const ReactLocal = require('react');
    const { View } = require('react-native');

    const MockCameraView = ReactLocal.forwardRef((props: any, ref: any) => {
      mockCameraViewProps.current = props;

      ReactLocal.useImperativeHandle(ref, () => ({
        takePictureAsync: mockTakePictureAsync,
      }));

      ReactLocal.useEffect(() => {
        if (mockShouldMountError && props.onMountError) {
          props.onMountError({ message: 'camera failed to boot' });
        }
      }, [props]);

      return ReactLocal.createElement(View, { testID: props.testID ?? 'mock-camera-view' });
    });

    MockCameraView.displayName = 'MockCameraView';
    return MockCameraView;
  })(),
  CameraType: {},
  useCameraPermissions: () => mockUseCameraPermissions(),
}));

jest.mock('expo-image-picker', () => ({
  UIImagePickerPreferredAssetRepresentationMode: {
    Compatible: 'compatible',
  },
  launchImageLibraryAsync: (...args: any[]) => mockLaunchImageLibraryAsync(...args),
}));

jest.mock('expo-linear-gradient', () => {
  const ReactLocal = require('react');
  const { View } = require('react-native');

  return {
    LinearGradient: ({
      children,
      colors: _colors,
      start: _start,
      end: _end,
      ...props
    }: any) => ReactLocal.createElement(View, props, children),
  };
});

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    replace: mockReplace,
    canGoBack: mockCanGoBack,
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => mockUseSafeAreaInsets(),
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => mockTheme,
}));

const translations: Record<string, string> = {
  'common.error': 'Error',
  'common.retry': 'Retry',
  'common.back': 'Back',
  'common.day': 'day',
  'common.days': 'days',
  'common.hour': 'hour',
  'common.hours': 'hours',
  'common.minute': 'minute',
  'common.minutes': 'minutes',
  'fridge_scan.limit_reached_with_time': 'Chef quota reached (5 requests). Next request available in {{time}}',
  'settings.privacy_policy': 'Privacy policy',
  'fridge_scan.title': 'Chef',
  'fridge_scan.subtitle': 'Take a photo of your foods and your chef suggests what to eat.',
  'fridge_scan.overlay_title': 'Frame your foods',
  'fridge_scan.overlay_hint': 'Keep the visible foods inside a single frame.',
  'fridge_scan.permission_title': 'Camera access is needed for Chef',
  'fridge_scan.permission_body': 'Take a photo of your foods. The image is only sent when you confirm the analysis.',
  'fridge_scan.permission_denied_title': 'Camera access is still blocked',
  'fridge_scan.permission_denied_body': 'Allow camera access to launch Chef. You can also review the privacy policy first.',
  'fridge_scan.permission_cta': 'Allow camera',
  'fridge_scan.camera_unavailable_title': 'Camera unavailable',
  'fridge_scan.camera_unavailable_body': 'The Chef camera could not start right now. Retry or go back to Home.',
  'fridge_scan.feedback_title': 'Choose your chef',
  'fridge_scan.feedback_body': 'Choose a style, then ask for your meal.',
  'fridge_scan.chef_selector_eyebrow': 'Your cooking style',
  'fridge_scan.chef_selector_title': 'Which chef will it be?',
  'fridge_scan.feedback_cta': 'Retake',
  'fridge_scan.feedback_primary_cta': 'Ask',
  'fridge_scan.feedback_secondary_cta': 'Retake photo',
  'fridge_scan.feedback_home_cta': 'Back home',
  'fridge_scan.feedback_camera_badge': 'Camera capture',
  'fridge_scan.feedback_gallery_badge': 'Gallery import',
  'fridge_scan.mode_labels.diet': 'Diet Chef',
  'fridge_scan.mode_labels.muscle_gain': 'Sport Chef',
  'fridge_scan.mode_labels.gourmand': 'Gourmet Chef',
  'fridge_scan.mode_short_labels.diet': 'Balance',
  'fridge_scan.mode_short_labels.muscle_gain': 'Performance',
  'fridge_scan.mode_short_labels.gourmand': 'Pleasure',
  'fridge_scan.mode_descriptions.diet': 'Balance, nutrition, and healthy meals.',
  'fridge_scan.mode_descriptions.muscle_gain': 'Protein, performance, and recovery.',
  'fridge_scan.mode_descriptions.gourmand': 'Flavor, comfort, and smart balance.',
  'fridge_scan.submission_queued_badge': 'Queued',
  'fridge_scan.submission_queued_title': 'Request sent',
  'fridge_scan.submission_queued_body':
    'Your photo is saved. Your chef is preparing an adapted suggestion. You have {{remaining}} request(s) left today.',
  'fridge_scan.submission_queued_cta': 'Take another photo',
  'fridge_scan.paywall_title': 'Premium Chef',
  'fridge_scan.paywall_subtitle': 'A chef adapted to your goal suggests an idea with what you have',
  'fridge_scan.paywall_body':
    'Go Premium to ask your chef to analyze your foods and suggest an adapted meal.',
  'fridge_scan.paywall_bullet_identify': 'Reviews visible foods',
  'fridge_scan.paywall_bullet_meal': 'Suggests a meal adapted to your goal',
  'fridge_scan.paywall_bullet_limit': 'Up to 5 Chef requests per day',
  'fridge_scan.limit_reached_title': 'Chef quota reached',
  'fridge_scan.limit_reached_fallback': 'Your Chef quota is reached for now.',
  'fridge_scan.submission_auth_error':
    'Your session expired before Chef could send the request. Sign in again and retry.',
  'fridge_scan.submission_network_error':
    'Chef could not reach the server. Check your connection and try again.',
  'fridge_scan.submission_image_error':
    'Chef could not prepare this photo. Retake it and try again.',
  'fridge_scan.submission_service_error':
    'Chef could not accept the request right now. Try again in a moment.',
  'fridge_scan.submission_error': 'The Chef request could not be sent right now.',
  'fridge_scan.capture_error': 'The photo could not be captured right now.',
  'fridge_scan.gallery_error': 'The gallery image could not be loaded right now.',
  'fridge_scan.back_accessibility': 'Go back',
  'fridge_scan.gallery_accessibility': 'Pick a food photo from the gallery',
  'fridge_scan.capture_accessibility': 'Capture a food photo',
  'fridge_scan.flip_accessibility': 'Flip camera',
};

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    locale: 'en',
    t: (key: string, options?: Record<string, unknown>) => {
      let value = translations[key] ?? key;

      if (options) {
        Object.entries(options).forEach(([optionKey, optionValue]) => {
          value = value.replace(`{{${optionKey}}}`, String(optionValue));
        });
      }

      return value;
    },
  }),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockAuthState,
}));

jest.mock('@/services/fridgeScan', () => ({
  submitFridgeScanCapture: (...args: unknown[]) =>
    mockSubmitFridgeScanCapture(...args),
}));

jest.mock('@/hooks/useCustomAlert', () => ({
  useCustomAlert: () => ({
    showAlert: mockShowAlert,
    alertElement: null,
  }),
}));

jest.mock('@/components/ContextualPaywall', () => ({
  ContextualPaywall: ({ visible }: any) => {
    if (!visible) {
      return null;
    }

    const ReactLocal = require('react');
    const { View } = require('react-native');
    return ReactLocal.createElement(View, { testID: 'fridge-scan-paywall-visible' });
  },
}));

jest.mock('@/components/Button', () => ({
  Button: ({ title, onPress, disabled }: any) => {
    const { TouchableOpacity, Text } = require('react-native');
    return (
      <TouchableOpacity onPress={onPress} disabled={disabled}>
        <Text>{title}</Text>
      </TouchableOpacity>
    );
  },
}));

jest.mock('@/components/LoadingSpinner', () => ({
  LoadingSpinner: () => {
    const { View, Text } = require('react-native');
    return (
      <View testID="loading-spinner">
        <Text>Loading...</Text>
      </View>
    );
  },
}));

jest.mock('@/components/CameraFlipIcon', () => ({
  CameraFlipIcon: () => {
    const { Text } = require('react-native');
    return <Text>FlipIcon</Text>;
  },
}));

jest.mock('lucide-react-native', () => {
  const ReactLocal = require('react');
  const { Text } = require('react-native');

  const makeIcon = (label: string) => (props: any) =>
    ReactLocal.createElement(Text, props, label);

  return {
    ArrowLeft: makeIcon('ArrowLeft'),
    Camera: makeIcon('Camera'),
    ChefHat: makeIcon('ChefHat'),
    Check: makeIcon('Check'),
    Dumbbell: makeIcon('Dumbbell'),
    Image: makeIcon('Image'),
    Leaf: makeIcon('Leaf'),
    Refrigerator: makeIcon('Refrigerator'),
    RefreshCw: makeIcon('RefreshCw'),
  };
});

const originalPlatform = Platform.OS;
const reactNativeModule =
  jest.requireActual<typeof import('react-native')>('react-native');
const useWindowDimensionsSpy = jest.spyOn(
  reactNativeModule,
  'useWindowDimensions',
);

describe('FridgeScanScreen', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTheme = {
      colors: { ...mockLightThemeColors },
      isDark: false,
    };
    mockAuthState = {
      userProfile: { account_tier: 'premium' },
      loading: false,
    };
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
    mockCameraViewProps.current = null;
    mockShouldMountError = false;
    mockTakePictureAsync.mockResolvedValue({ uri: 'file:///captured-fridge.jpg' });
    mockSubmitFridgeScanCapture.mockResolvedValue({
      fridgeScanId: 'fridge-scan-1',
      status: 'queued',
      imagePath: 'fridge-scans/fridge-scan-1.jpg',
      remaining: 4,
      limit: 5,
      selectedMode: 'diet',
    });
    mockUseCameraPermissions.mockReturnValue([{ granted: true, canAskAgain: true }, jest.fn()]);
    mockLaunchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///gallery-fridge.jpg',
          base64: 'GALLERY_FALLBACK_BASE64',
          width: 1000,
          height: 800,
        },
      ],
    });
    mockCanGoBack.mockReturnValue(true);
    consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  async function captureToReview() {
    await act(async () => {
      fireEvent.press(screen.getByTestId('fridge-scan-capture-button'));
      await Promise.resolve();
    });
  }

  async function submitReview() {
    await act(async () => {
      fireEvent.press(screen.getByText('Ask'));
      await Promise.resolve();
    });
  }

  it('shows the loading spinner while the camera permission state is unresolved', () => {
    mockUseCameraPermissions.mockReturnValue([undefined, jest.fn()]);

    render(<FridgeScanScreen />);

    expect(screen.getByTestId('loading-spinner')).toBeTruthy();
  });

  it('shows the permission card when camera access is denied', () => {
    mockUseCameraPermissions.mockReturnValue([
      { granted: false, canAskAgain: true },
      jest.fn(),
    ]);

    render(<FridgeScanScreen />);

    expect(screen.getByTestId('fridge-scan-permission-card')).toBeTruthy();
    expect(screen.getByText('Camera access is needed for Chef')).toBeTruthy();
    expect(screen.getByText('Allow camera')).toBeTruthy();
  });

  it('renders the permission card with the light chef palette', () => {
    mockUseCameraPermissions.mockReturnValue([
      { granted: false, canAskAgain: true },
      jest.fn(),
    ]);

    const chefTheme = resolveChefFlowVisualTheme(mockTheme.colors, false);

    render(<FridgeScanScreen />);

    const permissionCardStyle = StyleSheet.flatten(
      screen.getByTestId('fridge-scan-permission-card').props.style,
    );
    const titleStyle = StyleSheet.flatten(
      screen.getByText('Camera access is needed for Chef').props.style,
    );

    expect(permissionCardStyle.backgroundColor).toBe(chefTheme.surfaceElevated);
    expect(permissionCardStyle.borderColor).toBe(chefTheme.borderColor);
    expect(titleStyle.color).toBe(chefTheme.textPrimary);
  });

  it('requests permission when the permission CTA is pressed', () => {
    const requestPermission = jest.fn();
    mockUseCameraPermissions.mockReturnValue([
      { granted: false, canAskAgain: true },
      requestPermission,
    ]);

    render(<FridgeScanScreen />);

    fireEvent.press(screen.getByText('Allow camera'));

    expect(requestPermission).toHaveBeenCalledTimes(1);
  });

  it('renders the dedicated camera UI when permission is granted', async () => {
    render(<FridgeScanScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('fridge-scan-camera-view')).toBeTruthy();
    });

    expect(screen.getByTestId('fridge-scan-overlay-frame')).toBeTruthy();
    expect(screen.getByTestId('fridge-scan-gallery-button')).toBeTruthy();
    expect(screen.getByTestId('fridge-scan-capture-button')).toBeTruthy();
    expect(screen.getByTestId('fridge-scan-flip-button')).toBeTruthy();
  });

  it('removes the Android halo styling from the live Chef overlay frame', async () => {
    Object.defineProperty(Platform, 'OS', {
      value: 'android',
      configurable: true,
    });

    render(<FridgeScanScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('fridge-scan-overlay-frame')).toBeTruthy();
    });

    const overlayFrameStyle = StyleSheet.flatten(
      screen.getByTestId('fridge-scan-overlay-frame').props.style,
    );

    expect(overlayFrameStyle).toEqual(
      expect.objectContaining({
        borderRadius: 32,
        borderWidth: 1.25,
        borderColor: 'rgba(255, 255, 255, 0.8)',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        elevation: 0,
        shadowColor: 'transparent',
        shadowOpacity: 0,
        shadowRadius: 0,
        shadowOffset: { width: 0, height: 0 },
      }),
    );
  });

  it('captures a local fridge photo and opens the review sheet without navigating to scan preview', async () => {
    render(<FridgeScanScreen />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('fridge-scan-capture-button'));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockTakePictureAsync).toHaveBeenCalledWith({ quality: 1 });
    });

    expect(screen.getByTestId('fridge-scan-feedback-card')).toBeTruthy();
    expect(screen.getByTestId('fridge-scan-feedback-image')).toBeTruthy();
    expect(screen.queryByTestId('fridge-scan-feedback-guide-frame')).toBeNull();
    expect(screen.queryByTestId('fridge-scan-overlay-frame')).toBeNull();
    expect(screen.getByTestId('fridge-scan-chef-selector')).toBeTruthy();
    expect(screen.getByText('Choose your chef')).toBeTruthy();
    expect(screen.getByText('Diet Chef')).toBeTruthy();
    expect(screen.getByText('Sport Chef')).toBeTruthy();
    expect(screen.getByText('Gourmet Chef')).toBeTruthy();
    expect(screen.getByText('Balance')).toBeTruthy();
    expect(screen.getByText('Performance')).toBeTruthy();
    expect(screen.getByText('Pleasure')).toBeTruthy();
    expect(screen.getByText('Balance, nutrition, and healthy meals.')).toBeTruthy();
    expect(screen.getByText('Protein, performance, and recovery.')).toBeTruthy();
    expect(screen.getByText('Flavor, comfort, and smart balance.')).toBeTruthy();
    expect(screen.getByText('Retake photo')).toBeTruthy();
    expect(screen.getByText('Ask')).toBeTruthy();
    expect(screen.queryByText('Back home')).toBeNull();
    expect(screen.getByTestId('fridge-scan-retake-action')).toBeTruthy();
    expect(screen.getByText('Camera capture')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/scan-preview' })
    );
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('picks a local gallery photo and opens the review sheet without navigation', async () => {
    render(<FridgeScanScreen />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('fridge-scan-gallery-button'));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockLaunchImageLibraryAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          mediaTypes: ['images'],
          quality: 0.85,
          base64: true,
        }),
      );
    });

    expect(screen.getByTestId('fridge-scan-feedback-card')).toBeTruthy();
    expect(screen.queryByTestId('fridge-scan-feedback-guide-frame')).toBeNull();
    expect(screen.queryByTestId('fridge-scan-overlay-frame')).toBeNull();
    expect(screen.getByText('Gallery import')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('requests the iOS compatible gallery representation when available', async () => {
    Object.defineProperty(Platform, 'OS', {
      value: 'ios',
      configurable: true,
    });

    render(<FridgeScanScreen />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('fridge-scan-gallery-button'));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockLaunchImageLibraryAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          preferredAssetRepresentationMode: 'compatible',
        }),
      );
    });
  });

  it('renders the review sheet with light chef surfaces in light mode', async () => {
    const chefTheme = resolveChefFlowVisualTheme(mockTheme.colors, false);

    render(<FridgeScanScreen />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('fridge-scan-capture-button'));
      await Promise.resolve();
    });

    const overlayStyle = StyleSheet.flatten(
      screen.getByTestId('fridge-scan-feedback-overlay').props.style,
    );
    const cardStyle = StyleSheet.flatten(
      screen.getByTestId('fridge-scan-feedback-card').props.style,
    );
    const backButtonStyle = StyleSheet.flatten(
      screen.getByTestId('fridge-scan-feedback-back-button').props.style,
    );

    expect(overlayStyle.backgroundColor).toBe(chefTheme.overlayBackground);
    expect(cardStyle.backgroundColor).toBe(chefTheme.surfaceBackground);
    expect(cardStyle.borderColor).toBe(chefTheme.borderColor);
    expect(backButtonStyle.backgroundColor).toBe(
      chefTheme.chromeButtonBackground,
    );
  });

  it('ignores gallery cancellation and stays on the live camera', async () => {
    mockLaunchImageLibraryAsync.mockResolvedValue({
      canceled: true,
      assets: [],
    });

    render(<FridgeScanScreen />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('fridge-scan-gallery-button'));
      await Promise.resolve();
    });

    expect(screen.queryByTestId('fridge-scan-feedback-card')).toBeNull();
  });

  it('submits the default diet chef mode from the review sheet', async () => {
    render(<FridgeScanScreen />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('fridge-scan-capture-button'));
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.press(screen.getByText('Ask'));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockSubmitFridgeScanCapture).toHaveBeenCalledWith(
        expect.objectContaining({
          imageUri: 'file:///captured-fridge.jpg',
          source: 'camera',
          selectedMode: 'diet',
        }),
      );
    });
  });

  it('submits the selected gourmand mode from the review sheet', async () => {
    render(<FridgeScanScreen />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('fridge-scan-capture-button'));
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId('fridge-scan-chef-gourmand'));
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.press(screen.getByText('Ask'));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockSubmitFridgeScanCapture).toHaveBeenCalledWith(
        expect.objectContaining({
          imageUri: 'file:///captured-fridge.jpg',
          source: 'camera',
          selectedMode: 'gourmand',
        }),
      );
    });
  });

  it('submits the selected sport chef as the muscle_gain backend mode', async () => {
    render(<FridgeScanScreen />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('fridge-scan-capture-button'));
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId('fridge-scan-chef-sportif'));
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.press(screen.getByText('Ask'));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockSubmitFridgeScanCapture).toHaveBeenCalledWith(
        expect.objectContaining({
          imageUri: 'file:///captured-fridge.jpg',
          source: 'camera',
          selectedMode: 'muscle_gain',
        }),
      );
    });
  });

  it('passes the gallery pre-encoded fallback to the fridge scan service', async () => {
    render(<FridgeScanScreen />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('fridge-scan-gallery-button'));
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.press(screen.getByText('Ask'));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockSubmitFridgeScanCapture).toHaveBeenCalledWith(
        expect.objectContaining({
          imageUri: 'file:///gallery-fridge.jpg',
          source: 'gallery',
          selectedMode: 'diet',
          preEncodedJpeg: {
            base64: 'GALLERY_FALLBACK_BASE64',
            width: 1000,
            height: 800,
            source: 'gallery',
          },
        }),
      );
    });
  });

  it('uses the secondary CTA to return from review to the live camera', async () => {
    render(<FridgeScanScreen />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('fridge-scan-capture-button'));
      await Promise.resolve();
    });

    expect(screen.getByTestId('fridge-scan-feedback-card')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByText('Retake photo'));
      await Promise.resolve();
    });

    expect(screen.queryByTestId('fridge-scan-feedback-card')).toBeNull();
    expect(screen.getByTestId('fridge-scan-camera-view')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('keeps the retake action available for an admin captured review', async () => {
    mockAuthState = {
      userProfile: { account_tier: 'admin' },
      loading: false,
    };

    render(<FridgeScanScreen />);

    await captureToReview();

    expect(screen.getByText('Retake photo')).toBeTruthy();
    expect(screen.getByText('Ask')).toBeTruthy();
    expect(screen.queryByText('Back home')).toBeNull();
    expect(screen.getByTestId('fridge-scan-retake-action')).toBeTruthy();
  });

  it('shows home instead of retake for a free captured review and routes explicitly home', async () => {
    mockAuthState = {
      userProfile: { account_tier: 'free' },
      loading: false,
    };

    render(<FridgeScanScreen />);

    await captureToReview();

    expect(screen.getByText('Back home')).toBeTruthy();
    expect(screen.getByText('Ask')).toBeTruthy();
    expect(screen.queryByText('Retake photo')).toBeNull();
    expect(screen.getByTestId('fridge-scan-home-action')).toBeTruthy();

    fireEvent.press(screen.getByText('Back home'));

    expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('keeps the paywall gate when a free user asks from the captured review', async () => {
    mockAuthState = {
      userProfile: { account_tier: 'free' },
      loading: false,
    };

    render(<FridgeScanScreen />);

    await captureToReview();
    await submitReview();

    expect(screen.getByTestId('fridge-scan-paywall-visible')).toBeTruthy();
    expect(mockSubmitFridgeScanCapture).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('uses the free review actions for a gallery import', async () => {
    mockAuthState = {
      userProfile: { account_tier: 'free' },
      loading: false,
    };

    render(<FridgeScanScreen />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('fridge-scan-gallery-button'));
      await Promise.resolve();
    });

    expect(screen.getByText('Back home')).toBeTruthy();
    expect(screen.getByText('Ask')).toBeTruthy();
    expect(screen.queryByText('Retake photo')).toBeNull();
  });

  it('does not show entitlement-dependent review actions while the profile is loading', async () => {
    mockAuthState = {
      userProfile: { account_tier: 'premium' },
      loading: true,
    };

    render(<FridgeScanScreen />);

    await captureToReview();

    expect(screen.queryByText('Back home')).toBeNull();
    expect(screen.queryByText('Retake photo')).toBeNull();
    expect(screen.queryByText('Ask')).toBeNull();
  });

  it('derives compact Android overlay spacing from safe areas in camera and review modes', async () => {
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

    render(<FridgeScanScreen />);

    const controlsStyle = StyleSheet.flatten(
      screen.getByTestId('fridge-scan-controls-overlay').props.style,
    );

    expect(controlsStyle.bottom).toBe(SPACING.sm + SPACING.xl);

    await act(async () => {
      fireEvent.press(screen.getByTestId('fridge-scan-capture-button'));
      await Promise.resolve();
    });

    const feedbackStyle = StyleSheet.flatten(
      screen.getByTestId('fridge-scan-feedback-overlay').props.style,
    );

    expect(feedbackStyle).toEqual(
      expect.objectContaining({
        paddingTop: 24 + 44,
        paddingBottom: SPACING.sm,
      }),
    );
  });

  it('shows the dedicated camera unavailable state and retries by remounting the camera view', async () => {
    mockShouldMountError = true;
    const consoleWarnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    try {
      render(<FridgeScanScreen />);

      await waitFor(() => {
        expect(screen.getByTestId('fridge-scan-error-card')).toBeTruthy();
      });

      expect(
        screen.getByText(
          'The Chef camera could not start right now. Retry or go back to Home.',
        ),
      ).toBeTruthy();
      expect(screen.queryByText('camera failed to boot')).toBeNull();

      mockShouldMountError = false;

      await act(async () => {
        fireEvent.press(screen.getByText('Retry'));
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(screen.getByTestId('fridge-scan-camera-view')).toBeTruthy();
      });

      expect(screen.queryByTestId('fridge-scan-error-card')).toBeNull();
    } finally {
      consoleWarnSpy.mockRestore();
    }
  });

  it('prefers localized backend message keys over raw fridge scan limit messages', async () => {
    const now = Date.UTC(2026, 3, 12, 10, 0, 0);
    const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(now);
    const error = new ApiError(
      'Backend raw should stay hidden',
      'VALIDATION',
      undefined,
      {
        eligibility: {
          message: 'Backend raw should stay hidden',
          message_key: 'fridge_scan.limit_reached_with_time',
          next_available_date: now + 6 * 60 * 60 * 1000,
        },
      },
    );
    error.code = 'fridge_scan_limit_reached';
    mockSubmitFridgeScanCapture.mockRejectedValueOnce(error);

    try {
      render(<FridgeScanScreen />);

      await act(async () => {
        fireEvent.press(screen.getByTestId('fridge-scan-capture-button'));
        await Promise.resolve();
      });

      await act(async () => {
        fireEvent.press(screen.getByText('Ask'));
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(mockShowAlert).toHaveBeenCalledWith(
          'Chef quota reached',
          'Chef quota reached (5 requests). Next request available in 6 hours',
          undefined,
          undefined,
          { variant: 'warning' },
        );
      });

      const alertText = mockShowAlert.mock.calls
        .map((call) => call.slice(0, 2).join(' '))
        .join(' ');
      expect(alertText).not.toContain('Backend raw should stay hidden');
    } finally {
      dateNowSpy.mockRestore();
    }
  });

  it('shows a dedicated alert when local image normalization fails before the function call', async () => {
    mockSubmitFridgeScanCapture.mockRejectedValueOnce(
      createFridgeScanApiError({
        message: 'Unable to normalize fridge scan image',
        type: 'VALIDATION',
        code: 'fridge_scan_image_normalization_failed',
        context: {
          stage: 'image_normalization',
        },
      }),
    );

    render(<FridgeScanScreen />);

    await captureToReview();
    await submitReview();

    await waitFor(() => {
      expect(mockShowAlert).toHaveBeenCalledWith(
        'Error',
        'Chef could not prepare this photo. Retake it and try again.',
        undefined,
        undefined,
        { variant: 'warning' },
      );
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[FridgeScanScreen] Fridge scan image processing failed',
      expect.objectContaining({
        failure_bucket: 'image_normalization',
        code: 'fridge_scan_image_normalization_failed',
      }),
    );
  });

  it('shows a dedicated alert when the Chef request is blocked by an expired session', async () => {
    mockSubmitFridgeScanCapture.mockRejectedValueOnce(
      createFridgeScanApiError({
        message: 'api_errors.unauthorized',
        type: 'AUTH',
        code: 'auth_session_missing',
        status: 401,
        context: {
          functionName: 'fridge-scan-submit',
        },
      }),
    );

    render(<FridgeScanScreen />);

    await captureToReview();
    await submitReview();

    await waitFor(() => {
      expect(mockShowAlert).toHaveBeenCalledWith(
        'Error',
        'Your session expired before Chef could send the request. Sign in again and retry.',
        undefined,
        undefined,
        { variant: 'warning' },
      );
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[FridgeScanScreen] Fridge scan submission blocked by auth',
      expect.objectContaining({
        failure_bucket: 'auth',
        code: 'auth_session_missing',
        status: 401,
      }),
    );
  });

  it('shows a network-specific alert when Chef cannot reach the submit function', async () => {
    mockSubmitFridgeScanCapture.mockRejectedValueOnce(
      createFridgeScanApiError({
        message: 'Network request failed',
        type: 'NETWORK',
        code: 'edge_function_network_error',
        context: {
          functionName: 'fridge-scan-submit',
        },
        originalError: new TypeError('fetch failed'),
      }),
    );

    render(<FridgeScanScreen />);

    await captureToReview();
    await submitReview();

    await waitFor(() => {
      expect(mockShowAlert).toHaveBeenCalledWith(
        'Error',
        'Chef could not reach the server. Check your connection and try again.',
        undefined,
        undefined,
        { variant: 'warning' },
      );
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[FridgeScanScreen] Fridge scan submission network failure',
      expect.objectContaining({
        failure_bucket: 'network',
        code: 'edge_function_network_error',
      }),
    );
  });

  it('shows a server-specific alert when the submit edge function rejects the request', async () => {
    mockSubmitFridgeScanCapture.mockRejectedValueOnce(
      createFridgeScanApiError({
        message: 'fridge-scan-submit failed',
        type: 'EDGE_FUNCTION',
        code: 'edge_function_route_missing',
        status: 404,
        requestId: 'req-404',
        context: {
          functionName: 'fridge-scan-submit',
        },
      }),
    );

    render(<FridgeScanScreen />);

    await captureToReview();
    await submitReview();

    await waitFor(() => {
      expect(mockShowAlert).toHaveBeenCalledWith(
        'Error',
        'Chef could not accept the request right now. Try again in a moment.',
        undefined,
        undefined,
        { variant: 'warning' },
      );
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[FridgeScanScreen] Fridge scan submission server failure',
      expect.objectContaining({
        failure_bucket: 'edge_function',
        code: 'edge_function_route_missing',
        request_id: 'req-404',
        status: 404,
      }),
    );
  });

  it('uses router.back when history is available', () => {
    mockCanGoBack.mockReturnValue(true);

    render(<FridgeScanScreen />);

    fireEvent.press(screen.getAllByTestId('fridge-scan-back-button')[0]);

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('falls back to the tabs root when no back history exists', () => {
    mockCanGoBack.mockReturnValue(false);

    render(<FridgeScanScreen />);

    fireEvent.press(screen.getAllByTestId('fridge-scan-back-button')[0]);

    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
  });
});
