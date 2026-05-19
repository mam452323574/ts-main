import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import SettingsScreen from '@/app/settings';

const mockUseAuth = jest.fn();
const mockUseAllScanEligibility = jest.fn();
const mockRouterPush = jest.fn();
const mockRouterBack = jest.fn();
const mockRouterReplace = jest.fn();
const mockShowAlert = jest.fn();
let latestFocusEffectCallback: (() => void) | undefined;

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockRouterPush,
    back: mockRouterBack,
    replace: mockRouterReplace,
  }),
  useFocusEffect: (callback: () => void) => {
    latestFocusEffectCallback = callback;
  },
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
  },
  NotificationFeedbackType: {
    Warning: 'warning',
  },
}));

jest.mock('lucide-react-native', () => ({
  Crown: 'Crown',
  ChevronRight: 'ChevronRight',
  Shield: 'Shield',
  ShieldAlert: 'ShieldAlert',
  LogOut: 'LogOut',
  Bell: 'Bell',
  ArrowLeft: 'ArrowLeft',
  ChevronLeft: 'ChevronLeft',
  AlertTriangle: 'AlertTriangle',
  Settings: 'Settings',
  Globe: 'Globe',
  Check: 'Check',
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#F2F2F7',
      cardBackground: '#FFFFFF',
      primaryText: '#1D1D1F',
      primary: '#007AFF',
      gray: '#8E8E93',
      lightGray: '#E5E5EA',
      gold: '#FFD700',
      error: '#FF3B30',
      white: '#FFFFFF',
    },
    isDark: false,
  }),
}));

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) =>
      (
        {
          'settings.title': 'Settings',
          'settings.section_subscription': 'Subscription',
          'settings.section_preferences': 'Preferences',
          'settings.section_app': 'App',
          'settings.upgrade_premium': 'Upgrade Premium',
          'settings.upgrade_subtitle': 'Unlock all scans & features',
          'settings.language': 'Language',
          'settings.notifications': 'Notifications',
          'settings.notifications_preferences': 'Notification Preferences',
          'settings.admin_moderation': 'Admin moderation',
          'settings.admin_moderation_subtitle': 'Review reported social content',
          'settings.privacy_policy': 'Privacy Policy',
          'settings.danger_zone_title': 'Danger zone',
          'settings.danger_zone_desc': 'Sign out safely at any time.',
          'settings.sign_out_button': 'Sign Out',
          'settings.sign_out_loading': 'Signing out...',
          'settings.footer_version': 'Version',
          'settings.cancel': 'Cancel',
          'settings.ok': 'OK',
          'settings.sign_out_confirm_title': 'Ready to sign out?',
          'settings.sign_out_confirm_msg': 'Your session will close safely, and you can come back anytime.',
          'settings.sign_out_error_title': 'Sign out interrupted',
          'settings.sign_out_error_msg': 'A small issue happened. Please try again in a moment, your data is safe.',
          'home.items_available': 'Available Scans',
          'scan_types.health': 'Face',
          'scan_types.body': 'Body',
          'scan_types.nutrition': 'Nutrition',
          'scan_types.super': 'Super Scan',
          'scan_limit.loading': 'Loading',
          'scan_limit.unavailable': 'Unavailable',
          'scan_limit.auth_unready': 'Connecting',
          'scan_limit.query_error': 'Quota error',
          'scan_limit.backend_unavailable': 'Service unavailable',
          'scan_limit.missing_payload': 'Data unavailable',
          'scan_limits.premium_only': 'Premium only',
        } as Record<string, string>
      )[key] ?? key,
    locale: 'en',
    changeLanguage: jest.fn(),
    isChangingLanguage: false,
  }),
}));

jest.mock('@/contexts/NotificationContext', () => ({
  useNotificationContext: () => ({
    notificationCount: 0,
  }),
}));

jest.mock('@/hooks/queries', () => ({
  useAllScanEligibility: () => mockUseAllScanEligibility(),
}));
jest.mock('@/hooks/queries/useScanEligibility', () => ({
  useAllScanEligibility: () => mockUseAllScanEligibility(),
}));

jest.mock('@/hooks/useCustomAlert', () => ({
  useCustomAlert: () => ({
    showAlert: (...args: any[]) => mockShowAlert(...args),
    alertElement: null,
  }),
}));

jest.mock('@/components/AvatarPicker', () => ({
  AvatarPicker: () => 'AvatarPicker',
}));

jest.mock('@/components/AccountBadge', () => ({
  AccountBadge: ({ tier }: { tier: string }) => {
    const React = require('react');
    const { Text } = require('react-native');

    return <Text>{`badge:${tier}`}</Text>;
  },
}));

jest.mock('@/components/Button', () => ({
  Button: ({ title }: { title: string }) => {
    const React = require('react');
    const { Text } = require('react-native');

    return <Text>{title}</Text>;
  },
}));

jest.mock('@/components/ModalHandle', () => ({
  ModalHandle: () => null,
}));

jest.mock('@/services/navigation', () => ({
  navigationService: {
    navigateToNotifications: jest.fn(),
  },
}));

const buildEligibilityHookResult = (overrides: Partial<Record<string, any>> = {}) => ({
  data: {},
  errors: {},
  loadingByScanType: {
    body: false,
    health: false,
    nutrition: false,
    super: false,
  },
  isLoading: false,
  isAuthReady: true,
  canQuery: true,
  refetchAll: jest.fn(),
  ...overrides,
});

const buildUserProfile = (
  overrides: Partial<{
    id: string;
    username: string;
    email: string;
    avatar_url: string | null;
    account_tier: 'free' | 'premium' | 'admin';
  }> = {}
) => ({
  id: 'user-1',
  username: 'AdminUser',
  email: 'admin@example.com',
  avatar_url: null,
  account_tier: 'admin' as const,
  ...overrides,
});

function collectTestIds(node: any, acc: string[] = []): string[] {
  if (!node) {
    return acc;
  }

  if (Array.isArray(node)) {
    node.forEach((child) => collectTestIds(child, acc));
    return acc;
  }

  if (node.props?.testID) {
    acc.push(node.props.testID);
  }

  if (node.children) {
    collectTestIds(node.children, acc);
  }

  return acc;
}

describe('SettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockShowAlert.mockReset();
    latestFocusEffectCallback = undefined;
    mockUseAuth.mockReturnValue({
      userProfile: buildUserProfile(),
      signOut: jest.fn(),
      updateAvatarUrl: jest.fn(),
    });
    mockUseAllScanEligibility.mockReturnValue(
      buildEligibilityHookResult({
        data: {
          body: { allowed: true, remaining: 20, limit: 20, current_count: 0, message: 'OK' },
          health: { allowed: true, remaining: 20, limit: 20, current_count: 0, message: 'OK' },
          nutrition: { allowed: true, remaining: 20, limit: 20, current_count: 0, message: 'OK' },
          super: { allowed: true, remaining: 20, limit: 20, current_count: 0, message: 'OK' },
        },
      })
    );
  });

  it('renders numeric admin quotas inside the subscription card', () => {
    render(<SettingsScreen />);

    expect(screen.getByTestId('settings-quota-summary')).toBeTruthy();
    expect(screen.getAllByText('20/20')).toHaveLength(4);
    expect(screen.queryByText('...')).toBeNull();
  });

  it('renders the settings chrome inside the scroll flow before the page content', () => {
    const rendered = render(<SettingsScreen />);
    const testIds = collectTestIds(rendered.toJSON());
    const topChromeStyle = StyleSheet.flatten(
      screen.getByTestId('settings-top-chrome').props.style,
    );

    expect(screen.getByTestId('settings-scroll')).toBeTruthy();
    expect(screen.getByTestId('settings-top-chrome')).toBeTruthy();
    expect(screen.queryByTestId('settings-top-chrome-handle')).toBeNull();
    expect(screen.getByTestId('settings-top-chrome-left-action')).toBeTruthy();
    expect(screen.getByTestId('settings-screen-header')).toBeTruthy();
    expect(testIds.indexOf('settings-scroll')).toBeLessThan(
      testIds.indexOf('settings-top-chrome'),
    );
    expect(testIds.indexOf('settings-top-chrome')).toBeLessThan(
      testIds.indexOf('settings-profile-header'),
    );
    expect(topChromeStyle.backgroundColor).toBe('#000000');
    expect(topChromeStyle.borderBottomWidth).toBe(0);
    expect(topChromeStyle.borderBottomColor).toBe('transparent');
    expect(screen.getByTestId('settings-quota-summary')).toBeTruthy();
  });

  it('routes the settings chrome back action through router.back', () => {
    render(<SettingsScreen />);

    fireEvent.press(screen.getByTestId('settings-top-chrome-left-action'));

    expect(mockRouterBack).toHaveBeenCalledTimes(1);
  });

  it('renders explicit loading text for unresolved quota rows', () => {
    mockUseAllScanEligibility.mockReturnValue(
      buildEligibilityHookResult({
        data: {
          body: { allowed: true, remaining: 20, limit: 20, current_count: 0, message: 'OK' },
          nutrition: { allowed: true, remaining: 20, limit: 20, current_count: 0, message: 'OK' },
          super: { allowed: true, remaining: 20, limit: 20, current_count: 0, message: 'OK' },
        },
        loadingByScanType: {
          body: false,
          health: true,
          nutrition: false,
          super: false,
        },
      })
    );

    render(<SettingsScreen />);

    expect(screen.getByText('Loading')).toBeTruthy();
    expect(screen.queryByText('...')).toBeNull();
  });

  it('renders explicit unavailable text when quota data fails to resolve', () => {
    mockUseAllScanEligibility.mockReturnValue(
      buildEligibilityHookResult({
        data: {
          body: { allowed: true, remaining: 20, limit: 20, current_count: 0, message: 'OK' },
          nutrition: { allowed: true, remaining: 20, limit: 20, current_count: 0, message: 'OK' },
          super: { allowed: true, remaining: 20, limit: 20, current_count: 0, message: 'OK' },
        },
        errors: {
          health: new Error('failed'),
        },
      })
    );

    render(<SettingsScreen />);

    expect(screen.getByText('Quota error')).toBeTruthy();
    expect(screen.queryByText('...')).toBeNull();
  });

  it('refetches eligibility when settings gains focus', async () => {
    const refetchAll = jest.fn().mockResolvedValue([]);
    mockUseAllScanEligibility.mockReturnValue(
      buildEligibilityHookResult({
        refetchAll,
      })
    );

    render(<SettingsScreen />);

    await act(async () => {
      latestFocusEffectCallback?.();
      await Promise.resolve();
    });

    expect(refetchAll).toHaveBeenCalledTimes(1);
  });

  it('shows the admin moderation entry for admin profiles', () => {
    render(<SettingsScreen />);

    expect(screen.getByTestId('settings-admin-moderation')).toBeTruthy();
    expect(screen.getByText('Admin moderation')).toBeTruthy();
    expect(screen.getByText('Review reported social content')).toBeTruthy();
  });

  it('hides the admin moderation entry for non-admin profiles', () => {
    mockUseAuth.mockReturnValue({
      userProfile: buildUserProfile({
        account_tier: 'premium',
        username: 'PremiumUser',
        email: 'premium@example.com',
      }),
      signOut: jest.fn(),
      updateAvatarUrl: jest.fn(),
    });

    render(<SettingsScreen />);

    expect(screen.queryByTestId('settings-admin-moderation')).toBeNull();
  });

  it('navigates to the admin moderation screen from the settings entry', () => {
    render(<SettingsScreen />);

    fireEvent.press(screen.getByTestId('settings-admin-moderation'));

    expect(mockRouterPush).toHaveBeenCalledWith('/admin-social-moderation');
  });

  it('opens the localized sign-out confirmation alert', () => {
    render(<SettingsScreen />);

    fireEvent.press(screen.getByText('Sign Out'));

    expect(mockShowAlert).toHaveBeenCalledWith(
      'Ready to sign out?',
      'Your session will close safely, and you can come back anytime.',
      expect.any(Array),
      undefined,
      expect.objectContaining({
        variant: 'danger',
        emoji: '👋',
      }),
    );
  });
});
