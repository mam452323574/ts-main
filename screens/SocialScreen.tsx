import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { Plus } from 'lucide-react-native';

import { SocialCategoryPill } from '@/components/social/SocialCategoryPill';
import { SocialPostCard } from '@/components/social/SocialPostCard';
import { SocialProfilePreviewModal } from '@/components/social/SocialProfilePreviewModal';
import { SOCIAL_REPORT_REASON_CODES } from '@/constants/social';
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
import {
  flattenSocialFeedPages,
  useFeatureFlags,
  useSocialFeed,
  useSocialMutations,
} from '@/hooks/queries';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { trackEvent, trackFailureEvent } from '@/services/analytics';
import {
  resolveSocialCommentsGate,
  shouldEnableSocialComments,
} from '@/services/appConfig';
import {
  buildSocialAlertMessageWithDiagnostics,
  getDisplayedSocialCommentCount,
  recordSocialPostImpressions,
  recordSocialPostViews,
  shareSocialPostAsset,
  SocialServiceError,
} from '@/services/social';
import { logOperationalError } from '@/utils/observability';
import type {
  SocialCategoryFilter,
  SocialPost,
  SocialReactionState,
  SocialReportReasonCode,
} from '@/types';

const SOCIAL_FAB_SIZE = 60;
const SOCIAL_FAB_BOTTOM_OFFSET = SPACING.xl;
const SOCIAL_FEED_BOTTOM_PADDING =
  SOCIAL_FAB_SIZE + SOCIAL_FAB_BOTTOM_OFFSET + SPACING.md;
const SOCIAL_FILTER_CATEGORIES = [
  'all',
  'before_after',
  'food',
  'physique',
] as const;

export default function SocialScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useLanguage();
  const { userProfile } = useAuth();
  const { alertElement, showAlert } = useCustomAlert();
  const featureFlagsQuery = useFeatureFlags();
  const { data: featureFlags } = featureFlagsQuery;
  const queuedImpressionsRef = useRef<Set<string>>(new Set());
  const sessionImpressionsRef = useRef<Set<string>>(new Set());
  const impressionFlushTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queuedPostViewsRef = useRef<Set<string>>(new Set());
  const sessionPostViewsRef = useRef<Set<string>>(new Set());
  const postViewsFlushTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueImpressionsHandlerRef = useRef<(postIds: string[]) => void>(() => {});
  const queuePostViewsHandlerRef = useRef<(postIds: string[]) => void>(() => {});
  const seenFocusedCategoriesRef = useRef<Set<SocialCategoryFilter>>(new Set());
  const [selectedCategory, setSelectedCategory] = useState<SocialCategoryFilter>('all');
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [profilePreviewTarget, setProfilePreviewTarget] = useState<{
    userId: string;
    username?: string | null;
    avatarUrl?: string | null;
  } | null>(null);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {
    data,
    error: feedError,
    isFetched,
    isFetching,
    isFetchingNextPage,
    isStale,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useSocialFeed(selectedCategory);
  const feedFocusStateRef = useRef({
    isFetched,
    isFetching,
    isStale,
    refetch,
  });
  const {
    setReactionMutation,
    deletePostMutation,
    reportContentMutation,
    reactionError,
    clearReactionError,
    isDeletePending,
    isReactionPending,
  } = useSocialMutations();
  const quickReportReasonCodes = useMemo(
    () => SOCIAL_REPORT_REASON_CODES.filter((reasonCode) => reasonCode !== 'other'),
    [],
  );
  const reactionErrorDiagnostics = useMemo(() => {
    if (!reactionError) {
      return null;
    }

    const diagnostics: string[] = [];

    if (reactionError.functionName) {
      diagnostics.push(
        `${t('social.errors.reaction_route_label')}: ${reactionError.functionName}`,
      );
    }

    if (reactionError.code) {
      diagnostics.push(
        `${t('social.errors.reaction_code_label')}: ${reactionError.code}`,
      );
    }

    if (typeof reactionError.status === 'number') {
      diagnostics.push(
        `${t('social.errors.reaction_status_label')}: ${reactionError.status}`,
      );
    }

    if (reactionError.requestId) {
      diagnostics.push(
        `${t('social.errors.reaction_request_id_label')}: ${reactionError.requestId}`,
      );
    }

    return diagnostics.join(' | ');
  }, [reactionError, t]);

  useEffect(() => {
    trackEvent('social_tab_viewed');
  }, []);

  useEffect(() => {
    feedFocusStateRef.current = {
      isFetched,
      isFetching,
      isStale,
      refetch,
    };
  }, [isFetched, isFetching, isStale, refetch]);

  useEffect(() => {
    return () => {
      if (impressionFlushTimeoutRef.current) {
        clearTimeout(impressionFlushTimeoutRef.current);
      }
      if (postViewsFlushTimeoutRef.current) {
        clearTimeout(postViewsFlushTimeoutRef.current);
      }
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!seenFocusedCategoriesRef.current.has(selectedCategory)) {
        seenFocusedCategoriesRef.current.add(selectedCategory);
        return;
      }

      const {
        isFetched: hasFetchedCategory,
        isFetching: isCategoryFetching,
        isStale: isCategoryStale,
        refetch: refetchCategory,
      } = feedFocusStateRef.current;

      if (!hasFetchedCategory || isCategoryFetching || !isCategoryStale) {
        return;
      }

      void refetchCategory();
    }, [selectedCategory])
  );

  const posts = useMemo(() => flattenSocialFeedPages(data?.pages), [data?.pages]);
  const featureFlagsResolved =
    typeof featureFlagsQuery.dataUpdatedAt === 'number'
      ? featureFlagsQuery.dataUpdatedAt > 0
      : true;
  const commentsGateState = resolveSocialCommentsGate(featureFlags, {
    resolved: featureFlagsResolved,
  });
  const commentsEnabled = shouldEnableSocialComments(commentsGateState);
  const isProfileHydrating = !userProfile?.id;
  const backendError =
    !isProfileHydrating && feedError instanceof Error ? feedError : null;
  const backendErrorTitle = t('social.errors.unavailable_title');

  const flushQueuedImpressions = async () => {
    const queuedPostIds = Array.from(queuedImpressionsRef.current);
    queuedImpressionsRef.current.clear();

    if (queuedPostIds.length === 0) {
      return;
    }

    try {
      await recordSocialPostImpressions(queuedPostIds, 'feed');
    } catch (error) {
      queuedPostIds.forEach((postId) => {
        sessionImpressionsRef.current.delete(postId);
      });
      logOperationalError('[Social] Failed to record social impressions', error, {
        batch_size: queuedPostIds.length,
      });
    }
  };

  const flushQueuedPostViews = async () => {
    const queuedPostIds = Array.from(queuedPostViewsRef.current);
    queuedPostViewsRef.current.clear();

    if (queuedPostIds.length === 0) {
      return;
    }

    if (!userProfile?.id) {
      queuedPostIds.forEach((postId) => {
        sessionPostViewsRef.current.delete(postId);
      });
      return;
    }

    try {
      await recordSocialPostViews(queuedPostIds);
    } catch (error) {
      queuedPostIds.forEach((postId) => {
        sessionPostViewsRef.current.delete(postId);
      });
      logOperationalError('[Social] Failed to record unique social post views', error, {
        batch_size: queuedPostIds.length,
      });
    }
  };

  const queueImpressions = (postIds: string[]) => {
    let queuedAny = false;

    for (const postId of postIds) {
      if (sessionImpressionsRef.current.has(postId)) {
        continue;
      }

      sessionImpressionsRef.current.add(postId);
      queuedImpressionsRef.current.add(postId);
      queuedAny = true;
    }

    if (!queuedAny || impressionFlushTimeoutRef.current) {
      return;
    }

    impressionFlushTimeoutRef.current = setTimeout(() => {
      impressionFlushTimeoutRef.current = null;
      void flushQueuedImpressions();
    }, 800);
  };

  const queuePostViews = (postIds: string[]) => {
    if (!userProfile?.id) {
      return;
    }

    let queuedAny = false;

    for (const postId of postIds) {
      if (sessionPostViewsRef.current.has(postId)) {
        continue;
      }

      sessionPostViewsRef.current.add(postId);
      queuedPostViewsRef.current.add(postId);
      queuedAny = true;
    }

    if (!queuedAny || postViewsFlushTimeoutRef.current) {
      return;
    }

    postViewsFlushTimeoutRef.current = setTimeout(() => {
      postViewsFlushTimeoutRef.current = null;
      void flushQueuedPostViews();
    }, 800);
  };

  queueImpressionsHandlerRef.current = queueImpressions;
  queuePostViewsHandlerRef.current = queuePostViews;

  const handleImpressionViewableItemsChanged = useRef(
    ({
      viewableItems,
    }: {
      viewableItems: Array<{
        item?: SocialPost | null;
        isViewable?: boolean | null;
      }>;
    }) => {
      const visiblePostIds = viewableItems
        .filter((viewableItem) => viewableItem.isViewable)
        .map((viewableItem) => viewableItem.item?.id)
        .filter(
          (postId): postId is string =>
            typeof postId === 'string' && postId.length > 0,
        );

      queueImpressionsHandlerRef.current(visiblePostIds);
    },
  ).current;

  const handleUniqueViewableItemsChanged = useRef(
    ({
      viewableItems,
    }: {
      viewableItems: Array<{
        item?: SocialPost | null;
        isViewable?: boolean | null;
      }>;
    }) => {
      const visiblePostIds = viewableItems
        .filter((viewableItem) => viewableItem.isViewable)
        .map((viewableItem) => viewableItem.item?.id)
        .filter(
          (postId): postId is string =>
            typeof postId === 'string' && postId.length > 0,
        );

      queuePostViewsHandlerRef.current(visiblePostIds);
    },
  ).current;

  const viewabilityConfigCallbackPairs = useRef([
    {
      viewabilityConfig: {
        itemVisiblePercentThreshold: 60,
        minimumViewTime: 600,
      },
      onViewableItemsChanged: handleImpressionViewableItemsChanged,
    },
    {
      viewabilityConfig: {
        itemVisiblePercentThreshold: 60,
        minimumViewTime: 1200,
      },
      onViewableItemsChanged: handleUniqueViewableItemsChanged,
    },
  ]).current;

  const handleOpenComposer = () => {
    router.push('/social-compose' as any);
  };

  const handleOpenPost = (
    post: SocialPost,
    options: {
      focusComposer?: boolean;
    } = {},
  ) => {
    router.push({
      pathname: '/social-post' as any,
      params: {
        postId: post.id,
        postAuthorId: post.author_id,
        postModerationStatus: post.moderation_status,
        ...(options.focusComposer ? { focusComposer: '1' } : {}),
      },
    });
  };

  const handleOpenProfilePreview = (post: SocialPost) => {
    setProfilePreviewTarget({
      userId: post.author_id,
      username: post.author_username,
      avatarUrl: post.author_avatar_url,
    });
  };

  const handleSharePost = async (post: SocialPost) => {
    if (!post.asset_url) {
      return;
    }

    try {
      await shareSocialPostAsset(post.asset_url, post.id, t('social.actions.share'));
    } catch (error) {
      trackFailureEvent('social_share_failed', error, {
        post_id: post.id,
      });
      logOperationalError('[Social] Failed to share post asset', error, {
        post_id: post.id,
      });
      const message =
        error instanceof SocialServiceError
          ? error.message
          : t('social.errors.share_failed');
      showAlert(t('social.errors.share_title'), message, [{ text: t('common.ok') }]);
    }
  };

  const handleSetReaction = (post: SocialPost, nextReaction: SocialReactionState) => {
    if (isReactionPending(post.id)) {
      return;
    }

    setReactionMutation.mutate({
      postId: post.id,
      reaction: nextReaction,
    });
  };

  const submitReport = async (request: {
    target_type: 'post';
    target_post_id: string;
    reason_code: SocialReportReasonCode;
  }) => {
    try {
      await reportContentMutation.mutateAsync(request);
    } catch (error) {
      const message =
        error instanceof SocialServiceError
          ? error.message
          : t('social.report.error_submit');
      showAlert(t('social.report.error_title'), message, [{ text: t('common.ok') }]);
    }
  };

  const submitDeletePost = async (post: SocialPost) => {
    try {
      await deletePostMutation.mutateAsync({
        postId: post.id,
      });
    } catch (error) {
        const message = buildSocialAlertMessageWithDiagnostics(
          error,
          t('social.delete.error_submit'),
          {
            routeLabel: t('social.errors.reaction_route_label'),
            codeLabel: t('social.errors.reaction_code_label'),
            requestIdLabel: t('social.errors.reaction_request_id_label'),
            statusLabel: t('social.errors.reaction_status_label'),
          },
        );
      showAlert(t('social.delete.error_title'), message, [{ text: t('common.ok') }]);
    }
  };

  const handleReportPost = (post: SocialPost) => {
    showAlert(
      t('social.report.title'),
      t('social.report.message'),
      [
        ...quickReportReasonCodes.map((reasonCode) => ({
          text: t(`social.report.reasons.${reasonCode}`),
          onPress: () => {
            void submitReport({
              target_type: 'post',
              target_post_id: post.id,
              reason_code: reasonCode as SocialReportReasonCode,
            });
          },
        })),
        {
          text: t('common.cancel'),
          style: 'cancel' as const,
        },
      ],
    );
  };

  const handleDeletePost = (post: SocialPost) => {
    if (isDeletePending(post.id)) {
      return;
    }

    showAlert(
      t('social.delete.confirm_title'),
      t('social.delete.confirm_message'),
      [
        {
          text: t('common.cancel'),
          style: 'cancel' as const,
        },
        {
          text: t('social.actions.delete'),
          style: 'destructive' as const,
          onPress: () => {
            void submitDeletePost(post);
          },
        },
      ],
    );
  };

  const handleManualRefresh = useCallback(async () => {
    setIsManualRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsManualRefreshing(false);
    }
  }, [refetch]);

  const handleRetryBackendRequest = useCallback(() => {
    clearReactionError();
    queuedImpressionsRef.current.clear();
    sessionImpressionsRef.current.clear();
    queuedPostViewsRef.current.clear();
    sessionPostViewsRef.current.clear();
    if (impressionFlushTimeoutRef.current) {
      clearTimeout(impressionFlushTimeoutRef.current);
      impressionFlushTimeoutRef.current = null;
    }
    if (postViewsFlushTimeoutRef.current) {
      clearTimeout(postViewsFlushTimeoutRef.current);
      postViewsFlushTimeoutRef.current = null;
    }
    void handleManualRefresh();
  }, [clearReactionError, handleManualRefresh]);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      {alertElement}
      <View style={styles.header}>
        <Text style={styles.title}>{t('social.feed_title')}</Text>
      </View>

      <View style={styles.filtersSection}>
        <View style={styles.filtersCard}>
          <ScrollView
            horizontal
            contentContainerStyle={styles.filtersRow}
            showsHorizontalScrollIndicator={false}
            testID="social-filters-scroll"
          >
            {SOCIAL_FILTER_CATEGORIES.map((category) => (
              <SocialCategoryPill
                key={category}
                category={category}
                compact
                selected={selectedCategory === category}
                onPress={() => {
                  clearReactionError();
                  setSelectedCategory(category);
                }}
              />
            ))}
          </ScrollView>
        </View>
      </View>

      {backendError ? (
        <View style={styles.errorCard} testID="social-error-state">
          <Text style={styles.errorTitle}>{backendErrorTitle}</Text>
          <Text style={styles.errorBody}>{backendError.message}</Text>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={handleRetryBackendRequest}
            style={styles.errorButton}
            testID="social-error-retry"
          >
            <Text style={styles.errorButtonLabel}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {reactionError ? (
        <View style={styles.reactionErrorCard} testID="social-reaction-error">
          <View style={styles.reactionErrorHeader}>
            <Text style={styles.reactionErrorTitle}>
              {t('social.errors.reaction_title')}
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={clearReactionError}
              style={styles.reactionErrorDismissButton}
              testID="social-reaction-error-dismiss"
            >
              <Text style={styles.reactionErrorDismissLabel}>{t('common.ok')}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.reactionErrorBody}>
            {reactionError.message || t('social.errors.reaction_failed')}
          </Text>
          {reactionErrorDiagnostics ? (
            <Text style={styles.reactionErrorMeta}>{reactionErrorDiagnostics}</Text>
          ) : null}
        </View>
      ) : null}

      <FlashList<SocialPost>
        data={posts}
        keyExtractor={(item) => item.id}
        viewabilityConfigCallbackPairs={viewabilityConfigCallbackPairs}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) {
            void fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.4}
        refreshing={isManualRefreshing}
        onRefresh={handleManualRefresh}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.itemSeparator} />}
        ListEmptyComponent={
          !isFetched ? (
            <View style={styles.emptyState}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : backendError ? null : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>{t('social.empty.title')}</Text>
              <Text style={styles.emptyBody}>{t('social.empty.body')}</Text>
            </View>
          )
        }
        ListFooterComponent={
          isFetchingNextPage ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const displayedCommentCount = getDisplayedSocialCommentCount(item);

          return (
            <SocialPostCard
              post={{
                ...item,
                comment_count: displayedCommentCount,
              }}
              currentUserId={userProfile?.id}
              commentsEnabled={commentsEnabled}
              deleteDisabled={isDeletePending(item.id)}
              reactionsDisabled={isReactionPending(item.id)}
              onPress={() => handleOpenPost(item)}
              onAvatarPress={() => handleOpenProfilePreview(item)}
              onLikePress={() =>
                handleSetReaction(
                  item,
                  item.viewer_reaction === 'like' ? 'neutral' : 'like',
                )
              }
              onDislikePress={() =>
                handleSetReaction(
                  item,
                  item.viewer_reaction === 'dislike' ? 'neutral' : 'dislike',
                )
              }
              onCommentPress={() => handleOpenPost(item, { focusComposer: true })}
              onDeletePress={() => handleDeletePost(item)}
              onReportPress={() => handleReportPost(item)}
              onSharePress={item.asset_url ? () => void handleSharePost(item) : null}
            />
          );
        }}
        testID="social-feed-list"
      />

      <SocialProfilePreviewModal
        visible={profilePreviewTarget !== null}
        userId={profilePreviewTarget?.userId}
        fallbackUsername={profilePreviewTarget?.username}
        fallbackAvatarUrl={profilePreviewTarget?.avatarUrl}
        onClose={() => setProfilePreviewTarget(null)}
      />

      <TouchableOpacity
        accessibilityRole="button"
        onPress={handleOpenComposer}
        style={styles.fab}
        testID="social-compose-fab"
      >
        <Plus color={colors.white} size={24} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      paddingHorizontal: SPACING.page,
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.xs,
    },
    title: {
      fontSize: SIZES.xl,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
    },
    filtersSection: {
      paddingHorizontal: SPACING.page,
      paddingBottom: SPACING.sm,
    },
    filtersCard: {
      borderRadius: BORDER_RADIUS.xl,
      backgroundColor: colors.cardBackground,
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.06),
    },
    filtersRow: {
      alignItems: 'center',
      gap: SPACING.xs,
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.sm,
    },
    listContent: {
      paddingHorizontal: SPACING.page,
      paddingTop: SPACING.xs,
      paddingBottom: SOCIAL_FEED_BOTTOM_PADDING,
    },
    itemSeparator: {
      height: SPACING.md,
    },
    errorCard: {
      marginHorizontal: SPACING.page,
      marginBottom: SPACING.sm,
      padding: SPACING.md,
      borderRadius: BORDER_RADIUS.xl,
      backgroundColor: colors.cardBackground,
      borderWidth: 1,
      borderColor: withAlpha(colors.error, 0.2),
      gap: SPACING.sm,
    },
    errorTitle: {
      fontSize: SIZES.text16,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
    },
    errorBody: {
      fontSize: SIZES.text14,
      lineHeight: 22,
      color: colors.textMuted ?? colors.gray,
    },
    errorButton: {
      alignSelf: 'flex-start',
      minHeight: 36,
      paddingHorizontal: SPACING.md,
      borderRadius: BORDER_RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(colors.primary, 0.12),
    },
    errorButtonLabel: {
      fontSize: SIZES.text14,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.primary,
    },
    reactionErrorCard: {
      marginHorizontal: SPACING.page,
      marginBottom: SPACING.sm,
      padding: SPACING.md,
      borderRadius: BORDER_RADIUS.xl,
      backgroundColor: colors.cardBackground,
      borderWidth: 1,
      borderColor: withAlpha(colors.warning, 0.22),
      gap: SPACING.xs,
    },
    reactionErrorHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACING.sm,
    },
    reactionErrorTitle: {
      flex: 1,
      fontSize: SIZES.text14,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
    },
    reactionErrorDismissButton: {
      minHeight: 30,
      paddingHorizontal: SPACING.sm,
      borderRadius: BORDER_RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceMuted ?? withAlpha(colors.primaryText, 0.06),
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08),
    },
    reactionErrorDismissLabel: {
      fontSize: SIZES.text12,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.primaryText,
    },
    reactionErrorBody: {
      fontSize: SIZES.text14,
      lineHeight: 21,
      color: colors.primaryText,
    },
    reactionErrorMeta: {
      fontSize: SIZES.text12,
      lineHeight: 18,
      color: colors.textMuted ?? colors.gray,
    },
    emptyState: {
      paddingVertical: SPACING.xxxl,
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.sm,
    },
    emptyTitle: {
      fontSize: SIZES.text18,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
      textAlign: 'center',
    },
    emptyBody: {
      fontSize: SIZES.text14,
      lineHeight: 22,
      color: colors.textMuted ?? colors.gray,
      textAlign: 'center',
    },
    footerLoader: {
      paddingVertical: SPACING.lg,
      alignItems: 'center',
    },
    fab: {
      position: 'absolute',
      right: SPACING.page,
      bottom: SOCIAL_FAB_BOTTOM_OFFSET,
      width: SOCIAL_FAB_SIZE,
      height: SOCIAL_FAB_SIZE,
      borderRadius: SOCIAL_FAB_SIZE / 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.22,
      shadowRadius: 18,
      elevation: 6,
      borderWidth: 1,
      borderColor: withAlpha(colors.cardBackground, 0.92),
    },
  });
