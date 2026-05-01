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

import type { AdminOverflowActionDefinition } from './adminModerationUtils';

interface AdminOverflowMenuProps {
  item: SocialAdminModerationItem | null;
  actions: AdminOverflowActionDefinition[];
  onClose: () => void;
  onActionPress: (action: AdminOverflowActionDefinition) => void;
}

export function AdminOverflowMenu({
  item,
  actions,
  onClose,
  onActionPress,
}: AdminOverflowMenuProps) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal
      animationType="slide"
      transparent
      visible={item !== null}
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={styles.sheet}
          onPress={() => undefined}
          testID="admin-social-overflow-modal"
        >
          <View style={styles.handle} />
          <Text style={styles.title}>{t('social.admin.menu.title')}</Text>
          {item ? (
            <Text style={styles.subtitle}>
              {item.author_username ?? t('common.unknown_user')}
            </Text>
          ) : null}

          <View style={styles.actions}>
            {item
              ? actions.map((action) => (
                  <TouchableOpacity
                    key={`${item.content_id}-${action.key}`}
                    accessibilityRole="button"
                    onPress={() => onActionPress(action)}
                    style={styles.actionRow}
                    testID={`admin-social-overflow-action-${action.key}-${item.content_id}`}
                  >
                    <Text
                      style={[
                        styles.actionLabel,
                        action.tone === 'danger' ? styles.actionLabelDanger : null,
                      ]}
                    >
                      {t(action.labelKey)}
                    </Text>
                  </TouchableOpacity>
                ))
              : null}
          </View>

          <TouchableOpacity
            accessibilityRole="button"
            onPress={onClose}
            style={styles.cancelButton}
            testID="admin-social-overflow-close"
          >
            <Text style={styles.cancelLabel}>{t('common.cancel')}</Text>
          </TouchableOpacity>
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
      backgroundColor: withAlpha(colors.primaryText, 0.32),
    },
    sheet: {
      borderTopLeftRadius: BORDER_RADIUS.xl,
      borderTopRightRadius: BORDER_RADIUS.xl,
      backgroundColor: colors.cardBackground,
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.xl,
      gap: SPACING.md,
      ...SHADOWS.card,
    },
    handle: {
      alignSelf: 'center',
      width: 44,
      height: 5,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: withAlpha(colors.primaryText, 0.12),
    },
    title: {
      fontSize: SIZES.text16,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: SIZES.text12,
      color: colors.gray,
      textAlign: 'center',
    },
    actions: {
      gap: SPACING.xs,
    },
    actionRow: {
      minHeight: 52,
      borderRadius: BORDER_RADIUS.lg,
      paddingHorizontal: SPACING.md,
      justifyContent: 'center',
      backgroundColor: withAlpha(colors.primaryText, 0.03),
    },
    actionLabel: {
      fontSize: SIZES.text14,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.primaryText,
    },
    actionLabelDanger: {
      color: colors.error,
    },
    cancelButton: {
      minHeight: 48,
      borderRadius: BORDER_RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(colors.primaryText, 0.06),
    },
    cancelLabel: {
      fontSize: SIZES.text14,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.primaryText,
    },
  });

export default AdminOverflowMenu;
