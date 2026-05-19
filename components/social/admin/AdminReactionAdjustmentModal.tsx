import { useMemo } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Minus, Plus } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SIZES,
  SPACING,
  withAlpha,
} from '@/constants/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import type { SocialAdminModerationItem } from '@/types';
import {
  getKeyboardAvoidingViewBehavior,
  getMinimumBottomInsetPadding,
} from '@/utils/mobileLayout';

import { buildAdminChromePalette } from './adminModerationTheme';
import { Squircle } from '@/components/Squircle';

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
  const chrome = useMemo(
    () => buildAdminChromePalette(colors, 'needs_review'),
    [colors],
  );
  const styles = useMemo(() => createStyles(chrome), [chrome]);

  return (
    <View
      style={[
        styles.statColumn,
        invalid ? styles.statColumnInvalid : null,
      ]}
    >
      <View style={styles.statHeader}>
        {icon === 'plus' ? (
          <Plus color={chrome.trustAccent} size={14} />
        ) : (
          <Minus color={chrome.dangerAccent} size={14} />
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
  const chrome = useMemo(
    () => buildAdminChromePalette(colors, 'needs_review'),
    [colors],
  );
  const styles = useMemo(() => createStyles(chrome, insets), [chrome, insets]);

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
        <Squircle style={styles.modalCard} testID="admin-social-adjust-reactions-modal">
          <View style={styles.handle} />
          <Text style={styles.modalEyebrow}>
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
                  count:
                    preview?.nextEffectiveDislikeCount ??
                    item.effective_dislike_count,
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
              placeholderTextColor={chrome.textMuted}
              selectionColor={chrome.filterAccent}
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
              placeholderTextColor={chrome.textMuted}
              selectionColor={chrome.filterAccent}
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
              placeholderTextColor={chrome.textMuted}
              selectionColor={chrome.filterAccent}
              testID="admin-social-adjust-note-input"
            />
          </View>

          {!isInputValid ? (
            <Squircle style={styles.validationCard}>
              <Text style={styles.validationTitle}>
                {t('social.admin.reaction_adjustment.errors.invalid_title')}
              </Text>
              <Text style={styles.validationBody}>
                {t('social.admin.reaction_adjustment.errors.invalid_body')}
              </Text>
            </Squircle>
          ) : null}

          <View style={styles.modalActionsRow}>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={onClose}
              style={[styles.actionButton, styles.actionButtonNeutral]}
              testID="admin-social-adjust-cancel"
            >
              <Text
                style={[
                  styles.actionButtonLabel,
                  styles.actionButtonLabelNeutral,
                ]}
              >
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
              <Text
                style={[
                  styles.actionButtonLabel,
                  styles.actionButtonLabelPrimary,
                ]}
              >
                {t('common.save')}
              </Text>
            </TouchableOpacity>
          </View>
        </Squircle>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = (
  chrome: ReturnType<typeof buildAdminChromePalette>,
  insets: { bottom: number } = { bottom: 0 },
) =>
  StyleSheet.create({
    modalBackdrop: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: withAlpha(chrome.screenBackground, 0.76),
      paddingBottom: getMinimumBottomInsetPadding(insets.bottom, SPACING.sm),
    },
    modalCard: {
      borderTopLeftRadius: BORDER_RADIUS.hero,
      borderTopRightRadius: BORDER_RADIUS.hero,
      backgroundColor: chrome.surfaceRaised,
      borderWidth: 1,
      borderColor: chrome.borderSubtle,
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.sm,
      paddingBottom:
        getMinimumBottomInsetPadding(insets.bottom, SPACING.sm) + SPACING.lg,
      gap: SPACING.md,
      shadowColor: chrome.shadowColor,
      shadowOffset: { width: 0, height: -12 },
      shadowOpacity: 0.34,
      shadowRadius: 26,
      elevation: 12, borderCurve: 'continuous',
    },
    handle: {
      alignSelf: 'center',
      width: 44,
      height: 5,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: chrome.handle, borderCurve: 'continuous',
    },
    modalEyebrow: {
      fontSize: SIZES.text18,
      fontWeight: FONT_WEIGHTS.bold,
      color: chrome.textPrimary,
    },
    modalBody: {
      fontSize: SIZES.text14,
      lineHeight: 22,
      color: chrome.textSecondary,
    },
    statsRow: {
      flexDirection: 'row',
      gap: SPACING.sm,
    },
    statColumn: {
      flex: 1,
      borderRadius: BORDER_RADIUS.xl,
      padding: SPACING.md,
      gap: SPACING.xs,
      backgroundColor: chrome.surfaceMuted,
      borderWidth: 1,
      borderColor: chrome.borderSubtle, borderCurve: 'continuous',
    },
    statColumnInvalid: {
      borderColor: chrome.dangerAccentBorder,
    },
    statHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
    },
    statTitle: {
      fontSize: SIZES.text12,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: chrome.textPrimary,
    },
    statLine: {
      fontSize: SIZES.text12,
      color: chrome.textMuted,
    },
    statPreview: {
      fontSize: SIZES.text14,
      fontWeight: FONT_WEIGHTS.bold,
      color: chrome.textPrimary,
    },
    fieldBlock: {
      gap: SPACING.xs,
    },
    modalFieldLabel: {
      fontSize: SIZES.text12,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: chrome.textPrimary,
    },
    modalInput: {
      minHeight: 48,
      borderRadius: BORDER_RADIUS.xl,
      paddingHorizontal: SPACING.md,
      borderWidth: 1,
      borderColor: chrome.borderStrong,
      backgroundColor: withAlpha(chrome.screenBackground, 0.42),
      color: chrome.textPrimary,
      fontSize: SIZES.text14, borderCurve: 'continuous',
    },
    modalInputInvalid: {
      borderColor: chrome.dangerAccentBorder,
    },
    modalTextarea: {
      minHeight: 100,
      paddingTop: SPACING.md,
    },
    validationCard: {
      borderRadius: BORDER_RADIUS.xl,
      padding: SPACING.md,
      gap: SPACING.xs,
      backgroundColor: chrome.dangerAccentSoft,
      borderWidth: 1,
      borderColor: chrome.dangerAccentBorder, borderCurve: 'continuous',
    },
    validationTitle: {
      fontSize: SIZES.text12,
      fontWeight: FONT_WEIGHTS.bold,
      color: chrome.dangerAccent,
    },
    validationBody: {
      fontSize: SIZES.text12,
      lineHeight: 18,
      color: chrome.dangerAccent,
    },
    modalActionsRow: {
      flexDirection: 'row',
      gap: SPACING.sm,
      paddingTop: SPACING.sm,
    },
    actionButton: {
      flex: 1,
      minHeight: 48,
      borderRadius: BORDER_RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1, borderCurve: 'continuous',
    },
    actionButtonNeutral: {
      backgroundColor: chrome.surfaceMuted,
      borderColor: chrome.borderSubtle,
    },
    actionButtonPrimary: {
      backgroundColor: chrome.trustAccent,
      borderColor: chrome.trustAccentBorder,
    },
    actionButtonDisabled: {
      opacity: 0.5,
    },
    actionButtonLabel: {
      fontSize: SIZES.text14,
      fontWeight: FONT_WEIGHTS.semiBold,
    },
    actionButtonLabelNeutral: {
      color: chrome.textSecondary,
    },
    actionButtonLabelPrimary: {
      color: chrome.textOnAccent,
    },
  });

export default AdminReactionAdjustmentModal;
