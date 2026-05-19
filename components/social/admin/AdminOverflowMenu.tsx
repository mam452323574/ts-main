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
  SIZES,
  SPACING,
  withAlpha,
} from '@/constants/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import type { SocialAdminModerationItem } from '@/types';

import type { AdminOverflowActionDefinition } from './adminModerationUtils';
import { buildAdminChromePalette } from './adminModerationTheme';
import { SquirclePressable } from '@/components/Squircle';

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
  const chrome = useMemo(
    () => buildAdminChromePalette(colors, 'needs_review'),
    [colors],
  );
  const styles = useMemo(() => createStyles(chrome), [chrome]);

  return (
    <Modal
      animationType="slide"
      transparent
      visible={item !== null}
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <SquirclePressable
          style={styles.sheet}
          onPress={() => undefined}
          testID="admin-social-overflow-modal"
        >
          <View style={styles.handle} />
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>{t('social.admin.menu.title')}</Text>
            {item ? (
              <Text style={styles.subtitle}>
                {item.author_username ?? t('common.unknown_user')}
              </Text>
            ) : null}
          </View>

          <View style={styles.actions}>
            {item
              ? actions.map((action) => (
                  <TouchableOpacity
                    key={`${item.content_id}-${action.key}`}
                    accessibilityRole="button"
                    onPress={() => onActionPress(action)}
                    style={[
                      styles.actionRow,
                      action.tone === 'danger' ? styles.actionRowDanger : null,
                    ]}
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
        </SquirclePressable>
      </Pressable>
    </Modal>
  );
}

const createStyles = (chrome: ReturnType<typeof buildAdminChromePalette>) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: withAlpha(chrome.screenBackground, 0.72),
    },
    sheet: {
      borderTopLeftRadius: BORDER_RADIUS.hero,
      borderTopRightRadius: BORDER_RADIUS.hero,
      backgroundColor: chrome.surfaceRaised,
      borderWidth: 1,
      borderColor: chrome.borderSubtle,
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.xl + 2,
      gap: SPACING.md,
      shadowColor: chrome.shadowColor,
      shadowOffset: { width: 0, height: -10 },
      shadowOpacity: 0.34,
      shadowRadius: 22,
      elevation: 10, borderCurve: 'continuous',
    },
    handle: {
      alignSelf: 'center',
      width: 44,
      height: 5,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: chrome.handle, borderCurve: 'continuous',
    },
    headerCopy: {
      gap: SPACING.xs,
    },
    eyebrow: {
      fontSize: SIZES.text12,
      fontWeight: FONT_WEIGHTS.bold,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: chrome.trustAccent,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: SIZES.text16,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: chrome.textPrimary,
      textAlign: 'center',
    },
    actions: {
      gap: SPACING.xs + 2,
    },
    actionRow: {
      minHeight: 54,
      borderRadius: BORDER_RADIUS.xl,
      paddingHorizontal: SPACING.md,
      justifyContent: 'center',
      backgroundColor: chrome.surfaceMuted,
      borderWidth: 1,
      borderColor: chrome.borderSubtle, borderCurve: 'continuous',
    },
    actionRowDanger: {
      backgroundColor: chrome.dangerAccentSoft,
      borderColor: chrome.dangerAccentBorder,
    },
    actionLabel: {
      fontSize: SIZES.text14,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: chrome.textPrimary,
    },
    actionLabelDanger: {
      color: chrome.dangerAccent,
    },
    cancelButton: {
      minHeight: 50,
      borderRadius: BORDER_RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(chrome.textPrimary, 0.05),
      borderWidth: 1,
      borderColor: chrome.borderSubtle, borderCurve: 'continuous',
    },
    cancelLabel: {
      fontSize: SIZES.text14,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: chrome.textSecondary,
    },
  });

export default AdminOverflowMenu;
