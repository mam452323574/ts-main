// Polyfill crypto.getRandomValues — DOIT être importé avant tout module qui
// fait de la cryptographie (Supabase Auth, génération du state OAuth, etc.).
// Voir P0-2 dans FRONTEND_SECURITY_AUDIT.md.
import 'react-native-get-random-values';

import AsyncStorage from '@react-native-async-storage/async-storage';

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
import { AdsProvider } from '@/contexts/AdsContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  ThemeProvider as AppThemeProvider,
  useTheme as useAppTheme,
} from '@/contexts/ThemeContext';
import { DARK_COLORS } from '@/constants/theme';
import { StartupDiagnosticsProvider } from '@/contexts/StartupDiagnosticsContext';
import { StartupConfigGate } from '@/components/StartupConfigGate';
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

// Filet de sécurité de démarrage : capture toute erreur JS fatale (l'IPS
// d'Apple ne contient PAS le message JS) et la persiste pour pouvoir la lire au
// prochain lancement. Best-effort, ne doit JAMAIS throw. N'empêche pas le crash
// déjà corrigé en amont, mais rend diagnostiquable toute future régression de
// démarrage. Cf. rejet App Store 2.1(a) build 1.0.0(6).
const LAST_STARTUP_ERROR_KEY = 'selflens.lastStartupError';
try {
  const globalWithErrorUtils = globalThis as typeof globalThis & {
    ErrorUtils?: {
      getGlobalHandler?: () => ((error: unknown, isFatal?: boolean) => void) | undefined;
      setGlobalHandler?: (
        handler: (error: unknown, isFatal?: boolean) => void,
      ) => void;
    };
  };
  const errorUtils = globalWithErrorUtils.ErrorUtils;
  const previousHandler = errorUtils?.getGlobalHandler?.();

  errorUtils?.setGlobalHandler?.((error: unknown, isFatal?: boolean) => {
    try {
      const err = error as { name?: unknown; message?: unknown } | null;
      const payload = JSON.stringify({
        at: new Date().toISOString(),
        fatal: Boolean(isFatal),
        name: typeof err?.name === 'string' ? err.name : null,
        message:
          typeof err?.message === 'string'
            ? err.message.slice(0, 500)
            : String(error).slice(0, 500),
      });
      void AsyncStorage.setItem(LAST_STARTUP_ERROR_KEY, payload).catch(() => {});
      console.error('[StartupCrash]', payload);
    } catch {
      // ne jamais throw depuis le handler global
    }
    previousHandler?.(error, isFatal);
  });
} catch {
  // ErrorUtils indisponible — no-op
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
  const transparentModalContentStyle = useMemo(
    () => ({
      backgroundColor: 'transparent',
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
            name="coach/conversations"
            options={{ contentStyle }}
          />
          <Stack.Screen
            name="coach/chat"
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
            name="scan-preview"
            options={{ presentation: 'fullScreenModal', contentStyle: immersiveCameraContentStyle }}
          />
          <Stack.Screen
            name="scan-result"
            options={{
              presentation: 'transparentModal',
              contentStyle: transparentModalContentStyle,
              gestureEnabled: false,
              fullScreenGestureEnabled: false,
            }}
          />
          <Stack.Screen
            name="super-scan-result"
            options={{
              presentation: 'transparentModal',
              contentStyle: transparentModalContentStyle,
              gestureEnabled: false,
              fullScreenGestureEnabled: false,
            }}
          />
          <Stack.Screen
            name="scan-frigo"
            options={{ contentStyle: immersiveCameraContentStyle }}
          />
          <Stack.Screen
            name="fridge-scan-result"
            options={{ presentation: 'fullScreenModal', contentStyle: immersiveCameraContentStyle }}
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
            <StartupConfigGate>
              <ErrorBoundary>
                <LanguageProvider>
                  <AuthProvider>
                    <BootPrefetchController />
                    <GamificationProvider>
                      <AppThemeProvider>
                        <AdsProvider>
                          <NotificationProvider>
                            <BadgeProvider>
                              <SystemBarsController />
                              <RootLayoutNav />
                            </BadgeProvider>
                          </NotificationProvider>
                        </AdsProvider>
                      </AppThemeProvider>
                    </GamificationProvider>
                  </AuthProvider>
                </LanguageProvider>
              </ErrorBoundary>
            </StartupConfigGate>
          </StartupDiagnosticsProvider>
        </SafeAreaProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
