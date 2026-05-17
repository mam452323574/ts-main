import { useMemo } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { UserMinus, UserPlus } from 'lucide-react-native';

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
import { useSocialPublicProfile } from '@/hooks/queries/useSocialPublicProfile';
import {
  formatSocialAbsoluteDate,
  formatSocialMemberSinceLabel,
} from '@/utils/socialFormatting';
import { SquirclePressable, Squircle } from '@/components/Squircle';

interface SocialProfilePreviewModalProps {
  visible: boolean;
  userId?: string | null;
  fallbackUsername?: string | null;
  fallbackAvatarUrl?: string | null;
  isOwnProfile?: boolean;
  isAuthorFollowed?: boolean;
  followBusy?: boolean;
  onFollowPress?: (() => void) | null;
  onClose: () => void;
}

export function SocialProfilePreviewModal({
  visible,
  userId,
  fallbackUsername,
  fallbackAvatarUrl,
  isOwnProfile = false,
  isAuthorFollowed = false,
  followBusy = false,
  onFollowPress,
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
  const scanCount = profile?.scan_count ?? 0;
  const isBusy = isLoading || isFetching;
  const hasProfile = !!profile;
  const showFollowButton = !isOwnProfile && hasProfile && !!onFollowPress;

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
        <SquirclePressable
          onPress={() => undefined}
          style={styles.sheet}
          testID="social-profile-preview-modal"
        >
          <ModalHandle />

          <View style={styles.content}>
            <View style={styles.hero}>
              <ProfileAvatar
                avatarUrl={effectiveAvatarUrl}
                username={effectiveUsername}
                size={88}
                testID="social-profile-preview-avatar"
              />

              <Text
                numberOfLines={1}
                style={styles.username}
                testID="social-profile-preview-username"
              >
                {effectiveUsername}
              </Text>
              <Text style={styles.heroMeta}>{t('social.profile.title')}</Text>
            </View>

            {isBusy ? (
              <Squircle style={styles.stateCard} testID="social-profile-preview-loading">
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.stateText}>{t('social.profile.loading')}</Text>
              </Squircle>
            ) : !hasProfile ? (
              <Squircle style={styles.stateCard} testID="social-profile-preview-missing">
                <Text style={styles.stateTitle}>{t('social.profile.missing_title')}</Text>
                <Text style={styles.stateText}>{t('social.profile.missing_body')}</Text>
              </Squircle>
            ) : (
              <Squircle style={styles.stats} testID="social-profile-preview-stats">
                <View style={styles.statCell}>
                  <Text style={styles.statValue}>{scanCount}</Text>
                  <Text style={styles.statLabel}>{t('social.profile.scans_label')}</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statCell}>
                  <Text numberOfLines={1} style={styles.statValue}>
                    {memberSinceLabel ?? t('social.profile.loading')}
                  </Text>
                  <Text style={styles.statLabel}>
                    {t('social.profile.member_since_label')}
                  </Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statCell}>
                  <Text numberOfLines={1} style={styles.statValue}>
                    {absoluteCreatedAtLabel ?? t('social.profile.loading')}
                  </Text>
                  <Text style={styles.statLabel}>{t('social.profile.created_label')}</Text>
                </View>
              </Squircle>
            )}

            {showFollowButton ? (
              <TouchableOpacity
                accessibilityRole="button"
                disabled={followBusy}
                onPress={() => onFollowPress?.()}
                style={[
                  styles.followButton,
                  isAuthorFollowed && styles.followButtonActive,
                  followBusy && styles.followButtonDisabled,
                ]}
                testID="social-profile-follow-button"
              >
                {isAuthorFollowed ? (
                  <UserMinus color={colors.primaryText} size={18} />
                ) : (
                  <UserPlus color={colors.background} size={18} />
                )}
                <Text
                  style={[
                    styles.followButtonLabel,
                    isAuthorFollowed && styles.followButtonLabelActive,
                  ]}
                >
                  {isAuthorFollowed
                    ? t('social.actions.unfollow')
                    : t('social.actions.follow')}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </SquirclePressable>
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
    hero: {
      alignItems: 'center',
      gap: SPACING.sm,
    },
    username: {
      fontSize: SIZES.xl,
      lineHeight: 30,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
      textAlign: 'center',
    },
    heroMeta: {
      fontSize: SIZES.text14,
      lineHeight: 18,
      color: colors.textMuted ?? colors.gray,
      textAlign: 'center',
    },
    stats: {
      flexDirection: 'row',
      alignItems: 'stretch',
      justifyContent: 'space-between',
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.sm,
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: colors.surfaceMuted ?? withAlpha(colors.white, 0.04),
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.06),
    },
    statCell: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.xs,
      minWidth: 0,
      paddingHorizontal: SPACING.xs,
    },
    statDivider: {
      width: 1,
      alignSelf: 'stretch',
      backgroundColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08),
    },
    statLabel: {
      fontSize: SIZES.text12,
      lineHeight: 16,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.textMuted ?? colors.gray,
      textAlign: 'center',
    },
    statValue: {
      fontSize: SIZES.text16,
      lineHeight: 21,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
      textAlign: 'center',
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
    followButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.sm,
      paddingVertical: SPACING.sm + 2,
      paddingHorizontal: SPACING.lg,
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: colors.primary,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    followButtonActive: {
      backgroundColor: colors.surfaceMuted ?? withAlpha(colors.primaryText, 0.06),
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.12),
    },
    followButtonDisabled: {
      opacity: 0.55,
    },
    followButtonLabel: {
      fontSize: SIZES.text16,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.background,
    },
    followButtonLabelActive: {
      color: colors.primaryText,
    },
  });

export default SocialProfilePreviewModal;
