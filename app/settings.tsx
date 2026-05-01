import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Platform, Modal } from 'react-native';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Crown, ChevronRight, Shield, ShieldAlert, LogOut, Bell, ChevronLeft, AlertTriangle, Settings, Globe, Check } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { AvatarPicker } from '@/components/AvatarPicker';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useNotificationContext } from '@/contexts/NotificationContext';
import { AccountBadge } from '@/components/AccountBadge';
import { ModalHandle } from '@/components/ModalHandle';
import { navigationService } from '@/services/navigation';
import { SIZES, SPACING, BORDER_RADIUS, FONT_WEIGHTS } from '@/constants/theme';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { LOCALE_OPTIONS } from '@/i18n/config';
import { useAllScanEligibility } from '@/hooks/queries';
import { SCAN_TYPE_LABELS } from '@/constants/scan';
import { ScanType } from '@/types';
import {
  getScanQuotaStatusLabelKey,
  hasScanQuotaPayload,
  resolveScanQuotaState,
} from '@/utils/scanQuotaState';

const SETTINGS_SCAN_TYPES: ScanType[] = ['health', 'body', 'nutrition', 'super'];
const EMPTY_LOADING_BY_SCAN_TYPE = {
  body: false,
  health: false,
  nutrition: false,
  super: false,
};

export default function SettingsScreen() {
  const router = useRouter();
  const { userProfile, signOut, updateAvatarUrl } = useAuth();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, isDark, insets), [colors, insets, isDark]);
  const { notificationCount } = useNotificationContext();
  const { t, locale, changeLanguage, isChangingLanguage } = useLanguage();
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
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
    if (isSigningOut) {
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
    <View style={styles.container}>
      {alertElement}
      <ModalHandle />
      <View style={styles.headerBar}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <ChevronLeft color={colors.primaryText} size={24} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('settings.title')}</Text>
        <View style={styles.headerPlaceholder} />
      </View>
      <ScrollView
        style={styles.scrollContent}
        contentContainerStyle={styles.scrollContentContainer}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={true}
      >
        <View style={styles.header}>
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

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.section_subscription')}</Text>
          <View style={styles.subscriptionCard}>
            <AccountBadge tier={userProfile.account_tier} size="large" />
            <View style={styles.quotaSummary} testID="settings-quota-summary">
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
            </View>
            {userProfile.account_tier === 'free' && (
              <TouchableOpacity
                style={styles.upgradeCard}
                onPress={() => router.push('/premium-upgrade')}
                activeOpacity={0.8}
              >
                <Crown color="#FFD700" size={28} fill="#FFD700" />
                <View style={styles.upgradeCardText}>
                  <Text style={styles.upgradeCardTitle}>{t('settings.upgrade_premium')}</Text>
                  <Text style={styles.upgradeCardSubtitle}>{t('settings.upgrade_subtitle')}</Text>
                </View>
                <ChevronRight color={colors.primary} size={24} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.section_preferences')}</Text>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => setShowLanguageModal(true)}
            activeOpacity={0.7}
          >
            <View style={styles.menuItemLeft}>
              <Globe color={colors.primaryText} size={20} />
              <View>
                <Text style={styles.menuItemText}>{t('settings.language')}</Text>
                <Text style={styles.menuItemSubtext}>
                  {LOCALE_OPTIONS.find((item) => item.code === locale)?.label ?? locale.toUpperCase()}
                </Text>
              </View>
            </View>
            <ChevronRight color={colors.gray} size={20} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={handleNotificationsPress}
            activeOpacity={0.7}
          >
            <View style={styles.menuItemLeft}>
              <Bell color={colors.primaryText} size={20} />
              <View>
                <Text style={styles.menuItemText}>{t('settings.notifications')}</Text>
                {notificationCount > 0 && (
                  <Text style={styles.menuItemSubtext}>
                    {notificationCount} {t('settings.new_notifications')}
                  </Text>
                )}
              </View>
            </View>
            <View style={styles.menuItemRight}>
              {notificationCount > 0 && (
                <View style={styles.notificationBadge}>
                  <Text style={styles.notificationBadgeText}>{notificationCount}</Text>
                </View>
              )}
              <ChevronRight color={colors.gray} size={20} />
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={handleNotificationSettingsPress}
            activeOpacity={0.7}
          >
            <View style={styles.menuItemLeft}>
              <Settings color={colors.primaryText} size={20} />
              <Text style={styles.menuItemText}>{t('settings.notifications_preferences')}</Text>
            </View>
            <ChevronRight color={colors.gray} size={20} />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.section_app')}</Text>
          {userProfile.account_tier === 'admin' && (
            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleAdminModerationPress}
              activeOpacity={0.7}
              testID="settings-admin-moderation"
            >
              <View style={styles.menuItemLeft}>
                <ShieldAlert color={colors.primary} size={20} />
                <View>
                  <Text style={styles.menuItemText}>{t('settings.admin_moderation')}</Text>
                  <Text style={styles.menuItemSubtext}>{t('settings.admin_moderation_subtitle')}</Text>
                </View>
              </View>
              <ChevronRight color={colors.gray} size={20} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => router.push('/privacy-policy')}
            activeOpacity={0.8}
          >
            <View style={styles.menuItemLeft}>
              <Shield color={colors.primaryText} size={20} />
              <Text style={styles.menuItemText}>{t('settings.privacy_policy')}</Text>
            </View>
            <ChevronRight color={colors.gray} size={20} />
          </TouchableOpacity>
        </View>

        <View style={styles.dangerZone}>
          <View style={styles.dangerZoneHeader}>
            <AlertTriangle color={colors.error} size={20} />
            <Text style={styles.dangerZoneTitle}>{t('settings.danger_zone_title')}</Text>
          </View>
          <Text style={styles.dangerZoneDescription}>
            {t('settings.danger_zone_desc')}
          </Text>
          <TouchableOpacity
            style={[styles.signOutButton, isSigningOut && styles.signOutButtonDisabled]}
            onPress={handleSignOut}
            activeOpacity={0.7}
            disabled={isSigningOut}
          >
            <View style={styles.signOutButtonContent}>
              {isSigningOut ? (
                <ActivityIndicator color={colors.error} size="small" />
              ) : (
                <LogOut color={colors.error} size={22} strokeWidth={2.5} />
              )}
              <Text style={styles.signOutText}>
                {isSigningOut ? t('settings.sign_out_loading') : t('settings.sign_out_button')}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

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
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.modalIconRow}>
              <View style={styles.modalIconBadge}>
                <Globe color={colors.primary} size={24} />
              </View>
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
          </View>
        </TouchableOpacity>
      </Modal>

    </View>
  );
}

const createStyles = (colors: any, isDark: boolean, insets: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerBar: {
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
  scrollContent: {
    flex: 1,
  },
  scrollContentContainer: {
    paddingBottom: SPACING.xxxl + SPACING.xl + insets.bottom,
  },
  header: {
    alignItems: 'center',
    paddingTop: SPACING.xxl,
    paddingBottom: SPACING.xl,
    backgroundColor: colors.cardBackground,
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
  sectionTitle: {
    fontSize: SIZES.text16,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.primaryText,
    marginBottom: SPACING.md,
  },
  subscriptionCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    alignItems: 'center',
    gap: SPACING.md,
  },
  quotaSummary: {
    width: '100%',
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: colors.lightGray,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.xs,
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
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 215, 0, 0.4)',
    backgroundColor: 'rgba(255, 215, 0, 0.08)',
    marginTop: SPACING.sm,
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
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.cardBackground,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  menuItemText: {
    fontSize: SIZES.text16,
    color: colors.primaryText,
    fontWeight: FONT_WEIGHTS.regular,
  },
  menuItemSubtext: {
    fontSize: SIZES.text12,
    color: colors.primary,
    marginTop: 2,
    fontWeight: FONT_WEIGHTS.medium,
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
    alignItems: 'center',
  },
  notificationBadgeText: {
    fontSize: SIZES.text12,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.white,
  },
  dangerZone: {
    marginTop: SPACING.xxl,
    marginBottom: SPACING.xl,
    marginHorizontal: SPACING.page,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.md,
    backgroundColor: 'rgba(255, 69, 58, 0.1)', // Use opacity for dark mode compatibility
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 69, 58, 0.3)',
  },
  dangerZoneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  dangerZoneTitle: {
    fontSize: SIZES.text16,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.error,
  },
  dangerZoneDescription: {
    fontSize: SIZES.text14,
    color: colors.gray,
    marginBottom: SPACING.lg,
    lineHeight: 20,
  },
  signOutButton: {
    backgroundColor: colors.cardBackground,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 2,
    borderColor: colors.error,
    shadowColor: colors.error,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 10,
    position: 'relative',
  },
  signOutButtonDisabled: {
    opacity: 0.6,
  },
  signOutButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutText: {
    fontSize: SIZES.text16,
    fontWeight: FONT_WEIGHTS.semiBold,
    color: colors.error,
    marginLeft: SPACING.sm,
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
    backgroundColor: isDark ? 'rgba(3,8,16,0.7)' : 'rgba(10,16,32,0.42)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: insets.top + SPACING.lg,
    paddingBottom: insets.bottom + SPACING.lg,
    paddingHorizontal: SPACING.lg,
  },
  modalContent: {
    backgroundColor: colors.cardBackground,
    borderRadius: 28,
    padding: SPACING.xl,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: 'rgba(153, 166, 193, 0.22)',
    shadowColor: '#0D1428',
    shadowOffset: {
      width: 0,
      height: 14,
    },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10,
  },
  modalIconRow: {
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  modalIconBadge: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: 'rgba(0,122,255,0.14)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,122,255,0.26)',
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
    borderColor: 'rgba(153, 166, 193, 0.18)',
  },
  languageOptionSelected: {
    backgroundColor: 'rgba(0,122,255,0.12)',
    borderColor: 'rgba(0,122,255,0.34)',
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
    backgroundColor: 'rgba(153, 166, 193, 0.14)',
  },
  closeButtonText: {
    fontSize: SIZES.text16,
    color: colors.gray,
    fontWeight: FONT_WEIGHTS.medium,
  },
});
