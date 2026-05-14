import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

import { SocialPostCard } from '@/components/social/SocialPostCard';
import { BORDER_RADIUS, SPACING } from '@/constants/theme';

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
      surfaceMuted: '#f1f5f9',
      primaryText: '#1f2937',
      primary: '#2563eb',
      gray: '#6b7280',
      textMuted: '#6b7280',
      borderSubtle: '#e5e7eb',
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

  const renderCard = (props: Partial<React.ComponentProps<typeof SocialPostCard>> = {}) =>
    render(
      <SocialPostCard
        commentsEnabled
        currentUserId="viewer-1"
        onCommentPress={jest.fn()}
        onDislikePress={jest.fn()}
        onLikePress={jest.fn()}
        onMorePress={jest.fn()}
        onPress={jest.fn()}
        onReportPress={jest.fn()}
        post={createPost()}
        {...props}
      />,
    );

  it('keeps the fast feed actions to like, comment, share, and more', () => {
    const onLikePress = jest.fn();
    const onCommentPress = jest.fn();
    const onSharePress = jest.fn();
    const onMorePress = jest.fn();
    const screen = renderCard({
      onLikePress,
      onCommentPress,
      onSharePress,
      onMorePress,
      post: createPost({
        asset_url: 'https://test.supabase.co/storage/v1/object/sign/social-posts/u1/post-1.jpg',
      }) as any,
    });

    fireEvent.press(screen.getByTestId('social-post-like-post-1'));
    fireEvent.press(screen.getByTestId('social-post-comment-post-1'));
    fireEvent.press(screen.getByTestId('social-post-share-post-1'));
    fireEvent.press(screen.getByTestId('social-post-more-post-1'));

    expect(onLikePress).toHaveBeenCalledTimes(1);
    expect(onCommentPress).toHaveBeenCalledTimes(1);
    expect(onSharePress).toHaveBeenCalledTimes(1);
    expect(onMorePress).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('social-post-dislike-post-1')).toBeNull();
    expect(screen.queryByTestId('social-post-delete-post-1')).toBeNull();
    expect(screen.queryByTestId('social-post-report-post-1')).toBeNull();
  });

  it('keeps reactions enabled for the author on a pending post', () => {
    const onLikePress = jest.fn();
    const onCommentPress = jest.fn();
    const screen = renderCard({
      onLikePress,
      onCommentPress,
      post: createPost({ moderation_status: 'pending' }) as any,
    });

    fireEvent.press(screen.getByTestId('social-post-like-post-1'));
    fireEvent.press(screen.getByTestId('social-post-comment-post-1'));

    expect(onLikePress).toHaveBeenCalledTimes(1);
    expect(onCommentPress).toHaveBeenCalledTimes(1);
  });

  it('only shows the more menu when a sheet handler is wired', () => {
    const screen = renderCard({
      onMorePress: null,
      onDeletePress: jest.fn(),
      onReportPress: jest.fn(),
    });

    expect(screen.queryByTestId('social-post-more-post-1')).toBeNull();
  });

  it('keeps terminally moderated posts readable but non-reactive for the author', () => {
    const onLikePress = jest.fn();
    const onCommentPress = jest.fn();
    const screen = renderCard({
      onLikePress,
      onCommentPress,
      post: createPost({ moderation_status: 'hidden' }) as any,
    });

    fireEvent.press(screen.getByTestId('social-post-like-post-1'));
    fireEvent.press(screen.getByTestId('social-post-comment-post-1'));

    expect(onLikePress).not.toHaveBeenCalled();
    expect(onCommentPress).toHaveBeenCalledTimes(1);
  });

  it('temporarily disables like while a post mutation is pending', () => {
    const onLikePress = jest.fn();
    const screen = renderCard({
      onLikePress,
      reactionsDisabled: true,
    });

    fireEvent.press(screen.getByTestId('social-post-like-post-1'));

    expect(onLikePress).not.toHaveBeenCalled();
  });

  it('opens the post from the main card press and from the image press', () => {
    const onPress = jest.fn();
    const screen = renderCard({
      onPress,
      post: createPost({
        image_url: 'https://test.supabase.co/storage/v1/object/sign/social-posts/u1/post-1.jpg',
      }) as any,
    });

    fireEvent.press(screen.getByTestId('social-post-card-post-1'));
    fireEvent.press(screen.getByTestId('social-post-image-post-1'));

    expect(onPress).toHaveBeenCalledTimes(2);
  });

  it('keeps share behind the explicit button instead of the image tap', () => {
    const onPress = jest.fn();
    const onSharePress = jest.fn();
    const screen = renderCard({
      onPress,
      onSharePress,
      post: createPost({
        image_url: 'https://test.supabase.co/storage/v1/object/sign/social-posts/u1/post-1.jpg',
        asset_url: 'https://test.supabase.co/storage/v1/object/sign/social-posts/u1/post-1.jpg',
      }) as any,
    });

    fireEvent.press(screen.getByTestId('social-post-image-post-1'));
    fireEvent.press(screen.getByTestId('social-post-share-post-1'));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onSharePress).toHaveBeenCalledTimes(1);
  });

  it('opens the mini profile from the avatar pressable when provided', () => {
    const onAvatarPress = jest.fn();
    const screen = renderCard({ onAvatarPress });

    fireEvent.press(screen.getByTestId('social-post-identity-post-1-avatar-pressable'));

    expect(onAvatarPress).toHaveBeenCalledTimes(1);
  });

  it('shows the not interested badge when dislike feedback is already applied', () => {
    const screen = renderCard({
      post: createPost({ viewer_reaction: 'dislike' }) as any,
    });

    expect(screen.getByTestId('social-post-disliked-post-1')).toBeTruthy();
  });

  it('renders the feed post inside a neutral premium shell', () => {
    const screen = renderCard({
      post: createPost({
        image_url: 'https://test.supabase.co/storage/v1/object/sign/social-posts/u1/post-1.jpg',
      }) as any,
    });

    const cardStyle = StyleSheet.flatten(
      screen.getByTestId('social-post-card-post-1').props.style,
    );
    const imageWrapStyle = StyleSheet.flatten(
      screen.getByTestId('social-post-image-wrap-post-1').props.style,
    );

    expect(cardStyle).toEqual(
      expect.objectContaining({
        marginHorizontal: SPACING.page,
        borderRadius: BORDER_RADIUS.card,
        backgroundColor: '#ffffff',
        borderWidth: 1,
        borderColor: '#e5e7eb',
        shadowOpacity: 0,
        elevation: 0,
      }),
    );
    expect(imageWrapStyle).toEqual(
      expect.objectContaining({
        marginHorizontal: SPACING.sm,
        borderRadius: BORDER_RADIUS.lg,
        backgroundColor: '#f1f5f9',
        borderWidth: 1,
        borderColor: '#e5e7eb',
      }),
    );
    expect(cardStyle.borderColor).not.toBe('#2563eb');
    expect(imageWrapStyle.borderColor).not.toBe('#2563eb');
  });
});
