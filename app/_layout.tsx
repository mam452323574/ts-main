// Polyfill crypto.getRandomValues — DOIT être importé avant tout module qui
// fait de la cryptographie (Supabase Auth, génération du state OAuth, etc.).
// Voir P0-2 dans FRONTEND_SECURITY_AUDIT.md.
import 'react-native-get-random-values';

import { Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { Platform } from 'react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider as NavigationThemeProvider,
} from '@react-navigation/native';
import * as NavigationBar from 'expo-navigation-bar';
import * as SystemUI from 'expo-system-ui';

import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { useBootPrefetch } from '@/hooks/useBootPrefetch';
import { useProtectedRoute } from '@/hooks/useProtectedRoute';
import { AuthProvider } from '@/contexts/AuthContext';
import { NotificationProvider } from '@/contexts/NotificationContext';
import { BadgeProvider } from '@/contexts/BadgeContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { GamificationProvider } from '@/contexts/GamificationContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  ThemeProvider as AppThemeProvider,
  useTheme as useAppTheme,
} from '@/contexts/ThemeContext';
import { DARK_COLORS } from '@/constants/theme';
import { StartupDiagnosticsProvider } from '@/contexts/StartupDiagnosticsContext';
import { loadPurchasesModule } from '@/services/purchasesRuntime';
import { queryClient } from '@/services/queryClient';
import { getRuntimeConfig } from '@/services/runtimeConfig';
import {
  getRuntimeCapabilities,
  logRuntimeDecision,
} from '@/utils/runtimeCapabilities';
import { logOperationalError } from '@/utils/observability';
import {
  ANDROID_SECONDARY_BACKGROUND,
  getAndroidRouteChrome,
} from '@/utils/androidRouteChrome';
import type { AndroidRouteChrome } from '@/utils/androidRouteChrome';

// `queryClient` est désormais exporté depuis `@/services/queryClient` pour
// permettre un import direct depuis AuthContext sans require dynamique (P2-G).
// On le ré-exporte ici pour ne pas casser les call sites existants qui font
// `import { queryClient } from '@/app/_layout'`.
export { queryClient };

const DEFAULT_ANDROID_SYSTEM_BACKGROUND = DARK_COLORS.background;

if (Platform.OS === 'android') {
  void SystemUI.setBackgroundColorAsync(DEFAULT_ANDROID_SYSTEM_BACKGROUND).catch((error) => {
    console.error('[SystemUI] Failed to set initial Android background color:', error);
  });
}

async function syncAndroidSystemBars(routeChrome: AndroidRouteChrome) {
  try {
    await SystemUI.setBackgroundColorAsync(routeChrome.systemBackgroundColor);
  } catch (error) {
    console.error('[SystemUI] Failed to sync Android background color:', error);
  }

  try {
    await NavigationBar.setButtonStyleAsync(routeChrome.navigationButtonStyle);
  } catch (error) {
    console.error('[NavigationBar] Failed to sync button style:', error);
  }
}

function BootPrefetchController() {
  useBootPrefetch();
  return null;
}

function RootLayoutNav() {
  const { alertElement } = useProtectedRoute();
  const { colors, isDark } = useAppTheme();

  const navigationTheme = useMemo(() => {
    const baseTheme = isDark ? DarkTheme : DefaultTheme;

    return {
      ...baseTheme,
      dark: isDark,
      colors: {
        ...baseTheme.colors,
        primary: colors.primary,
        background: colors.background,
        card: colors.background,
        text: colors.primaryText,
        border: colors.lightGray,
        notification: colors.error,
      },
    };
  }, [colors.background, colors.error, colors.lightGray, colors.primary, colors.primaryText, isDark]);

  const contentStyle = useMemo(
    () => ({
      backgroundColor: colors.background,
    }),
    [colors.background]
  );
  const immersiveCameraContentStyle = useMemo(
    () => ({
      backgroundColor: ANDROID_SECONDARY_BACKGROUND,
    }),
    []
  );

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle,
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="post-signup-onboarding"
            options={{
              gestureEnabled: false,
              contentStyle,
            }}
          />
          <Stack.Screen
            name="analytics"
            options={{ contentStyle }}
          />
          <Stack.Screen
            name="coach"
            options={{ contentStyle }}
          />
          <Stack.Screen
            name="coach-history"
            options={{ presentation: 'modal', contentStyle }}
          />
          <Stack.Screen
            name="admin-social-moderation"
            options={{ contentStyle }}
          />
          <Stack.Screen
            name="social-compose"
            options={{ presentation: 'modal', contentStyle }}
          />
          <Stack.Screen
            name="social-post"
            options={{ contentStyle }}
          />
          <Stack.Screen
            name="social-comments"
            options={{ contentStyle }}
          />
          <Stack.Screen
            name="settings"
            options={{ presentation: 'modal', contentStyle }}
          />
          <Stack.Screen
            name="entry-offer"
            options={{ presentation: 'modal', contentStyle }}
          />
          <Stack.Screen
            name="notifications"
            options={{ presentation: 'modal', contentStyle }}
          />
          <Stack.Screen
            name="recipes"
            options={{ presentation: 'modal', contentStyle }}
          />
          <Stack.Screen
            name="exercises"
            options={{ presentation: 'modal', contentStyle }}
          />
          <Stack.Screen
            name="scan-result"
            options={{ presentation: 'modal', contentStyle }}
          />
          <Stack.Screen
            name="scan-frigo"
            options={{ contentStyle: immersiveCameraContentStyle }}
          />
          <Stack.Screen
            name="fridge-scan-result"
            options={{ presentation: 'modal', contentStyle: immersiveCameraContentStyle }}
          />
          <Stack.Screen
            name="share-story"
            options={{ presentation: 'modal', contentStyle }}
          />
          <Stack.Screen
            name="premium-upgrade"
            options={{ presentation: 'modal', contentStyle }}
          />
        </Stack>
        {alertElement}
      </>
    </NavigationThemeProvider>
  );
}

function SystemBarsController() {
  const pathname = usePathname();
  const { colors, isDark } = useAppTheme();
  const routeChrome = useMemo(
    () => getAndroidRouteChrome(pathname, colors, isDark),
    [colors, isDark, pathname]
  );

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    void syncAndroidSystemBars(routeChrome);
  }, [routeChrome]);

  if (Platform.OS !== 'android') {
    return (
      <StatusBar
        style={routeChrome.statusBarStyle}
        translucent
        backgroundColor="transparent"
        animated
      />
    );
  }

  return (
    <StatusBar
      style={routeChrome.statusBarStyle}
      translucent
      backgroundColor="transparent"
      animated
    />
  );
}

export default function RootLayout() {
  useFrameworkReady();

  useEffect(() => {
    if (!__DEV__) return;

    const originalConsoleError = console.error;
    console.error = (...args: unknown[]) => {
      const firstArg = args[0];
      if (
        typeof firstArg === 'string' &&
        firstArg.includes("'GO_BACK' was not handled")
      ) {
        // Warning dev-only emis par expo-router pendant la reconfiguration de
        // la stack au sign-out. Sans impact fonctionnel ni en prod.
        return;
      }
      originalConsoleError(...args);
    };

    return () => {
      console.error = originalConsoleError;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const initializeRevenueCat = async () => {
      const runtime = getRuntimeCapabilities();

      if (!runtime.canUseNativePurchases) {
        logRuntimeDecision('RevenueCat init skipped', {
          reason: runtime.isExpoGo
            ? 'development-build-required'
            : 'unsupported-runtime',
        });
        return;
      }

      const purchasesModule = await loadPurchasesModule();
      if (!purchasesModule || !isMounted) {
        return;
      }

      const Purchases = purchasesModule.default;
      const { LOG_LEVEL } = purchasesModule;
      const runtimeConfig = getRuntimeConfig();
      const apiKey =
        runtime.platform === 'ios'
          ? runtimeConfig.revenueCatIosApiKey
          : runtimeConfig.revenueCatAndroidApiKey;

      if (!apiKey) {
        console.warn(
          `[Runtime] RevenueCat init skipped: missing public API key for ${runtime.platform}`,
        );
        return;
      }

      logRuntimeDecision('RevenueCat init start', {
        targetPlatform: runtime.platform,
      });

      Purchases.setLogLevel(LOG_LEVEL.WARN);
      Purchases.configure({ apiKey });
    };

    initializeRevenueCat().catch((error) => {
      logOperationalError('[Runtime] RevenueCat init failed', error);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <StartupDiagnosticsProvider>
            <ErrorBoundary>
              <LanguageProvider>
                <AuthProvider>
                  <BootPrefetchController />
                  <GamificationProvider>
                    <AppThemeProvider>
                      <NotificationProvider>
                        <BadgeProvider>
                          <SystemBarsController />
                          <RootLayoutNav />
                        </BadgeProvider>
                      </NotificationProvider>
                    </AppThemeProvider>
                  </GamificationProvider>
                </AuthProvider>
              </LanguageProvider>
            </ErrorBoundary>
          </StartupDiagnosticsProvider>
        </SafeAreaProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
