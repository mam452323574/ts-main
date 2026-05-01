import { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, Bell, Award, Sparkles } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/Button';
import { SIZES, SPACING, BORDER_RADIUS, FONT_WEIGHTS } from '@/constants/theme';

import { useLanguage } from '@/contexts/LanguageContext';
import { useCustomAlert } from '@/hooks/useCustomAlert';

export default function NotificationSettingsScreen() {
  const router = useRouter();
  const { userProfile, updateNotificationSettings } = useAuth();
  const { colors, isDark } = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, isDark, insets), [colors, insets, isDark]);
  const [saving, setSaving] = useState(false);
  const { showAlert, alertElement } = useCustomAlert();

  const [settings, setSettings] = useState({
    reminders: true,
    achievements: true,
    newContent: true,
  });

  useEffect(() => {
    if (userProfile?.notification_settings) {
      setSettings(userProfile.notification_settings);
    }
  }, [userProfile]);

  const handleToggle = (key: keyof typeof settings) => {
    setSettings((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      await updateNotificationSettings(settings);

      showAlert(
        t('notification_settings.saved_title'),
        t('notification_settings.saved_message'),
        [
          {
            text: t('common.ok'),
            onPress: () => router.back(),
          },
        ]
      );
    } catch (error) {
      console.error('Error saving notification settings:', error);
      showAlert(
        t('common.error'),
        t('notification_settings.error_save')
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      {alertElement}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <ChevronLeft color={colors.primaryText} size={24} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('notification_settings.title')}</Text>
        <View style={styles.headerPlaceholder} />
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('notification_settings.types')}</Text>
          <Text style={styles.sectionDescription}>
            {t('notification_settings.types_desc')}
          </Text>

          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <View style={styles.iconContainer}>
                <Bell color={colors.primary} size={20} />
              </View>
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>{t('notification_settings.reminders')}</Text>
                <Text style={styles.settingDescription}>
                  {t('notification_settings.reminders_desc')}
                </Text>
              </View>
            </View>
            <Switch
              value={settings.reminders}
              onValueChange={() => handleToggle('reminders')}
              trackColor={{ false: colors.lightGray, true: colors.primary }}
              thumbColor={colors.white}
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <View style={styles.iconContainer}>
                <Award color={colors.primary} size={20} />
              </View>
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>{t('notification_settings.achievements')}</Text>
                <Text style={styles.settingDescription}>
                  {t('notification_settings.achievements_desc')}
                </Text>
              </View>
            </View>
            <Switch
              value={settings.achievements}
              onValueChange={() => handleToggle('achievements')}
              trackColor={{ false: colors.lightGray, true: colors.primary }}
              thumbColor={colors.white}
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <View style={styles.iconContainer}>
                <Sparkles color={colors.primary} size={20} />
              </View>
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>{t('notification_settings.new_content')}</Text>
                <Text style={styles.settingDescription}>
                  {t('notification_settings.new_content_desc')}
                </Text>
              </View>
            </View>
            <Switch
              value={settings.newContent}
              onValueChange={() => handleToggle('newContent')}
              trackColor={{ false: colors.lightGray, true: colors.primary }}
              thumbColor={colors.white}
            />
          </View>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            {t('notification_settings.info')}
          </Text>
        </View>

        <View style={styles.buttonContainer}>
          <Button
            title={t('notification_settings.save')}
            onPress={handleSave}
            loading={saving}
            disabled={saving}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: any, isDark: boolean, insets: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: insets.top + SPACING.sm,
    paddingBottom: SPACING.md,
    paddingHorizontal: SPACING.page,
    backgroundColor: colors.cardBackground,
    borderBottomWidth: 1,
    borderBottomColor: colors.lightGray,
  },
  backButton: {
    padding: SPACING.xs,
    width: 40,
  },
  headerTitle: {
    fontSize: SIZES.text18,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.primaryText,
  },
  headerPlaceholder: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  section: {
    paddingHorizontal: SPACING.page,
    paddingTop: SPACING.xl,
  },
  sectionTitle: {
    fontSize: SIZES.text18,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.primaryText,
    marginBottom: SPACING.xs,
  },
  sectionDescription: {
    fontSize: SIZES.text14,
    color: colors.gray,
    marginBottom: SPACING.lg,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.cardBackground,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: SPACING.md,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: colors.grayLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  settingText: {
    flex: 1,
  },
  settingTitle: {
    fontSize: SIZES.text16,
    fontWeight: FONT_WEIGHTS.semiBold,
    color: colors.primaryText,
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: SIZES.text12,
    color: colors.gray,
  },
  infoBox: {
    backgroundColor: isDark ? colors.goldLight : '#FFF9E6',
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginHorizontal: SPACING.page,
    marginTop: SPACING.xl,
    borderWidth: 1,
    borderColor: isDark ? colors.gold : '#FFE082',
  },
  infoText: {
    fontSize: SIZES.text14,
    color: isDark ? colors.primaryText : colors.darkGray,
    lineHeight: 20,
  },
  buttonContainer: {
    paddingHorizontal: SPACING.page,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.xl + insets.bottom,
  },
});
