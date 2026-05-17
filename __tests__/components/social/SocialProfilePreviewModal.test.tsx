import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import { SocialProfilePreviewModal } from '@/components/social/SocialProfilePreviewModal';

jest.mock('@/components/ProfileAvatar', () => {
  const ReactLocal = require('react');
  const { View: RNView } = require('react-native');
  return {
    ProfileAvatar: ({ testID }: { testID?: string }) =>
      ReactLocal.createElement(RNView, { testID }),
  };
});

jest.mock('@/components/ModalHandle', () => {
  const ReactLocal = require('react');
  const { View: RNView } = require('react-native');
  return {
    ModalHandle: () => ReactLocal.createElement(RNView, null),
  };
});

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
    locale: 'fr',
  }),
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#f7f7f7',
      cardBackground: '#ffffff',
      surfaceMuted: '#f1f5f9',
      primaryText: '#1f2937',
      primary: '#2563eb',
      gray: '#6b7280',
      textMuted: '#6b7280',
      borderSubtle: '#e5e7eb',
      borderStrong: '#cbd5e1',
      error: '#dc2626',
      warning: '#d97706',
      white: '#ffffff',
    },
  }),
}));

const mockUseSocialPublicProfile = jest.fn();
jest.mock('@/hooks/queries/useSocialPublicProfile', () => ({
  useSocialPublicProfile: (userId: string | null | undefined, enabled: boolean) =>
    mockUseSocialPublicProfile(userId, enabled),
}));

jest.mock('@/utils/socialFormatting', () => ({
  formatSocialAbsoluteDate: () => '2026-04-01',
  formatSocialMemberSinceLabel: () => 'depuis 30 jours',
}));

describe('SocialProfilePreviewModal', () => {
  beforeEach(() => {
    mockUseSocialPublicProfile.mockReturnValue({
      data: {
        id: 'author-1',
        username: 'alice',
        avatar_url: null,
        account_created_at: '2026-03-01T00:00:00Z',
        created_at: '2026-03-01T00:00:00Z',
        scan_count: 12,
      },
      isLoading: false,
      isFetching: false,
    });
  });

  it('renders the Follow button for a viewable profile that is not the viewer’s own', () => {
    const onFollowPress = jest.fn();

    const screen = render(
      <SocialProfilePreviewModal
        visible
        userId="author-1"
        onClose={jest.fn()}
        isOwnProfile={false}
        isAuthorFollowed={false}
        onFollowPress={onFollowPress}
      />,
    );

    expect(screen.getByTestId('social-profile-follow-button')).toBeTruthy();
  });

  it('does not render the Follow button when isOwnProfile is true', () => {
    const screen = render(
      <SocialProfilePreviewModal
        visible
        userId="viewer-1"
        onClose={jest.fn()}
        isOwnProfile
        onFollowPress={jest.fn()}
      />,
    );

    expect(screen.queryByTestId('social-profile-follow-button')).toBeNull();
  });

  it('does not render the Follow button when onFollowPress is undefined', () => {
    const screen = render(
      <SocialProfilePreviewModal
        visible
        userId="author-1"
        onClose={jest.fn()}
        isOwnProfile={false}
      />,
    );

    expect(screen.queryByTestId('social-profile-follow-button')).toBeNull();
  });

  it('does not render the Follow button when no profile is loaded yet', () => {
    mockUseSocialPublicProfile.mockReturnValueOnce({
      data: null,
      isLoading: true,
      isFetching: true,
    });

    const screen = render(
      <SocialProfilePreviewModal
        visible
        userId="author-1"
        onClose={jest.fn()}
        isOwnProfile={false}
        onFollowPress={jest.fn()}
      />,
    );

    expect(screen.queryByTestId('social-profile-follow-button')).toBeNull();
  });

  it('invokes onFollowPress when the button is tapped', () => {
    const onFollowPress = jest.fn();

    const screen = render(
      <SocialProfilePreviewModal
        visible
        userId="author-1"
        onClose={jest.fn()}
        isOwnProfile={false}
        isAuthorFollowed={false}
        onFollowPress={onFollowPress}
      />,
    );

    fireEvent.press(screen.getByTestId('social-profile-follow-button'));

    expect(onFollowPress).toHaveBeenCalledTimes(1);
  });

  it('disables the Follow button when followBusy is true', () => {
    const onFollowPress = jest.fn();

    const screen = render(
      <SocialProfilePreviewModal
        visible
        userId="author-1"
        onClose={jest.fn()}
        isOwnProfile={false}
        isAuthorFollowed={false}
        followBusy
        onFollowPress={onFollowPress}
      />,
    );

    const button = screen.getByTestId('social-profile-follow-button');
    fireEvent.press(button);

    expect(onFollowPress).not.toHaveBeenCalled();
  });
});
