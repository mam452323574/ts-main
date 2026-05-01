import { useMemo } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ModalHandle } from '@/components/ModalHandle';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SHADOWS,
  SIZES,
  SPACING,
  mixColors,
  withAlpha,
} from '@/constants/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useSocialPublicProfile } from '@/hooks/queries';
import {
  formatSocialAbsoluteDate,
  formatSocialMemberSinceLabel,
} from '@/utils/socialFormatting';

interface SocialProfilePreviewModalProps {
  visible: boolean;
  userId?: string | null;
  fallbackUsername?: string | null;
  fallbackAvatarUrl?: string | null;
  onClose: () => void;
}

export function SocialProfilePreviewModal({
  visible,
  userId,
  fallbackUsername,
  fallbackAvatarUrl,
  onClose,
}: SocialProfilePreviewModalProps) {
  const { colors } = useTheme();
  const { t, locale } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { data: profile, isLoading, isFetching } = useSocialPublicProfile(
    userId,
    visible,
  );

  const effectiveUsername = profile?.username ?? fallbackUsername ?? t('common.unknown_user');
  const effectiveAvatarUrl = profile?.avatar_url ?? fallbackAvatarUrl;
  const createdAtValue = profile?.account_created_at ?? profile?.created_at ?? null;
  const absoluteCreatedAtLabel = formatSocialAbsoluteDate(createdAtValue, locale);
  const memberSinceLabel = formatSocialMemberSinceLabel(createdAtValue, t);
  const createdOnLabel = absoluteCreatedAtLabel
    ? t('social.profile.created_on', { date: absoluteCreatedAtLabel })
    : null;
  const scanCount = profile?.scan_count ?? 0;
  const isBusy = isLoading || isFetching;
  const hasProfile = !!profile;

  return (
    <Modal
      animationType="slide"
      transparent
      visible={visible && !!userId}
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        style={styles.backdrop}
        testID="social-profile-preview-backdrop"
      >
        <Pressable
          onPress={() => undefined}
          style={styles.sheet}
          testID="social-profile-preview-modal"
        >
          <ModalHandle />

          <View style={styles.content}>
            <Text style={styles.eyebrow}>{t('social.profile.title')}</Text>

            <View style={styles.heroRow}>
              <ProfileAvatar
                avatarUrl={effectiveAvatarUrl}
                username={effectiveUsername}
                size={72}
                testID="social-profile-preview-avatar"
              />

              <View style={styles.heroCopy}>
                <Text
                  numberOfLines={1}
                  style={styles.username}
                  testID="social-profile-preview-username"
                >
                  {effectiveUsername}
                </Text>
                {createdOnLabel ? (
                  <Text style={styles.heroMeta}>{createdOnLabel}</Text>
                ) : null}
                {memberSinceLabel ? (
                  <Text style={styles.heroMeta}>{memberSinceLabel}</Text>
                ) : null}
              </View>
            </View>

            {isBusy ? (
              <View style={styles.stateCard} testID="social-profile-preview-loading">
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.stateText}>{t('social.profile.loading')}</Text>
              </View>
            ) : !hasProfile ? (
              <View style={styles.stateCard} testID="social-profile-preview-missing">
                <Text style={styles.stateTitle}>{t('social.profile.missing_title')}</Text>
                <Text style={styles.stateText}>{t('social.profile.missing_body')}</Text>
              </View>
            ) : (
              <View style={styles.stats}>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>{t('social.profile.created_label')}</Text>
                  <Text style={styles.statValue}>
                    {createdOnLabel ?? t('social.profile.loading')}
                  </Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>{t('social.profile.member_since_label')}</Text>
                  <Text style={styles.statValue}>
                    {memberSinceLabel ?? t('social.profile.loading')}
                  </Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>{t('social.profile.scans_label')}</Text>
                  <Text style={styles.statValue}>
                    {t('social.profile.scans_completed', { count: scanCount })}
                  </Text>
                </View>
              </View>
            )}
          </View>
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
      backgroundColor: withAlpha(colors.primaryText, 0.18),
    },
    sheet: {
      borderTopLeftRadius: BORDER_RADIUS.xl + 8,
      borderTopRightRadius: BORDER_RADIUS.xl + 8,
      backgroundColor: mixColors(colors.cardBackground, colors.primary, 0.03),
      borderWidth: 1,
      borderBottomWidth: 0,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08),
      ...SHADOWS.card,
    },
    content: {
      paddingHorizontal: SPACING.lg,
      paddingBottom: SPACING.xl,
      gap: SPACING.lg,
    },
    eyebrow: {
      fontSize: SIZES.text12,
      lineHeight: 16,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primary,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    heroRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
    },
    heroCopy: {
      flex: 1,
      gap: SPACING.xs,
    },
    username: {
      fontSize: SIZES.text20,
      lineHeight: 24,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
    },
    heroMeta: {
      fontSize: SIZES.text14,
      lineHeight: 18,
      color: colors.textMuted ?? colors.gray,
    },
    stats: {
      gap: SPACING.sm,
    },
    statCard: {
      gap: 2,
      padding: SPACING.md,
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: colors.surfaceMuted ?? withAlpha(colors.white, 0.04),
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.06),
    },
    statLabel: {
      fontSize: SIZES.text12,
      lineHeight: 16,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.textMuted ?? colors.gray,
    },
    statValue: {
      fontSize: SIZES.text14,
      lineHeight: 20,
      color: colors.primaryText,
    },
    stateCard: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.sm,
      paddingVertical: SPACING.lg,
      paddingHorizontal: SPACING.md,
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: colors.surfaceMuted ?? withAlpha(colors.white, 0.04),
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.06),
    },
    stateTitle: {
      fontSize: SIZES.text14,
      lineHeight: 18,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
      textAlign: 'center',
    },
    stateText: {
      fontSize: SIZES.text14,
      lineHeight: 19,
      color: colors.textMuted ?? colors.gray,
      textAlign: 'center',
    },
  });

export default SocialProfilePreviewModal;
