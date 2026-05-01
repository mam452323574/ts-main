import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import { SocialPostCard } from '@/components/social/SocialPostCard';

jest.mock('@/components/ProfileAvatar', () => {
  const ReactLocal = require('react');
  const { View: RNView } = require('react-native');

  return {
    ProfileAvatar: ({ testID }: { testID?: string }) =>
      ReactLocal.createElement(RNView, { testID }),
  };
});

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
      primaryText: '#1f2937',
      primary: '#2563eb',
      gray: '#6b7280',
      error: '#dc2626',
      warning: '#d97706',
      white: '#ffffff',
    },
  }),
}));

describe('SocialPostCard', () => {
  const createPost = (overrides: Record<string, unknown> = {}) => ({
    id: 'post-1',
    author_id: 'viewer-1',
    author_username: 'alice',
    author_avatar_url: null,
    category: 'food' as const,
    content_text: 'Fresh meal',
    image_url: null,
    created_at: '2026-04-06T12:00:00.000Z',
    like_count: 3,
    dislike_count: 1,
    comment_count: 2,
    viewer_reaction: 'neutral' as const,
    viewer_has_liked: false,
    moderation_status: 'approved' as const,
    ...overrides,
  });

  it('keeps reactions enabled for the author on a pending post', () => {
    const onLikePress = jest.fn();
    const onDislikePress = jest.fn();
    const onCommentPress = jest.fn();
    const screen = render(
      <SocialPostCard
        commentsEnabled
        currentUserId="viewer-1"
        onCommentPress={onCommentPress}
        onDislikePress={onDislikePress}
        onLikePress={onLikePress}
        onReportPress={jest.fn()}
        post={createPost({ moderation_status: 'pending' })}
      />,
    );

    fireEvent.press(screen.getByTestId('social-post-like-post-1'));
    fireEvent.press(screen.getByTestId('social-post-dislike-post-1'));
    fireEvent.press(screen.getByTestId('social-post-comment-post-1'));

    expect(onLikePress).toHaveBeenCalledTimes(1);
    expect(onDislikePress).toHaveBeenCalledTimes(1);
    expect(onCommentPress).toHaveBeenCalledTimes(1);
  });

  it('keeps terminally moderated posts readable but non-reactive for the author', () => {
    const onLikePress = jest.fn();
    const onDislikePress = jest.fn();
    const onCommentPress = jest.fn();
    const screen = render(
      <SocialPostCard
        commentsEnabled
        currentUserId="viewer-1"
        onCommentPress={onCommentPress}
        onDislikePress={onDislikePress}
        onLikePress={onLikePress}
        onReportPress={jest.fn()}
        post={createPost({ moderation_status: 'hidden' })}
      />,
    );

    fireEvent.press(screen.getByTestId('social-post-like-post-1'));
    fireEvent.press(screen.getByTestId('social-post-dislike-post-1'));
    fireEvent.press(screen.getByTestId('social-post-comment-post-1'));

    expect(onLikePress).not.toHaveBeenCalled();
    expect(onDislikePress).not.toHaveBeenCalled();
    expect(onCommentPress).toHaveBeenCalledTimes(1);
  });

  it('temporarily disables reactions while a post mutation is pending', () => {
    const onLikePress = jest.fn();
    const onDislikePress = jest.fn();
    const screen = render(
      <SocialPostCard
        commentsEnabled
        currentUserId="viewer-1"
        onCommentPress={jest.fn()}
        onDislikePress={onDislikePress}
        onLikePress={onLikePress}
        onReportPress={jest.fn()}
        post={createPost()}
        reactionsDisabled
      />,
    );

    fireEvent.press(screen.getByTestId('social-post-like-post-1'));
    fireEvent.press(screen.getByTestId('social-post-dislike-post-1'));

    expect(onLikePress).not.toHaveBeenCalled();
    expect(onDislikePress).not.toHaveBeenCalled();
  });

  it('shows delete for the author and hides report', () => {
    const onDeletePress = jest.fn();
    const screen = render(
      <SocialPostCard
        commentsEnabled
        currentUserId="viewer-1"
        deleteDisabled={false}
        onCommentPress={jest.fn()}
        onDeletePress={onDeletePress}
        onDislikePress={jest.fn()}
        onLikePress={jest.fn()}
        onReportPress={jest.fn()}
        post={createPost()}
      />,
    );

    expect(screen.getByTestId('social-post-delete-post-1')).toBeTruthy();
    expect(screen.queryByTestId('social-post-report-post-1')).toBeNull();

    fireEvent.press(screen.getByTestId('social-post-delete-post-1'));

    expect(onDeletePress).toHaveBeenCalledTimes(1);
  });

  it('shows report for other users and hides delete', () => {
    const onReportPress = jest.fn();
    const screen = render(
      <SocialPostCard
        commentsEnabled
        currentUserId="viewer-2"
        onCommentPress={jest.fn()}
        onDeletePress={jest.fn()}
        onDislikePress={jest.fn()}
        onLikePress={jest.fn()}
        onReportPress={onReportPress}
        post={createPost()}
      />,
    );

    expect(screen.getByTestId('social-post-report-post-1')).toBeTruthy();
    expect(screen.queryByTestId('social-post-delete-post-1')).toBeNull();

    fireEvent.press(screen.getByTestId('social-post-report-post-1'));

    expect(onReportPress).toHaveBeenCalledTimes(1);
  });

  it('disables delete while the post deletion is pending', () => {
    const onDeletePress = jest.fn();
    const screen = render(
      <SocialPostCard
        commentsEnabled
        currentUserId="viewer-1"
        deleteDisabled
        onCommentPress={jest.fn()}
        onDeletePress={onDeletePress}
        onDislikePress={jest.fn()}
        onLikePress={jest.fn()}
        onReportPress={jest.fn()}
        post={createPost()}
      />,
    );

    fireEvent.press(screen.getByTestId('social-post-delete-post-1'));

    expect(onDeletePress).not.toHaveBeenCalled();
  });

  it('opens the post from the main card press and from the image press', () => {
    const onPress = jest.fn();
    const screen = render(
      <SocialPostCard
        commentsEnabled
        currentUserId="viewer-1"
        onCommentPress={jest.fn()}
        onDeletePress={jest.fn()}
        onDislikePress={jest.fn()}
        onLikePress={jest.fn()}
        onPress={onPress}
        onReportPress={jest.fn()}
        post={createPost({ image_url: 'https://test.supabase.co/storage/v1/object/sign/social-posts/u1/post-1.jpg' })}
      />,
    );

    fireEvent.press(screen.getByTestId('social-post-card-post-1'));
    fireEvent.press(screen.getByTestId('social-post-image-post-1'));

    expect(onPress).toHaveBeenCalledTimes(2);
  });

  it('keeps share behind the explicit button instead of the image tap', () => {
    const onPress = jest.fn();
    const onSharePress = jest.fn();
    const screen = render(
      <SocialPostCard
        commentsEnabled
        currentUserId="viewer-1"
        onCommentPress={jest.fn()}
        onDeletePress={jest.fn()}
        onDislikePress={jest.fn()}
        onLikePress={jest.fn()}
        onPress={onPress}
        onReportPress={jest.fn()}
        onSharePress={onSharePress}
        post={createPost({
          image_url: 'https://test.supabase.co/storage/v1/object/sign/social-posts/u1/post-1.jpg',
          asset_url: 'https://test.supabase.co/storage/v1/object/sign/social-posts/u1/post-1.jpg',
        })}
      />,
    );

    fireEvent.press(screen.getByTestId('social-post-image-post-1'));
    fireEvent.press(screen.getByTestId('social-post-share-post-1'));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onSharePress).toHaveBeenCalledTimes(1);
  });

  it('opens the mini profile from the avatar pressable when provided', () => {
    const onAvatarPress = jest.fn();
    const screen = render(
      <SocialPostCard
        commentsEnabled
        currentUserId="viewer-1"
        onAvatarPress={onAvatarPress}
        onCommentPress={jest.fn()}
        onDeletePress={jest.fn()}
        onDislikePress={jest.fn()}
        onLikePress={jest.fn()}
        onReportPress={jest.fn()}
        post={createPost()}
      />,
    );

    fireEvent.press(screen.getByTestId('social-post-identity-post-1-avatar-pressable'));

    expect(onAvatarPress).toHaveBeenCalledTimes(1);
  });
});
