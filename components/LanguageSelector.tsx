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

import { SHADOWS, SIZES, SPACING } from '@/constants/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { LOCALE_OPTIONS, type LocaleCode } from '@/i18n/config';

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

          <View style={styles.modalContent}>
            <View style={styles.modalHeaderIconRow}>
              <View style={styles.modalHeaderIconBadge}>
                <Globe color={colors.primary} size={22} />
              </View>
              <Text style={styles.modalEmoji}>🌐</Text>
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
          </View>
        </View>
      </Modal>
    </>
  );
};

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.lightGray,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.9)',
      ...SHADOWS.header,
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
      backgroundColor: isDark ? 'rgba(3,8,16,0.72)' : 'rgba(10,16,32,0.42)',
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
      borderRadius: 30,
      paddingVertical: SPACING.lg,
      backgroundColor: colors.cardBackground,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#EBEEF6',
      shadowColor: '#0D1428',
      shadowOffset: { width: 0, height: 14 },
      shadowOpacity: isDark ? 0.38 : 0.14,
      shadowRadius: 24,
      elevation: 11,
      maxHeight: '72%',
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
      backgroundColor: isDark ? 'rgba(10,132,255,0.18)' : '#EAF3FF',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(10,132,255,0.4)' : '#CDE2FF',
    },
    modalEmoji: {
      marginTop: SPACING.xs,
      fontSize: 18,
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
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F4F6FB',
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
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E8ECF5',
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#FFFFFF',
    },
    languageOptionSelected: {
      borderColor: 'rgba(0,122,255,0.34)',
      backgroundColor: 'rgba(0,122,255,0.12)',
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
