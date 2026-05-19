import { useMemo } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Ellipsis,
  Eye,
  Flag,
  ShieldAlert,
  Users,
} from 'lucide-react-native';

import { OptimizedImage } from '@/components/OptimizedImage';
import { SocialCategoryPill } from '@/components/social/SocialCategoryPill';
import { SocialIdentityRow } from '@/components/social/SocialIdentityRow';
import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SIZES,
  SPACING,
} from '@/constants/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import type {
  SocialAdminModerationItem,
  SocialModerationAction,
  SocialAdminModerationFilter,
} from '@/types';

import {
  formatAdminTimestamp,
  getOverflowActionDefinitions,
  getPrimaryActionDefinitions,
  isModerationItemApprovable,
} from './adminModerationUtils';
import {
  buildAdminChromePalette,
  resolveAdminActionSurface,
  resolveAdminItemTone,
} from './adminModerationTheme';

interface AdminModerationCardProps {
  item: SocialAdminModerationItem;
  isExpanded: boolean;
  actionDisabled: boolean;
  isSelected: boolean;
  pendingActionKey: string | null;
  selectionDisabled: boolean;
  onToggleDetails: (itemId: string) => void;
  onToggleSelection: (itemId: string) => void;
  onModerationActionPress: (
    item: SocialAdminModerationItem,
    action: SocialModerationAction,
  ) => void;
  onOverflowPress: (item: SocialAdminModerationItem) => void;
}

function resolvePaletteFilter(item: SocialAdminModerationItem): SocialAdminModerationFilter {
  if (item.moderation_state === 'approved') {
    return 'processed';
  }

  if (
    item.moderation_state === 'rejected' ||
    item.moderation_state === 'removed'
  ) {
    return 'reported';
  }

  return 'needs_review';
}

function TypeChip({
  label,
  backgroundColor,
  borderColor,
  textColor,
}: {
  label: string;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
}) {
  return (
    <View style={[styles.typeChip, { backgroundColor, borderColor }]}>
      <Text style={[styles.typeChipLabel, { color: textColor }]}>{label}</Text>
    </View>
  );
}

function StateBadge({
  label,
  backgroundColor,
  borderColor,
  textColor,
}: {
  label: string;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
}) {
  return (
    <View style={[styles.stateBadge, { backgroundColor, borderColor }]}>
      <Text style={[styles.stateBadgeLabel, { color: textColor }]}>{label}</Text>
    </View>
  );
}

function SignalChip({
  icon,
  label,
  chrome,
  iconColor,
}: {
  icon: 'flag' | 'users' | 'eye';
  label: string;
  chrome: ReturnType<typeof buildAdminChromePalette>;
  iconColor: string;
}) {
  return (
    <View
      style={[
        styles.signalChip,
        {
          backgroundColor: chrome.surfaceMuted,
          borderColor: chrome.borderSubtle,
        },
      ]}
    >
      {icon === 'flag' ? (
        <Flag color={iconColor} size={14} />
      ) : icon === 'users' ? (
        <Users color={iconColor} size={14} />
      ) : (
        <Eye color={iconColor} size={14} />
      )}
      <Text style={[styles.signalChipLabel, { color: chrome.textSecondary }]}>
        {label}
      </Text>
    </View>
  );
}

export function AdminModerationCard({
  item,
  isExpanded,
  actionDisabled,
  isSelected,
  pendingActionKey,
  selectionDisabled,
  onToggleDetails,
  onToggleSelection,
  onModerationActionPress,
  onOverflowPress,
}: AdminModerationCardProps) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const chrome = useMemo(
    () => buildAdminChromePalette(colors, resolvePaletteFilter(item)),
    [colors, item],
  );
  const tone = useMemo(() => resolveAdminItemTone(item), [item]);
  const stylesMemo = useMemo(
    () => createStyles(chrome, tone),
    [chrome, tone],
  );
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
  const isSelectionAvailable = isModerationItemApprovable(item);
  const isPendingTarget = Boolean(actionDisabled && pendingActionKey);
  const stateLabel = t(
    item.moderation_state === 'approved'
      ? 'social.moderation.approved'
      : `social.moderation.${item.moderation_state}`,
  );

  return (
    <View style={stylesMemo.cardShell} testID={`admin-social-item-${item.content_id}`}>
      <View
        style={[
          stylesMemo.cardHalo,
          { backgroundColor: tone.accentHalo },
        ]}
      />

      <View style={stylesMemo.cardFrame}>
        <View
          style={[
            stylesMemo.cardRail,
            { backgroundColor: tone.accent },
          ]}
        />

        <View style={stylesMemo.card}>
          {item.moderation_last_error ? (
            <View style={stylesMemo.errorBanner}>
              <AlertCircle color={chrome.dangerAccent} size={16} />
              <Text style={stylesMemo.errorBannerText} numberOfLines={2}>
                {item.moderation_last_error}
              </Text>
            </View>
          ) : null}

          <View style={stylesMemo.decisionZone}>
            <SocialIdentityRow
              username={item.author_username}
              meta={createdLabel}
              avatarSize={38}
              trailing={(
                <StateBadge
                  label={stateLabel}
                  backgroundColor={tone.summarySurface}
                  borderColor={tone.summaryBorder}
                  textColor={tone.accentSoft}
                />
              )}
              testID={`admin-social-identity-${item.content_id}`}
            />

            <View style={stylesMemo.badgesRow}>
              <TypeChip
                label={t(`social.admin.types.${item.content_type}`)}
                backgroundColor={tone.accentSurface}
                borderColor={tone.accentBorder}
                textColor={tone.accentSoft}
              />
              {item.category ? <SocialCategoryPill category={item.category} compact /> : null}
              {item.author_active_bans.map((ban, index) => (
                <View key={`${ban.scope}-${index}`} style={stylesMemo.banBadge}>
                  <ShieldAlert color={chrome.dangerAccent} size={12} />
                  <Text style={stylesMemo.banBadgeLabel}>{ban.scope}</Text>
                </View>
              ))}
            </View>

            <View style={stylesMemo.actionsRow}>
              {primaryActions.map((actionDefinition) => {
                const actionPalette = resolveAdminActionSurface(
                  actionDefinition.tone,
                  tone,
                  chrome,
                );

                return (
                  <View
                    key={`${item.content_id}-${actionDefinition.action}`}
                    style={
                      actionDefinition.action === 'approve' && isSelectionAvailable
                        ? stylesMemo.approvalGroup
                        : null
                    }
                  >
                    <TouchableOpacity
                      accessibilityRole="button"
                      disabled={actionDisabled}
                      onPress={() =>
                        onModerationActionPress(item, actionDefinition.action)
                      }
                      style={[
                        stylesMemo.actionButton,
                        {
                          backgroundColor: actionPalette.backgroundColor,
                          borderColor: actionPalette.borderColor,
                        },
                        actionDisabled ? stylesMemo.actionButtonDisabled : null,
                      ]}
                      testID={`admin-social-action-${actionDefinition.action}-${item.content_id}`}
                    >
                      <Text
                        style={[
                          styles.actionButtonLabel,
                          { color: actionPalette.textColor },
                        ]}
                      >
                        {t(actionDefinition.labelKey)}
                      </Text>
                    </TouchableOpacity>

                    {actionDefinition.action === 'approve' && isSelectionAvailable ? (
                      <TouchableOpacity
                        accessibilityRole="checkbox"
                        accessibilityState={{
                          checked: isSelected,
                          disabled: selectionDisabled,
                        }}
                        accessibilityLabel={t('social.admin.bulk.selected_count', {
                          count: isSelected ? 1 : 0,
                        })}
                        disabled={selectionDisabled}
                        onPress={() => onToggleSelection(item.content_id)}
                        style={[
                          stylesMemo.selectionCheckbox,
                          isSelected ? stylesMemo.selectionCheckboxSelected : null,
                          selectionDisabled ? stylesMemo.actionButtonDisabled : null,
                        ]}
                        testID={`admin-social-select-${item.content_id}`}
                      >
                        {isSelected ? (
                          <Check color={chrome.textOnAccent} size={16} strokeWidth={2.6} />
                        ) : null}
                      </TouchableOpacity>
                    ) : null}
                  </View>
                );
              })}

              {overflowActions.length > 0 ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={t('social.admin.actions.more')}
                  disabled={actionDisabled}
                  onPress={() => onOverflowPress(item)}
                  style={[
                    stylesMemo.moreButton,
                    actionDisabled ? stylesMemo.actionButtonDisabled : null,
                  ]}
                  testID={`admin-social-overflow-${item.content_id}`}
                >
                  <Ellipsis color={chrome.textSecondary} size={18} />
                  <Text style={stylesMemo.moreButtonLabel}>
                    {t('social.admin.actions.more')}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {isPendingTarget && pendingActionKey ? (
              <View
                style={stylesMemo.pendingCard}
                testID={`admin-social-pending-${item.content_id}`}
              >
                <ActivityIndicator color={chrome.trustAccent} size="small" />
                <Text style={stylesMemo.pendingCardLabel}>
                  {t('social.admin.pending_action', {
                    action: t(`social.admin.actions.${pendingActionKey}`),
                  })}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={stylesMemo.proofSection}>
            {item.content_text ? (
              <Text
                style={stylesMemo.bodyText}
                numberOfLines={isExpanded ? undefined : 4}
              >
                {item.content_text}
              </Text>
            ) : null}

            {item.asset_url ? (
              <OptimizedImage
                source={{ uri: item.asset_url }}
                contentFit="cover"
                recyclingKey={item.content_id}
                style={stylesMemo.previewImage}
                testID={`admin-social-image-${item.content_id}`}
              />
            ) : null}

            {item.reason_codes.length > 0 ? (
              <View style={stylesMemo.reasonWrap}>
                {item.reason_codes.map((reasonCode) => (
                  <View
                    key={`${item.content_id}-${reasonCode}`}
                    style={stylesMemo.reasonChip}
                  >
                    <Text style={stylesMemo.reasonChipLabel}>
                      {t(`social.report.reasons.${reasonCode}`)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>

          <View style={stylesMemo.contextZone}>
            <View style={stylesMemo.signalsRow}>
              <SignalChip
                icon="flag"
                label={t('social.admin.meta.reports_compact', {
                  count: item.open_reports,
                })}
                chrome={chrome}
                iconColor={tone.accentSoft}
              />
              <SignalChip
                icon="users"
                label={t('social.admin.meta.unique_reporters_compact', {
                  count: item.unique_reporters_24h,
                })}
                chrome={chrome}
                iconColor={chrome.trustAccent}
              />
              {item.content_type === 'post' ? (
                <SignalChip
                  icon="eye"
                  label={t('social.admin.meta.unique_views_compact', {
                    count: item.unique_viewer_count,
                  })}
                  chrome={chrome}
                  iconColor={chrome.textMuted}
                />
              ) : null}
            </View>

            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => onToggleDetails(item.content_id)}
              style={stylesMemo.detailsToggle}
              testID={`admin-social-details-toggle-${item.content_id}`}
            >
              <Text style={stylesMemo.detailsToggleLabel}>
                {t(
                  isExpanded
                    ? 'social.admin.details.hide'
                    : 'social.admin.details.show',
                )}
              </Text>
              {isExpanded ? (
                <ChevronUp color={chrome.textMuted} size={16} />
              ) : (
                <ChevronDown color={chrome.textMuted} size={16} />
              )}
            </TouchableOpacity>
          </View>

          {isExpanded ? (
            <View
              style={stylesMemo.detailsCard}
              testID={`admin-social-details-${item.content_id}`}
            >
              <Text style={stylesMemo.detailLine}>
                {t('social.admin.meta.created_at')}: {createdLabel ?? '-'}
              </Text>
              <Text style={stylesMemo.detailLine}>
                {t('social.admin.meta.reported_24h', {
                  count: item.total_reports_24h,
                })}
              </Text>
              <Text style={stylesMemo.detailLine}>
                {t('social.admin.meta.unique_reporters', {
                  count: item.unique_reporters_24h,
                })}
              </Text>
              {item.content_type === 'post' ? (
                <Text style={stylesMemo.detailLine}>
                  {t('social.admin.meta.unique_views', {
                    count: item.unique_viewer_count,
                  })}
                </Text>
              ) : null}
              {item.content_type === 'post' ? (
                <Text style={stylesMemo.detailLine}>
                  {t('social.admin.meta.likes_snapshot', {
                    raw: item.raw_like_count,
                    effective: item.effective_like_count,
                  })}
                </Text>
              ) : null}
              {item.content_type === 'post' ? (
                <Text style={stylesMemo.detailLine}>
                  {t('social.admin.meta.dislikes_snapshot', {
                    raw: item.raw_dislike_count,
                    effective: item.effective_dislike_count,
                  })}
                </Text>
              ) : null}
              {item.content_type === 'post' ? (
                <Text style={stylesMemo.detailLine}>
                  {t('social.admin.meta.admin_adjustments', {
                    likes: item.admin_like_adjustment,
                    dislikes: item.admin_dislike_adjustment,
                  })}
                </Text>
              ) : null}
              {reportedAtLabel ? (
                <Text style={stylesMemo.detailLine}>
                  {t('social.admin.meta.last_reported_at')}: {reportedAtLabel}
                </Text>
              ) : null}
              {completedAtLabel ? (
                <Text style={stylesMemo.detailLine}>
                  {t('social.admin.meta.completed_at')}: {completedAtLabel}
                </Text>
              ) : null}
              {item.moderation_reason ? (
                <Text style={stylesMemo.detailLine}>
                  {t('social.admin.meta.reason')}: {item.moderation_reason}
                </Text>
              ) : null}
              {item.moderation_provider ? (
                <Text style={stylesMemo.detailLine}>
                  {t('social.admin.meta.provider')}: {item.moderation_provider}
                </Text>
              ) : null}
              {item.moderation_last_error ? (
                <Text style={stylesMemo.detailLineError}>
                  {t('social.admin.meta.last_error')}: {item.moderation_last_error}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  typeChip: {
    minHeight: 28,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1, borderCurve: 'continuous',
  },
  typeChipLabel: {
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.semiBold,
  },
  stateBadge: {
    minHeight: 28,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1, borderCurve: 'continuous',
  },
  stateBadgeLabel: {
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.semiBold,
  },
  signalChip: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs - 1,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1, borderCurve: 'continuous',
  },
  signalChipLabel: {
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.medium,
  },
  actionButtonLabel: {
    fontSize: 12,
    fontWeight: FONT_WEIGHTS.semiBold,
  },
  detailLine: {
    fontSize: 11,
    lineHeight: 16,
  },
  detailLineError: {
    fontSize: 11,
    lineHeight: 16,
  },
});

const createStyles = (
  chrome: ReturnType<typeof buildAdminChromePalette>,
  tone: ReturnType<typeof resolveAdminItemTone>,
) =>
  StyleSheet.create({
    cardShell: {
      paddingHorizontal: SPACING.page,
      paddingVertical: SPACING.xs + 2,
    },
    cardHalo: {
      position: 'absolute',
      top: 4,
      left: SPACING.page + 28,
      width: 140,
      height: 140,
      borderRadius: 70,
      opacity: 0.85, borderCurve: 'continuous',
    },
    cardFrame: {
      overflow: 'hidden',
      borderRadius: BORDER_RADIUS.hero,
      backgroundColor: chrome.surface,
      borderWidth: 1,
      borderColor: tone.accentBorder,
      shadowColor: chrome.shadowColor,
      shadowOffset: { width: 0, height: 14 },
      shadowOpacity: 0.3,
      shadowRadius: 28,
      elevation: 8, borderCurve: 'continuous',
    },
    cardRail: {
      position: 'absolute',
      top: 18,
      bottom: 18,
      left: 0,
      width: 3,
      borderTopRightRadius: BORDER_RADIUS.full,
      borderBottomRightRadius: BORDER_RADIUS.full, borderCurve: 'continuous',
    },
    card: {
      gap: SPACING.md,
      padding: SPACING.md + 2,
      backgroundColor: chrome.surface,
    },
    errorBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs + 2,
      borderRadius: BORDER_RADIUS.lg,
      paddingHorizontal: SPACING.sm + 2,
      paddingVertical: SPACING.xs + 2,
      backgroundColor: chrome.dangerAccentSoft,
      borderWidth: 1,
      borderColor: chrome.dangerAccentBorder, borderCurve: 'continuous',
    },
    errorBannerText: {
      flex: 1,
      fontSize: 11,
      lineHeight: 16,
      color: chrome.dangerAccent,
    },
    decisionZone: {
      gap: SPACING.sm,
    },
    badgesRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.xs,
    },
    banBadge: {
      minHeight: 28,
      borderRadius: BORDER_RADIUS.full,
      paddingHorizontal: SPACING.sm,
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs - 1,
      backgroundColor: chrome.dangerAccentSoft,
      borderWidth: 1,
      borderColor: chrome.dangerAccentBorder, borderCurve: 'continuous',
    },
    banBadgeLabel: {
      fontSize: 10,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: chrome.dangerAccent,
      textTransform: 'uppercase',
    },
    actionsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: SPACING.xs + 2,
    },
    approvalGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
    },
    actionButton: {
      minHeight: 38,
      paddingHorizontal: SPACING.md,
      borderRadius: BORDER_RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1, borderCurve: 'continuous',
    },
    actionButtonDisabled: {
      opacity: 0.52,
    },
    selectionCheckbox: {
      width: 38,
      height: 38,
      borderRadius: BORDER_RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: tone.accentBorder,
      backgroundColor: chrome.surfaceMuted, borderCurve: 'continuous',
    },
    selectionCheckboxSelected: {
      backgroundColor: tone.accent,
      borderColor: tone.accent,
    },
    moreButton: {
      minHeight: 38,
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs - 1,
      paddingHorizontal: SPACING.sm + 2,
      borderRadius: BORDER_RADIUS.full,
      borderWidth: 1,
      borderColor: chrome.borderSubtle,
      backgroundColor: chrome.surfaceMuted, borderCurve: 'continuous',
    },
    moreButtonLabel: {
      fontSize: 11,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: chrome.textMuted,
    },
    pendingCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs + 2,
      borderRadius: BORDER_RADIUS.lg,
      paddingHorizontal: SPACING.sm + 2,
      paddingVertical: SPACING.xs + 2,
      backgroundColor: chrome.trustAccentSoft,
      borderWidth: 1,
      borderColor: chrome.trustAccentBorder, borderCurve: 'continuous',
    },
    pendingCardLabel: {
      flex: 1,
      fontSize: 11,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: chrome.trustAccent,
    },
    proofSection: {
      gap: SPACING.sm,
      borderRadius: BORDER_RADIUS.xl,
      padding: SPACING.sm + 2,
      backgroundColor: tone.proofSurface,
      borderWidth: 1,
      borderColor: tone.proofBorder, borderCurve: 'continuous',
    },
    bodyText: {
      fontSize: SIZES.text14,
      lineHeight: 21,
      color: chrome.textPrimary,
    },
    previewImage: {
      width: '100%',
      height: 146,
      borderRadius: BORDER_RADIUS.xl,
      backgroundColor: chrome.surfaceStrong,
      borderWidth: 1,
      borderColor: chrome.borderSubtle, borderCurve: 'continuous',
    },
    reasonWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.xs,
    },
    reasonChip: {
      paddingHorizontal: SPACING.sm,
      paddingVertical: 4,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: tone.summarySurface,
      borderWidth: 1,
      borderColor: tone.summaryBorder, borderCurve: 'continuous',
    },
    reasonChipLabel: {
      fontSize: 10,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: tone.accentSoft,
    },
    contextZone: {
      gap: SPACING.sm,
    },
    signalsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.xs,
    },
    detailsToggle: {
      minHeight: 36,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.xs,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: tone.subtleSurface,
      borderWidth: 1,
      borderColor: tone.subtleBorder, borderCurve: 'continuous',
    },
    detailsToggleLabel: {
      fontSize: 11,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: chrome.textSecondary,
    },
    detailsCard: {
      borderRadius: BORDER_RADIUS.lg,
      padding: SPACING.sm + 2,
      gap: SPACING.xs,
      backgroundColor: chrome.surfaceMuted,
      borderWidth: 1,
      borderColor: chrome.borderSubtle, borderCurve: 'continuous',
    },
    detailLine: {
      color: chrome.textSecondary,
    },
    detailLineError: {
      color: chrome.dangerAccent,
    },
  });

export default AdminModerationCard;
