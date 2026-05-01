import React from 'react';
import { render } from '@testing-library/react-native';

const mockUseFeatureFlags = jest.fn();
const mockUseLocalSearchParams = jest.fn(() => ({}));
const mockReplace = jest.fn();
const mockUseAuth = jest.fn();
const mockClearBadge = jest.fn();

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string | { pathname: string; params?: Record<string, unknown> } }) => {
    const React = require('react');
    const { View } = require('react-native');
    return React.createElement(View, { testID: 'redirect-target', href });
  },
  useRouter: () => ({
    replace: mockReplace,
  }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => callback(),
}));

jest.mock('@/hooks/queries', () => ({
  useFeatureFlags: () => mockUseFeatureFlags(),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/contexts/BadgeContext', () => ({
  useBadges: () => ({
    clearBadge: mockClearBadge,
  }),
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#FFFFFF',
      primary: '#007AFF',
    },
  }),
}));

jest.mock('@/screens/CoachScreen', () => (props: any) => {
  const React = require('react');
  const { View } = require('react-native');
  return React.createElement(View, {
    testID: 'coach-screen',
    variant: props.variant,
  });
});

jest.mock('@/screens/AnalyticsScreen', () => () => {
  const React = require('react');
  const { View } = require('react-native');
  return React.createElement(View, { testID: 'analytics-screen' });
});

jest.mock('@/screens/EntryOfferScreen', () => () => {
  const React = require('react');
  const { View } = require('react-native');
  return React.createElement(View, { testID: 'entry-offer-screen' });
});

jest.mock('@/screens/SocialComposerScreen', () => () => {
  const React = require('react');
  const { View } = require('react-native');
  return React.createElement(View, { testID: 'social-composer-screen' });
});

jest.mock('@/screens/SocialCommentsScreen', () => () => {
  const React = require('react');
  const { View } = require('react-native');
  return React.createElement(View, { testID: 'social-comments-screen' });
});

import SocialPostRoute from '@/app/social-post';
import CoachRoute from '@/app/coach';
import AnalyticsRoute from '@/app/analytics';
import CoachTabRoute from '@/app/(tabs)/coach';
import EntryOfferRoute from '@/app/entry-offer';
import SocialComposeRoute from '@/app/social-compose';
import SocialCommentsRoute from '@/app/social-comments';

describe('feature-flagged routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLocalSearchParams.mockReturnValue({
      postId: 'post-1',
      focusComposer: '1',
    });
    mockUseAuth.mockReturnValue({
      loading: false,
      userProfile: {
        account_tier: 'premium',
      },
    });
  });

  it('renders coach even when the coach flag is disabled', () => {
    mockUseFeatureFlags.mockReturnValue({
      data: {
        social_enabled: false,
        coach_enabled: false,
        entry_offer_enabled: false,
        social_comments_enabled: false,
      },
      isFetching: false,
    });

    const screen = render(<CoachRoute />);

    expect(screen.getByTestId('coach-screen')).toBeTruthy();
  });

  it('renders coach when the flag is enabled', () => {
    mockUseFeatureFlags.mockReturnValue({
      data: {
        social_enabled: false,
        coach_enabled: true,
        entry_offer_enabled: false,
        social_comments_enabled: false,
      },
      isFetching: false,
    });

    const screen = render(<CoachRoute />);

    expect(screen.getByTestId('coach-screen')).toBeTruthy();
  });

  it('renders coach in the coach tab for premium users', () => {
    const screen = render(<CoachTabRoute />);

    expect(screen.getByTestId('coach-screen').props.variant).toBe('tab');
    expect(mockClearBadge).toHaveBeenCalledWith('coach');
  });

  it('renders coach in the coach tab for free users without redirecting to premium', () => {
    mockUseAuth.mockReturnValue({
      loading: false,
      userProfile: {
        account_tier: 'free',
      },
    });

    const screen = render(<CoachTabRoute />);

    expect(screen.getByTestId('coach-screen').props.variant).toBe('tab');
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('renders the full analytics route outside the coach tab', () => {
    const screen = render(<AnalyticsRoute />);

    expect(screen.getByTestId('analytics-screen')).toBeTruthy();
  });

  it('redirects entry-offer back to tabs when the flag is disabled', () => {
    mockUseFeatureFlags.mockReturnValue({
      data: {
        social_enabled: false,
        coach_enabled: false,
        entry_offer_enabled: false,
        social_comments_enabled: false,
      },
      isFetching: false,
    });

    const screen = render(<EntryOfferRoute />);

    expect(screen.getByTestId('redirect-target').props.href).toBe('/(tabs)');
  });

  it('renders entry-offer when the flag is enabled', () => {
    mockUseFeatureFlags.mockReturnValue({
      data: {
        social_enabled: false,
        coach_enabled: false,
        entry_offer_enabled: true,
        social_comments_enabled: false,
      },
      isFetching: false,
    });

    const screen = render(<EntryOfferRoute />);

    expect(screen.getByTestId('entry-offer-screen')).toBeTruthy();
  });

  it('renders social compose even when social is disabled', () => {
    mockUseFeatureFlags.mockReturnValue({
      data: {
        social_enabled: false,
        coach_enabled: false,
        entry_offer_enabled: false,
        social_comments_enabled: false,
      },
      isFetching: false,
    });

    const screen = render(<SocialComposeRoute />);

    expect(screen.getByTestId('social-composer-screen')).toBeTruthy();
  });

  it('renders social compose when social is enabled', () => {
    mockUseFeatureFlags.mockReturnValue({
      data: {
        social_enabled: true,
        coach_enabled: false,
        entry_offer_enabled: false,
        social_comments_enabled: false,
      },
      isFetching: false,
    });

    const screen = render(<SocialComposeRoute />);

    expect(screen.getByTestId('social-composer-screen')).toBeTruthy();
  });

  it('redirects social comments alias to /social when comments are disabled', () => {
    mockUseFeatureFlags.mockReturnValue({
      data: {
        social_enabled: true,
        coach_enabled: false,
        entry_offer_enabled: false,
        social_comments_enabled: false,
      },
      isFetching: false,
    });

    const screen = render(<SocialCommentsRoute />);

    expect(screen.getByTestId('redirect-target').props.href).toBe('/(tabs)/social');
  });

  it('redirects social comments alias to social-post when comments are enabled', () => {
    mockUseFeatureFlags.mockReturnValue({
      data: {
        social_enabled: false,
        coach_enabled: false,
        entry_offer_enabled: false,
        social_comments_enabled: true,
      },
      isFetching: false,
    });

    const screen = render(<SocialCommentsRoute />);

    expect(screen.getByTestId('redirect-target').props.href).toEqual({
      pathname: '/social-post',
      params: {
        postId: 'post-1',
        focusComposer: '1',
      },
    });
  });

  it('redirects social comments alias to social-post when social is enabled and comments flag is absent', () => {
    mockUseFeatureFlags.mockReturnValue({
      data: {
        social_enabled: true,
        coach_enabled: false,
        entry_offer_enabled: false,
      },
      isFetching: false,
    });

    const screen = render(<SocialCommentsRoute />);

    expect(screen.getByTestId('redirect-target').props.href).toEqual({
      pathname: '/social-post',
      params: {
        postId: 'post-1',
        focusComposer: '1',
      },
    });
  });

  it('redirects social comments alias to social-post while comments config is unresolved', () => {
    mockUseFeatureFlags.mockReturnValue({
      data: {
        social_enabled: false,
        coach_enabled: false,
        entry_offer_enabled: false,
        social_comments_enabled: false,
        config_source: 'default',
      },
      dataUpdatedAt: 0,
      isFetching: true,
    });

    const screen = render(<SocialCommentsRoute />);

    expect(screen.getByTestId('redirect-target').props.href).toEqual({
      pathname: '/social-post',
      params: {
        postId: 'post-1',
        focusComposer: '1',
      },
    });
  });

  it('renders social post when comments are enabled even if social is disabled', () => {
    mockUseFeatureFlags.mockReturnValue({
      data: {
        social_enabled: false,
        coach_enabled: false,
        entry_offer_enabled: false,
        social_comments_enabled: true,
      },
      isFetching: false,
    });

    const screen = render(<SocialPostRoute />);

    expect(screen.getByTestId('social-comments-screen')).toBeTruthy();
  });

  it('renders social post when social is enabled and comments flag is absent', () => {
    mockUseFeatureFlags.mockReturnValue({
      data: {
        social_enabled: true,
        coach_enabled: false,
        entry_offer_enabled: false,
      },
      isFetching: false,
    });

    const screen = render(<SocialPostRoute />);

    expect(screen.getByTestId('social-comments-screen')).toBeTruthy();
  });

  it('renders social post while comments config is unresolved', () => {
    mockUseFeatureFlags.mockReturnValue({
      data: {
        social_enabled: false,
        coach_enabled: false,
        entry_offer_enabled: false,
        social_comments_enabled: false,
        config_source: 'default',
      },
      dataUpdatedAt: 0,
      isFetching: true,
    });

    const screen = render(<SocialPostRoute />);

    expect(screen.getByTestId('social-comments-screen')).toBeTruthy();
  });
});
