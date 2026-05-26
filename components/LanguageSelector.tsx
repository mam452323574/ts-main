import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Check, ChevronDown, Globe, X } from 'lucide-react-native';

import {
  BORDER_RADIUS,
  SIZES,
  SPACING,
  getThemeTokens,
  withAlpha,
} from '@/constants/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { LOCALE_OPTIONS, type LocaleCode } from '@/i18n/config';
import { Squircle } from '@/components/Squircle';

interface LanguageSelectorProps {
  style?: any;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({ style }) => {
  const { locale, changeLanguage, isChangingLanguage, t } = useLanguage();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [modalVisible, setModalVisible] = useState(false);

  const currentLang =
    LOCALE_OPTIONS.find((item) => item.code === locale) ?? LOCALE_OPTIONS[0];

  const handleSelect = (langCode: LocaleCode) => {
    void changeLanguage(langCode);
    setModalVisible(false);
  };

  const renderItem = ({ item }: { item: (typeof LOCALE_OPTIONS)[number] }) => {
    const isSelected = item.code === locale;
    return (
      <TouchableOpacity
        style={[styles.languageOption, isSelected && styles.languageOptionSelected]}
        onPress={() => handleSelect(item.code)}
        disabled={isChangingLanguage}
      >
        <Text style={styles.flagLarge}>{item.flag}</Text>
        <Text style={[styles.languageLabel, isSelected && styles.languageLabelSelected]}>
          {item.label}
        </Text>
        {isSelected ? <Check color={colors.primary} size={20} /> : null}
      </TouchableOpacity>
    );
  };

  return (
    <>
      <TouchableOpacity
        style={[styles.button, style]}
        onPress={() => setModalVisible(true)}
        disabled={isChangingLanguage}
      >
        <Text style={styles.flag}>{currentLang.flag}</Text>
        <Text style={styles.code}>{currentLang.code.toUpperCase()}</Text>
        <ChevronDown size={14} color={colors.gray} />
      </TouchableOpacity>

      <Modal
        animationType="fade"
        transparent
        visible={modalVisible}
        statusBarTranslucent={Platform.OS === 'android'}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            testID="modal-backdrop"
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setModalVisible(false)}
          />

          <Squircle style={styles.modalContent}>
            <View style={styles.modalHeaderIconRow}>
              <Squircle style={styles.modalHeaderIconBadge}>
                <Globe color={colors.primary} size={22} />
              </Squircle>
            </View>

            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('settings.select_language_title')}</Text>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={styles.closeButton}
              >
                <X size={20} color={colors.gray} />
              </TouchableOpacity>
            </View>

            <FlatList
              data={LOCALE_OPTIONS}
              renderItem={renderItem}
              keyExtractor={(item) => item.code}
              contentContainerStyle={styles.listContent}
            />
          </Squircle>
        </View>
      </Modal>
    </>
  );
};

const createStyles = (colors: any, isDark: boolean) => {
  const tokens = getThemeTokens(isDark);

  return StyleSheet.create({
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: BORDER_RADIUS.full,
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? tokens.border.subtle,
      backgroundColor: colors.cardBackground,
      borderCurve: 'continuous',
    },
    flag: {
      fontSize: 18,
      marginRight: 6,
    },
    code: {
      fontSize: 14,
      fontWeight: '600',
      marginRight: 4,
      color: colors.primaryText,
    },
    modalOverlay: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: tokens.scrim,
      paddingHorizontal: SPACING.lg,
    },
    modalBackdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    modalContent: {
      width: '88%',
      maxWidth: 360,
      borderRadius: BORDER_RADIUS.hero,
      paddingVertical: SPACING.lg,
      backgroundColor: colors.cardBackground,
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? tokens.border.subtle,
      maxHeight: '72%', borderCurve: 'continuous',
    },
    modalHeaderIconRow: {
      alignItems: 'center',
      marginBottom: SPACING.xs,
    },
    modalHeaderIconBadge: {
      width: 54,
      height: 54,
      borderRadius: 27,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceMuted ?? withAlpha(colors.primaryText, 0.05),
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? tokens.border.subtle,
      borderCurve: 'continuous',
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: SPACING.lg,
      marginBottom: SPACING.md,
    },
    modalTitle: {
      fontSize: SIZES.lg,
      fontWeight: '700',
      color: colors.primaryText,
      textTransform: 'capitalize',
    },
    closeButton: {
      padding: 6,
      borderRadius: 16,
      backgroundColor: colors.surfaceMuted ?? tokens.surfaceMuted.base,
      borderCurve: 'continuous',
    },
    listContent: {
      paddingHorizontal: SPACING.lg,
      paddingBottom: SPACING.md,
      gap: SPACING.xs,
    },
    languageOption: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: SPACING.md,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? tokens.border.subtle,
      backgroundColor: colors.cardBackground, borderCurve: 'continuous',
    },
    languageOptionSelected: {
      borderColor: withAlpha(colors.primary, 0.34),
      backgroundColor: colors.primaryLight ?? withAlpha(colors.primary, isDark ? 0.14 : 0.1),
    },
    flagLarge: {
      fontSize: 24,
      marginRight: SPACING.md,
    },
    languageLabel: {
      flex: 1,
      fontSize: SIZES.md,
      color: colors.primaryText,
      fontWeight: '500',
    },
    languageLabelSelected: {
      color: colors.primary,
      fontWeight: '700',
    },
  });
};
