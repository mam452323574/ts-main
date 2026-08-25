import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useNotifications } from '@/hooks/useNotifications';

const mockDismissAllModalsAndNavigate = jest.fn();

// Mock expo-notifications
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getExpoPushTokenAsync: jest.fn().mockResolvedValue({ data: 'mock-token' }),
  addNotificationReceivedListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
  addNotificationResponseReceivedListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
  removeNotificationSubscription: jest.fn(),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('notification-id'),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { MAX: 5 },
  SchedulableTriggerInputTypes: {
    TIME_INTERVAL: 'timeInterval',
    DAILY: 'daily',
    DATE: 'date',
  },
}));

// Mock expo-device
jest.mock('expo-device', () => ({
  isDevice: true,
}));

jest.mock('@/services/navigation', () => ({
  navigationService: {
    dismissAllModalsAndNavigate: (...args: unknown[]) =>
      mockDismissAllModalsAndNavigate(...args),
  },
}));

// Mock supabase
jest.mock('@/services/supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnValue({
      update: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      }),
    }),
  },
}));

// Mock useAuth
const mockUser = { id: 'user-123', email: 'test@example.com' };
const mockUseAuth = jest.fn();

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

describe('useNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: null });
  });

  it('returns expoPushToken as null initially', () => {
    mockUseAuth.mockReturnValue({ user: null });

    const { result } = renderHook(() => useNotifications());

    expect(result.current.expoPushToken).toBeNull();
  });

  it('returns notification as null initially', () => {
    mockUseAuth.mockReturnValue({ user: null });

    const { result } = renderHook(() => useNotifications());

    expect(result.current.notification).toBeNull();
  });

  it('exposes scheduleLocalNotification function', () => {
    mockUseAuth.mockReturnValue({ user: null });

    const { result } = renderHook(() => useNotifications());

    expect(typeof result.current.scheduleLocalNotification).toBe('function');
  });

  it('does not register for notifications without user', () => {
    const Notifications = require('expo-notifications');
    mockUseAuth.mockReturnValue({ user: null });

    renderHook(() => useNotifications());

    expect(Notifications.addNotificationReceivedListener).not.toHaveBeenCalled();
  });

  it('registers notification listeners when user is present', async () => {
    const Notifications = require('expo-notifications');
    mockUseAuth.mockReturnValue({ user: mockUser });

    renderHook(() => useNotifications());

    await waitFor(() => {
      expect(Notifications.addNotificationReceivedListener).toHaveBeenCalled();
    });
  });

  it('does not request push permission automatically when user is present', async () => {
    const Notifications = require('expo-notifications');
    mockUseAuth.mockReturnValue({ user: mockUser });

    renderHook(() => useNotifications());

    await waitFor(() => {
      expect(Notifications.addNotificationReceivedListener).toHaveBeenCalled();
    });

    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it('registers response listener when user is present', async () => {
    const Notifications = require('expo-notifications');
    mockUseAuth.mockReturnValue({ user: mockUser });

    renderHook(() => useNotifications());

    await waitFor(() => {
      expect(Notifications.addNotificationResponseReceivedListener).toHaveBeenCalled();
    });
  });

  it('cleans up listeners on unmount', async () => {
    const Notifications = require('expo-notifications');
    mockUseAuth.mockReturnValue({ user: mockUser });

    const { unmount } = renderHook(() => useNotifications());

    await waitFor(() => {
      expect(Notifications.addNotificationReceivedListener).toHaveBeenCalled();
    });

    unmount();

    expect(
      Notifications.addNotificationReceivedListener.mock.results[0].value.remove
    ).toHaveBeenCalled();
    expect(
      Notifications.addNotificationResponseReceivedListener.mock.results[0].value.remove
    ).toHaveBeenCalled();
  });

  it('scheduleLocalNotification calls Notifications.scheduleNotificationAsync', async () => {
    const Notifications = require('expo-notifications');
    mockUseAuth.mockReturnValue({ user: null });

    const { result } = renderHook(() => useNotifications());

    await result.current.scheduleLocalNotification('Test Title', 'Test Body', { key: 'value' });

    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
      content: {
        title: 'Test Title',
        body: 'Test Body',
        data: { key: 'value' },
        sound: true,
      },
      trigger: { type: 'timeInterval', seconds: 1 },
    });
  });

  it('dedupes scan ready notifications for the same scan type and timestamp', async () => {
    const Notifications = require('expo-notifications');
    const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000);
    mockUseAuth.mockReturnValue({ user: null });

    try {
      const { result } = renderHook(() => useNotifications());
      const nextDateMs = 2_000_000;

      await result.current.scheduleScanReadyNotification('health', nextDateMs);
      await result.current.scheduleScanReadyNotification('health', nextDateMs);

      expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(1);
      expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(
        'scan-ready-health',
      );
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          identifier: 'scan-ready-health',
          content: expect.objectContaining({
            data: { type: 'scan_ready', scanType: 'health' },
          }),
          trigger: {
            type: 'date',
            date: new Date(nextDateMs),
          },
        }),
      );
    } finally {
      dateNowSpy.mockRestore();
    }
  });

  it('retries scan ready scheduling after a failed scheduler call', async () => {
    const Notifications = require('expo-notifications');
    const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000);
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    Notifications.scheduleNotificationAsync
      .mockRejectedValueOnce(new Error('scheduler unavailable'))
      .mockResolvedValueOnce('notification-id');
    mockUseAuth.mockReturnValue({ user: null });

    try {
      const { result } = renderHook(() => useNotifications());
      const nextDateMs = 2_000_000;

      await result.current.scheduleScanReadyNotification('health', nextDateMs);
      await result.current.scheduleScanReadyNotification('health', nextDateMs);

      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
      expect(consoleSpy).toHaveBeenCalledWith(
        '[Notifications] Erreur planification Scan Ready (health):',
        expect.any(Error),
      );
    } finally {
      consoleSpy.mockRestore();
      dateNowSpy.mockRestore();
    }
  });

  it('skips expired scan ready timestamps before touching the native scheduler', async () => {
    const Notifications = require('expo-notifications');
    const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(2_000);
    mockUseAuth.mockReturnValue({ user: null });

    try {
      const { result } = renderHook(() => useNotifications());

      await result.current.scheduleScanReadyNotification('health', 1_000);

      expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
      expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    } finally {
      dateNowSpy.mockRestore();
    }
  });

  describe('memory cleanup', () => {
    it('does not update state after unmount', async () => {
      const Notifications = require('expo-notifications');
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

      // Create a delayed token resolution using a controllable promise
      let resolveTokenFn: ((value: { data: string }) => void) | null = null;
      const tokenPromise = new Promise<{ data: string }>(resolve => {
        resolveTokenFn = resolve;
      });
      Notifications.getExpoPushTokenAsync.mockReturnValue(tokenPromise);

      mockUseAuth.mockReturnValue({ user: mockUser });

      const { result, unmount } = renderHook(() => useNotifications());
      const registrationPromise = result.current.registerForPushNotifications();

      // Unmount before the token resolves
      unmount();

      // Now resolve the token - this should not cause a state update warning
      if (resolveTokenFn) {
        // @ts-ignore
        (resolveTokenFn as any)({ data: 'late-token' });
      }
      await registrationPromise;

      // Wait a bit to ensure no warnings are triggered
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should not have any "Can't perform a React state update" warnings
      const stateUpdateWarnings = consoleSpy.mock.calls.filter(
        call => call[0]?.toString().includes("Can't perform a React state update")
      );
      expect(stateUpdateWarnings.length).toBe(0);

      consoleSpy.mockRestore();
    });

    it('saves push token to database after explicit registration', async () => {
      const { supabase } = require('@/services/supabase');
      const Notifications = require('expo-notifications');

      // Ensure getExpoPushTokenAsync resolves with a token
      Notifications.getExpoPushTokenAsync.mockResolvedValue({ data: 'test-push-token' });

      mockUseAuth.mockReturnValue({ user: mockUser });

      const { result } = renderHook(() => useNotifications());
      await act(async () => {
        await result.current.registerForPushNotifications();
      });

      await waitFor(() => {
        expect(supabase.from).toHaveBeenCalledWith('user_profiles');
      });
    });
  });

  describe('notification listeners', () => {
    it('sets up notification received listener with callback', async () => {
      const Notifications = require('expo-notifications');
      mockUseAuth.mockReturnValue({ user: mockUser });

      renderHook(() => useNotifications());

      await waitFor(() => {
        expect(Notifications.addNotificationReceivedListener).toHaveBeenCalledWith(
          expect.any(Function)
        );
      });
    });

    it('sets up notification response listener with callback', async () => {
      const Notifications = require('expo-notifications');
      mockUseAuth.mockReturnValue({ user: mockUser });

      renderHook(() => useNotifications());

      await waitFor(() => {
        expect(Notifications.addNotificationResponseReceivedListener).toHaveBeenCalledWith(
          expect.any(Function)
        );
      });
    });

    it('routes scan ready responses to /(tabs)', async () => {
      const Notifications = require('expo-notifications');
      mockUseAuth.mockReturnValue({ user: mockUser });

      renderHook(() => useNotifications());

      await waitFor(() => {
        expect(Notifications.addNotificationResponseReceivedListener).toHaveBeenCalledWith(
          expect.any(Function)
        );
      });

      const responseCallback =
        Notifications.addNotificationResponseReceivedListener.mock.calls[0][0];

      responseCallback({
        notification: {
          request: {
            content: {
              data: { type: 'scan_ready' },
            },
          },
        },
      });

      expect(mockDismissAllModalsAndNavigate).toHaveBeenCalledWith('/(tabs)');
    });

    it('routes achievement responses to /notifications', async () => {
      const Notifications = require('expo-notifications');
      mockUseAuth.mockReturnValue({ user: mockUser });

      renderHook(() => useNotifications());

      await waitFor(() => {
        expect(Notifications.addNotificationResponseReceivedListener).toHaveBeenCalledWith(
          expect.any(Function)
        );
      });

      const responseCallback =
        Notifications.addNotificationResponseReceivedListener.mock.calls[0][0];

      responseCallback({
        notification: {
          request: {
            content: {
              data: { type: 'achievement' },
            },
          },
        },
      });

      expect(mockDismissAllModalsAndNavigate).toHaveBeenCalledWith('/notifications');
    });

    it('routes invalid notification payloads to /notifications', async () => {
      const Notifications = require('expo-notifications');
      mockUseAuth.mockReturnValue({ user: mockUser });

      renderHook(() => useNotifications());

      await waitFor(() => {
        expect(Notifications.addNotificationResponseReceivedListener).toHaveBeenCalledWith(
          expect.any(Function)
        );
      });

      const responseCallback =
        Notifications.addNotificationResponseReceivedListener.mock.calls[0][0];

      responseCallback({
        notification: {
          request: {
            content: {
              data: { foo: 'bar' },
            },
          },
        },
      });

      expect(mockDismissAllModalsAndNavigate).toHaveBeenCalledWith('/notifications');
    });
  });
});
