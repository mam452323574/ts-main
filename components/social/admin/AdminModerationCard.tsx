import { useMemo } from 'react';
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Ellipsis,
  Eye,
  Flag,
  ShieldAlert,
  Users,
} from 'lucide-react-native';

import { SocialCategoryPill } from '@/components/social/SocialCategoryPill';
import { SocialIdentityRow } from '@/components/social/SocialIdentityRow';
import { SocialModerationBadge } from '@/components/social/SocialModerationBadge';
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
import type {
  SocialAdminModerationItem,
  SocialModerationAction,
} from '@/types';

import {
  formatAdminTimestamp,
  getOverflowActionDefinitions,
  getPrimaryActionDefinitions,
} from './adminModerationUtils';

interface AdminModerationCardProps {
  item: SocialAdminModerationItem;
  isExpanded: boolean;
  actionDisabled: boolean;
  pendingActionKey: string | null;
  onToggleDetails: (itemId: string) => void;
  onModerationActionPress: (
    item: SocialAdminModerationItem,
    action: SocialModerationAction,
  ) => void;
  onOverflowPress: (item: SocialAdminModerationItem) => void;
}

function TypeChip({
  label,
}: {
  label: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.typeChip}>
      <Text style={styles.typeChipLabel}>{label}</Text>
    </View>
  );
}

function ApprovedBadge() {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.approvedBadge}>
      <Text style={styles.approvedBadgeLabel}>
        {t('social.moderation.approved')}
      </Text>
    </View>
  );
}

function SignalChip({
  icon,
  label,
}: {
  icon: 'flag' | 'users' | 'eye';
  label: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.signalChip}>
      {icon === 'flag' ? (
        <Flag color={colors.warning} size={14} />
      ) : icon === 'users' ? (
        <Users color={colors.primary} size={14} />
      ) : (
        <Eye color={colors.gray} size={14} />
      )}
      <Text style={styles.signalChipLabel}>{label}</Text>
    </View>
  );
}

export function AdminModerationCard({
  item,
  isExpanded,
  actionDisabled,
  pendingActionKey,
  onToggleDetails,
  onModerationActionPress,
  onOverflowPress,
}: AdminModerationCardProps) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const primaryActions = getPrimaryActionDefinitions(item);
  const overflowActions = getOverflowActionDefinitions(item);
  const createdLabel = formatAdminTimestamp(item.created_at);
  const reportedAtLabel = formatAdminTimestamp(item.last_reported_at, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  const completedAtLabel = formatAdminTimestamp(item.moderation_completed_at, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  const isPendingTarget = Boolean(actionDisabled && pendingActionKey);
  const showExpandedDetails = isExpanded;

  return (
    <View style={styles.cardShell} testID={`admin-social-item-${item.content_id}`}>
      <View style={styles.card}>
        {item.moderation_last_error ? (
          <View style={styles.errorBanner}>
            <AlertCircle color={colors.error} size={16} />
            <Text style={styles.errorBannerText} numberOfLines={2}>
              {item.moderation_last_error}
            </Text>
          </View>
        ) : null}

        <View style={styles.topRow}>
          <SocialIdentityRow
            username={item.author_username}
            meta={createdLabel}
            avatarSize={36}
            trailing={
              item.moderation_state === 'approved' ? (
                <ApprovedBadge />
              ) : (
                <SocialModerationBadge moderationState={item.moderation_state} />
              )
            }
            testID={`admin-social-identity-${item.content_id}`}
          />
        </View>

        <View style={styles.badgesRow}>
          <TypeChip label={t(`social.admin.types.${item.content_type}`)} />
          {item.category ? <SocialCategoryPill category={item.category} compact /> : null}
          {item.author_active_bans.map((ban, index) => (
            <View key={`${ban.scope}-${index}`} style={styles.banBadge}>
              <ShieldAlert color={colors.error} size={12} />
              <Text style={styles.banBadgeLabel}>{ban.scope}</Text>
            </View>
          ))}
        </View>

        {item.content_text ? (
          <Text
            style={styles.bodyText}
            numberOfLines={showExpandedDetails ? undefined : 3}
          >
            {item.content_text}
          </Text>
        ) : null}

        {item.asset_url ? (
          <Image
            source={{ uri: item.asset_url }}
            resizeMode="cover"
            style={styles.previewImage}
            testID={`admin-social-image-${item.content_id}`}
          />
        ) : null}

        <View style={styles.signalsRow}>
          <SignalChip
            icon="flag"
            label={t('social.admin.meta.reports_compact', { count: item.open_reports })}
          />
          <SignalChip
            icon="users"
            label={t('social.admin.meta.unique_reporters_compact', {
              count: item.unique_reporters_24h,
            })}
          />
          {item.content_type === 'post' ? (
            <SignalChip
              icon="eye"
              label={t('social.admin.meta.unique_views_compact', {
                count: item.unique_viewer_count,
              })}
            />
          ) : null}
        </View>

        {item.reason_codes.length > 0 ? (
          <View style={styles.reasonWrap}>
            {item.reason_codes.map((reasonCode) => (
              <View key={`${item.content_id}-${reasonCode}`} style={styles.reasonChip}>
                <Text style={styles.reasonChipLabel}>
                  {t(`social.report.reasons.${reasonCode}`)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {isPendingTarget && pendingActionKey ? (
          <View
            style={styles.pendingCard}
            testID={`admin-social-pending-${item.content_id}`}
          >
            <ActivityIndicator color={colors.primary} size="small" />
            <Text style={styles.pendingCardLabel}>
              {t('social.admin.pending_action', {
                action: t(`social.admin.actions.${pendingActionKey}`),
              })}
            </Text>
          </View>
        ) : null}

        <View style={styles.actionsRow}>
          {primaryActions.map((actionDefinition) => (
            <TouchableOpacity
              key={`${item.content_id}-${actionDefinition.action}`}
              accessibilityRole="button"
              disabled={actionDisabled}
              onPress={() => onModerationActionPress(item, actionDefinition.action)}
              style={[
                styles.actionButton,
                actionDefinition.tone === 'primary'
                  ? styles.actionButtonPrimary
                  : actionDefinition.tone === 'danger'
                    ? styles.actionButtonDanger
                    : styles.actionButtonNeutral,
                actionDisabled ? styles.actionButtonDisabled : null,
              ]}
              testID={`admin-social-action-${actionDefinition.action}-${item.content_id}`}
            >
              <Text
                style={[
                  styles.actionButtonLabel,
                  actionDefinition.tone === 'primary'
                    ? styles.actionButtonLabelPrimary
                    : actionDefinition.tone === 'danger'
                      ? styles.actionButtonLabelDanger
                      : styles.actionButtonLabelNeutral,
                ]}
              >
                {t(actionDefinition.labelKey)}
              </Text>
            </TouchableOpacity>
          ))}

          {overflowActions.length > 0 ? (
            <TouchableOpacity
              accessibilityRole="button"
              disabled={actionDisabled}
              onPress={() => onOverflowPress(item)}
              style={[
                styles.moreButton,
                actionDisabled ? styles.actionButtonDisabled : null,
              ]}
              testID={`admin-social-overflow-${item.content_id}`}
            >
              <Ellipsis color={colors.primaryText} size={18} />
              <Text style={styles.moreButtonLabel}>
                {t('social.admin.actions.more')}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => onToggleDetails(item.content_id)}
          style={styles.detailsToggle}
          testID={`admin-social-details-toggle-${item.content_id}`}
        >
          <Text style={styles.detailsToggleLabel}>
            {t(
              showExpandedDetails
                ? 'social.admin.details.hide'
                : 'social.admin.details.show',
            )}
          </Text>
          {showExpandedDetails ? (
            <ChevronUp color={colors.gray} size={16} />
          ) : (
            <ChevronDown color={colors.gray} size={16} />
          )}
        </TouchableOpacity>

        {showExpandedDetails ? (
          <View
            style={styles.detailsCard}
            testID={`admin-social-details-${item.content_id}`}
          >
            <Text style={styles.detailLine}>
              {t('social.admin.meta.created_at')}: {createdLabel ?? '-'}
            </Text>
            <Text style={styles.detailLine}>
              {t('social.admin.meta.reported_24h', {
                count: item.total_reports_24h,
              })}
            </Text>
            <Text style={styles.detailLine}>
              {t('social.admin.meta.unique_reporters', {
                count: item.unique_reporters_24h,
              })}
            </Text>
            {item.content_type === 'post' ? (
              <Text style={styles.detailLine}>
                {t('social.admin.meta.unique_views', {
                  count: item.unique_viewer_count,
                })}
              </Text>
            ) : null}
            {item.content_type === 'post' ? (
              <Text style={styles.detailLine}>
                {t('social.admin.meta.likes_snapshot', {
                  raw: item.raw_like_count,
                  effective: item.effective_like_count,
                })}
              </Text>
            ) : null}
            {item.content_type === 'post' ? (
              <Text style={styles.detailLine}>
                {t('social.admin.meta.dislikes_snapshot', {
                  raw: item.raw_dislike_count,
                  effective: item.effective_dislike_count,
                })}
              </Text>
            ) : null}
            {item.content_type === 'post' ? (
              <Text style={styles.detailLine}>
                {t('social.admin.meta.admin_adjustments', {
                  likes: item.admin_like_adjustment,
                  dislikes: item.admin_dislike_adjustment,
                })}
              </Text>
            ) : null}
            {reportedAtLabel ? (
              <Text style={styles.detailLine}>
                {t('social.admin.meta.last_reported_at')}: {reportedAtLabel}
              </Text>
            ) : null}
            {completedAtLabel ? (
              <Text style={styles.detailLine}>
                {t('social.admin.meta.completed_at')}: {completedAtLabel}
              </Text>
            ) : null}
            {item.moderation_reason ? (
              <Text style={styles.detailLine}>
                {t('social.admin.meta.reason')}: {item.moderation_reason}
              </Text>
            ) : null}
            {item.moderation_provider ? (
              <Text style={styles.detailLine}>
                {t('social.admin.meta.provider')}: {item.moderation_provider}
              </Text>
            ) : null}
            {item.moderation_last_error ? (
              <Text style={styles.detailLineError}>
                {t('social.admin.meta.last_error')}: {item.moderation_last_error}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    cardShell: {
      paddingHorizontal: SPACING.page,
      paddingVertical: SPACING.xs + 2,
    },
    card: {
      borderRadius: BORDER_RADIUS.xl,
      padding: SPACING.md + 2,
      gap: SPACING.sm + 2,
      backgroundColor: colors.cardBackground,
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08),
      ...SHADOWS.card,
    },
    errorBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs + 2,
      borderRadius: BORDER_RADIUS.md,
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.xs + 2,
      backgroundColor: withAlpha(colors.error, 0.08),
      borderWidth: 1,
      borderColor: withAlpha(colors.error, 0.18),
    },
    errorBannerText: {
      flex: 1,
      fontSize: 11,
      lineHeight: 16,
      color: colors.error,
    },
    topRow: {
      gap: SPACING.xs,
    },
    badgesRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.xs,
    },
    typeChip: {
      minHeight: 28,
      paddingHorizontal: SPACING.sm,
      borderRadius: BORDER_RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(colors.primary, 0.12),
    },
    typeChipLabel: {
      fontSize: 11,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.primary,
    },
    approvedBadge: {
      minHeight: 26,
      paddingHorizontal: SPACING.sm,
      borderRadius: BORDER_RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: withAlpha(colors.success, 0.24),
      backgroundColor: withAlpha(colors.success, 0.1),
    },
    approvedBadgeLabel: {
      fontSize: 11,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.success,
    },
    banBadge: {
      minHeight: 28,
      borderRadius: BORDER_RADIUS.full,
      paddingHorizontal: SPACING.sm,
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs - 1,
      backgroundColor: withAlpha(colors.error, 0.08),
      borderWidth: 1,
      borderColor: withAlpha(colors.error, 0.18),
    },
    banBadgeLabel: {
      fontSize: 10,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.error,
      textTransform: 'uppercase',
    },
    bodyText: {
      fontSize: SIZES.text14,
      lineHeight: 20,
      color: colors.primaryText,
    },
    previewImage: {
      width: '100%',
      height: 112,
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: colors.surfaceMuted ?? withAlpha(colors.primaryText, 0.04),
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08),
    },
    signalsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.xs,
    },
    signalChip: {
      minHeight: 28,
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs - 1,
      paddingHorizontal: SPACING.sm,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: withAlpha(colors.primaryText, 0.04),
    },
    signalChipLabel: {
      fontSize: 11,
      color: colors.primaryText,
    },
    reasonWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.xs,
    },
    reasonChip: {
      paddingHorizontal: SPACING.sm,
      paddingVertical: 3,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: withAlpha(colors.warning, 0.14),
    },
    reasonChipLabel: {
      fontSize: 10,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.warning,
    },
    pendingCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs + 2,
      borderRadius: BORDER_RADIUS.md,
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.xs + 2,
      backgroundColor: withAlpha(colors.primary, 0.08),
      borderWidth: 1,
      borderColor: withAlpha(colors.primary, 0.18),
    },
    pendingCardLabel: {
      flex: 1,
      fontSize: 11,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.primary,
    },
    actionsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.xs + 2,
    },
    actionButton: {
      minHeight: 36,
      paddingHorizontal: SPACING.sm + 2,
      borderRadius: BORDER_RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
    },
    actionButtonPrimary: {
      backgroundColor: withAlpha(colors.primary, 0.12),
      borderColor: withAlpha(colors.primary, 0.22),
    },
    actionButtonDanger: {
      backgroundColor: withAlpha(colors.error, 0.08),
      borderColor: withAlpha(colors.error, 0.18),
    },
    actionButtonNeutral: {
      backgroundColor: colors.surfaceMuted ?? withAlpha(colors.primaryText, 0.04),
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08),
    },
    actionButtonDisabled: {
      opacity: 0.5,
    },
    actionButtonLabel: {
      fontSize: 12,
      fontWeight: FONT_WEIGHTS.semiBold,
    },
    actionButtonLabelPrimary: {
      color: colors.primary,
    },
    actionButtonLabelDanger: {
      color: colors.error,
    },
    actionButtonLabelNeutral: {
      color: colors.primaryText,
    },
    moreButton: {
      minHeight: 36,
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs - 1,
      paddingHorizontal: SPACING.sm + 2,
      borderRadius: BORDER_RADIUS.full,
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08),
      backgroundColor: colors.surfaceMuted ?? withAlpha(colors.primaryText, 0.03),
    },
    moreButtonLabel: {
      fontSize: 12,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.primaryText,
    },
    detailsToggle: {
      minHeight: 34,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.xs,
    },
    detailsToggleLabel: {
      fontSize: 11,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.textMuted ?? colors.gray,
    },
    detailsCard: {
      borderRadius: BORDER_RADIUS.md,
      padding: SPACING.sm + 2,
      gap: SPACING.xs,
      backgroundColor: colors.surfaceMuted ?? withAlpha(colors.primaryText, 0.03),
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.06),
    },
    detailLine: {
      fontSize: 11,
      lineHeight: 16,
      color: colors.textMuted ?? colors.gray,
    },
    detailLineError: {
      fontSize: 11,
      lineHeight: 16,
      color: colors.error,
    },
  });

export default AdminModerationCard;
