import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { AlertCircle, ChevronLeft, ShieldAlert } from 'lucide-react-native';

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
  parseSignedIntegerInput,
  resolveDefaultSortMode,
  searchModerationItems,
  sortModerationItems,
} from '@/components/social/admin/adminModerationUtils';
import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SHADOWS,
  SIZES,
  SPACING,
  withAlpha,
} from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useSocialAdminModeration } from '@/hooks/queries';
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
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [selectedFilter, setSelectedFilter] =
    useState<SocialAdminModerationFilter>('needs_review');
  const [sortMode, setSortMode] = useState<AdminModerationSortMode>(
    resolveDefaultSortMode('needs_review'),
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedItemIds, setExpandedItemIds] = useState<string[]>([]);
  const [activeOverflowItemId, setActiveOverflowItemId] = useState<string | null>(null);
  const [pendingActionContext, setPendingActionContext] =
    useState<PendingActionContext | null>(null);
  const [reactionAdjustmentTarget, setReactionAdjustmentTarget] =
    useState<SocialAdminModerationItem | null>(null);
  const [likeAdjustmentInput, setLikeAdjustmentInput] = useState('0');
  const [dislikeAdjustmentInput, setDislikeAdjustmentInput] = useState('0');
  const [reactionAdjustmentNote, setReactionAdjustmentNote] = useState('');
  const autoExpandedErrorIdsRef = useRef<Set<string>>(new Set());
  const isAdmin = userProfile?.account_tier === 'admin';
  const {
    moderationQueueQuery,
    moderateContentMutation,
    reclassifyPostMutation,
    moderateUserMutation,
    eradicateUserMutation,
    adjustPostReactionsMutation,
  } = useSocialAdminModeration(selectedFilter, isAdmin);

  useEffect(() => {
    if (!loading && userProfile && !isAdmin) {
      router.replace('/(tabs)' as any);
    }
  }, [isAdmin, loading, router, userProfile]);

  // S-02 — Defense en profondeur : ne pas rendre l'arbre admin tant que le
  // tier n'est pas confirme. Le redirect du useEffect ci-dessus est async
  // (un cycle de render se produit avant la navigation), un non-admin pouvait
  // donc voir brievement la liste des actions sensibles. Le RLS Supabase et
  // requireAdminUserProfile cote Edge Functions restent autoritaires.
  if (loading || !userProfile || !isAdmin) {
    return (
      <SafeAreaView
        style={styles.container}
        edges={['top']}
        testID="admin-social-guard-blocking"
      >
        <View style={styles.guardBlockingContainer}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

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
  const actionDisabled =
    moderateContentMutation.isPending ||
    reclassifyPostMutation.isPending ||
    moderateUserMutation.isPending ||
    eradicateUserMutation.isPending ||
    adjustPostReactionsMutation.isPending;
  const parsedLikeAdjustment = parseSignedIntegerInput(likeAdjustmentInput);
  const parsedDislikeAdjustment = parseSignedIntegerInput(dislikeAdjustmentInput);
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

  const handleModerationAction = async (
    item: SocialAdminModerationItem,
    action: SocialModerationAction,
  ) => {
    try {
      await setPendingFor(item.content_id, action, () =>
        moderateContentMutation.mutateAsync(buildModerationRequest(item, action)),
      );
      setActiveOverflowItemId(null);
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : t('social.admin.errors.action_failed');

      showAlert(t('social.admin.errors.action_title'), message, [
        { text: t('common.ok') },
      ]);
    }
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

    const parsedLikes = parseSignedIntegerInput(likeAdjustmentInput);
    const parsedDislikes = parseSignedIntegerInput(dislikeAdjustmentInput);

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
      <View style={styles.summaryStrip} testID="admin-social-summary-strip">
        <View style={styles.summaryTopRow}>
          <View style={styles.summaryEyebrowRow}>
            <ShieldAlert color={colors.primary} size={14} />
            <Text style={styles.summaryEyebrowLabel}>
              {t('social.admin.hero.active_queue')}
            </Text>
          </View>
          <View style={styles.summaryCountPill}>
            <Text style={styles.summaryCountValue}>{selectedFilterCount}</Text>
          </View>
        </View>

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

      <View style={styles.summaryGrid} testID="admin-social-summary-grid">
        {summaryCards.map((card) => (
          <View key={card.key} style={styles.summaryMiniCard} testID={card.testID}>
            <Text style={styles.summaryMiniValue}>{card.value}</Text>
            <Text style={styles.summaryMiniLabel}>
              {t(`social.admin.summary.${card.key}`)}
            </Text>
          </View>
        ))}
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
    </View>
  );

  const renderQueueFooter = () => {
    if (moderationQueueQuery.isLoading && !moderationQueueQuery.data) {
      return (
        <View style={styles.stateShell}>
          <View style={styles.loadingCard} testID="admin-social-loading-placeholder">
            <View style={styles.loadingHeader}>
              <ActivityIndicator color={colors.primary} size="small" />
              <Text style={styles.loadingTitle}>{t('social.admin.title')}</Text>
            </View>

            {[0, 1].map((index) => (
              <View key={index} style={styles.loadingPreviewCard}>
                <View style={[styles.loadingBar, styles.loadingBarShort]} />
                <View style={[styles.loadingBar, styles.loadingBarMedium]} />
                <View style={[styles.loadingBar, styles.loadingBarLong]} />
              </View>
            ))}
          </View>
        </View>
      );
    }

    if (moderationQueueQuery.error) {
      return (
        <View style={styles.stateShell}>
          <View style={styles.inlineErrorCard} testID="admin-social-error-state">
            <View style={styles.inlineMessageRow}>
              <AlertCircle color={colors.error} size={16} />
              <View style={styles.inlineMessageCopy}>
                <Text style={styles.inlineMessageTitle}>
                  {t('social.admin.errors.load_title')}
                </Text>
                <Text style={styles.inlineMessageBody}>{queueLoadErrorMessage}</Text>
              </View>
            </View>

            {showQueueLoadDebugInfo ? (
              <View style={styles.debugBlock} testID="admin-social-error-debug">
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
              </View>
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
          </View>
        </View>
      );
    }

    if (renderedQueueItems.length === 0) {
      const isSearchActive = searchQuery.trim().length > 0;

      return (
        <View style={styles.stateShell}>
          <View style={styles.emptyCard} testID="admin-social-empty-state">
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
          </View>
        </View>
      );
    }

    return <View style={styles.listFooterSpacer} />;
  };

  if (loading || !userProfile) {
    return (
      <SafeAreaView style={styles.centeredState} testID="admin-social-loading">
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.centeredState} testID="admin-social-redirecting">
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} testID="admin-social-screen">
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
          <ChevronLeft color={colors.primaryText} size={18} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title}>{t('social.admin.title')}</Text>
          <Text numberOfLines={1} style={styles.subtitle}>
            {t('social.admin.subtitle')}
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
            pendingActionKey={
              pendingActionContext?.itemId === item.content_id
                ? pendingActionContext.actionKey
                : null
            }
            onToggleDetails={toggleExpandedItem}
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
    </SafeAreaView>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    guardBlockingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    centeredState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: SPACING.page,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm + 2,
      paddingHorizontal: SPACING.page,
      paddingTop: SPACING.xs,
      paddingBottom: SPACING.xs + 2,
    },
    backButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceMuted ?? colors.cardBackground,
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08),
    },
    headerText: {
      flex: 1,
      gap: 1,
    },
    title: {
      fontSize: 17,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
    },
    subtitle: {
      fontSize: 12,
      lineHeight: 16,
      color: colors.textMuted ?? colors.gray,
    },
    summaryStack: {
      gap: SPACING.sm,
      paddingHorizontal: SPACING.page,
      paddingTop: SPACING.xs,
      paddingBottom: SPACING.sm,
    },
    summaryStrip: {
      borderRadius: BORDER_RADIUS.xl,
      paddingHorizontal: SPACING.md + 2,
      paddingVertical: SPACING.md,
      gap: SPACING.xs + 2,
      backgroundColor: withAlpha(colors.cardBackground, 0.96),
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08),
      ...SHADOWS.card,
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
      color: colors.primary,
    },
    summaryCountPill: {
      minWidth: 44,
      minHeight: 30,
      paddingHorizontal: SPACING.sm,
      borderRadius: BORDER_RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(colors.primary, 0.12),
      borderWidth: 1,
      borderColor: withAlpha(colors.primary, 0.18),
    },
    summaryCountValue: {
      fontSize: 15,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primary,
    },
    summaryTitle: {
      fontSize: SIZES.text16,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
    },
    summaryBody: {
      fontSize: 13,
      lineHeight: 18,
      color: colors.textMuted ?? colors.gray,
    },
    summaryFootnote: {
      fontSize: 11,
      color: colors.textMuted ?? colors.gray,
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
      backgroundColor: colors.surfaceMuted ?? colors.cardBackground,
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08),
    },
    summaryMiniValue: {
      fontSize: 16,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
    },
    summaryMiniLabel: {
      fontSize: 10,
      lineHeight: 14,
      color: colors.textMuted ?? colors.gray,
    },
    listContent: {
      paddingBottom: SPACING.xxxl,
      flexGrow: 1,
    },
    stateShell: {
      paddingHorizontal: SPACING.page,
      paddingTop: SPACING.sm,
    },
    loadingCard: {
      borderRadius: BORDER_RADIUS.xl,
      padding: SPACING.md + 2,
      gap: SPACING.sm,
      backgroundColor: colors.cardBackground,
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08),
    },
    loadingHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    loadingTitle: {
      fontSize: 13,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.primaryText,
    },
    loadingPreviewCard: {
      borderRadius: BORDER_RADIUS.lg,
      padding: SPACING.sm + 2,
      gap: SPACING.xs + 2,
      backgroundColor: colors.surfaceMuted ?? withAlpha(colors.primaryText, 0.03),
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.05),
    },
    loadingBar: {
      height: 8,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: withAlpha(colors.primaryText, 0.08),
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
      borderRadius: BORDER_RADIUS.xl,
      padding: SPACING.md + 2,
      gap: SPACING.sm,
      backgroundColor: colors.cardBackground,
      borderWidth: 1,
      borderColor: withAlpha(colors.error, 0.18),
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
      color: colors.primaryText,
    },
    inlineMessageBody: {
      fontSize: 13,
      lineHeight: 18,
      color: colors.textMuted ?? colors.gray,
    },
    debugBlock: {
      borderRadius: BORDER_RADIUS.lg,
      padding: SPACING.sm,
      gap: 2,
      backgroundColor: colors.surfaceMuted ?? withAlpha(colors.primaryText, 0.03),
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.05),
    },
    debugLine: {
      fontSize: SIZES.text12,
      lineHeight: 18,
      color: colors.textMuted ?? colors.gray,
    },
    retryButton: {
      alignSelf: 'flex-start',
      minHeight: 34,
      paddingHorizontal: SPACING.md,
      borderRadius: BORDER_RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(colors.primary, 0.12),
    },
    retryButtonLabel: {
      fontSize: 12,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.primary,
    },
    emptyCard: {
      borderRadius: BORDER_RADIUS.xl,
      padding: SPACING.md + 2,
      gap: SPACING.xs + 2,
      backgroundColor: colors.cardBackground,
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08),
    },
    emptyCardTitle: {
      fontSize: 15,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
    },
    emptyCardBody: {
      fontSize: 13,
      lineHeight: 18,
      color: colors.textMuted ?? colors.gray,
    },
    listFooterSpacer: {
      height: SPACING.lg,
    },
  });
