import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NotificationBell } from '@/components/NotificationBell';

// Mock dependencies
jest.mock('lucide-react-native', () => ({
  Bell: 'Bell',
}));



const mockNavigateToNotifications = jest.fn();
jest.mock('@/services/navigation', () => ({
  navigationService: {
    navigateToNotifications: () => mockNavigateToNotifications(),
  },
}));

const mockUseNotificationContext = jest.fn();
jest.mock('@/contexts/NotificationContext', () => ({
  useNotificationContext: () => mockUseNotificationContext(),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: null,
  }),
}));

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
  }),
}));

const renderNotificationBell = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <NotificationBell />
    </QueryClientProvider>
  );
};

describe('NotificationBell', () => {
  beforeEach(() => {
    mockNavigateToNotifications.mockClear();
    mockUseNotificationContext.mockClear();
  });

  it('renders without crashing', () => {
    mockUseNotificationContext.mockReturnValue({ notificationCount: 0 });

    const { toJSON } = renderNotificationBell();

    expect(toJSON()).toBeTruthy();
  });

  it('does not show badge when notification count is 0', () => {
    mockUseNotificationContext.mockReturnValue({ notificationCount: 0 });

    renderNotificationBell();

    expect(screen.queryByText('0')).toBeNull();
  });

  it('shows badge with count when notifications exist', () => {
    mockUseNotificationContext.mockReturnValue({ notificationCount: 5 });

    renderNotificationBell();

    expect(screen.getByText('5')).toBeTruthy();
  });

  it('shows 9+ when notification count exceeds 9', () => {
    mockUseNotificationContext.mockReturnValue({ notificationCount: 15 });

    renderNotificationBell();

    expect(screen.getByText('9+')).toBeTruthy();
  });

  it('navigates to notifications when pressed', () => {
    mockUseNotificationContext.mockReturnValue({ notificationCount: 3 });

    renderNotificationBell();

    // Find and press the touchable
    const badge = screen.getByText('3');
    const touchable = badge.parent?.parent;
    if (touchable) {
      fireEvent.press(touchable);
    }

    expect(mockNavigateToNotifications).toHaveBeenCalled();
  });
});
