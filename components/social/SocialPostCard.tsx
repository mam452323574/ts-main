import { useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Bookmark,
  Flag,
  Ellipsis,
  Heart,
  MessageCircle,
  Share2,
} from 'lucide-react-native';

import { SocialCategoryPill } from './SocialCategoryPill';
import { SocialIdentityRow } from './SocialIdentityRow';
import { SocialModerationBadge } from './SocialModerationBadge';
import { SocialReactionPicker } from './SocialReactionPicker';

import { OptimizedImage } from '@/components/OptimizedImage';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SIZES,
  SPACING,
  withAlpha,
} from '@/constants/theme';
import { formatSocialRelativeTimeLabel } from '@/utils/socialFormatting';
import { normalizeTrustedImageUri } from '@/utils/urlSecurity';
import type { SocialPost, SocialReactionState } from '@/types';
import { SquirclePressable } from '@/components/Squircle';

interface SocialPostCardProps {
  post: SocialPost;
  currentUserId?: string | null;
  commentsEnabled?: boolean;
  reactionsDisabled?: boolean;
  deleteDisabled?: boolean;
  onPress?: (() => void) | null;
  onAvatarPress?: (() => void) | null;
  onLikePress: () => void;
  onDislikePress?: () => void;
  onCommentPress: () => void;
  onDeletePress?: (() => void) | null;
  onReportPress?: (() => void) | null;
  onSharePress?: (() => void) | null;
  onMorePress?: (() => void) | null;
  onSavePress?: (() => void) | null;
  savePending?: boolean;
  onReactionSelect?: ((reaction: SocialReactionState) => void) | null;
}

export function SocialPostCard({
  post,
  currentUserId,
  commentsEnabled = true,
  reactionsDisabled = false,
  onPress,
  onAvatarPress,
  onLikePress,
  onCommentPress,
  onSharePress,
  onMorePress,
  onSavePress,
  savePending = false,
  onReactionSelect,
}: SocialPostCardProps) {
  const { colors, isDark = false } = useTheme();
  const [reactionPickerVisible, setReactionPickerVisible] = useState(false);
  const { t } = useLanguage();
  const styles = useMemo(
    () => createStyles(colors, Boolean(isDark)),
    [colors, isDark],
  );
  const isOwnPost = currentUserId === post.author_id;
  const canReactToPost =
    post.moderation_status === 'approved' ||
    (isOwnPost && post.moderation_status === 'pending');
  const reactionsAreDisabled = !canReactToPost || reactionsDisabled;
  const showModerationBadge =
    isOwnPost &&
    post.moderation_status !== 'approved' &&
    post.moderation_status !== 'pending';
  const createdLabel = formatSocialRelativeTimeLabel(post.created_at, t) ?? '';
  const safeImageUri = useMemo(
    () => normalizeTrustedImageUri(post.image_url),
    [post.image_url],
  );
  const shouldShowMoreButton = !!onMorePress;

  return (
    <SquirclePressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      onPress={onPress ?? undefined}
      style={styles.card}
      testID={`social-post-card-${post.id}`}
    >
      <View style={styles.header}>
        <SocialIdentityRow
          username={post.author_username}
          avatarUrl={post.author_avatar_url}
          meta={createdLabel}
          onAvatarPress={onAvatarPress}
          testID={`social-post-identity-${post.id}`}
          trailing={
            <View style={styles.trailingActions}>
              <SocialCategoryPill category={post.category} compact />
              {shouldShowMoreButton ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={t('social.actions.more')}
                  hitSlop={8}
                  onPress={onMorePress}
                  style={styles.moreButton}
                  testID={`social-post-more-${post.id}`}
                >
                  <Ellipsis color={colors.primaryText} size={20} />
                </TouchableOpacity>
              ) : null}
            </View>
          }
        />
      </View>

      {showModerationBadge ? (
        <View style={styles.badgeRow}>
          <SocialModerationBadge moderationState={post.moderation_status} />
        </View>
      ) : null}

      {post.content_text ? (
        <Text style={styles.caption}>{post.content_text}</Text>
      ) : null}

      {safeImageUri ? (
        <SquirclePressable
          disabled={!onPress}
          onPress={onPress ?? undefined}
          style={styles.imageWrap}
          testID={`social-post-image-wrap-${post.id}`}
        >
          <OptimizedImage
            source={{ uri: safeImageUri }}
            contentFit="cover"
            recyclingKey={post.id}
            style={styles.postImage}
            testID={`social-post-image-${post.id}`}
          />
        </SquirclePressable>
      ) : null}

      <View style={styles.actionBar}>
        <View style={styles.reactionAnchor}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t('social.actions.like')}
            accessibilityState={{
              disabled: reactionsAreDisabled,
              selected: post.viewer_reaction === 'like',
            }}
            disabled={reactionsAreDisabled}
            onPress={onLikePress}
            onLongPress={
              onReactionSelect && !reactionsAreDisabled
                ? () => setReactionPickerVisible(true)
                : undefined
            }
            delayLongPress={350}
            style={[styles.iconAction, reactionsAreDisabled && styles.actionButtonDisabled]}
            testID={`social-post-like-${post.id}`}
          >
            <Heart
              color={post.viewer_reaction === 'like' ? colors.error : colors.primaryText}
              fill={post.viewer_reaction === 'like' ? colors.error : 'transparent'}
              size={18}
            />
            <Text style={styles.actionLabel}>{post.like_count}</Text>
          </TouchableOpacity>
          <SocialReactionPicker
            visible={reactionPickerVisible}
            currentReaction={post.viewer_reaction}
            testID={`social-reaction-picker-${post.id}`}
            onSelect={(reaction) => {
              setReactionPickerVisible(false);
              onReactionSelect?.(reaction);
            }}
            onDismiss={() => setReactionPickerVisible(false)}
          />
        </View>

        {commentsEnabled ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t('social.actions.comment')}
            onPress={onCommentPress}
            style={styles.iconAction}
            testID={`social-post-comment-${post.id}`}
          >
            <MessageCircle color={colors.primaryText} size={18} />
            <Text style={styles.actionLabel}>{post.comment_count}</Text>
          </TouchableOpacity>
        ) : null}

        {onSharePress && post.asset_url ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t('social.actions.share_short')}
            onPress={onSharePress}
            style={styles.iconAction}
            testID={`social-post-share-${post.id}`}
          >
            <Share2 color={colors.primaryText} size={18} />
            <Text style={styles.actionLabel}>{t('social.actions.share_short')}</Text>
          </TouchableOpacity>
        ) : null}

        {onSavePress && !isOwnPost ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={
              post.viewer_has_saved
                ? t('social.actions.unsave')
                : t('social.actions.save')
            }
            disabled={savePending}
            onPress={onSavePress}
            style={[styles.iconAction, savePending && styles.iconActionDisabled]}
            testID={`social-post-save-${post.id}`}
          >
            <Bookmark
              color={post.viewer_has_saved ? colors.primary : colors.primaryText}
              fill={post.viewer_has_saved ? colors.primary : 'transparent'}
              size={18}
            />
          </TouchableOpacity>
        ) : null}

        {post.viewer_reaction === 'dislike' ? (
          <View style={styles.feedbackBadge} testID={`social-post-disliked-${post.id}`}>
            <Flag color={colors.warning} size={14} />
            <Text style={styles.feedbackBadgeLabel}>
              {t('social.actions.not_interested_applied')}
            </Text>
          </View>
        ) : null}
      </View>
    </SquirclePressable>
  );
}

const createStyles = (colors: any, isDark: boolean) => {
  const neutralBorder = colors.borderSubtle ?? withAlpha(colors.primaryText, isDark ? 0.12 : 0.08);
  const neutralMutedSurface =
    colors.surfaceMuted ?? withAlpha(colors.primaryText, isDark ? 0.1 : 0.04);

  return StyleSheet.create({
    card: {
      marginHorizontal: SPACING.page,
      paddingVertical: SPACING.md,
      gap: SPACING.md,
      borderRadius: BORDER_RADIUS.card,
      backgroundColor: colors.cardBackground,
      borderWidth: 1,
      borderColor: neutralBorder,
      shadowColor: 'transparent',
      shadowOpacity: 0,
      shadowRadius: 0,
      shadowOffset: { width: 0, height: 0 },
      elevation: 0,
    },
    header: {
      paddingHorizontal: SPACING.lg,
      alignItems: 'stretch',
    },
    badgeRow: {
      marginTop: -2,
      paddingHorizontal: SPACING.lg,
    },
    caption: {
      paddingHorizontal: SPACING.lg,
      fontSize: SIZES.text16,
      lineHeight: 23,
      color: colors.primaryText,
    },
    imageWrap: {
      marginHorizontal: SPACING.sm,
      borderRadius: BORDER_RADIUS.lg,
      overflow: 'hidden',
      backgroundColor: neutralMutedSurface,
      borderWidth: 1,
      borderColor: neutralBorder,
    },
    postImage: {
      width: '100%',
      aspectRatio: 4 / 5,
      backgroundColor: neutralMutedSurface,
    },
    actionBar: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.lg,
      alignItems: 'center',
      paddingHorizontal: SPACING.lg,
    },
    iconAction: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      minHeight: 32,
      paddingVertical: 2,
    },
    reactionAnchor: {
      position: 'relative',
    },
    iconActionDisabled: {
      opacity: 0.45,
    },
    actionButtonDisabled: {
      opacity: 0.45,
    },
    actionLabel: {
      fontSize: SIZES.text14,
      fontWeight: FONT_WEIGHTS.medium,
      color: colors.primaryText,
    },
    dangerActionLabel: {
      color: colors.error,
    },
    trailingActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    moreButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: neutralMutedSurface,
      borderWidth: 1,
      borderColor: neutralBorder,
    },
    feedbackBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      minHeight: 30,
      paddingHorizontal: SPACING.sm,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: withAlpha(colors.warning, 0.12),
      borderWidth: 1,
      borderColor: withAlpha(colors.warning, 0.24),
    },
    feedbackBadgeLabel: {
      fontSize: SIZES.text12,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.warning,
    },
  });
};

export default SocialPostCard;
