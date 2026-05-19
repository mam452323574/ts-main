import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type ReactNode,
  type SetStateAction,
} from 'react';
import {
  AppState,
  StyleSheet,
  View,
  type AppStateStatus,
} from 'react-native';
import {
  CameraView,
  CameraType,
  useCameraPermissions,
} from 'expo-camera';
import { usePathname } from 'expo-router';

export const MAIN_TAB_PATHNAMES = new Set([
  '/',
  '/index',
  '/coach',
  '/social',
  '/(tabs)',
  '/(tabs)/index',
  '/(tabs)/coach',
  '/(tabs)/social',
]);

export const SCANNER_CAMERA_PATHNAMES = new Set([
  '/scanner',
  '/(tabs)/scanner',
]);

export const SCAN_FLOW_OVERLAY_PATHNAMES = new Set([
  '/scan-preview',
  '/scan-result',
  '/super-scan-result',
]);

export const SCANNER_SESSION_VISIBLE_PATHNAMES = new Set([
  ...SCANNER_CAMERA_PATHNAMES,
  ...SCAN_FLOW_OVERLAY_PATHNAMES,
]);

export const SCANNER_SESSION_SUSPEND_PATHNAMES = new Set(['/scan-frigo']);

const SCANNER_SESSION_HOST_PATHNAMES = new Set([
  ...MAIN_TAB_PATHNAMES,
  ...SCANNER_SESSION_VISIBLE_PATHNAMES,
]);

type CameraPermissionState = ReturnType<typeof useCameraPermissions>[0];
type CameraPermissionRequest = ReturnType<typeof useCameraPermissions>[1];

interface ScannerCameraSessionContextValue {
  permission: CameraPermissionState;
  requestPermission: CameraPermissionRequest;
  isReady: boolean;
  facing: CameraType;
  setFacing: Dispatch<SetStateAction<CameraType>>;
  cameraRef: MutableRefObject<CameraView | null>;
  isMounted: boolean;
  isVisible: boolean;
  sessionKey: number;
  autofocusEnabled: boolean;
  setAutofocusEnabled: Dispatch<SetStateAction<boolean>>;
  setIsReady: Dispatch<SetStateAction<boolean>>;
}

const ScannerCameraSessionContext = createContext<
  ScannerCameraSessionContextValue | undefined
>(undefined);

function getInitialCameraAppState(): AppStateStatus {
  return AppState.currentState === 'background' ||
    AppState.currentState === 'inactive'
    ? AppState.currentState
    : 'active';
}

export function ScannerCameraSessionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [permission, requestPermission] = useCameraPermissions();
  const [appState, setAppState] = useState<AppStateStatus>(
    getInitialCameraAppState,
  );
  const [isReady, setIsReady] = useState(false);
  const [facing, setFacing] = useState<CameraType>('back');
  const [autofocusEnabled, setAutofocusEnabled] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);
  const cameraRef = useRef<CameraView>(null);
  const sessionWasMountedRef = useRef(false);

  const isMounted =
    Boolean(permission?.granted) &&
    appState === 'active' &&
    SCANNER_SESSION_HOST_PATHNAMES.has(pathname) &&
    !SCANNER_SESSION_SUSPEND_PATHNAMES.has(pathname);
  const isVisible = isMounted && SCANNER_SESSION_VISIBLE_PATHNAMES.has(pathname);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (isMounted) {
      sessionWasMountedRef.current = true;
      return;
    }

    if (!sessionWasMountedRef.current) {
      return;
    }

    sessionWasMountedRef.current = false;
    setIsReady(false);
    setFacing('back');
    setAutofocusEnabled(false);
    setSessionKey((current) => current + 1);
  }, [isMounted]);

  const value = useMemo(
    () => ({
      permission,
      requestPermission,
      isReady,
      facing,
      setFacing,
      cameraRef,
      isMounted,
      isVisible,
      sessionKey,
      autofocusEnabled,
      setAutofocusEnabled,
      setIsReady,
    }),
    [
      autofocusEnabled,
      facing,
      isMounted,
      isReady,
      isVisible,
      permission,
      requestPermission,
      sessionKey,
    ],
  );

  return (
    <ScannerCameraSessionContext.Provider value={value}>
      {children}
    </ScannerCameraSessionContext.Provider>
  );
}

function useScannerCameraSessionContext() {
  const context = useContext(ScannerCameraSessionContext);

  if (!context) {
    throw new Error(
      'useScannerCameraSession must be used within a ScannerCameraSessionProvider',
    );
  }

  return context;
}

export function ScannerCameraSessionHost() {
  const {
    autofocusEnabled,
    cameraRef,
    facing,
    isMounted,
    sessionKey,
    setIsReady,
  } = useScannerCameraSessionContext();

  const handleCameraReady = useCallback(() => {
    setIsReady(true);
  }, [setIsReady]);

  if (!isMounted) {
    return null;
  }

  return (
    <View
      pointerEvents="none"
      style={styles.host}
      testID="scanner-camera-session-host"
    >
      <View pointerEvents="none" style={styles.viewport} testID="scanner-camera-session-viewport">
        <CameraView
          key={`scanner-camera-session-${sessionKey}`}
          ref={cameraRef}
          style={styles.camera}
          facing={facing}
          autofocus={autofocusEnabled ? 'on' : 'off'}
          animateShutter={false}
          mirror={false}
          onCameraReady={handleCameraReady}
          testID="scanner-shared-camera-view"
        />
      </View>
    </View>
  );
}

export function useScannerCameraSession() {
  const {
    permission,
    requestPermission,
    isReady,
    facing,
    setFacing,
    cameraRef,
    isMounted,
    isVisible,
    sessionKey,
    autofocusEnabled,
    setAutofocusEnabled,
  } = useScannerCameraSessionContext();

  return {
    permission,
    requestPermission,
    isReady,
    facing,
    setFacing,
    cameraRef,
    isMounted,
    isVisible,
    sessionKey,
    autofocusEnabled,
    setAutofocusEnabled,
  };
}

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  viewport: {
    ...StyleSheet.absoluteFillObject,
    opacity: 1,
  },
  camera: {
    ...StyleSheet.absoluteFillObject,
  },
});
