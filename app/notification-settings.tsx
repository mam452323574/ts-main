import { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { Bell, Award, Sparkles } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { AppScreen } from '@/components/AppScreen';
import { Button } from '@/components/Button';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ScreenSection } from '@/components/ScreenSection';
import { SettingRow } from '@/components/SettingRow';
import { SIZES, SPACING } from '@/constants/theme';

import { useLanguage } from '@/contexts/LanguageContext';
import { useCustomAlert } from '@/hooks/useCustomAlert';

export default function NotificationSettingsScreen() {
  const router = useRouter();
  const { userProfile, updateNotificationSettings } = useAuth();
  const { colors, isDark } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
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
    <AppScreen scroll style={styles.container} contentContainerStyle={styles.content}>
      {alertElement}
      <ScreenHeader
        title={t('notification_settings.title')}
        onBack={() => router.back()}
        centered
        topInset={false}
      />

      <ScreenSection
        title={t('notification_settings.types')}
        subtitle={t('notification_settings.types_desc')}
        style={styles.section}
      >
        <SettingRow
          title={t('notification_settings.reminders')}
          description={t('notification_settings.reminders_desc')}
          icon={<Bell color={colors.primaryText} size={20} />}
          right={
            <Switch
              value={settings.reminders}
              onValueChange={() => handleToggle('reminders')}
              trackColor={{ false: colors.lightGray, true: colors.primary }}
              thumbColor={colors.white}
            />
          }
        />
        <SettingRow
          title={t('notification_settings.achievements')}
          description={t('notification_settings.achievements_desc')}
          icon={<Award color={colors.primaryText} size={20} />}
          right={
            <Switch
              value={settings.achievements}
              onValueChange={() => handleToggle('achievements')}
              trackColor={{ false: colors.lightGray, true: colors.primary }}
              thumbColor={colors.white}
            />
          }
        />
        <SettingRow
          title={t('notification_settings.new_content')}
          description={t('notification_settings.new_content_desc')}
          icon={<Sparkles color={colors.primaryText} size={20} />}
          right={
            <Switch
              value={settings.newContent}
              onValueChange={() => handleToggle('newContent')}
              trackColor={{ false: colors.lightGray, true: colors.primary }}
              thumbColor={colors.white}
            />
          }
        />
      </ScreenSection>

      <ScreenSection variant="premium" style={styles.section} contentStyle={styles.infoSurface}>
        <Text style={styles.infoText}>
          {t('notification_settings.info')}
        </Text>
      </ScreenSection>

      <View style={styles.buttonContainer}>
        <Button
          title={t('notification_settings.save')}
          onPress={handleSave}
          loading={saving}
          disabled={saving}
        />
      </View>
    </AppScreen>
  );
}

const createStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: SPACING.xxxl,
    gap: SPACING.lg,
  },
  section: {
    paddingHorizontal: SPACING.page,
  },
  infoSurface: {
    padding: SPACING.md,
  },
  infoText: {
    fontSize: SIZES.text14,
    color: isDark ? colors.primaryText : colors.darkGray,
    lineHeight: 20,
  },
  buttonContainer: {
    paddingHorizontal: SPACING.page,
    paddingTop: SPACING.sm,
  },
});
