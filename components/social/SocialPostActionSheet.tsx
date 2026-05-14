import { useMemo } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Flag, ThumbsDown, Trash2, X } from 'lucide-react-native';

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

interface SocialPostActionSheetProps {
  visible: boolean;
  post?: SocialPost | null;
  currentUserId?: string | null;
  deleteDisabled?: boolean;
  reactionsDisabled?: boolean;
  onClose: () => void;
  onDeletePress?: (() => void) | null;
  onReportPress?: (() => void) | null;
  onNotInterestedPress?: (() => void) | null;
}

export function SocialPostActionSheet({
  visible,
  post,
  currentUserId,
  deleteDisabled = false,
  reactionsDisabled = false,
  onClose,
  onDeletePress,
  onReportPress,
  onNotInterestedPress,
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
        <Pressable
          onPress={() => undefined}
          style={styles.sheet}
          testID="social-post-action-sheet"
        >
          <View style={styles.handle} />

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
                <View style={styles.actionIcon}>
                  <ThumbsDown color={colors.primaryText} size={19} />
                </View>
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
                <View style={styles.actionIcon}>
                  <Flag color={colors.primaryText} size={19} />
                </View>
                <View style={styles.actionCopy}>
                  <Text style={styles.actionLabel}>{t('social.actions.report')}</Text>
                  <Text style={styles.actionMeta}>
                    {t('social.post_actions.report_hint')}
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
                <View style={[styles.actionIcon, styles.dangerActionIcon]}>
                  <Trash2 color={colors.error} size={19} />
                </View>
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
        </Pressable>
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
      gap: SPACING.lg,
    },
    handle: {
      alignSelf: 'center',
      width: 44,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.borderStrong ?? withAlpha(colors.primaryText, 0.18),
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
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08),
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
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08),
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
      backgroundColor: colors.cardBackground,
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
