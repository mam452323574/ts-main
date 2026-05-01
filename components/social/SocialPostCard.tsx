import { useMemo } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Flag,
  Heart,
  MessageCircle,
  Share2,
  ThumbsDown,
  Trash2,
} from 'lucide-react-native';

import { SocialCategoryPill } from './SocialCategoryPill';
import { SocialIdentityRow } from './SocialIdentityRow';
import { SocialModerationBadge } from './SocialModerationBadge';

import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SHADOWS,
  SIZES,
  SPACING,
  withAlpha,
} from '@/constants/theme';
import { formatSocialRelativeTimeLabel } from '@/utils/socialFormatting';
import { normalizeTrustedImageUri } from '@/utils/urlSecurity';
import type { SocialPost } from '@/types';

interface SocialPostCardProps {
  post: SocialPost;
  currentUserId?: string | null;
  commentsEnabled?: boolean;
  reactionsDisabled?: boolean;
  deleteDisabled?: boolean;
  onPress?: (() => void) | null;
  onAvatarPress?: (() => void) | null;
  onLikePress: () => void;
  onDislikePress: () => void;
  onCommentPress: () => void;
  onDeletePress?: (() => void) | null;
  onReportPress: () => void;
  onSharePress?: (() => void) | null;
}

export function SocialPostCard({
  post,
  currentUserId,
  commentsEnabled = true,
  reactionsDisabled = false,
  deleteDisabled = false,
  onPress,
  onAvatarPress,
  onLikePress,
  onDislikePress,
  onCommentPress,
  onDeletePress,
  onReportPress,
  onSharePress,
}: SocialPostCardProps) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);
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

  return (
    <Pressable
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
          trailing={<SocialCategoryPill category={post.category} />}
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
        <Pressable disabled={!onPress} onPress={onPress ?? undefined} style={styles.imageWrap}>
          <Image
            source={{ uri: safeImageUri }}
            resizeMode="cover"
            style={styles.postImage}
            testID={`social-post-image-${post.id}`}
          />
        </Pressable>
      ) : null}

      <View style={styles.actions}>
        <TouchableOpacity
          accessibilityRole="button"
          disabled={reactionsAreDisabled}
          onPress={onLikePress}
          style={[
            styles.actionButton,
            reactionsAreDisabled ? styles.actionButtonDisabled : null,
          ]}
          testID={`social-post-like-${post.id}`}
        >
          <Heart
            color={post.viewer_reaction === 'like' ? colors.error : colors.primaryText}
            size={18}
          />
          <Text style={styles.actionLabel}>{post.like_count}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityRole="button"
          disabled={reactionsAreDisabled}
          onPress={onDislikePress}
          style={[
            styles.actionButton,
            reactionsAreDisabled ? styles.actionButtonDisabled : null,
          ]}
          testID={`social-post-dislike-${post.id}`}
        >
          <ThumbsDown
            color={
              post.viewer_reaction === 'dislike' ? colors.warning : colors.primaryText
            }
            size={18}
          />
          <Text style={styles.actionLabel}>{post.dislike_count}</Text>
        </TouchableOpacity>

        {commentsEnabled ? (
          <TouchableOpacity
            accessibilityRole="button"
            onPress={onCommentPress}
            style={styles.actionButton}
            testID={`social-post-comment-${post.id}`}
          >
            <MessageCircle color={colors.primaryText} size={18} />
            <Text style={styles.actionLabel}>{post.comment_count}</Text>
          </TouchableOpacity>
        ) : null}

        {onSharePress && post.asset_url ? (
          <TouchableOpacity
            accessibilityRole="button"
            onPress={onSharePress}
            style={styles.actionButton}
            testID={`social-post-share-${post.id}`}
          >
            <Share2 color={colors.primaryText} size={18} />
            <Text style={styles.actionLabel}>{t('social.actions.share')}</Text>
          </TouchableOpacity>
        ) : null}

        {isOwnPost && onDeletePress ? (
          <TouchableOpacity
            accessibilityRole="button"
            disabled={deleteDisabled}
            onPress={onDeletePress}
            style={[
              styles.actionButton,
              deleteDisabled ? styles.actionButtonDisabled : null,
            ]}
            testID={`social-post-delete-${post.id}`}
          >
            <Trash2 color={colors.error} size={18} />
            <Text style={[styles.actionLabel, styles.dangerActionLabel]}>
              {deleteDisabled
                ? t('social.actions.deleting')
                : t('social.actions.delete')}
            </Text>
          </TouchableOpacity>
        ) : null}

        {!isOwnPost ? (
          <TouchableOpacity
            accessibilityRole="button"
            onPress={onReportPress}
            style={styles.actionButton}
            testID={`social-post-report-${post.id}`}
          >
            <Flag color={colors.primaryText} size={18} />
            <Text style={styles.actionLabel}>{t('social.actions.report')}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </Pressable>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    card: {
      borderRadius: BORDER_RADIUS.xl,
      backgroundColor: colors.cardBackground,
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08),
      padding: SPACING.lg,
      gap: SPACING.md,
      ...SHADOWS.card,
    },
    header: {
      alignItems: 'stretch',
    },
    badgeRow: {
      marginTop: -4,
    },
    caption: {
      fontSize: SIZES.text16,
      lineHeight: 24,
      color: colors.primaryText,
    },
    imageWrap: {
      borderRadius: BORDER_RADIUS.lg,
      overflow: 'hidden',
    },
    postImage: {
      width: '100%',
      aspectRatio: 4 / 5,
      backgroundColor: withAlpha(colors.primaryText, 0.04),
    },
    actions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.md,
      alignItems: 'center',
    },
    actionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
    },
    actionButtonDisabled: {
      opacity: 0.45,
    },
    actionLabel: {
      fontSize: SIZES.text14,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.primaryText,
    },
    dangerActionLabel: {
      color: colors.error,
    },
  });

export default SocialPostCard;
