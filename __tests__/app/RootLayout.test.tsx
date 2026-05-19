import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import * as NavigationBar from 'expo-navigation-bar';
import * as SystemUI from 'expo-system-ui';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';

import { DARK_COLORS, LIGHT_COLORS } from '@/constants/theme';

const mockLoadPurchasesModule = jest.fn();
const mockGetRuntimeCapabilities = jest.fn();
const mockSetLogLevel = jest.fn();
const mockConfigure = jest.fn();
const mockLogRuntimeDecision = jest.fn();
const mockUsePathname = jest.fn(() => '/');

type MockRuntimeConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  revenueCatIosApiKey: string | null;
  revenueCatAndroidApiKey: string | null;
  aptabaseAppKey: string | null;
  aptabaseHost: string | null;
};

var mockRuntimeConfigValue: MockRuntimeConfig | undefined;

function mockGetRuntimeConfig(): MockRuntimeConfig {
  return (
    mockRuntimeConfigValue ?? {
      supabaseUrl: 'https://example.supabase.co',
      supabaseAnonKey: 'anon-key',
      revenueCatIosApiKey: 'ios_public_key',
      revenueCatAndroidApiKey: 'android_public_key',
      aptabaseAppKey: null,
      aptabaseHost: null,
    }
  );
}

function setMockRuntimeConfig(value: MockRuntimeConfig) {
  mockRuntimeConfigValue = value;
}

type MockThemeValue = {
  theme: 'light' | 'dark';
  colors: typeof LIGHT_COLORS;
  toggleTheme: jest.Mock;
  setTheme: jest.Mock;
  isDark: boolean;
};

let mockThemeValue: MockThemeValue = {
  theme: 'light',
  colors: LIGHT_COLORS,
  toggleTheme: jest.fn(),
  setTheme: jest.fn(),
  isDark: false,
};

jest.mock('expo-router', () => {
  const Stack = Object.assign(
    jest.fn(({ children }: { children?: React.ReactNode }) => children),
    {
      Screen: jest.fn(() => null),
    }
  );

  return {
    Stack,
    usePathname: () => mockUsePathname(),
  };
});

jest.mock('expo-status-bar', () => ({
  StatusBar: jest.fn(() => null),
}));

jest.mock('expo-navigation-bar', () => ({
  setButtonStyleAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-system-ui', () => ({
  setBackgroundColorAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('@react-navigation/native', () => ({
  DarkTheme: {
    dark: true,
    colors: {
      primary: '#000000',
      background: '#000000',
      card: '#000000',
      text: '#FFFFFF',
      border: '#000000',
      notification: '#FFFFFF',
    },
  },
  DefaultTheme: {
    dark: false,
    colors: {
      primary: '#000000',
      background: '#FFFFFF',
      card: '#FFFFFF',
      text: '#000000',
      border: '#CCCCCC',
      notification: '#000000',
    },
  },
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/hooks/useFrameworkReady', () => ({
  useFrameworkReady: jest.fn(),
}));

jest.mock('@/hooks/useProtectedRoute', () => ({
  useProtectedRoute: () => ({
    alertElement: null,
  }),
}));

jest.mock('@/hooks/useBootPrefetch', () => ({
  useBootPrefetch: jest.fn(),
}));

jest.mock('@/contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/contexts/NotificationContext', () => ({
  NotificationProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/contexts/BadgeContext', () => ({
  BadgeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/contexts/LanguageContext', () => ({
  LanguageProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/contexts/GamificationContext', () => ({
  GamificationProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/contexts/ThemeContext', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
  useTheme: () => mockThemeValue,
}));

jest.mock('@/components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/contexts/StartupDiagnosticsContext', () => ({
  StartupDiagnosticsProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/services/purchasesRuntime', () => ({
  loadPurchasesModule: () => mockLoadPurchasesModule(),
}));

jest.mock('@/services/runtimeConfig', () => ({
  getRuntimeConfig: () => mockGetRuntimeConfig(),
}));

jest.mock('@/utils/runtimeCapabilities', () => ({
  getRuntimeCapabilities: () => mockGetRuntimeCapabilities(),
  logRuntimeDecision: (...args: unknown[]) => mockLogRuntimeDecision(...args),
}));

(Platform as { OS: string }).OS = 'android';

import RootLayout from '@/app/_layout';

const mockStatusBar = jest.mocked(StatusBar);
const mockSetNavigationBarButtonStyleAsync = jest.mocked(NavigationBar.setButtonStyleAsync);
const mockSetSystemBackgroundColorAsync = jest.mocked(SystemUI.setBackgroundColorAsync);
const mockExpoRouter = jest.requireMock('expo-router') as {
  Stack: jest.Mock & {
    Screen: jest.Mock;
  };
};
const mockStack = mockExpoRouter.Stack;
const mockStackScreen = mockExpoRouter.Stack.Screen;

describe('RootLayout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Platform as { OS: string }).OS = 'android';
    mockUsePathname.mockReturnValue('/');
    mockThemeValue = {
      theme: 'light',
      colors: LIGHT_COLORS,
      toggleTheme: jest.fn(),
      setTheme: jest.fn(),
      isDark: false,
    };
    mockGetRuntimeCapabilities.mockReturnValue({
      platform: 'android',
      appOwnership: 'expo',
      isExpoGo: true,
      canUseNativePurchases: false,
      canUseLocalNotifications: false,
      canRegisterForPushNotifications: false,
    });
    setMockRuntimeConfig({
      supabaseUrl: 'https://example.supabase.co',
      supabaseAnonKey: 'anon-key',
      revenueCatIosApiKey: 'ios_public_key',
      revenueCatAndroidApiKey: 'android_public_key',
      aptabaseAppKey: null,
      aptabaseHost: null,
    });
  });

  it('does not initialize RevenueCat in Expo Go', async () => {
    render(<RootLayout />);

    await waitFor(() => {
      expect(mockLogRuntimeDecision).toHaveBeenCalledWith(
        'RevenueCat init skipped',
        expect.objectContaining({
          reason: 'development-build-required',
        })
      );
    });

    expect(mockLoadPurchasesModule).not.toHaveBeenCalled();
  });

  it('initializes RevenueCat in native runtime', async () => {
    mockGetRuntimeCapabilities.mockReturnValue({
      platform: 'android',
      appOwnership: 'standalone',
      isExpoGo: false,
      canUseNativePurchases: true,
      canUseLocalNotifications: true,
      canRegisterForPushNotifications: true,
    });
    mockLoadPurchasesModule.mockResolvedValue({
      default: {
        setLogLevel: mockSetLogLevel,
        configure: mockConfigure,
      },
      LOG_LEVEL: {
        WARN: 'WARN',
      },
    });

    render(<RootLayout />);

    await waitFor(() => {
      expect(mockLoadPurchasesModule).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(mockSetLogLevel).toHaveBeenCalledWith('WARN');
      expect(mockConfigure).toHaveBeenCalledWith({
        apiKey: 'android_public_key',
      });
    });
  });

  it('uses the iOS public API key when initializing RevenueCat on iOS', async () => {
    (Platform as { OS: string }).OS = 'ios';
    mockGetRuntimeCapabilities.mockReturnValue({
      platform: 'ios',
      appOwnership: 'standalone',
      isExpoGo: false,
      canUseNativePurchases: true,
      canUseLocalNotifications: true,
      canRegisterForPushNotifications: true,
    });
    mockLoadPurchasesModule.mockResolvedValue({
      default: {
        setLogLevel: mockSetLogLevel,
        configure: mockConfigure,
      },
      LOG_LEVEL: {
        WARN: 'WARN',
      },
    });

    render(<RootLayout />);

    await waitFor(() => {
      expect(mockConfigure).toHaveBeenCalledWith({
        apiKey: 'ios_public_key',
      });
    });
  });

  it('skips RevenueCat initialization when the runtime config is missing a public key', async () => {
    const consoleWarnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    mockGetRuntimeCapabilities.mockReturnValue({
      platform: 'android',
      appOwnership: 'standalone',
      isExpoGo: false,
      canUseNativePurchases: true,
      canUseLocalNotifications: true,
      canRegisterForPushNotifications: true,
    });
    setMockRuntimeConfig({
      supabaseUrl: 'https://example.supabase.co',
      supabaseAnonKey: 'anon-key',
      revenueCatIosApiKey: 'ios_public_key',
      revenueCatAndroidApiKey: null,
      aptabaseAppKey: null,
      aptabaseHost: null,
    });
    mockLoadPurchasesModule.mockResolvedValue({
      default: {
        setLogLevel: mockSetLogLevel,
        configure: mockConfigure,
      },
      LOG_LEVEL: {
        WARN: 'WARN',
      },
    });

    render(<RootLayout />);

    await waitFor(() => {
      expect(mockLoadPurchasesModule).toHaveBeenCalledTimes(1);
    });

    expect(mockSetLogLevel).not.toHaveBeenCalled();
    expect(mockConfigure).not.toHaveBeenCalled();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[Runtime] RevenueCat init skipped: missing public API key for android',
    );

    consoleWarnSpy.mockRestore();
  });

  it('uses the shared tabs background for the home tab in light mode', async () => {
    const screen = render(<RootLayout />);

    await waitFor(() => {
      expect(mockSetSystemBackgroundColorAsync).toHaveBeenCalledWith(LIGHT_COLORS.background);
      expect(mockSetNavigationBarButtonStyleAsync).toHaveBeenCalledWith('dark');
    });

    expect(screen.queryByTestId('bottom-system-bar-underlay')).toBeNull();
    expect(mockStatusBar.mock.lastCall?.[0]).toEqual(
      expect.objectContaining({
        style: 'dark',
        backgroundColor: 'transparent',
      })
    );
  });

  it('uses the shared tabs background for the coach tab in dark mode', async () => {
    mockUsePathname.mockReturnValue('/coach');
    mockThemeValue = {
      theme: 'dark',
      colors: DARK_COLORS,
      toggleTheme: jest.fn(),
      setTheme: jest.fn(),
      isDark: true,
    };

    const screen = render(<RootLayout />);

    await waitFor(() => {
      expect(mockSetSystemBackgroundColorAsync).toHaveBeenCalledWith(DARK_COLORS.cardBackground);
      expect(mockSetNavigationBarButtonStyleAsync).toHaveBeenCalledWith('light');
    });

    expect(screen.queryByTestId('bottom-system-bar-underlay')).toBeNull();
    expect(mockStatusBar.mock.lastCall?.[0]).toEqual(
      expect.objectContaining({
        style: 'light',
        backgroundColor: 'transparent',
      })
    );
  });

  it('keeps the scanner tab on the shared tabs background with a light status bar', async () => {
    mockUsePathname.mockReturnValue('/scanner');

    const screen = render(<RootLayout />);

    await waitFor(() => {
      expect(mockSetSystemBackgroundColorAsync).toHaveBeenCalledWith(LIGHT_COLORS.background);
      expect(mockSetNavigationBarButtonStyleAsync).toHaveBeenCalledWith('dark');
    });

    expect(screen.queryByTestId('bottom-system-bar-underlay')).toBeNull();
    expect(mockStatusBar.mock.lastCall?.[0]).toEqual(
      expect.objectContaining({
        style: 'light',
        backgroundColor: 'transparent',
      })
    );
  });

  it('keeps the social tab on the shared tabs background with the default light status bar', async () => {
    mockUsePathname.mockReturnValue('/social');

    render(<RootLayout />);

    await waitFor(() => {
      expect(mockSetSystemBackgroundColorAsync).toHaveBeenCalledWith(LIGHT_COLORS.background);
      expect(mockSetNavigationBarButtonStyleAsync).toHaveBeenCalledWith('dark');
    });

    expect(mockStatusBar.mock.lastCall?.[0]).toEqual(
      expect.objectContaining({
        style: 'dark',
        backgroundColor: 'transparent',
      })
    );
  });

  it('keeps themed secondary pages on the app Android system background', async () => {
    mockUsePathname.mockReturnValue('/settings');

    const screen = render(<RootLayout />);

    await waitFor(() => {
      expect(mockSetSystemBackgroundColorAsync).toHaveBeenCalledWith(LIGHT_COLORS.background);
      expect(mockSetNavigationBarButtonStyleAsync).toHaveBeenCalledWith('dark');
    });

    expect(screen.queryByTestId('bottom-system-bar-underlay')).toBeNull();
    expect(mockStatusBar.mock.lastCall?.[0]).toEqual(
      expect.objectContaining({
        style: 'dark',
        backgroundColor: 'transparent',
      })
    );
  });

  it('keeps scan preview on the immersive black Android system background', async () => {
    mockUsePathname.mockReturnValue('/scan-preview');
    mockThemeValue = {
      theme: 'dark',
      colors: DARK_COLORS,
      toggleTheme: jest.fn(),
      setTheme: jest.fn(),
      isDark: true,
    };

    render(<RootLayout />);

    await waitFor(() => {
      expect(mockSetSystemBackgroundColorAsync).toHaveBeenCalledWith('#000000');
      expect(mockSetNavigationBarButtonStyleAsync).toHaveBeenCalledWith('light');
    });

    expect(mockStatusBar.mock.lastCall?.[0]).toEqual(
      expect.objectContaining({
        style: 'light',
      })
    );
  });

  it('keeps scan-frigo on the immersive black Android system background', async () => {
    mockUsePathname.mockReturnValue('/scan-frigo');

    render(<RootLayout />);

    await waitFor(() => {
      expect(mockSetSystemBackgroundColorAsync).toHaveBeenCalledWith('#000000');
      expect(mockSetNavigationBarButtonStyleAsync).toHaveBeenCalledWith('light');
    });

    expect(mockStatusBar.mock.lastCall?.[0]).toEqual(
      expect.objectContaining({
        style: 'light',
        backgroundColor: 'transparent',
      })
    );
  });

  it('does not set deprecated native-stack navigation bar colors in edge-to-edge mode', () => {
    render(<RootLayout />);

    expect(mockStack).toHaveBeenCalled();

    const stackProps = mockStack.mock.calls[0]?.[0] as {
      screenOptions: Record<string, unknown>;
    };
    const stackScreenCalls = mockStackScreen.mock.calls as Array<
      [
        {
          name: string;
          options?: Record<string, unknown>;
        },
      ]
    >;
    const tabsScreenProps = stackScreenCalls.find(
      ([props]) => props.name === '(tabs)'
    )?.[0] as {
      options?: Record<string, unknown>;
    } | undefined;

    expect(stackProps.screenOptions).not.toHaveProperty('navigationBarColor');
    expect(tabsScreenProps?.options ?? {}).not.toHaveProperty('navigationBarColor');
  });

  it('registers analytics, coach, entry-offer, and scan-frigo with the expected stack options', () => {
    render(<RootLayout />);

    const stackScreenCalls = mockStackScreen.mock.calls as Array<
      [
        {
          name: string;
          options?: Record<string, unknown>;
        },
      ]
    >;
    const coachScreenProps = stackScreenCalls.find(([props]) => props.name === 'coach')?.[0];
    const analyticsScreenProps = stackScreenCalls.find(
      ([props]) => props.name === 'analytics'
    )?.[0];
    const coachHistoryScreenProps = stackScreenCalls.find(
      ([props]) => props.name === 'coach-history'
    )?.[0];
    const adminSocialModerationScreenProps = stackScreenCalls.find(
      ([props]) => props.name === 'admin-social-moderation'
    )?.[0];
    const entryOfferScreenProps = stackScreenCalls.find(
      ([props]) => props.name === 'entry-offer'
    )?.[0];
    const socialComposeScreenProps = stackScreenCalls.find(
      ([props]) => props.name === 'social-compose'
    )?.[0];
    const socialPostScreenProps = stackScreenCalls.find(
      ([props]) => props.name === 'social-post'
    )?.[0];
    const socialCommentsScreenProps = stackScreenCalls.find(
      ([props]) => props.name === 'social-comments'
    )?.[0];
    const shareStoryScreenProps = stackScreenCalls.find(
      ([props]) => props.name === 'share-story'
    )?.[0];
    const fridgeScanScreenProps = stackScreenCalls.find(
      ([props]) => props.name === 'scan-frigo'
    )?.[0];
    const scanPreviewScreenProps = stackScreenCalls.find(
      ([props]) => props.name === 'scan-preview'
    )?.[0];
    const scanResultScreenProps = stackScreenCalls.find(
      ([props]) => props.name === 'scan-result'
    )?.[0];
    const superScanResultScreenProps = stackScreenCalls.find(
      ([props]) => props.name === 'super-scan-result'
    )?.[0];

    expect(coachScreenProps).toBeDefined();
    expect(analyticsScreenProps).toBeDefined();
    expect(coachHistoryScreenProps).toBeDefined();
    expect(adminSocialModerationScreenProps).toBeDefined();
    expect(fridgeScanScreenProps).toBeDefined();
    expect(scanPreviewScreenProps).toBeDefined();
    expect(scanResultScreenProps).toBeDefined();
    expect(superScanResultScreenProps).toBeDefined();
    expect(adminSocialModerationScreenProps?.options).toEqual(
      expect.objectContaining({
        contentStyle: expect.objectContaining({
          backgroundColor: LIGHT_COLORS.background,
        }),
      })
    );
    expect(analyticsScreenProps?.options).toEqual(
      expect.objectContaining({
        contentStyle: expect.objectContaining({
          backgroundColor: LIGHT_COLORS.background,
        }),
      })
    );
    expect(coachScreenProps?.options).toEqual(
      expect.objectContaining({
        contentStyle: expect.objectContaining({
          backgroundColor: LIGHT_COLORS.background,
        }),
      })
    );
    expect(coachHistoryScreenProps?.options).toEqual(
      expect.objectContaining({
        presentation: 'modal',
        contentStyle: expect.objectContaining({
          backgroundColor: LIGHT_COLORS.background,
        }),
      })
    );
    expect(entryOfferScreenProps?.options).toEqual(
      expect.objectContaining({
        presentation: 'modal',
        contentStyle: expect.objectContaining({
          backgroundColor: LIGHT_COLORS.background,
        }),
      })
    );
    expect(socialComposeScreenProps?.options).toEqual(
      expect.objectContaining({
        presentation: 'modal',
        contentStyle: expect.objectContaining({
          backgroundColor: LIGHT_COLORS.background,
        }),
      })
    );
    expect(socialPostScreenProps?.options).toEqual(
      expect.objectContaining({
        contentStyle: expect.objectContaining({
          backgroundColor: LIGHT_COLORS.background,
        }),
      })
    );
    expect(socialCommentsScreenProps?.options).toEqual(
      expect.objectContaining({
        contentStyle: expect.objectContaining({
          backgroundColor: LIGHT_COLORS.background,
        }),
      })
    );
    expect(shareStoryScreenProps?.options).toEqual(
      expect.objectContaining({
        presentation: 'modal',
        contentStyle: expect.objectContaining({
          backgroundColor: LIGHT_COLORS.background,
        }),
      })
    );
    expect(fridgeScanScreenProps?.options).toEqual(
      expect.objectContaining({
        contentStyle: expect.objectContaining({
          backgroundColor: '#000000',
        }),
      })
    );
    expect(scanPreviewScreenProps?.options).toEqual(
      expect.objectContaining({
        presentation: 'fullScreenModal',
        contentStyle: expect.objectContaining({
          backgroundColor: '#000000',
        }),
      })
    );
    expect(scanResultScreenProps?.options).toEqual(
      expect.objectContaining({
        presentation: 'transparentModal',
        gestureEnabled: false,
        fullScreenGestureEnabled: false,
        contentStyle: expect.objectContaining({
          backgroundColor: 'transparent',
        }),
      })
    );
    expect(superScanResultScreenProps?.options).toEqual(
      expect.objectContaining({
        presentation: 'transparentModal',
        gestureEnabled: false,
        fullScreenGestureEnabled: false,
        contentStyle: expect.objectContaining({
          backgroundColor: 'transparent',
        }),
      })
    );
  });
});
