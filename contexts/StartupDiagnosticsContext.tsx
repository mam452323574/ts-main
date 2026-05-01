import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { getRuntimeCapabilities, logStartupMarker } from '@/utils/runtimeCapabilities';
import type { SafeObservabilityProperties } from '@/utils/observability';

type StartupMarker =
  | 'root-mounted'
  | 'session-loaded'
  | 'profile-loaded'
  | 'route-ready'
  | 'index-rendered'
  | 'login-rendered'
  | 'email-verification-rendered'
  | 'username-setup-rendered'
  | 'home-rendered';

interface StartupDiagnosticsContextValue {
  markStartup: (
    marker: StartupMarker,
    extra?: SafeObservabilityProperties
  ) => void;
  settleStartup: (reason?: string) => void;
  hasTimedOut: boolean;
}

const STARTUP_TIMEOUT_MS = 7000;

const noop = () => {};

const StartupDiagnosticsContext = createContext<StartupDiagnosticsContextValue>({
  markStartup: noop,
  settleStartup: noop,
  hasTimedOut: false,
});

export function StartupDiagnosticsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [hasTimedOut, setHasTimedOut] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settledRef = useRef(false);

  const clearWatchdog = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    logStartupMarker('root-mounted');

    timeoutRef.current = setTimeout(() => {
      if (settledRef.current) {
        return;
      }

      setHasTimedOut(true);
      logStartupMarker('startup-timeout', {
        timeoutMs: STARTUP_TIMEOUT_MS,
      });
    }, STARTUP_TIMEOUT_MS);

    return () => {
      clearWatchdog();
    };
  }, [clearWatchdog]);

  const markStartup = useCallback(
    (marker: StartupMarker, extra: SafeObservabilityProperties = {}) => {
      logStartupMarker(marker, extra);
    },
    []
  );

  const settleStartup = useCallback(
    (reason = 'ready') => {
      if (settledRef.current) {
        return;
      }

      settledRef.current = true;
      clearWatchdog();
      setHasTimedOut(false);
      logStartupMarker('startup-settled', { reason });
    },
    [clearWatchdog]
  );

  const value = useMemo(
    () => ({
      markStartup,
      settleStartup,
      hasTimedOut,
    }),
    [hasTimedOut, markStartup, settleStartup]
  );

  return (
    <StartupDiagnosticsContext.Provider value={value}>
      {children}
      {hasTimedOut ? <StartupFallbackOverlay /> : null}
    </StartupDiagnosticsContext.Provider>
  );
}

export function useStartupDiagnostics() {
  return useContext(StartupDiagnosticsContext);
}

function StartupFallbackOverlay() {
  const runtime = getRuntimeCapabilities();

  return (
    <View style={styles.overlay} testID="startup-fallback">
      <View style={styles.card}>
        <ActivityIndicator size="large" color="#1E3A2B" />
        <Text style={styles.title}>Demarrage plus long que prevu</Text>
        <Text style={styles.body}>
          L&apos;application continue a se lancer. Si l&apos;ecran reste bloque,
          relance Expo Go puis reessaie.
        </Text>
        <Text style={styles.footnote}>
          {runtime.platform} - {runtime.appOwnership}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: 'rgba(12, 18, 28, 0.74)',
  },
  card: {
    width: '100%',
    maxWidth: 360,
    padding: 24,
    borderRadius: 24,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  title: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '700',
    color: '#1D1D1F',
    textAlign: 'center',
  },
  body: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 21,
    color: '#4A5568',
    textAlign: 'center',
  },
  footnote: {
    marginTop: 12,
    fontSize: 12,
    color: '#718096',
    textAlign: 'center',
  },
});
