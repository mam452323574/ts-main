import { useMemo } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Minus, Plus } from 'lucide-react-native';

import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SHADOWS,
  SIZES,
  SPACING,
  withAlpha,
} from '@/constants/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import type { SocialAdminModerationItem } from '@/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getKeyboardAvoidingViewBehavior,
  getMinimumBottomInsetPadding,
} from '@/utils/mobileLayout';

interface AdminReactionAdjustmentModalProps {
  item: SocialAdminModerationItem | null;
  likeAdjustmentInput: string;
  dislikeAdjustmentInput: string;
  noteInput: string;
  isInputValid: boolean;
  onChangeLikeAdjustment: (value: string) => void;
  onChangeDislikeAdjustment: (value: string) => void;
  onChangeNote: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  submitDisabled: boolean;
  preview: {
    nextEffectiveLikeCount: number;
    nextEffectiveDislikeCount: number;
  } | null;
}

function StatColumn({
  icon,
  title,
  currentLabel,
  previewLabel,
  invalid,
}: {
  icon: 'plus' | 'minus';
  title: string;
  currentLabel: string;
  previewLabel: string;
  invalid: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View
      style={[
        styles.statColumn,
        invalid ? styles.statColumnInvalid : null,
      ]}
    >
      <View style={styles.statHeader}>
        {icon === 'plus' ? (
          <Plus color={colors.primary} size={14} />
        ) : (
          <Minus color={colors.error} size={14} />
        )}
        <Text style={styles.statTitle}>{title}</Text>
      </View>
      <Text style={styles.statLine}>{currentLabel}</Text>
      <Text style={styles.statPreview}>{previewLabel}</Text>
    </View>
  );
}

export function AdminReactionAdjustmentModal({
  item,
  likeAdjustmentInput,
  dislikeAdjustmentInput,
  noteInput,
  isInputValid,
  onChangeLikeAdjustment,
  onChangeDislikeAdjustment,
  onChangeNote,
  onClose,
  onSubmit,
  submitDisabled,
  preview,
}: AdminReactionAdjustmentModalProps) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets), [colors, insets]);

  return (
    <Modal
      animationType="slide"
      transparent
      visible={item !== null}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={getKeyboardAvoidingViewBehavior()}
        style={styles.modalBackdrop}
      >
        <View style={styles.modalCard} testID="admin-social-adjust-reactions-modal">
          <Text style={styles.modalTitle}>
            {t('social.admin.reaction_adjustment.title')}
          </Text>
          <Text style={styles.modalBody}>
            {t('social.admin.reaction_adjustment.body')}
          </Text>

          {item ? (
            <View style={styles.statsRow}>
              <StatColumn
                icon="plus"
                title={t('social.admin.reaction_adjustment.likes_label')}
                currentLabel={t('social.admin.reaction_adjustment.current_value', {
                  count: item.effective_like_count,
                })}
                previewLabel={t('social.admin.reaction_adjustment.preview_value', {
                  count: preview?.nextEffectiveLikeCount ?? item.effective_like_count,
                })}
                invalid={!isInputValid}
              />
              <StatColumn
                icon="minus"
                title={t('social.admin.reaction_adjustment.dislikes_label')}
                currentLabel={t('social.admin.reaction_adjustment.current_value', {
                  count: item.effective_dislike_count,
                })}
                previewLabel={t('social.admin.reaction_adjustment.preview_value', {
                  count: preview?.nextEffectiveDislikeCount ?? item.effective_dislike_count,
                })}
                invalid={!isInputValid}
              />
            </View>
          ) : null}

          <View style={styles.fieldBlock}>
            <Text style={styles.modalFieldLabel}>
              {t('social.admin.reaction_adjustment.likes_label')}
            </Text>
            <TextInput
              value={likeAdjustmentInput}
              onChangeText={onChangeLikeAdjustment}
              keyboardType="numbers-and-punctuation"
              style={[
                styles.modalInput,
                !isInputValid ? styles.modalInputInvalid : null,
              ]}
              placeholder={t('social.admin.reaction_adjustment.input_placeholder')}
              placeholderTextColor={colors.gray}
              testID="admin-social-adjust-likes-input"
            />
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.modalFieldLabel}>
              {t('social.admin.reaction_adjustment.dislikes_label')}
            </Text>
            <TextInput
              value={dislikeAdjustmentInput}
              onChangeText={onChangeDislikeAdjustment}
              keyboardType="numbers-and-punctuation"
              style={[
                styles.modalInput,
                !isInputValid ? styles.modalInputInvalid : null,
              ]}
              placeholder={t('social.admin.reaction_adjustment.input_placeholder')}
              placeholderTextColor={colors.gray}
              testID="admin-social-adjust-dislikes-input"
            />
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.modalFieldLabel}>
              {t('social.admin.reaction_adjustment.note_label')}
            </Text>
            <TextInput
              value={noteInput}
              onChangeText={onChangeNote}
              style={[styles.modalInput, styles.modalTextarea]}
              multiline
              textAlignVertical="top"
              placeholder={t('social.admin.reaction_adjustment.note_placeholder')}
              placeholderTextColor={colors.gray}
              testID="admin-social-adjust-note-input"
            />
          </View>

          {!isInputValid ? (
            <View style={styles.validationCard}>
              <Text style={styles.validationTitle}>
                {t('social.admin.reaction_adjustment.errors.invalid_title')}
              </Text>
              <Text style={styles.validationBody}>
                {t('social.admin.reaction_adjustment.errors.invalid_body')}
              </Text>
            </View>
          ) : null}

          <View style={styles.modalActionsRow}>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={onClose}
              style={[styles.actionButton, styles.actionButtonNeutral]}
              testID="admin-social-adjust-cancel"
            >
              <Text style={[styles.actionButtonLabel, styles.actionButtonLabelNeutral]}>
                {t('common.cancel')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              disabled={submitDisabled}
              onPress={onSubmit}
              style={[
                styles.actionButton,
                styles.actionButtonPrimary,
                submitDisabled ? styles.actionButtonDisabled : null,
              ]}
              testID="admin-social-adjust-submit"
            >
              <Text style={[styles.actionButtonLabel, styles.actionButtonLabelPrimary]}>
                {t('common.save')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = (colors: any, insets: { bottom: number } = { bottom: 0 }) =>
  StyleSheet.create({
    modalBackdrop: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: withAlpha(colors.primaryText, 0.4),
      paddingBottom: getMinimumBottomInsetPadding(insets.bottom, SPACING.sm),
    },
    modalCard: {
      borderTopLeftRadius: BORDER_RADIUS.xl,
      borderTopRightRadius: BORDER_RADIUS.xl,
      backgroundColor: colors.cardBackground,
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08),
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.xl,
      paddingBottom:
        getMinimumBottomInsetPadding(insets.bottom, SPACING.sm) + SPACING.lg,
      gap: SPACING.md,
      ...SHADOWS.card,
    },
    modalTitle: {
      fontSize: SIZES.text18,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
    },
    modalBody: {
      fontSize: SIZES.text14,
      lineHeight: 22,
      color: colors.textMuted ?? colors.gray,
    },
    statsRow: {
      flexDirection: 'row',
      gap: SPACING.sm,
    },
    statColumn: {
      flex: 1,
      borderRadius: BORDER_RADIUS.lg,
      padding: SPACING.md,
      gap: SPACING.xs,
      backgroundColor: colors.surfaceMuted ?? withAlpha(colors.primaryText, 0.03),
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08),
    },
    statColumnInvalid: {
      borderColor: withAlpha(colors.error, 0.22),
    },
    statHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
    },
    statTitle: {
      fontSize: SIZES.text12,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.primaryText,
    },
    statLine: {
      fontSize: SIZES.text12,
      color: colors.textMuted ?? colors.gray,
    },
    statPreview: {
      fontSize: SIZES.text14,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
    },
    fieldBlock: {
      gap: SPACING.xs,
    },
    modalFieldLabel: {
      fontSize: SIZES.text12,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.primaryText,
    },
    modalInput: {
      minHeight: 48,
      borderRadius: BORDER_RADIUS.lg,
      paddingHorizontal: SPACING.md,
      borderWidth: 1,
      borderColor: colors.borderStrong ?? withAlpha(colors.primaryText, 0.12),
      backgroundColor: colors.surfaceMuted ?? withAlpha(colors.primaryText, 0.03),
      color: colors.primaryText,
      fontSize: SIZES.text14,
    },
    modalInputInvalid: {
      borderColor: withAlpha(colors.error, 0.22),
    },
    modalTextarea: {
      minHeight: 96,
      paddingTop: SPACING.md,
    },
    validationCard: {
      borderRadius: BORDER_RADIUS.lg,
      padding: SPACING.md,
      gap: SPACING.xs,
      backgroundColor: withAlpha(colors.error, 0.08),
      borderWidth: 1,
      borderColor: withAlpha(colors.error, 0.18),
    },
    validationTitle: {
      fontSize: SIZES.text12,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.error,
    },
    validationBody: {
      fontSize: SIZES.text12,
      lineHeight: 18,
      color: colors.error,
    },
    modalActionsRow: {
      flexDirection: 'row',
      gap: SPACING.sm,
      paddingTop: SPACING.sm,
    },
    actionButton: {
      flex: 1,
      minHeight: 46,
      borderRadius: BORDER_RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
    },
    actionButtonPrimary: {
      backgroundColor: withAlpha(colors.primary, 0.12),
      borderColor: withAlpha(colors.primary, 0.22),
    },
    actionButtonNeutral: {
      backgroundColor: withAlpha(colors.primaryText, 0.04),
      borderColor: withAlpha(colors.primaryText, 0.08),
    },
    actionButtonDisabled: {
      opacity: 0.5,
    },
    actionButtonLabel: {
      fontSize: SIZES.text14,
      fontWeight: FONT_WEIGHTS.semiBold,
    },
    actionButtonLabelPrimary: {
      color: colors.primary,
    },
    actionButtonLabelNeutral: {
      color: colors.primaryText,
    },
  });

export default AdminReactionAdjustmentModal;
