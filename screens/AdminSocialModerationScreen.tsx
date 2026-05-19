import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { AlertCircle, ChevronLeft, ShieldAlert } from 'lucide-react-native';

import { AppScreen } from '@/components/AppScreen';
import { ScreenState } from '@/components/ScreenState';
import AdminModerationCard from '@/components/social/admin/AdminModerationCard';
import AdminModerationToolbar from '@/components/social/admin/AdminModerationToolbar';
import AdminOverflowMenu from '@/components/social/admin/AdminOverflowMenu';
import AdminReactionAdjustmentModal from '@/components/social/admin/AdminReactionAdjustmentModal';
import {
  AdminOverflowActionDefinition,
  AdminOverflowActionKey,
  AdminModerationSortMode,
  buildModerationRequest,
  computeEffectiveReactionCount,
  formatAdminTimestamp,
  getAvailableCategoryOptions,
  getFilterCount,
  getOverflowActionDefinitions,
  getSectionCopy,
  isModerationItemApprovable,
  parseAdminReactionAdjustmentInput,
  resolveDefaultSortMode,
  searchModerationItems,
  sortModerationItems,
} from '@/components/social/admin/adminModerationUtils';
import { buildAdminChromePalette } from '@/components/social/admin/adminModerationTheme';
import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SIZES,
  SPACING,
  withAlpha,
} from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useAdminWhoami } from '@/hooks/queries/useAdminWhoami';
import { useSocialAdminModeration } from '@/hooks/queries/useSocialAdminModeration';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import {
  getSocialAdminServiceErrorDebugInfo,
  resolveSocialAdminFailureKindFromError,
} from '@/services/socialAdmin';
import type {
  SocialAdminModerationFilter,
  SocialAdminModerationItem,
  SocialModerationAction,
  SocialReclassifyPostRequest,
} from '@/types';
import { Squircle } from '@/components/Squircle';

interface PendingActionContext {
  itemId: string;
  actionKey: AdminOverflowActionKey;
}

function shouldDebugAdminSocialScreen() {
  return typeof __DEV__ !== 'undefined' && __DEV__ && process.env.NODE_ENV !== 'test';
}

function resolveAdminSocialQueueLoadMessage(
  error: unknown,
  t: (key: string) => string,
) {
  const failureKind = resolveSocialAdminFailureKindFromError(error);

  switch (failureKind) {
    case 'route_missing':
      return t('social.admin.errors.load_route_missing');
    case 'authentication':
      return t('social.admin.errors.load_authentication');
    case 'admin_access':
    case 'policy_denied':
      return t('social.admin.errors.load_admin_access');
    case 'payload_invalid':
      return t('social.admin.errors.load_invalid_payload');
    case 'schema_mismatch':
    case 'network':
    case 'generic':
    default:
      return t('social.admin.errors.load_backend_unavailable');
  }
}

export default function AdminSocialModerationScreen() {
  const router = useRouter();
  const { userProfile, loading } = useAuth();
  const { colors } = useTheme();
  const { t } = useLanguage();
  const { alertElement, showAlert } = useCustomAlert();
  const [selectedFilter, setSelectedFilter] =
    useState<SocialAdminModerationFilter>('needs_review');
  const chrome = useMemo(
    () => buildAdminChromePalette(colors, selectedFilter),
    [colors, selectedFilter],
  );
  const styles = useMemo(() => createStyles(chrome), [chrome]);
  const [sortMode, setSortMode] = useState<AdminModerationSortMode>(
    resolveDefaultSortMode('needs_review'),
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedItemIds, setExpandedItemIds] = useState<string[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [activeOverflowItemId, setActiveOverflowItemId] = useState<string | null>(null);
  const [pendingActionContext, setPendingActionContext] =
    useState<PendingActionContext | null>(null);
  const [reactionAdjustmentTarget, setReactionAdjustmentTarget] =
    useState<SocialAdminModerationItem | null>(null);
  const [likeAdjustmentInput, setLikeAdjustmentInput] = useState('0');
  const [dislikeAdjustmentInput, setDislikeAdjustmentInput] = useState('0');
  const [reactionAdjustmentNote, setReactionAdjustmentNote] = useState('');
  const autoExpandedErrorIdsRef = useRef<Set<string>>(new Set());
  // S-07 — Le tier admin issu du userProfile (AuthContext) est cache cote
  // client. On revalide cote serveur via admin-whoami : si le user a perdu
  // son tier admin (demotion, ban), on bloque l'ecran avant de rendre les
  // composants admin. La double check (client + server) ferme la fenetre
  // d'observation des endpoints / payloads attendus pour un attaquant qui
  // patcherait userProfile.account_tier en memoire.
  const clientSideIsAdmin = userProfile?.account_tier === 'admin';
  const adminWhoamiQuery = useAdminWhoami({ enabled: clientSideIsAdmin });
  const isAdmin = clientSideIsAdmin && adminWhoamiQuery.data?.is_admin === true;
  const {
    moderationQueueQuery,
    moderateContentMutation,
    bulkApproveContentMutation,
    reclassifyPostMutation,
    moderateUserMutation,
    eradicateUserMutation,
    adjustPostReactionsMutation,
  } = useSocialAdminModeration(selectedFilter, isAdmin);

  useEffect(() => {
    if (loading || !userProfile) {
      return;
    }
    // Redirige si le client cote profil n'est pas admin OU si admin-whoami
    // a confirme un non-admin (403). On attend la fin du fetch whoami avant
    // de rediriger pour eviter un flash UI.
    if (!clientSideIsAdmin) {
      router.replace('/(tabs)' as any);
      return;
    }
    if (adminWhoamiQuery.isError || adminWhoamiQuery.data?.is_admin === false) {
      router.replace('/(tabs)' as any);
    }
  }, [
    clientSideIsAdmin,
    adminWhoamiQuery.isError,
    adminWhoamiQuery.data?.is_admin,
    loading,
    router,
    userProfile,
  ]);

  const moderationItems = moderationQueueQuery.data?.items ?? [];
  const sectionCopy = getSectionCopy(selectedFilter);
  const queueCounts = useMemo(
    () => ({
      needs_review: getFilterCount(moderationQueueQuery.data, 'needs_review'),
      reported: getFilterCount(moderationQueueQuery.data, 'reported'),
      processed: getFilterCount(moderationQueueQuery.data, 'processed'),
    }),
    [moderationQueueQuery.data],
  );
  const summaryCards = [
    {
      key: 'needs_review',
      value: moderationQueueQuery.data?.needs_review_count ?? 0,
      testID: 'admin-social-summary-needs-review',
    },
    {
      key: 'reported',
      value: moderationQueueQuery.data?.reported_count ?? 0,
      testID: 'admin-social-summary-reported',
    },
    {
      key: 'flagged',
      value: moderationQueueQuery.data?.flagged_count ?? 0,
      testID: 'admin-social-summary-flagged',
    },
    {
      key: 'pending',
      value: moderationQueueQuery.data?.pending_count ?? 0,
      testID: 'admin-social-summary-pending',
    },
    {
      key: 'processed',
      value: moderationQueueQuery.data?.processed_count ?? 0,
      testID: 'admin-social-summary-processed',
    },
  ] as const;
  const queueLoadErrorMessage = moderationQueueQuery.error
    ? resolveAdminSocialQueueLoadMessage(moderationQueueQuery.error, t)
    : null;
  const queueLoadErrorDebugInfo = moderationQueueQuery.error
    ? getSocialAdminServiceErrorDebugInfo(moderationQueueQuery.error)
    : null;
  const showQueueLoadDebugInfo =
    shouldDebugAdminSocialScreen() && !!queueLoadErrorDebugInfo;
  const isBulkApprovePending = bulkApproveContentMutation?.isPending ?? false;
  const actionDisabled =
    moderateContentMutation.isPending ||
    isBulkApprovePending ||
    reclassifyPostMutation.isPending ||
    moderateUserMutation.isPending ||
    eradicateUserMutation.isPending ||
    adjustPostReactionsMutation.isPending;
  const parsedLikeAdjustment = parseAdminReactionAdjustmentInput(likeAdjustmentInput);
  const parsedDislikeAdjustment = parseAdminReactionAdjustmentInput(dislikeAdjustmentInput);
  const hasValidReactionAdjustments =
    parsedLikeAdjustment !== null && parsedDislikeAdjustment !== null;
  const reactionPreview = reactionAdjustmentTarget && hasValidReactionAdjustments
    ? {
        nextEffectiveLikeCount: computeEffectiveReactionCount(
          reactionAdjustmentTarget.raw_like_count,
          parsedLikeAdjustment,
        ),
        nextEffectiveDislikeCount: computeEffectiveReactionCount(
          reactionAdjustmentTarget.raw_dislike_count,
          parsedDislikeAdjustment,
        ),
      }
    : null;

  const searchedItems = useMemo(
    () => searchModerationItems(moderationItems, searchQuery),
    [moderationItems, searchQuery],
  );
  const visibleItems = useMemo(
    () => sortModerationItems(searchedItems, sortMode),
    [searchedItems, sortMode],
  );
  const renderedQueueItems = moderationQueueQuery.error ? [] : visibleItems;
  const selectableVisibleItemIds = useMemo(
    () =>
      new Set(
        renderedQueueItems
          .filter((item) => isModerationItemApprovable(item))
          .map((item) => item.content_id),
      ),
    [renderedQueueItems],
  );
  const selectedModerationItems = useMemo(
    () =>
      renderedQueueItems.filter(
        (item) =>
          selectedItemIds.has(item.content_id) &&
          selectableVisibleItemIds.has(item.content_id),
      ),
    [renderedQueueItems, selectableVisibleItemIds, selectedItemIds],
  );
  const selectedOverflowItem = useMemo(
    () =>
      moderationItems.find((item) => item.content_id === activeOverflowItemId) ?? null,
    [activeOverflowItemId, moderationItems],
  );
  const selectedOverflowActions = useMemo(
    () =>
      selectedOverflowItem ? getOverflowActionDefinitions(selectedOverflowItem) : [],
    [selectedOverflowItem],
  );
  const selectedFilterCount = getFilterCount(
    moderationQueueQuery.data,
    selectedFilter,
  );
  const lastSyncLabel = formatAdminTimestamp(
    new Date(moderationQueueQuery.dataUpdatedAt || Date.now()).toISOString(),
    {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    },
  );

  useEffect(() => {
    if (
      activeOverflowItemId &&
      !moderationItems.some((item) => item.content_id === activeOverflowItemId)
    ) {
      setActiveOverflowItemId(null);
    }
  }, [activeOverflowItemId, moderationItems]);

  useEffect(() => {
    if (selectedItemIds.size === 0) {
      return;
    }

    setSelectedItemIds((current) => {
      const nextSelection = new Set(
        [...current].filter((itemId) => selectableVisibleItemIds.has(itemId)),
      );

      return nextSelection.size === current.size ? current : nextSelection;
    });
  }, [selectableVisibleItemIds, selectedItemIds]);

  useEffect(() => {
    const newExpandedIds = moderationItems
      .filter((item) => item.moderation_last_error)
      .map((item) => item.content_id)
      .filter((itemId) => !autoExpandedErrorIdsRef.current.has(itemId));

    if (newExpandedIds.length === 0) {
      return;
    }

    newExpandedIds.forEach((itemId) => autoExpandedErrorIdsRef.current.add(itemId));
    setExpandedItemIds((current) => [...new Set([...current, ...newExpandedIds])]);
  }, [moderationItems]);

  const setPendingFor = async <T,>(
    itemId: string,
    actionKey: AdminOverflowActionKey,
    action: () => Promise<T>,
  ) => {
    setPendingActionContext({ itemId, actionKey });

    try {
      return await action();
    } finally {
      setPendingActionContext((current) => {
        if (!current) {
          return current;
        }

        if (current.itemId !== itemId || current.actionKey !== actionKey) {
          return current;
        }

        return null;
      });
    }
  };

  const closeReactionAdjustmentModal = () => {
    setReactionAdjustmentTarget(null);
    setLikeAdjustmentInput('0');
    setDislikeAdjustmentInput('0');
    setReactionAdjustmentNote('');
  };

  const toggleExpandedItem = (itemId: string) => {
    setExpandedItemIds((current) =>
      current.includes(itemId)
        ? current.filter((value) => value !== itemId)
        : [...current, itemId],
    );
  };

  const clearSelectedItems = () => {
    setSelectedItemIds(new Set());
  };

  const toggleSelectedItem = (itemId: string) => {
    setSelectedItemIds((current) => {
      const nextSelection = new Set(current);

      if (nextSelection.has(itemId)) {
        nextSelection.delete(itemId);
      } else {
        nextSelection.add(itemId);
      }

      return nextSelection;
    });
  };

  const handleModerationAction = async (
    item: SocialAdminModerationItem,
    action: SocialModerationAction,
  ) => {
    try {
      await setPendingFor(item.content_id, action, () =>
        moderateContentMutation.mutateAsync(buildModerationRequest(item, action)),
      );
      setActiveOverflowItemId(null);
      setSelectedItemIds((current) => {
        if (!current.has(item.content_id)) {
          return current;
        }

        const nextSelection = new Set(current);
        nextSelection.delete(item.content_id);
        return nextSelection;
      });
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : t('social.admin.errors.action_failed');

      showAlert(t('social.admin.errors.action_title'), message, [
        { text: t('common.ok') },
      ]);
    }
  };

  const submitBulkApproval = async () => {
    if (!bulkApproveContentMutation || selectedModerationItems.length === 0) {
      return;
    }

    try {
      const summary = await bulkApproveContentMutation.mutateAsync(
        selectedModerationItems,
      );

      if (summary.approvedCount === summary.requestedCount) {
        clearSelectedItems();
        return;
      }

      setSelectedItemIds(new Set(summary.failedIds));

      if (summary.approvedCount > 0) {
        showAlert(
          t('social.admin.bulk.partial_title'),
          t('social.admin.bulk.partial_body', {
            approved: summary.approvedCount,
            total: summary.requestedCount,
          }),
          [{ text: t('common.ok') }],
        );
        return;
      }

      showAlert(
        t('social.admin.bulk.failure_title'),
        t('social.admin.bulk.failure_body', {
          total: summary.requestedCount,
        }),
        [{ text: t('common.ok') }],
      );
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : t('social.admin.bulk.failure_body', {
          total: selectedModerationItems.length,
        });

      showAlert(t('social.admin.bulk.failure_title'), message, [
        { text: t('common.ok') },
      ]);
    }
  };

  const handleBulkApprovePress = () => {
    if (selectedModerationItems.length === 0) {
      return;
    }

    showAlert(
      t('social.admin.bulk.confirm_title'),
      t('social.admin.bulk.confirm_body', {
        count: selectedModerationItems.length,
      }),
      [
        {
          text: t('common.cancel'),
          style: 'cancel',
        },
        {
          text: t('social.admin.bulk.confirm_action'),
          onPress: () => {
            void submitBulkApproval();
          },
        },
      ],
      undefined,
      {
        variant: 'info',
        buttonTones: {
          cancel: 'ghost',
        },
      },
    );
  };

  const handleReclassifyPost = async (
    itemId: string,
    request: SocialReclassifyPostRequest,
  ) => {
    try {
      await setPendingFor(itemId, 'change_category', () =>
        reclassifyPostMutation.mutateAsync(request),
      );
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : t('social.admin.errors.category_change_failed');

      showAlert(t('social.admin.errors.category_change_title'), message, [
        { text: t('common.ok') },
      ]);
    }
  };

  const handleCategoryChangePress = (item: SocialAdminModerationItem) => {
    setActiveOverflowItemId(null);

    if (item.content_type !== 'post' || !item.category) {
      return;
    }

    const categories = getAvailableCategoryOptions(item);

    if (categories.length === 0) {
      return;
    }

    showAlert(
      t('social.admin.category_change.title'),
      t('social.admin.category_change.message', {
        category: t(`social.categories.${item.category}`),
      }),
      [
        ...categories.map((category) => ({
          text: t(`social.categories.${category}`),
          onPress: () => {
            void handleReclassifyPost(item.content_id, {
              post_id: item.content_id,
              category: category as SocialReclassifyPostRequest['category'],
            });
          },
        })),
        {
          text: t('common.cancel'),
          style: 'cancel' as const,
        },
      ],
      undefined,
      {
        variant: 'info',
        buttonTones: {
          cancel: 'ghost',
        },
      },
    );
  };

  const handleAdjustReactionsPress = (item: SocialAdminModerationItem) => {
    setActiveOverflowItemId(null);

    if (item.content_type !== 'post') {
      return;
    }

    setReactionAdjustmentTarget(item);
    setLikeAdjustmentInput(String(item.admin_like_adjustment));
    setDislikeAdjustmentInput(String(item.admin_dislike_adjustment));
    setReactionAdjustmentNote('');
  };

  const handleSubmitReactionAdjustment = async () => {
    if (!reactionAdjustmentTarget) {
      return;
    }

    const parsedLikes = parseAdminReactionAdjustmentInput(likeAdjustmentInput);
    const parsedDislikes = parseAdminReactionAdjustmentInput(dislikeAdjustmentInput);

    if (parsedLikes === null || parsedDislikes === null) {
      showAlert(
        t('social.admin.reaction_adjustment.errors.invalid_title'),
        t('social.admin.reaction_adjustment.errors.invalid_body'),
        [{ text: t('common.ok') }],
      );
      return;
    }

    try {
      await setPendingFor(
        reactionAdjustmentTarget.content_id,
        'adjust_reactions',
        () =>
          adjustPostReactionsMutation.mutateAsync({
            post_id: reactionAdjustmentTarget.content_id,
            admin_like_adjustment: parsedLikes,
            admin_dislike_adjustment: parsedDislikes,
            note: reactionAdjustmentNote.trim() || undefined,
          }),
      );
      closeReactionAdjustmentModal();
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : t('social.admin.reaction_adjustment.errors.submit_failed');

      showAlert(t('social.admin.reaction_adjustment.errors.submit_title'), message, [
        { text: t('common.ok') },
      ]);
    }
  };

  const handleModerateAuthorPress = (item: SocialAdminModerationItem) => {
    setActiveOverflowItemId(null);

    if (!item.author_id) {
      showAlert(t('social.admin.errors.load_title'), t('social.admin.errors.author_missing'), [
        { text: t('common.ok') },
      ]);
      return;
    }

    const targetUserId = item.author_id;
    const runUserAction = async (
      action: 'ban_user' | 'revoke_ban' | 'remove_avatar' | 'eradicate_user_content',
      scope?: 'posts' | 'comments',
    ) => {
      try {
        await setPendingFor(item.content_id, 'moderate_author', async () => {
          if (action === 'eradicate_user_content') {
            await eradicateUserMutation.mutateAsync({
              target_user_id: targetUserId,
            });
            return;
          }

          await moderateUserMutation.mutateAsync({
            target_user_id: targetUserId,
            action,
            scope,
          });
        });
      } catch (error) {
        const message = error instanceof Error
          ? error.message
          : t('social.admin.errors.user_action_failed');

        showAlert(t('social.admin.errors.user_action_title'), message, [
          { text: t('common.ok') },
        ]);
      }
    };

    showAlert(
      t('social.admin.user_moderation.title'),
      t('social.admin.user_moderation.body'),
      [
        {
          text: t('social.admin.user_moderation.ban_posts'),
          onPress: () => {
            void runUserAction('ban_user', 'posts');
          },
          style: 'destructive',
        },
        {
          text: t('social.admin.user_moderation.ban_comments'),
          onPress: () => {
            void runUserAction('ban_user', 'comments');
          },
          style: 'destructive',
        },
        {
          text: t('social.admin.user_moderation.remove_avatar'),
          onPress: () => {
            void runUserAction('remove_avatar');
          },
          style: 'destructive',
        },
        {
          text: t('social.admin.user_moderation.eradicate_content'),
          onPress: () => {
            void runUserAction('eradicate_user_content');
          },
          style: 'destructive',
        },
        {
          text: t('social.admin.user_moderation.revoke_all'),
          onPress: () => {
            void runUserAction('revoke_ban');
          },
          style: 'default',
        },
        {
          text: t('common.cancel'),
          style: 'cancel',
        },
      ],
    );
  };

  const handleOverflowAction = (action: AdminOverflowActionDefinition) => {
    const item = selectedOverflowItem;
    if (!item) {
      return;
    }

    if (action.action) {
      void handleModerationAction(item, action.action);
      return;
    }

    if (action.key === 'change_category') {
      handleCategoryChangePress(item);
      return;
    }

    if (action.key === 'adjust_reactions') {
      handleAdjustReactionsPress(item);
      return;
    }

    if (action.key === 'moderate_author') {
      handleModerateAuthorPress(item);
    }
  };

  const renderQueueHeader = () => (
    <View style={styles.summaryStack}>
      <Squircle style={styles.summaryStrip} testID="admin-social-summary-strip">
        <Squircle style={styles.summaryGlowPrimary} />
        <Squircle style={styles.summaryGlowSecondary} />
        <View style={styles.summaryTopRow}>
          <View style={styles.summaryEyebrowRow}>
            <ShieldAlert color={chrome.filterAccent} size={14} />
            <Text style={styles.summaryEyebrowLabel}>
              {t('social.admin.hero.active_queue')}
            </Text>
          </View>
          <View style={styles.summaryCountPill}>
            <Text style={styles.summaryCountValue}>{selectedFilterCount}</Text>
          </View>
        </View>

        <View style={styles.summaryHeroRow}>
          <View style={styles.summaryHeroCopy}>
            <Text style={styles.summaryTitle}>{t(sectionCopy.titleKey)}</Text>
            <Text numberOfLines={2} style={styles.summaryBody}>
              {t(sectionCopy.bodyKey)}
            </Text>
            <Text style={styles.summaryFootnote}>
              {t('social.admin.hero.last_sync', {
                date: lastSyncLabel ?? '--',
              })}
            </Text>
          </View>

          <Squircle style={styles.summarySpotlight}>
            <Text style={styles.summarySpotlightValue}>{selectedFilterCount}</Text>
            <Text style={styles.summarySpotlightLabel}>
              {t(`social.admin.filters.${selectedFilter}`)}
            </Text>
          </Squircle>
        </View>
      </Squircle>

      <View style={styles.summaryGrid} testID="admin-social-summary-grid">
        {summaryCards.map((card) => {
          const accent =
            card.key === 'processed'
              ? chrome.successAccent
              : card.key === 'flagged'
                ? chrome.dangerAccent
                : card.key === 'reported'
                  ? chrome.filterAccentSecondary
                  : chrome.trustAccent;

          return (
            <Squircle
              key={card.key}
              style={[
                styles.summaryMiniCard,
                {
                  backgroundColor: withAlpha(accent, 0.08),
                  borderColor: withAlpha(accent, 0.16),
                },
              ]}
              testID={card.testID}
            >
            <Text style={styles.summaryMiniValue}>{card.value}</Text>
            <Text style={styles.summaryMiniLabel}>
              {t(`social.admin.summary.${card.key}`)}
            </Text>
            </Squircle>
          );
        })}
      </View>

      <AdminModerationToolbar
        selectedFilter={selectedFilter}
        sortMode={sortMode}
        searchQuery={searchQuery}
        counts={queueCounts}
        onFilterChange={(filter) => {
          setSelectedFilter(filter);
          setSortMode(resolveDefaultSortMode(filter));
          setActiveOverflowItemId(null);
        }}
        onSearchChange={setSearchQuery}
        onSortChange={setSortMode}
      />

      {selectedModerationItems.length > 0 ? (
        <Squircle style={styles.bulkActionBar} testID="admin-social-bulk-bar">
          <View style={styles.bulkHeaderRow}>
            <View style={styles.bulkSelectionPill}>
              <Text style={styles.bulkSelectionLabel}>
                {t('social.admin.bulk.selected_count', {
                  count: selectedModerationItems.length,
                })}
              </Text>
            </View>

            <Text style={styles.bulkStatusLabel}>
              {t(`social.admin.sort.${sortMode}`)}
            </Text>
          </View>

          <View style={styles.bulkActionButtons}>
            <TouchableOpacity
              accessibilityRole="button"
              disabled={actionDisabled}
              onPress={clearSelectedItems}
              style={[
                styles.bulkSecondaryButton,
                actionDisabled ? styles.bulkButtonDisabled : null,
              ]}
              testID="admin-social-bulk-clear"
            >
              <Text style={styles.bulkSecondaryButtonLabel}>
                {t('social.admin.bulk.clear_selection')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              accessibilityRole="button"
              disabled={actionDisabled}
              onPress={handleBulkApprovePress}
              style={[
                styles.bulkPrimaryButton,
                actionDisabled ? styles.bulkButtonDisabled : null,
              ]}
              testID="admin-social-bulk-approve"
            >
              <Text style={styles.bulkPrimaryButtonLabel}>
                {t(
                  isBulkApprovePending
                    ? 'social.admin.bulk.approving_selection'
                    : 'social.admin.bulk.approve_selection',
                )}
              </Text>
            </TouchableOpacity>
          </View>
        </Squircle>
      ) : null}
    </View>
  );

  const renderQueueFooter = () => {
    if (moderationQueueQuery.isLoading && !moderationQueueQuery.data) {
      return (
        <View style={styles.stateShell}>
          <Squircle style={styles.loadingCard} testID="admin-social-loading-placeholder">
            <View style={styles.loadingHeader}>
              <ActivityIndicator color={chrome.trustAccent} size="small" />
              <Text style={styles.loadingTitle}>{t('social.admin.title')}</Text>
            </View>

            {[0, 1].map((index) => (
              <Squircle key={index} style={styles.loadingPreviewCard}>
                <View style={[styles.loadingBar, styles.loadingBarShort]} />
                <View style={[styles.loadingBar, styles.loadingBarMedium]} />
                <View style={[styles.loadingBar, styles.loadingBarLong]} />
              </Squircle>
            ))}
          </Squircle>
        </View>
      );
    }

    if (moderationQueueQuery.error) {
      return (
        <View style={styles.stateShell}>
          <Squircle style={styles.inlineErrorCard} testID="admin-social-error-state">
            <View style={styles.inlineMessageRow}>
              <AlertCircle color={chrome.dangerAccent} size={16} />
              <View style={styles.inlineMessageCopy}>
                <Text style={styles.inlineMessageTitle}>
                  {t('social.admin.errors.load_title')}
                </Text>
                <Text style={styles.inlineMessageBody}>{queueLoadErrorMessage}</Text>
              </View>
            </View>

            {showQueueLoadDebugInfo ? (
              <Squircle style={styles.debugBlock} testID="admin-social-error-debug">
                <Text style={styles.debugLine}>
                  {`code: ${queueLoadErrorDebugInfo?.code ?? '-'}`}
                </Text>
                <Text style={styles.debugLine}>
                  {`function: ${queueLoadErrorDebugInfo?.functionName ?? '-'}`}
                </Text>
                <Text style={styles.debugLine}>
                  {`request_id: ${queueLoadErrorDebugInfo?.requestId ?? '-'}`}
                </Text>
                <Text style={styles.debugLine}>
                  {`project: ${queueLoadErrorDebugInfo?.projectLabel ?? '-'}`}
                </Text>
                <Text style={styles.debugLine}>
                  {`message: ${queueLoadErrorDebugInfo?.message ?? '-'}`}
                </Text>
              </Squircle>
            ) : null}

            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => {
                void moderationQueueQuery.refetch();
              }}
              style={styles.retryButton}
              testID="admin-social-retry"
            >
              <Text style={styles.retryButtonLabel}>{t('common.retry')}</Text>
            </TouchableOpacity>
          </Squircle>
        </View>
      );
    }

    if (renderedQueueItems.length === 0) {
      const isSearchActive = searchQuery.trim().length > 0;

      return (
        <View style={styles.stateShell}>
          <Squircle style={styles.emptyCard} testID="admin-social-empty-state">
            <Text style={styles.emptyCardTitle}>
              {t(
                isSearchActive
                  ? 'social.admin.empty.search_title'
                  : sectionCopy.emptyTitleKey,
              )}
            </Text>
            <Text style={styles.emptyCardBody}>
              {t(
                isSearchActive
                  ? 'social.admin.empty.search_body'
                  : sectionCopy.emptyBodyKey,
              )}
            </Text>
          </Squircle>
        </View>
      );
    }

    return <View style={styles.listFooterSpacer} />;
  };

  if (loading || !userProfile) {
    return (
      <ScreenState tone="loading" layout="full" testID="admin-social-loading" />
    );
  }

  if (!isAdmin) {
    return (
      <ScreenState tone="loading" layout="full" testID="admin-social-redirecting" />
    );
  }

  return (
    <AppScreen topInset={false} bottomInset={false} style={styles.container} testID="admin-social-screen">
      {alertElement}
      <AdminReactionAdjustmentModal
        item={reactionAdjustmentTarget}
        likeAdjustmentInput={likeAdjustmentInput}
        dislikeAdjustmentInput={dislikeAdjustmentInput}
        noteInput={reactionAdjustmentNote}
        isInputValid={hasValidReactionAdjustments}
        onChangeLikeAdjustment={setLikeAdjustmentInput}
        onChangeDislikeAdjustment={setDislikeAdjustmentInput}
        onChangeNote={setReactionAdjustmentNote}
        onClose={closeReactionAdjustmentModal}
        onSubmit={handleSubmitReactionAdjustment}
        submitDisabled={actionDisabled || !reactionPreview || !hasValidReactionAdjustments}
        preview={reactionPreview}
      />
      <AdminOverflowMenu
        item={selectedOverflowItem}
        actions={selectedOverflowActions}
        onClose={() => setActiveOverflowItemId(null)}
        onActionPress={handleOverflowAction}
      />

      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.backButton}
          testID="admin-social-back"
        >
          <ChevronLeft color={chrome.headerButtonIcon} size={18} />
        </TouchableOpacity>

        <View style={styles.headerText}>
          <Text style={styles.title}>{t('social.admin.title')}</Text>
          <Text numberOfLines={1} style={styles.subtitle}>
            {t('social.admin.subtitle')}
          </Text>
        </View>

        <View style={styles.headerStatePill}>
          <Text style={styles.headerStateLabel}>
            {t(`social.admin.filters.${selectedFilter}`)}
          </Text>
        </View>
      </View>

      <FlashList
        data={renderedQueueItems}
        renderItem={({ item }) => (
          <AdminModerationCard
            item={item}
            isExpanded={expandedItemIds.includes(item.content_id)}
            actionDisabled={actionDisabled}
            isSelected={selectedItemIds.has(item.content_id)}
            pendingActionKey={
              pendingActionContext?.itemId === item.content_id
                ? pendingActionContext.actionKey
                : null
            }
            selectionDisabled={actionDisabled}
            onToggleDetails={toggleExpandedItem}
            onToggleSelection={toggleSelectedItem}
            onModerationActionPress={handleModerationAction}
            onOverflowPress={(targetItem) =>
              setActiveOverflowItemId(targetItem.content_id)
            }
          />
        )}
        keyExtractor={(item) => `${selectedFilter}-${item.content_id}`}
        ListHeaderComponent={renderQueueHeader()}
        ListFooterComponent={renderQueueFooter()}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshing={moderationQueueQuery.isRefetching}
        onRefresh={() => {
          void moderationQueueQuery.refetch();
        }}
        testID={`admin-social-section-${selectedFilter}`}
      />
    </AppScreen>
  );
}

const createStyles = (chrome: ReturnType<typeof buildAdminChromePalette>) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: chrome.screenBackground,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm + 2,
      paddingHorizontal: SPACING.page,
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.sm + 2,
      backgroundColor: chrome.headerSurface,
      borderBottomWidth: 1,
      borderBottomColor: chrome.headerBorder,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: chrome.headerButtonBackground,
      borderWidth: 1,
      borderColor: chrome.headerButtonBorder, borderCurve: 'continuous',
    },
    headerText: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    title: {
      fontSize: 18,
      fontWeight: FONT_WEIGHTS.bold,
      color: chrome.textPrimary,
    },
    subtitle: {
      fontSize: 12,
      lineHeight: 16,
      color: chrome.textMuted,
    },
    headerStatePill: {
      minHeight: 34,
      maxWidth: 120,
      paddingHorizontal: SPACING.sm + 2,
      borderRadius: BORDER_RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: chrome.filterAccentSoft,
      borderWidth: 1,
      borderColor: chrome.filterAccentBorder, borderCurve: 'continuous',
    },
    headerStateLabel: {
      fontSize: 11,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: chrome.textPrimary,
    },
    summaryStack: {
      gap: SPACING.sm,
      paddingHorizontal: SPACING.page,
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.md,
    },
    summaryStrip: {
      overflow: 'hidden',
      borderRadius: BORDER_RADIUS.hero,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.md + 2,
      gap: SPACING.sm,
      backgroundColor: chrome.surfaceGlass,
      borderWidth: 1,
      borderColor: chrome.filterAccentBorder,
      shadowColor: chrome.shadowColor,
      shadowOffset: { width: 0, height: 18 },
      shadowOpacity: 0.34,
      shadowRadius: 28,
      elevation: 10, borderCurve: 'continuous',
    },
    summaryGlowPrimary: {
      position: 'absolute',
      top: -48,
      right: -24,
      width: 164,
      height: 164,
      borderRadius: 82,
      backgroundColor: chrome.filterAccentHalo, borderCurve: 'continuous',
    },
    summaryGlowSecondary: {
      position: 'absolute',
      bottom: -52,
      left: -28,
      width: 150,
      height: 150,
      borderRadius: 75,
      backgroundColor: chrome.trustAccentSoft, borderCurve: 'continuous',
    },
    summaryTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACING.sm,
    },
    summaryEyebrowRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
    },
    summaryEyebrowLabel: {
      fontSize: 11,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: chrome.filterAccent,
    },
    summaryCountPill: {
      minWidth: 44,
      minHeight: 30,
      paddingHorizontal: SPACING.sm,
      borderRadius: BORDER_RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: chrome.filterAccentSoft,
      borderWidth: 1,
      borderColor: chrome.filterAccentBorder, borderCurve: 'continuous',
    },
    summaryCountValue: {
      fontSize: 15,
      fontWeight: FONT_WEIGHTS.bold,
      color: chrome.textPrimary,
    },
    summaryHeroRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: SPACING.md,
    },
    summaryHeroCopy: {
      flex: 1,
      gap: SPACING.xs + 2,
    },
    summaryTitle: {
      fontSize: SIZES.text18,
      fontWeight: FONT_WEIGHTS.bold,
      color: chrome.textPrimary,
    },
    summaryBody: {
      fontSize: 13,
      lineHeight: 19,
      color: chrome.textSecondary,
    },
    summaryFootnote: {
      fontSize: 11,
      color: chrome.textMuted,
    },
    summarySpotlight: {
      minWidth: 96,
      borderRadius: BORDER_RADIUS.xl,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.md,
      alignItems: 'flex-start',
      justifyContent: 'center',
      backgroundColor: withAlpha(chrome.screenBackground, 0.34),
      borderWidth: 1,
      borderColor: chrome.filterAccentBorder, borderCurve: 'continuous',
    },
    summarySpotlightValue: {
      fontSize: 30,
      lineHeight: 34,
      fontWeight: FONT_WEIGHTS.bold,
      color: chrome.textPrimary,
    },
    summarySpotlightLabel: {
      marginTop: 4,
      fontSize: 11,
      lineHeight: 14,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: chrome.textSecondary,
      textTransform: 'uppercase',
    },
    summaryGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.xs + 2,
    },
    summaryMiniCard: {
      flexBasis: '31%',
      flexGrow: 1,
      minWidth: 92,
      borderRadius: BORDER_RADIUS.lg,
      paddingHorizontal: SPACING.sm + 2,
      paddingVertical: SPACING.sm,
      gap: 2,
      borderWidth: 1, borderCurve: 'continuous',
    },
    summaryMiniValue: {
      fontSize: 16,
      fontWeight: FONT_WEIGHTS.bold,
      color: chrome.textPrimary,
    },
    summaryMiniLabel: {
      fontSize: 10,
      lineHeight: 14,
      color: chrome.textMuted,
    },
    bulkActionBar: {
      gap: SPACING.sm,
      borderRadius: BORDER_RADIUS.hero,
      padding: SPACING.md + 2,
      backgroundColor: chrome.surfaceGlass,
      borderWidth: 1,
      borderColor: chrome.filterAccentBorder,
      shadowColor: chrome.shadowColor,
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.24,
      shadowRadius: 22,
      elevation: 8, borderCurve: 'continuous',
    },
    bulkHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACING.sm,
    },
    bulkSelectionPill: {
      alignSelf: 'flex-start',
      minHeight: 28,
      paddingHorizontal: SPACING.sm + 2,
      borderRadius: BORDER_RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: chrome.filterAccentSoft,
      borderWidth: 1,
      borderColor: chrome.filterAccentBorder, borderCurve: 'continuous',
    },
    bulkSelectionLabel: {
      fontSize: 12,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: chrome.textPrimary,
    },
    bulkStatusLabel: {
      fontSize: 11,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: chrome.textMuted,
      textTransform: 'uppercase',
    },
    bulkActionButtons: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.xs + 2,
    },
    bulkPrimaryButton: {
      minHeight: 38,
      paddingHorizontal: SPACING.md,
      borderRadius: BORDER_RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: chrome.trustAccent,
      borderWidth: 1,
      borderColor: chrome.trustAccentBorder, borderCurve: 'continuous',
    },
    bulkPrimaryButtonLabel: {
      fontSize: 12,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: chrome.textOnAccent,
    },
    bulkSecondaryButton: {
      minHeight: 38,
      paddingHorizontal: SPACING.md,
      borderRadius: BORDER_RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: chrome.surfaceMuted,
      borderWidth: 1,
      borderColor: chrome.borderSubtle, borderCurve: 'continuous',
    },
    bulkSecondaryButtonLabel: {
      fontSize: 12,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: chrome.textSecondary,
    },
    bulkButtonDisabled: {
      opacity: 0.5,
    },
    listContent: {
      paddingBottom: SPACING.xxxl,
      flexGrow: 1,
    },
    stateShell: {
      paddingHorizontal: SPACING.page,
      paddingTop: SPACING.md,
    },
    loadingCard: {
      borderRadius: BORDER_RADIUS.hero,
      padding: SPACING.md + 2,
      gap: SPACING.sm,
      backgroundColor: chrome.surfaceGlass,
      borderWidth: 1,
      borderColor: chrome.borderSubtle, borderCurve: 'continuous',
    },
    loadingHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    loadingTitle: {
      fontSize: 13,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: chrome.textPrimary,
    },
    loadingPreviewCard: {
      borderRadius: BORDER_RADIUS.lg,
      padding: SPACING.sm + 2,
      gap: SPACING.xs + 2,
      backgroundColor: chrome.surfaceMuted,
      borderWidth: 1,
      borderColor: chrome.borderSubtle, borderCurve: 'continuous',
    },
    loadingBar: {
      height: 8,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: withAlpha(chrome.textPrimary, 0.08), borderCurve: 'continuous',
    },
    loadingBarShort: {
      width: '34%',
    },
    loadingBarMedium: {
      width: '62%',
    },
    loadingBarLong: {
      width: '84%',
    },
    inlineErrorCard: {
      borderRadius: BORDER_RADIUS.hero,
      padding: SPACING.md + 2,
      gap: SPACING.sm,
      backgroundColor: chrome.surfaceGlass,
      borderWidth: 1,
      borderColor: chrome.dangerAccentBorder, borderCurve: 'continuous',
    },
    inlineMessageRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: SPACING.sm,
    },
    inlineMessageCopy: {
      flex: 1,
      gap: 2,
    },
    inlineMessageTitle: {
      fontSize: 15,
      fontWeight: FONT_WEIGHTS.bold,
      color: chrome.textPrimary,
    },
    inlineMessageBody: {
      fontSize: 13,
      lineHeight: 18,
      color: chrome.textSecondary,
    },
    debugBlock: {
      borderRadius: BORDER_RADIUS.lg,
      padding: SPACING.sm,
      gap: 2,
      backgroundColor: chrome.surfaceMuted,
      borderWidth: 1,
      borderColor: chrome.borderSubtle, borderCurve: 'continuous',
    },
    debugLine: {
      fontSize: SIZES.text12,
      lineHeight: 18,
      color: chrome.textMuted,
    },
    retryButton: {
      alignSelf: 'flex-start',
      minHeight: 34,
      paddingHorizontal: SPACING.md,
      borderRadius: BORDER_RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: chrome.trustAccentSoft,
      borderWidth: 1,
      borderColor: chrome.trustAccentBorder, borderCurve: 'continuous',
    },
    retryButtonLabel: {
      fontSize: 12,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: chrome.trustAccent,
    },
    emptyCard: {
      borderRadius: BORDER_RADIUS.hero,
      padding: SPACING.md + 2,
      gap: SPACING.xs + 2,
      backgroundColor: chrome.surfaceGlass,
      borderWidth: 1,
      borderColor: chrome.borderSubtle, borderCurve: 'continuous',
    },
    emptyCardTitle: {
      fontSize: 15,
      fontWeight: FONT_WEIGHTS.bold,
      color: chrome.textPrimary,
    },
    emptyCardBody: {
      fontSize: 13,
      lineHeight: 18,
      color: chrome.textSecondary,
    },
    listFooterSpacer: {
      height: SPACING.lg,
    },
  });
