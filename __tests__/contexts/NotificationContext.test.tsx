import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NotificationProvider, useNotificationContext } from '@/contexts/NotificationContext';

const mockSubscribe = jest.fn().mockReturnValue({ unsubscribe: jest.fn() });
const mockSelect = jest.fn();
const mockUpdate = jest.fn();
const mockInsert = jest.fn();
const mockScheduleDailyReminder = jest.fn().mockResolvedValue(undefined);
const mockScheduleMotivationalNotification = jest.fn().mockResolvedValue(undefined);
const mockScheduleLocalNotification = jest.fn().mockResolvedValue(undefined);
const mockScheduleSuperScanReset = jest.fn().mockResolvedValue(undefined);
const mockScheduleScanReadyNotification = jest.fn().mockResolvedValue(undefined);

const mockAuthState: {
  user: { id: string } | null;
  userProfile:
    | {
        notification_settings: {
          reminders: boolean;
          achievements: boolean;
          newContent: boolean;
        };
      }
    | null;
} = {
  user: { id: 'user-123' },
  userProfile: {
    notification_settings: {
      reminders: true,
      achievements: true,
      newContent: true,
    },
  },
};

const mockLocaleState = {
  locale: 'fr',
};

jest.mock('@/services/supabase', () => ({
  supabase: {
    channel: jest.fn(() => ({
      on: jest.fn().mockReturnThis(),
      subscribe: mockSubscribe,
    })),
    from: jest.fn(() => ({
      select: mockSelect,
      update: mockUpdate,
      insert: mockInsert,
    })),
  },
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockAuthState,
}));

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
    locale: mockLocaleState.locale,
  }),
}));

jest.mock('@/hooks/useNotifications', () => ({
  useNotifications: () => ({
    expoPushToken: 'test-token',
    scheduleLocalNotification: mockScheduleLocalNotification,
    scheduleDailyReminder: mockScheduleDailyReminder,
    scheduleSuperScanReset: mockScheduleSuperScanReset,
    scheduleMotivationalNotification: mockScheduleMotivationalNotification,
    scheduleScanReadyNotification: mockScheduleScanReadyNotification,
  }),
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <NotificationProvider>{children}</NotificationProvider>
    </QueryClientProvider>
  );
};

describe('NotificationContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState.user = { id: 'user-123' };
    mockAuthState.userProfile = {
      notification_settings: {
        reminders: true,
        achievements: true,
        newContent: true,
      },
    };
    mockLocaleState.locale = 'fr';

    mockSelect.mockReturnValue({
      eq: jest.fn().mockReturnValue({
        is: jest.fn().mockResolvedValue({ count: 0, error: null }),
        single: jest.fn().mockResolvedValue({ data: null, error: null }),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      }),
    });
    mockUpdate.mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      }),
    });
    mockInsert.mockResolvedValue({ error: null });
  });

  it('provides default notification state', async () => {
    const { result } = renderHook(() => useNotificationContext(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.hasUnreadNotifications).toBe(false);
      expect(result.current.notificationCount).toBe(0);
    });
  });

  it('throws error when used outside provider', () => {
    expect(() => {
      renderHook(() => useNotificationContext());
    }).toThrow('useNotificationContext must be used within a NotificationProvider');
  });

  it('marks notifications as read through Supabase', async () => {
    const { result } = renderHook(() => useNotificationContext(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.markNotificationAsRead).toBeDefined();
    });

    await act(async () => {
      await result.current.markNotificationAsRead('notification-123');
    });

    expect(mockUpdate).toHaveBeenCalledWith({
      read_at: expect.any(String),
    });
  });

  it('dedupes startup notification scheduling for equivalent rerenders and reruns on locale change', async () => {
    const { rerender } = renderHook(() => useNotificationContext(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(mockScheduleDailyReminder).toHaveBeenCalledTimes(1);
      expect(mockScheduleMotivationalNotification).toHaveBeenCalledTimes(1);
    });

    mockAuthState.userProfile = {
      notification_settings: {
        reminders: true,
        achievements: true,
        newContent: true,
      },
    };

    rerender({});

    await waitFor(() => {
      expect(mockScheduleDailyReminder).toHaveBeenCalledTimes(1);
      expect(mockScheduleMotivationalNotification).toHaveBeenCalledTimes(1);
    });

    mockLocaleState.locale = 'en';

    rerender({});

    await waitFor(() => {
      expect(mockScheduleDailyReminder).toHaveBeenCalledTimes(2);
      expect(mockScheduleMotivationalNotification).toHaveBeenCalledTimes(2);
    });
  });
});
