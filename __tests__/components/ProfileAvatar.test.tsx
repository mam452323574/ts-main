import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';

import { ProfileAvatar } from '@/components/ProfileAvatar';

jest.mock('@/hooks/useResolvedAvatarUrl', () => ({
  useResolvedAvatarUrl: (value: string | null | undefined) => value ?? null,
}));

describe('ProfileAvatar', () => {
  it('renders remote avatars as circular cover images', () => {
    const screen = render(
      <ProfileAvatar
        avatarUrl="https://example.com/avatar.jpg"
        username="Ada"
        size={80}
        testID="profile-avatar"
      />,
    );

    const avatar = screen.getByTestId('profile-avatar');
    const flattenedStyle = StyleSheet.flatten(avatar.props.style);

    expect(avatar.props.resizeMode).toBe('cover');
    expect(flattenedStyle).toMatchObject({
      width: 80,
      height: 80,
      borderRadius: 40,
      overflow: 'hidden',
    });
  });

  it('keeps the circular fallback when no image exists', () => {
    const screen = render(
      <ProfileAvatar username="Ada" size={64} testID="profile-avatar" />,
    );

    const fallback = screen.getByTestId('profile-avatar-fallback');
    const flattenedStyle = StyleSheet.flatten(fallback.props.style);

    expect(screen.getByText('A')).toBeTruthy();
    expect(flattenedStyle).toMatchObject({
      width: 64,
      height: 64,
      borderRadius: 32,
      overflow: 'hidden',
    });
  });
});
