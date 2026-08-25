import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Platform, Modal } from 'react-native';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Crown, ChevronRight, Shield, ShieldAlert, LogOut, Bell, Settings, Globe, Check, Trash2 } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { AppScreen } from '@/components/AppScreen';
import { AvatarPicker } from '@/components/AvatarPicker';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useNotificationContext } from '@/contexts/NotificationContext';
import { AccountBadge } from '@/components/AccountBadge';
import { ResultSheetTopChrome } from '@/components/results/ResultSheetTopChrome';
import { ScreenSection } from '@/components/ScreenSection';
import { SettingRow } from '@/components/SettingRow';
import { navigationService } from '@/services/navigation';
import { SIZES, SPACING, BORDER_RADIUS, FONT_WEIGHTS, withAlpha } from '@/constants/theme';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { LOCALE_OPTIONS } from '@/i18n/config';
import { useAllScanEligibility } from '@/hooks/queries/useScanEligibility';
import { SCAN_TYPE_LABELS } from '@/constants/scan';
import { ScanType } from '@/types';
import {
  getScanQuotaStatusLabelKey,
  hasScanQuotaPayload,
  resolveScanQuotaState,
} from '@/utils/scanQuotaState';
import { Squircle } from '@/components/Squircle';

const SETTINGS_SCAN_TYPES: ScanType[] = ['health', 'body', 'nutrition', 'super'];
const EMPTY_LOADING_BY_SCAN_TYPE = {
  body: false,
  health: false,
  nutrition: false,
  super: false,
};

export default function SettingsScreen() {
  const router = useRouter();
  const { userProfile, signOut, updateAvatarUrl, deleteAccount } = useAuth();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, isDark, insets), [colors, insets, isDark]);
  const { notificationCount } = useNotificationContext();
  const { t, locale, changeLanguage, isChangingLanguage } = useLanguage();
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isSavingAvatar, setIsSavingAvatar] = useState(false);
  const { showAlert, alertElement } = useCustomAlert();
  const accountTier = userProfile?.account_tier ?? null;
  const {
    data: scanEligibility,
    errors: scanEligibilityErrors = {},
    loadingByScanType = EMPTY_LOADING_BY_SCAN_TYPE,
    isAuthReady = true,
    canQuery: canQueryEligibility = true,
    refetchAll: refetchEligibility,
  } = useAllScanEligibility();
  const scanQuotaRows = useMemo(
    () =>
      SETTINGS_SCAN_TYPES.map((scanType) => ({
        scanType,
        state: resolveScanQuotaState({
          scanType,
          accountTier,
          eligibility: scanEligibility?.[scanType],
          error: scanEligibilityErrors[scanType],
          loading: loadingByScanType[scanType],
          isAuthReady,
          canQuery: canQueryEligibility,
        }),
      })),
    [accountTier, canQueryEligibility, isAuthReady, loadingByScanType, scanEligibility, scanEligibilityErrors]
  );

  useFocusEffect(
    useCallback(() => {
      if (isAuthReady && canQueryEligibility) {
        void refetchEligibility();
      }
    }, [canQueryEligibility, isAuthReady, refetchEligibility])
  );

  useEffect(() => {
    // Mount-only failsafe: reset stale isSigningOut state on screen open and
    // schedule a 10s safety timer. Reading isSigningOut inside is intentional
    // — adding it to deps would re-run the failsafe on every state change.
    setIsSigningOut(false);

    const timeout = setTimeout(() => {
      if (isSigningOut) {
        setIsSigningOut(false);
      }
    }, 10000);

    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isSigningOut) {
      const resetTimeout = setTimeout(() => {
        setIsSigningOut(false);
      }, 15000);
      return () => clearTimeout(resetTimeout);
    }
  }, [isSigningOut]);

  const handleNotificationsPress = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    navigationService.navigateToNotifications();
  };

  const handleNotificationSettingsPress = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push('/notification-settings');
  };

  const handleAdminModerationPress = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push('/admin-social-moderation');
  };

  const performSignOut = async () => {
    try {
      setIsSigningOut(true);
      console.log('[Settings] Starting sign out...');

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }

      await signOut();
      console.log('[Settings] Sign out successful, redirecting to login...');
      router.replace('/login');
    } catch (error) {
      console.error('[Settings] Sign out error:', error);
      setIsSigningOut(false);
      showAlert(
        t('settings.sign_out_error_title'),
        t('settings.sign_out_error_msg'),
        [{ text: t('settings.ok') }],
        undefined,
        { variant: 'danger', emoji: '🛡️' }
      );
    }
  };

  const handleSignOut = async () => {
    if (isSigningOut || isDeletingAccount) {
      return;
    }

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    showAlert(
      t('settings.sign_out_confirm_title'),
      t('settings.sign_out_confirm_msg'),
      [
        { text: t('settings.cancel'), style: 'cancel' },
        {
          text: t('settings.sign_out_button'),
          style: 'destructive',
          onPress: performSignOut,
        },
      ],
      undefined,
      {
        variant: 'danger',
        emoji: '👋',
        dismissible: true,
      }
    );
  };

  const performDeleteAccount = async () => {
    try {
      setIsDeletingAccount(true);

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }

      await deleteAccount();
      router.replace('/login');
    } catch (error) {
      console.error('[Settings] Delete account error:', error);
      setIsDeletingAccount(false);
      showAlert(
        t('settings.delete_account_error_title'),
        t('settings.delete_account_error_msg'),
        [{ text: t('settings.ok') }],
        undefined,
        { variant: 'danger', emoji: null },
      );
    }
  };

  const handleDeleteAccount = () => {
    if (isSigningOut || isDeletingAccount) {
      return;
    }

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    showAlert(
      t('settings.delete_account_confirm_title'),
      t('settings.delete_account_confirm_msg'),
      [
        { text: t('settings.cancel'), style: 'cancel' },
        {
          text: t('settings.delete_account_continue'),
          style: 'destructive',
          onPress: () => {
            showAlert(
              t('settings.delete_account_final_title'),
              t('settings.delete_account_final_msg'),
              [
                { text: t('settings.cancel'), style: 'cancel' },
                {
                  text: t('settings.delete_account_button'),
                  style: 'destructive',
                  onPress: performDeleteAccount,
                },
              ],
              undefined,
              { variant: 'danger', emoji: null, dismissible: true },
            );
          },
        },
      ],
      undefined,
      { variant: 'danger', emoji: null, dismissible: true },
    );
  };

  const handleAvatarSelected = async (avatarReference: string) => {
    try {
      setIsSavingAvatar(true);
      await updateAvatarUrl(avatarReference);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t('components.avatar.error_download');
      showAlert(t('components.avatar.error_title'), message, [
        { text: t('common.ok') },
      ]);
    } finally {
      setIsSavingAvatar(false);
    }
  };

  if (!userProfile) {
    return null;
  }

  return (
    <AppScreen topInset={false} bottomInset={false} style={styles.container}>
      {alertElement}
      <ScrollView
        style={styles.scrollContent}
        contentContainerStyle={styles.scrollContentContainer}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={true}
        testID="settings-scroll"
      >
        <ResultSheetTopChrome
          onLeftAction={() => router.back()}
          leftActionAccessibilityLabel={t('common.back')}
          testID="settings-top-chrome"
          title={t('settings.title')}
          titleTestID="settings-screen-header"
          variant="settings"
        />
        <View style={styles.header} testID="settings-profile-header">
          <View style={styles.avatarContainer}>
            <AvatarPicker
              userId={userProfile.id}
              currentAvatarUrl={userProfile.avatar_url}
              onAvatarSelected={handleAvatarSelected}
              size={100}
            />
            {isSavingAvatar ? (
              <ActivityIndicator color={colors.primary} style={styles.avatarSavingIndicator} />
            ) : null}
          </View>
          <Text style={styles.username}>{userProfile.username}</Text>
          <Text style={styles.email}>{userProfile.email}</Text>
        </View>

        <ScreenSection
          title={t('settings.section_subscription')}
          variant="raised"
          padded
          style={styles.section}
          contentStyle={styles.subscriptionCard}
        >
            <AccountBadge tier={userProfile.account_tier} size="large" />
            <Squircle style={styles.quotaSummary} testID="settings-quota-summary">
              <Text style={styles.quotaSummaryTitle}>{t('home.items_available')}</Text>
              {scanQuotaRows.map(({ scanType, state }) => {
                const hasPayload = hasScanQuotaPayload(state);
                const stateLabelKey = getScanQuotaStatusLabelKey(state);

                return (
                  <View
                    key={scanType}
                    style={styles.quotaRow}
                    testID={`settings-quota-row-${scanType}`}
                  >
                    <Text style={styles.quotaLabel}>{t(SCAN_TYPE_LABELS[scanType])}</Text>
                    <Text
                      style={[
                        styles.quotaValue,
                        hasPayload
                          ? styles.quotaValueReady
                          : state.status === 'locked'
                            ? styles.quotaValueLocked
                            : styles.quotaValueMuted,
                      ]}
                    >
                      {hasPayload
                        ? `${state.remaining}/${state.limit}`
                        : t(stateLabelKey ?? 'scan_limit.missing_payload')}
                    </Text>
                  </View>
                );
              })}
            </Squircle>
            {userProfile.account_tier === 'free' && (
              <TouchableOpacity
                style={styles.upgradeCard}
                onPress={() => router.push('/premium-upgrade')}
                activeOpacity={0.8}
              >
                <Crown color={colors.gold} size={28} fill={withAlpha(colors.gold, 0.22)} />
                <View style={styles.upgradeCardText}>
                  <Text style={styles.upgradeCardTitle}>{t('settings.upgrade_premium')}</Text>
                  <Text style={styles.upgradeCardSubtitle}>{t('settings.upgrade_subtitle')}</Text>
                </View>
                <ChevronRight color={colors.gold} size={24} />
              </TouchableOpacity>
            )}
        </ScreenSection>

        <ScreenSection title={t('settings.section_preferences')} style={styles.section}>
          <SettingRow
            title={t('settings.language')}
            description={LOCALE_OPTIONS.find((item) => item.code === locale)?.label ?? locale.toUpperCase()}
            icon={<Globe color={colors.primaryText} size={20} />}
            onPress={() => setShowLanguageModal(true)}
          />
          <SettingRow
            title={t('settings.notifications')}
            description={notificationCount > 0 ? `${notificationCount} ${t('settings.new_notifications')}` : null}
            icon={<Bell color={colors.primaryText} size={20} />}
            onPress={handleNotificationsPress}
            right={
              <View style={styles.menuItemRight}>
                {notificationCount > 0 ? (
                  <View style={styles.notificationBadge}>
                    <Text style={styles.notificationBadgeText}>{notificationCount}</Text>
                  </View>
                ) : null}
                <ChevronRight color={colors.gray} size={20} />
              </View>
            }
          />
          <SettingRow
            title={t('settings.notifications_preferences')}
            icon={<Settings color={colors.primaryText} size={20} />}
            onPress={handleNotificationSettingsPress}
          />
        </ScreenSection>

        <ScreenSection title={t('settings.section_app')} style={styles.section}>
          {userProfile.account_tier === 'admin' ? (
            <SettingRow
              title={t('settings.admin_moderation')}
              description={t('settings.admin_moderation_subtitle')}
              icon={<ShieldAlert color={colors.primary} size={20} />}
              onPress={handleAdminModerationPress}
              testID="settings-admin-moderation"
            />
          ) : null}
          <SettingRow
            title={t('settings.privacy_policy')}
            icon={<Shield color={colors.primaryText} size={20} />}
            onPress={() => router.push('/privacy-policy')}
          />
        </ScreenSection>

        <ScreenSection
          title={t('settings.danger_zone_title')}
          subtitle={t('settings.danger_zone_desc')}
          variant="danger"
          style={styles.dangerSection}
        >
          <SettingRow
            title={isSigningOut ? t('settings.sign_out_loading') : t('settings.sign_out_button')}
            icon={
              isSigningOut ? (
                <ActivityIndicator color={colors.error} size="small" />
              ) : (
                <LogOut color={colors.error} size={22} strokeWidth={2.5} />
              )
            }
            onPress={handleSignOut}
            disabled={isSigningOut || isDeletingAccount}
            destructive
          />
          <SettingRow
            title={isDeletingAccount ? t('settings.delete_account_loading') : t('settings.delete_account_button')}
            description={t('settings.delete_account_desc')}
            icon={
              isDeletingAccount ? (
                <ActivityIndicator color={colors.error} size="small" />
              ) : (
                <Trash2 color={colors.error} size={22} strokeWidth={2.5} />
              )
            }
            onPress={handleDeleteAccount}
            disabled={isSigningOut || isDeletingAccount}
            destructive
            testID="settings-delete-account"
          />
        </ScreenSection>

        <View style={styles.footer}>
          <Text style={styles.footerText}>{t('settings.footer_version')}</Text>
        </View>
      </ScrollView>

      <Modal
        visible={showLanguageModal}
        transparent={true}
        animationType="fade"
        statusBarTranslucent={Platform.OS === 'android'}
        onRequestClose={() => setShowLanguageModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowLanguageModal(false)}
        >
          <Squircle style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.modalIconRow}>
              <Squircle style={styles.modalIconBadge}>
                <Globe color={colors.primary} size={24} />
              </Squircle>
              <Text style={styles.modalEmoji}>🌐</Text>
            </View>
            <Text style={styles.modalTitle}>{t('settings.select_language_title')}</Text>
            {LOCALE_OPTIONS.map((language) => (
              <TouchableOpacity
                key={language.code}
                style={[
                  styles.languageOption,
                  locale === language.code && styles.languageOptionSelected,
                ]}
                onPress={() => {
                  void changeLanguage(language.code);
                  setShowLanguageModal(false);
                }}
                disabled={isChangingLanguage}
              >
                <Text
                  style={[
                    styles.languageText,
                    locale === language.code && styles.languageTextSelected,
                  ]}
                >
                  {language.label}
                </Text>
                {locale === language.code && <Check size={20} color={colors.primary} />}
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowLanguageModal(false)}
            >
              <Text style={styles.closeButtonText}>{t('settings.cancel')}</Text>
            </TouchableOpacity>
          </Squircle>
        </TouchableOpacity>
      </Modal>

    </AppScreen>
  );
}

const createStyles = (colors: any, isDark: boolean, insets: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flex: 1,
  },
  scrollContentContainer: {
    paddingTop: insets.top + SPACING.md,
    paddingBottom: SPACING.xxxl + SPACING.xl + insets.bottom,
  },
  header: {
    alignItems: 'center',
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.xl,
    backgroundColor: isDark ? 'transparent' : colors.cardBackground,
    borderBottomWidth: isDark ? 0 : 1,
    borderBottomColor: isDark
      ? 'transparent'
      : (colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08)),
  },
  avatarContainer: {
    marginBottom: SPACING.md,
    alignItems: 'center',
  },
  avatarSavingIndicator: {
    marginTop: SPACING.sm,
  },
  username: {
    fontSize: SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.primaryText,
    marginBottom: SPACING.xs,
  },
  email: {
    fontSize: SIZES.text14,
    color: colors.gray,
  },
  section: {
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.page,
  },
  dangerSection: {
    marginTop: SPACING.xxl,
  },
  subscriptionCard: {
    alignItems: 'center',
    gap: SPACING.md,
  },
  quotaSummary: {
    width: '100%',
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    borderColor: colors.borderSubtle ?? colors.lightGray,
    backgroundColor: colors.surfaceMuted ?? withAlpha(colors.primaryText, 0.04),
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.xs, borderCurve: 'continuous',
  },
  quotaSummaryTitle: {
    fontSize: SIZES.text12,
    fontWeight: FONT_WEIGHTS.semiBold,
    color: colors.gray,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: SPACING.xs,
  },
  quotaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
  },
  quotaLabel: {
    fontSize: SIZES.text14,
    color: colors.primaryText,
    flex: 1,
  },
  quotaValue: {
    fontSize: SIZES.text14,
    fontWeight: FONT_WEIGHTS.semiBold,
    textAlign: 'right',
  },
  quotaValueReady: {
    color: colors.primary,
  },
  quotaValueMuted: {
    color: colors.gray,
  },
  quotaValueLocked: {
    color: colors.gold,
  },
  upgradeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1.5,
    borderColor: withAlpha(colors.gold, 0.34),
    backgroundColor: withAlpha(colors.gold, isDark ? 0.1 : 0.14),
    marginTop: SPACING.sm,
    shadowColor: colors.gold,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: isDark ? 0.16 : 0.1,
    shadowRadius: 22,
    elevation: 3, borderCurve: 'continuous',
  },
  upgradeCardText: {
    flex: 1,
  },
  upgradeCardTitle: {
    fontSize: SIZES.text16,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.primaryText,
  },
  upgradeCardSubtitle: {
    fontSize: SIZES.text12,
    color: colors.gray,
    marginTop: 2,
  },
  menuItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  notificationBadge: {
    backgroundColor: colors.error,
    borderRadius: BORDER_RADIUS.full,
    minWidth: 22,
    height: 22,
    paddingHorizontal: SPACING.xs,
    justifyContent: 'center',
    alignItems: 'center', borderCurve: 'continuous',
  },
  notificationBadgeText: {
    fontSize: SIZES.text12,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.white,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
  },
  footerText: {
    fontSize: SIZES.text12,
    color: colors.gray,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: isDark
      ? withAlpha(colors.background, 0.7)
      : withAlpha(colors.primaryText, 0.42),
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: insets.top + SPACING.lg,
    paddingBottom: insets.bottom + SPACING.lg,
    paddingHorizontal: SPACING.lg,
  },
  modalContent: {
    backgroundColor: colors.surfaceElevated ?? colors.cardBackground,
    borderRadius: BORDER_RADIUS.hero,
    padding: SPACING.xl,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: colors.borderStrong ?? withAlpha(colors.gray, 0.22),
    shadowColor: colors.primaryText,
    shadowOffset: {
      width: 0,
      height: 14,
    },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10, borderCurve: 'continuous',
  },
  modalIconRow: {
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  modalIconBadge: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: withAlpha(colors.primary, 0.14),
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: withAlpha(colors.primary, 0.26), borderCurve: 'continuous',
  },
  modalEmoji: {
    marginTop: SPACING.xs,
    fontSize: 18,
  },
  modalTitle: {
    fontSize: SIZES.text18,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.primaryText,
    marginBottom: SPACING.lg,
    textAlign: 'center',
  },
  languageOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: 16,
    marginBottom: SPACING.xs,
    borderWidth: 1,
    borderColor: withAlpha(colors.gray, 0.18), borderCurve: 'continuous',
  },
  languageOptionSelected: {
    backgroundColor: withAlpha(colors.primary, 0.12),
    borderColor: withAlpha(colors.primary, 0.34),
  },
  languageText: {
    fontSize: SIZES.text16,
    color: colors.primaryText,
  },
  languageTextSelected: {
    color: colors.primary,
    fontWeight: FONT_WEIGHTS.bold,
  },
  closeButton: {
    marginTop: SPACING.lg,
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderRadius: 14,
    backgroundColor: withAlpha(colors.gray, 0.14), borderCurve: 'continuous',
  },
  closeButtonText: {
    fontSize: SIZES.text16,
    color: colors.gray,
    fontWeight: FONT_WEIGHTS.medium,
  },
});
