import { useMemo } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  EyeOff,
  Flag,
  ThumbsDown,
  Trash2,
  UserMinus,
  UserPlus,
  X,
} from 'lucide-react-native';

import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SIZES,
  SPACING,
  withAlpha,
} from '@/constants/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import type { SocialPost } from '@/types';
import { SquirclePressable, Squircle } from '@/components/Squircle';

interface SocialPostActionSheetProps {
  visible: boolean;
  post?: SocialPost | null;
  currentUserId?: string | null;
  deleteDisabled?: boolean;
  reactionsDisabled?: boolean;
  isAuthorFollowed?: boolean;
  onClose: () => void;
  onDeletePress?: (() => void) | null;
  onReportPress?: (() => void) | null;
  onNotInterestedPress?: (() => void) | null;
  onFollowPress?: (() => void) | null;
  onHideAuthorPress?: (() => void) | null;
}

export function SocialPostActionSheet({
  visible,
  post,
  currentUserId,
  deleteDisabled = false,
  reactionsDisabled = false,
  isAuthorFollowed = false,
  onClose,
  onDeletePress,
  onReportPress,
  onNotInterestedPress,
  onFollowPress,
  onHideAuthorPress,
}: SocialPostActionSheetProps) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isOwnPost = !!post && currentUserId === post.author_id;
  const canReactToPost =
    !!post &&
    (post.moderation_status === 'approved' ||
      (isOwnPost && post.moderation_status === 'pending'));
  const showNotInterested = canReactToPost && !!onNotInterestedPress;
  const showDelete = isOwnPost && !!onDeletePress;
  const showReport = !isOwnPost && !!onReportPress;
  const showFollow = !isOwnPost && !!onFollowPress;
  const showHideAuthor = !isOwnPost && !!onHideAuthorPress;

  const runAndClose = (action?: (() => void) | null) => {
    if (!action) {
      return;
    }
    onClose();
    action();
  };

  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible && !!post}
      onRequestClose={onClose}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common.cancel')}
        onPress={onClose}
        style={styles.backdrop}
        testID="social-post-action-sheet-backdrop"
      >
        <SquirclePressable
          onPress={() => undefined}
          style={styles.sheet}
          testID="social-post-action-sheet"
        >
          <Squircle style={styles.handle} />

          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>{t('social.post_actions.title')}</Text>
              <Text numberOfLines={1} style={styles.subtitle}>
                {post?.author_username ?? t('common.unknown_user')}
              </Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
              onPress={onClose}
              style={styles.closeButton}
              testID="social-post-action-sheet-close"
            >
              <X color={colors.primaryText} size={18} />
            </TouchableOpacity>
          </View>

          <View style={styles.actions}>
            {showNotInterested ? (
              <TouchableOpacity
                accessibilityRole="button"
                disabled={reactionsDisabled}
                onPress={() => runAndClose(onNotInterestedPress)}
                style={[styles.actionRow, reactionsDisabled && styles.actionRowDisabled]}
                testID="social-post-action-not-interested"
              >
                <Squircle style={styles.actionIcon}>
                  <ThumbsDown color={colors.primaryText} size={19} />
                </Squircle>
                <View style={styles.actionCopy}>
                  <Text style={styles.actionLabel}>
                    {post?.viewer_reaction === 'dislike'
                      ? t('social.actions.not_interested_remove')
                      : t('social.actions.not_interested')}
                  </Text>
                  <Text style={styles.actionMeta}>
                    {t('social.post_actions.not_interested_hint')}
                  </Text>
                </View>
              </TouchableOpacity>
            ) : null}

            {showReport ? (
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => runAndClose(onReportPress)}
                style={styles.actionRow}
                testID="social-post-action-report"
              >
                <Squircle style={styles.actionIcon}>
                  <Flag color={colors.primaryText} size={19} />
                </Squircle>
                <View style={styles.actionCopy}>
                  <Text style={styles.actionLabel}>{t('social.actions.report')}</Text>
                  <Text style={styles.actionMeta}>
                    {t('social.post_actions.report_hint')}
                  </Text>
                </View>
              </TouchableOpacity>
            ) : null}

            {showFollow ? (
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => runAndClose(onFollowPress)}
                style={styles.actionRow}
                testID="social-post-action-follow"
              >
                <Squircle style={styles.actionIcon}>
                  {isAuthorFollowed ? (
                    <UserMinus color={colors.primaryText} size={19} />
                  ) : (
                    <UserPlus color={colors.primaryText} size={19} />
                  )}
                </Squircle>
                <View style={styles.actionCopy}>
                  <Text style={styles.actionLabel}>
                    {isAuthorFollowed
                      ? t('social.actions.unfollow')
                      : t('social.actions.follow')}
                  </Text>
                  <Text style={styles.actionMeta}>
                    {t('social.post_actions.follow_hint')}
                  </Text>
                </View>
              </TouchableOpacity>
            ) : null}

            {showHideAuthor ? (
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => runAndClose(onHideAuthorPress)}
                style={styles.actionRow}
                testID="social-post-action-hide-author"
              >
                <Squircle style={styles.actionIcon}>
                  <EyeOff color={colors.primaryText} size={19} />
                </Squircle>
                <View style={styles.actionCopy}>
                  <Text style={styles.actionLabel}>
                    {t('social.actions.hide_author')}
                  </Text>
                  <Text style={styles.actionMeta}>
                    {t('social.post_actions.hide_author_hint')}
                  </Text>
                </View>
              </TouchableOpacity>
            ) : null}

            {showDelete ? (
              <TouchableOpacity
                accessibilityRole="button"
                disabled={deleteDisabled}
                onPress={() => runAndClose(onDeletePress)}
                style={[
                  styles.actionRow,
                  styles.dangerActionRow,
                  deleteDisabled && styles.actionRowDisabled,
                ]}
                testID="social-post-action-delete"
              >
                <Squircle style={[styles.actionIcon, styles.dangerActionIcon]}>
                  <Trash2 color={colors.error} size={19} />
                </Squircle>
                <View style={styles.actionCopy}>
                  <Text style={[styles.actionLabel, styles.dangerActionLabel]}>
                    {deleteDisabled
                      ? t('social.actions.deleting')
                      : t('social.actions.delete')}
                  </Text>
                  <Text style={styles.actionMeta}>
                    {t('social.post_actions.delete_hint')}
                  </Text>
                </View>
              </TouchableOpacity>
            ) : null}
          </View>
        </SquirclePressable>
      </Pressable>
    </Modal>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: withAlpha(colors.primaryText, 0.34),
    },
    sheet: {
      paddingTop: SPACING.sm,
      paddingHorizontal: SPACING.lg,
      paddingBottom: SPACING.xl,
      borderTopLeftRadius: BORDER_RADIUS.xl + 8,
      borderTopRightRadius: BORDER_RADIUS.xl + 8,
      backgroundColor: colors.cardBackground,
      borderWidth: 1,
      borderBottomWidth: 0,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08),
      gap: SPACING.lg, borderCurve: 'continuous',
    },
    handle: {
      alignSelf: 'center',
      width: 44,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.borderStrong ?? withAlpha(colors.primaryText, 0.18), borderCurve: 'continuous',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACING.md,
    },
    headerCopy: {
      flex: 1,
      gap: 2,
    },
    title: {
      fontSize: SIZES.text18,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
    },
    subtitle: {
      fontSize: 13,
      color: colors.textMuted ?? colors.gray,
    },
    closeButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceMuted ?? withAlpha(colors.primaryText, 0.06),
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08), borderCurve: 'continuous',
    },
    actions: {
      gap: SPACING.sm,
    },
    actionRow: {
      minHeight: 64,
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: colors.surfaceMuted ?? withAlpha(colors.primaryText, 0.06),
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08), borderCurve: 'continuous',
    },
    actionRowDisabled: {
      opacity: 0.45,
    },
    dangerActionRow: {
      borderColor: withAlpha(colors.error, 0.24),
      backgroundColor: withAlpha(colors.error, 0.08),
    },
    actionIcon: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.cardBackground, borderCurve: 'continuous',
    },
    dangerActionIcon: {
      backgroundColor: withAlpha(colors.error, 0.1),
    },
    actionCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    actionLabel: {
      fontSize: SIZES.text16,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.primaryText,
    },
    actionMeta: {
      fontSize: SIZES.text12,
      lineHeight: 17,
      color: colors.textMuted ?? colors.gray,
    },
    dangerActionLabel: {
      color: colors.error,
    },
  });

export default SocialPostActionSheet;
