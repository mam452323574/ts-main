import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import { SocialPostActionSheet } from '@/components/social/SocialPostActionSheet';
import type { SocialPost } from '@/types';

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
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

function buildPost(overrides: Partial<SocialPost> = {}): SocialPost {
  return {
    id: 'post-1',
    author_id: 'author-1',
    author_username: 'alice',
    author_avatar_url: null,
    category: 'food',
    content_text: 'meal',
    image_url: null,
    created_at: '2026-04-06T12:00:00.000Z',
    like_count: 3,
    dislike_count: 1,
    comment_count: 2,
    viewer_reaction: 'neutral',
    viewer_has_liked: false,
    moderation_status: 'approved',
    ...overrides,
  } as SocialPost;
}

describe('SocialPostActionSheet', () => {
  it('renders Follow and Hide actions for a post the viewer does not own', () => {
    const onFollowPress = jest.fn();
    const onHideAuthorPress = jest.fn();
    const onClose = jest.fn();

    const screen = render(
      <SocialPostActionSheet
        visible
        post={buildPost()}
        currentUserId="viewer-1"
        onClose={onClose}
        onReportPress={jest.fn()}
        onFollowPress={onFollowPress}
        onHideAuthorPress={onHideAuthorPress}
      />,
    );

    expect(screen.getByTestId('social-post-action-follow')).toBeTruthy();
    expect(screen.getByTestId('social-post-action-hide-author')).toBeTruthy();
  });

  it('hides Follow and Hide actions when the viewer is the author', () => {
    const screen = render(
      <SocialPostActionSheet
        visible
        post={buildPost({ author_id: 'viewer-1' })}
        currentUserId="viewer-1"
        onClose={jest.fn()}
        onDeletePress={jest.fn()}
        onFollowPress={jest.fn()}
        onHideAuthorPress={jest.fn()}
      />,
    );

    expect(screen.queryByTestId('social-post-action-follow')).toBeNull();
    expect(screen.queryByTestId('social-post-action-hide-author')).toBeNull();
  });

  it('hides each action when its callback is not provided', () => {
    const screen = render(
      <SocialPostActionSheet
        visible
        post={buildPost()}
        currentUserId="viewer-1"
        onClose={jest.fn()}
        onReportPress={jest.fn()}
        onFollowPress={undefined}
        onHideAuthorPress={undefined}
      />,
    );

    expect(screen.queryByTestId('social-post-action-follow')).toBeNull();
    expect(screen.queryByTestId('social-post-action-hide-author')).toBeNull();
  });

  it('invokes onFollowPress and closes the sheet when the Follow action is tapped', () => {
    const onFollowPress = jest.fn();
    const onClose = jest.fn();

    const screen = render(
      <SocialPostActionSheet
        visible
        post={buildPost()}
        currentUserId="viewer-1"
        onClose={onClose}
        onFollowPress={onFollowPress}
      />,
    );

    fireEvent.press(screen.getByTestId('social-post-action-follow'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onFollowPress).toHaveBeenCalledTimes(1);
  });

  it('invokes onHideAuthorPress and closes the sheet when the Hide action is tapped', () => {
    const onHideAuthorPress = jest.fn();
    const onClose = jest.fn();

    const screen = render(
      <SocialPostActionSheet
        visible
        post={buildPost()}
        currentUserId="viewer-1"
        onClose={onClose}
        onHideAuthorPress={onHideAuthorPress}
      />,
    );

    fireEvent.press(screen.getByTestId('social-post-action-hide-author'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onHideAuthorPress).toHaveBeenCalledTimes(1);
  });
});
