import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
} from '@testing-library/react-native';
import { AppState, StyleSheet, Text, TouchableOpacity } from 'react-native';

const mockUsePathname = jest.fn(() => '/');
const mockUseCameraPermissions = jest.fn();
const mockTakePictureAsync = jest.fn();
const mockCameraViewProps: { current: Record<string, any> | null } = { current: null };
let mockCurrentAppState: typeof AppState.currentState = 'active';
let latestAppStateListener: ((state: 'active' | 'inactive' | 'background') => void) | undefined;
let cameraMountCount = 0;
let cameraUnmountCount = 0;

jest.mock('expo-router', () => ({
  usePathname: () => mockUsePathname(),
}));

jest.mock('expo-camera', () => ({
  CameraView: (() => {
    const ReactLocal = require('react');
    const { View: MockView } = require('react-native');

    const MockCameraView = ReactLocal.forwardRef((props: any, ref: any) => {
      mockCameraViewProps.current = props;

      ReactLocal.useImperativeHandle(ref, () => ({
        takePictureAsync: mockTakePictureAsync,
      }));

      ReactLocal.useEffect(() => {
        cameraMountCount += 1;
        props.onCameraReady?.();

        return () => {
          cameraUnmountCount += 1;
        };
      }, []);

      return ReactLocal.createElement(MockView, {
        testID: 'mock-shared-camera-view',
      });
    });

    MockCameraView.displayName = 'MockCameraView';
    return MockCameraView;
  })(),
  CameraType: {},
  useCameraPermissions: () => mockUseCameraPermissions(),
}));

import {
  ScannerCameraSessionHost,
  ScannerCameraSessionProvider,
  useScannerCameraSession,
} from '@/contexts/ScannerCameraSessionContext';

function SessionSnapshot() {
  const session = useScannerCameraSession();

  return (
    <>
      <Text testID="session-mounted">{String(session.isMounted)}</Text>
      <Text testID="session-visible">{String(session.isVisible)}</Text>
      <Text testID="session-ready">{String(session.isReady)}</Text>
      <Text testID="session-key">{String(session.sessionKey)}</Text>
      <TouchableOpacity
        onPress={() => session.setFacing('front')}
        testID="session-set-front"
      >
        <Text>Front</Text>
      </TouchableOpacity>
    </>
  );
}

function renderSessionTree() {
  return render(
    <ScannerCameraSessionProvider>
      <ScannerCameraSessionHost />
      <SessionSnapshot />
    </ScannerCameraSessionProvider>,
  );
}

describe('ScannerCameraSessionContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUsePathname.mockReturnValue('/');
    mockUseCameraPermissions.mockReturnValue([{ granted: true }, jest.fn()]);
    mockCurrentAppState = 'active';
    latestAppStateListener = undefined;
    cameraMountCount = 0;
    cameraUnmountCount = 0;
    mockCameraViewProps.current = null;

    Object.defineProperty(AppState, 'currentState', {
      configurable: true,
      get: () => mockCurrentAppState,
    });

    jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
      latestAppStateListener = listener as typeof latestAppStateListener;
      return {
        remove: jest.fn(),
      } as any;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('mounts the shared camera on main tabs without an occluder', () => {
    renderSessionTree();

    expect(screen.getByTestId('mock-shared-camera-view')).toBeTruthy();
    expect(screen.getByTestId('session-mounted').props.children).toBe('true');
    expect(screen.getByTestId('session-visible').props.children).toBe('false');
    expect(screen.getByTestId('session-ready').props.children).toBe('true');
    expect(screen.queryByTestId('scanner-camera-session-occluder')).toBeNull();

    const viewportStyle = StyleSheet.flatten(
      screen.getByTestId('scanner-camera-session-viewport').props.style,
    );

    expect(viewportStyle.opacity).toBe(1);
    expect(cameraMountCount).toBe(1);
    expect(cameraUnmountCount).toBe(0);
  });

  it('keeps the same camera session mounted while switching from coach to scanner', () => {
    mockUsePathname.mockReturnValue('/coach');
    const tree = renderSessionTree();
    const initialSessionKey = screen.getByTestId('session-key').props.children;

    expect(cameraMountCount).toBe(1);
    expect(cameraUnmountCount).toBe(0);
    expect(screen.queryByTestId('scanner-camera-session-occluder')).toBeNull();

    mockUsePathname.mockReturnValue('/scanner');
    tree.rerender(
      <ScannerCameraSessionProvider>
        <ScannerCameraSessionHost />
        <SessionSnapshot />
      </ScannerCameraSessionProvider>,
    );

    let viewportStyle = StyleSheet.flatten(
      screen.getByTestId('scanner-camera-session-viewport').props.style,
    );
    expect(viewportStyle.opacity).toBe(1);
    expect(screen.getByTestId('session-visible').props.children).toBe('true');
    expect(screen.queryByTestId('scanner-camera-session-occluder')).toBeNull();
    expect(screen.getByTestId('session-key').props.children).toBe(initialSessionKey);
    expect(cameraMountCount).toBe(1);
    expect(cameraUnmountCount).toBe(0);

    mockUsePathname.mockReturnValue('/coach');
    tree.rerender(
      <ScannerCameraSessionProvider>
        <ScannerCameraSessionHost />
        <SessionSnapshot />
      </ScannerCameraSessionProvider>,
    );

    viewportStyle = StyleSheet.flatten(
      screen.getByTestId('scanner-camera-session-viewport').props.style,
    );
    expect(viewportStyle.opacity).toBe(1);
    expect(screen.getByTestId('session-visible').props.children).toBe('false');
    expect(screen.queryByTestId('scanner-camera-session-occluder')).toBeNull();
    expect(cameraMountCount).toBe(1);
    expect(cameraUnmountCount).toBe(0);
  });

  it('suspends the shared camera on concurrent camera routes and resets facing before remount', () => {
    mockUsePathname.mockReturnValue('/scanner');
    const tree = renderSessionTree();

    fireEvent.press(screen.getByTestId('session-set-front'));
    expect(mockCameraViewProps.current?.facing).toBe('front');

    mockUsePathname.mockReturnValue('/scan-frigo');
    tree.rerender(
      <ScannerCameraSessionProvider>
        <ScannerCameraSessionHost />
        <SessionSnapshot />
      </ScannerCameraSessionProvider>,
    );

    expect(screen.queryByTestId('mock-shared-camera-view')).toBeNull();
    expect(screen.getByTestId('session-mounted').props.children).toBe('false');
    expect(cameraUnmountCount).toBe(1);

    mockUsePathname.mockReturnValue('/scanner');
    tree.rerender(
      <ScannerCameraSessionProvider>
        <ScannerCameraSessionHost />
        <SessionSnapshot />
      </ScannerCameraSessionProvider>,
    );

    expect(screen.getByTestId('mock-shared-camera-view')).toBeTruthy();
    expect(mockCameraViewProps.current?.facing).toBe('back');
    expect(screen.getByTestId('session-key').props.children).toBe('1');
    expect(cameraMountCount).toBe(2);
  });

  it('tears the session down in background and remounts it on active', () => {
    mockUsePathname.mockReturnValue('/scanner');
    renderSessionTree();

    expect(screen.getByTestId('mock-shared-camera-view')).toBeTruthy();
    expect(cameraMountCount).toBe(1);

    act(() => {
      latestAppStateListener?.('background');
    });

    expect(screen.queryByTestId('mock-shared-camera-view')).toBeNull();
    expect(screen.getByTestId('session-mounted').props.children).toBe('false');
    expect(cameraUnmountCount).toBe(1);

    act(() => {
      latestAppStateListener?.('active');
    });

    expect(screen.getByTestId('mock-shared-camera-view')).toBeTruthy();
    expect(screen.getByTestId('session-mounted').props.children).toBe('true');
    expect(screen.getByTestId('session-visible').props.children).toBe('true');
    expect(cameraMountCount).toBe(2);
  });
});
