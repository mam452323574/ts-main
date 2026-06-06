import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { AppScreen } from '@/components/AppScreen';
import { Button } from '@/components/Button';
import { ModalHandle } from '@/components/ModalHandle';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ScreenState } from '@/components/ScreenState';
import { CoachHistoryCard } from '@/components/coach/CoachHistoryCard';
import { CoachConversationCard } from '@/components/coach/CoachConversationCard';
import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SIZES,
  SPACING,
  withAlpha,
} from '@/constants/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useInfiniteCoachUnifiedHistory } from '@/hooks/queries/useInfiniteCoachUnifiedHistory';
import { useDeleteCoachEntry } from '@/hooks/queries/useDeleteCoachEntry';
import { useDeleteCoachConversation } from '@/hooks/queries/useDeleteCoachConversation';
import {
  resolveCoachEntryPersonaPresentation,
  resolveCoachPersonaPresentation,
} from '@/utils/coachEntryPersona';
import { formatCoachHistoryDate } from '@/utils/coachHistory';
import { formatCoachTimestamp } from '@/utils/coachFormatting';
import {
  buildCoachConversationDisplayTitle,
  formatCoachConversationCounter,
} from '@/utils/coachConversationFormatting';
import {
  resolveCoachCtaLabel,
  resolveCoachDisclaimerText,
  resolveCoachUserFacingErrorMessage,
} from '@/utils/coachLocalization';
import { resolveCoachCtaRoute } from '@/utils/coachRoutes';
import { Squircle } from '@/components/Squircle';
import {
  COACH_CONVERSATION_FREE_USER_LIMIT,
  COACH_CONVERSATION_PER_CONVERSATION_LIMIT,
  type CoachConversation,
} from '@/shared/coachConversation';
import {
  type CoachPersonaKey,
} from '@/shared/coachPersonas';
import {
  getCoachUnifiedHistoryItemKey,
  isCoachUnifiedHistoryConversationItem,
  isCoachUnifiedHistoryEntryItem,
  type CoachUnifiedHistoryConversationItem,
  type CoachUnifiedHistoryEntryItem,
  type CoachUnifiedHistoryItem,
} from '@/shared/coachHistory';

const CONVERSATION_COUNTER_COPY = {
  perConversation: (count: number, limit: number) => `${count}/${limit} messages`,
  freePerConversation: (count: number, limit: number) => `${count}/${limit} questions`,
};

const CONVERSATION_FALLBACK_TITLE = 'Conversation avec le coach';

const RECENT_HISTORY_WINDOW_MS = 24 * 60 * 60 * 1000;

function isRecentCoachHistoryTimestamp(value: string | null | undefined) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return false;
  }

  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return false;
  }

  const now = Date.now();
  return timestamp <= now && now - timestamp < RECENT_HISTORY_WINDOW_MS;
}

// Build a CoachConversation-shaped object from a unified-feed item so the
// existing CoachConversationCard can render it without any new prop surface.
function toCoachConversation(
  item: CoachUnifiedHistoryConversationItem,
): CoachConversation {
  return {
    id: item.id,
    user_id: item.user_id,
    created_at: item.created_at,
    updated_at: item.updated_at ?? item.created_at,
    title: item.title,
    persona_key: item.persona_key,
    locale: item.locale,
    status: item.conversation_status,
    message_count: item.message_count,
    user_message_count: item.user_message_count,
    account_tier_at_start: item.account_tier_at_start,
    last_user_message_at: item.last_user_message_at,
    last_assistant_message_at: item.last_assistant_message_at,
    ended_at: item.ended_at,
    ended_reason: item.ended_reason,
    archived_at: item.archived_at,
    metadata: item.metadata,
  };
}

export default function CoachHistoryScreen() {
  const router = useRouter();
  const { excludeEntryId: excludeEntryIdParam } = useLocalSearchParams<{
    excludeEntryId?: string | string[];
  }>();
  const { colors } = useTheme();
  const { locale, t } = useLanguage();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets), [colors, insets]);
  const [expandedHistoryEntryId, setExpandedHistoryEntryId] = useState<string | null>(
    null,
  );
  const hasInitializedExpandedHistoryEntry = useRef(false);

  const excludeEntryId = Array.isArray(excludeEntryIdParam)
    ? excludeEntryIdParam[0] ?? null
    : excludeEntryIdParam ?? null;

  const unifiedQuery = useInfiniteCoachUnifiedHistory();
  const unifiedItems = useMemo(
    () =>
      excludeEntryId
        ? unifiedQuery.items.filter(
            (item) => !(item.kind === 'entry' && item.id === excludeEntryId),
          )
        : unifiedQuery.items,
    [unifiedQuery.items, excludeEntryId],
  );

  const deleteEntryMutation = useDeleteCoachEntry();
  const deleteConversationMutation = useDeleteCoachConversation();

  const handleConfirmDeleteEntry = useCallback(
    (entryId: string) => {
      Alert.alert(
        t('coach.history_delete_confirm_title'),
        t('coach.history_delete_confirm_body_entry'),
        [
          { text: t('coach.history_delete_confirm_cancel'), style: 'cancel' },
          {
            text: t('coach.history_delete_confirm_confirm'),
            style: 'destructive',
            onPress: () => {
              deleteEntryMutation.mutate(
                { entryId },
                {
                  onError: (error) => {
                    Alert.alert(
                      t('coach.history_delete_error_title'),
                      resolveCoachUserFacingErrorMessage(error, t),
                    );
                  },
                },
              );
            },
          },
        ],
        { cancelable: true },
      );
    },
    [deleteEntryMutation, t],
  );

  const handleConfirmDeleteConversation = useCallback(
    (conversationId: string) => {
      Alert.alert(
        t('coach.history_delete_confirm_title'),
        t('coach.history_delete_confirm_body_conversation'),
        [
          { text: t('coach.history_delete_confirm_cancel'), style: 'cancel' },
          {
            text: t('coach.history_delete_confirm_confirm'),
            style: 'destructive',
            onPress: () => {
              deleteConversationMutation.mutate(
                { conversationId },
                {
                  onError: (error) => {
                    Alert.alert(
                      t('coach.history_delete_error_title'),
                      resolveCoachUserFacingErrorMessage(error, t),
                    );
                  },
                },
              );
            },
          },
        ],
        { cancelable: true },
      );
    },
    [deleteConversationMutation, t],
  );

  // Auto-expand the freshest entry so the user lands on the most recent advice
  // without having to tap the chevron.
  const firstEntryIdForExpansion = useMemo<string | null>(() => {
    const firstEntry = unifiedItems.find(isCoachUnifiedHistoryEntryItem);
    return firstEntry ? firstEntry.id : null;
  }, [unifiedItems]);

  useEffect(() => {
    if (
      !hasInitializedExpandedHistoryEntry.current &&
      firstEntryIdForExpansion
    ) {
      setExpandedHistoryEntryId(firstEntryIdForExpansion);
      hasInitializedExpandedHistoryEntry.current = true;
    }
  }, [firstEntryIdForExpansion]);

  useEffect(() => {
    if (!expandedHistoryEntryId) return;
    const stillThere = unifiedItems.some(
      (item) => item.kind === 'entry' && item.id === expandedHistoryEntryId,
    );
    if (!stillThere) {
      setExpandedHistoryEntryId(null);
    }
  }, [expandedHistoryEntryId, unifiedItems]);

  const handleClose = () => {
    if (router.canDismiss()) {
      router.dismiss();
      return;
    }
    router.back();
  };

  const handleStartNewAdvice = () => {
    if (router.canDismiss()) {
      router.dismiss();
      return;
    }
    router.push('/coach' as any);
  };

  const renderEntryCard = useCallback(
    (entry: CoachUnifiedHistoryEntryItem) => {
      const personaPresentation = resolveCoachEntryPersonaPresentation(entry as any);
      const ctaRoute = resolveCoachCtaRoute(entry.cta_route);
      const entryTimestamp = entry.generated_at ?? entry.created_at;
      const modeLabel = entry.question_text ?? null;

      return (
        <CoachHistoryCard
          title={entry.title ?? ''}
          body={(entry as any).body ?? ''}
          dateLabel={formatCoachHistoryDate(
            entry.generated_at ?? entry.created_at,
            locale,
            t,
          )}
          personaLabel={t('coach.used_persona_label')}
          personaValue={t(personaPresentation.titleTranslationKey)}
          personaAvatarSource={personaPresentation.avatarSource}
          personaAvatarFallbackLabel={personaPresentation.avatarFallbackLabel}
          personaAvatarHaloTint={personaPresentation.avatarHaloTint}
          modeLabel={modeLabel}
          recentLabel={
            isRecentCoachHistoryTimestamp(entryTimestamp)
              ? t('coach.recent_badge')
              : null
          }
          content={(entry as any).content_json ?? (entry as any).content ?? null}
          sectionLabels={{
            context_notes: t('coach.sections.context_notes'),
            priorities: t('coach.sections.priorities'),
            action_steps: t('coach.sections.action_steps'),
            warnings: t('coach.sections.warnings'),
            data_gaps: t('coach.sections.data_gaps'),
            meal_template: t('coach.sections.meal_template'),
            meal_swaps: t('coach.sections.meal_swaps'),
            shopping_list: t('coach.sections.shopping_list'),
            quick_recipe: t('coach.sections.quick_recipe'),
            daily_schedule: t('coach.sections.daily_schedule'),
            micro_routine: t('coach.sections.micro_routine'),
            habit_tracker: t('coach.sections.habit_tracker'),
            reminders: t('coach.sections.reminders'),
            knowledge_card: t('coach.sections.knowledge_card'),
            next_scan_suggestion: t('coach.sections.next_scan_suggestion'),
            signal_watch: t('coach.sections.signal_watch'),
            streak_celebration: t('coach.sections.streak_celebration'),
            today: t('coach.sections.today'),
            formatters: {
              inDays: (count: number) => t('coach.sections.in_days', { count }),
              daysPerWeek: (count: number) =>
                t('coach.sections.days_per_week', { count }),
              minutes: (count: number) => t('coach.sections.minutes', { count }),
            },
            shopping_sections: {
              frais: t('coach.sections.shopping_fresh'),
              sec: t('coach.sections.shopping_dry'),
              boissons: t('coach.sections.shopping_drinks'),
              snacks: t('coach.sections.shopping_snacks'),
              autre: t('coach.sections.shopping_other'),
            },
            scan_types: {
              face: t('coach.sections.scan_face'),
              body: t('coach.sections.scan_body'),
              nutrition: t('coach.sections.scan_nutrition'),
              super: t('coach.sections.scan_super'),
              health: t('coach.sections.scan_health'),
            },
            recurrences: {
              today: t('coach.sections.recurrence_today'),
              daily: t('coach.sections.recurrence_daily'),
              weekly: t('coach.sections.recurrence_weekly'),
            },
          }}
          disclaimerLabel={t('coach.disclaimer_label')}
          disclaimer={resolveCoachDisclaimerText(
            (entry as any).disclaimer,
            t,
          )}
          ctaLabel={resolveCoachCtaLabel(ctaRoute, entry.cta_label, t)}
          onCtaPress={ctaRoute ? () => router.push(ctaRoute) : null}
          expanded={expandedHistoryEntryId === entry.id}
          onToggle={() =>
            setExpandedHistoryEntryId((current) =>
              current === entry.id ? null : entry.id,
            )
          }
          onDelete={() => handleConfirmDeleteEntry(entry.id)}
          deleteA11yLabel={t('coach.history_delete_action')}
          testID={`coach-history-unified-entry-${entry.id}`}
        />
      );
    },
    [
      expandedHistoryEntryId,
      handleConfirmDeleteEntry,
      locale,
      router,
      t,
    ],
  );

  const renderConversationCard = useCallback(
    (item: CoachUnifiedHistoryConversationItem) => {
      const conversation = toCoachConversation(item);
      const personaPresentation = resolveCoachPersonaPresentation(
        item.persona_key as CoachPersonaKey,
      );
      const counterLabel = formatCoachConversationCounter(
        conversation,
        {
          perConversation: CONVERSATION_COUNTER_COPY.perConversation,
          freePerConversation: CONVERSATION_COUNTER_COPY.freePerConversation,
        },
        COACH_CONVERSATION_PER_CONVERSATION_LIMIT,
        COACH_CONVERSATION_FREE_USER_LIMIT,
      );
      // Discreet "Ongoing" badge only for live conversations — system statuses
      // (ended / quota_reached / archived / free_consumed / conversation_full)
      // stay hidden to keep the feed lean.
      const statusLabel =
        conversation.status === 'active'
          ? t('coach.history_status_active')
          : null;
      const dateLabel = formatCoachTimestamp(
        item.last_user_message_at ?? item.updated_at ?? item.created_at,
        locale,
      );
      const title = buildCoachConversationDisplayTitle(
        conversation,
        null,
        CONVERSATION_FALLBACK_TITLE,
      );

      return (
        <CoachConversationCard
          conversation={conversation}
          title={title}
          personaLabel={t(personaPresentation.titleTranslationKey)}
          counterLabel={counterLabel}
          statusLabel={statusLabel}
          statusTone="neutral"
          dateLabel={dateLabel}
          onPress={() =>
            router.push({
              pathname: '/coach/chat' as any,
              params: { id: item.id },
            })
          }
          onDelete={() => handleConfirmDeleteConversation(item.id)}
          deleteA11yLabel={t('coach.history_delete_action')}
          testID={`coach-history-unified-conversation-${item.id}`}
        />
      );
    },
    [handleConfirmDeleteConversation, locale, router, t],
  );

  const unifiedLoadError =
    unifiedQuery.error instanceof Error ? unifiedQuery.error : null;
  const unifiedLoadErrorBody = useMemo(
    () => resolveCoachUserFacingErrorMessage(unifiedLoadError, t),
    [unifiedLoadError, t],
  );

  const isUnifiedRefreshing =
    unifiedQuery.isFetching &&
    unifiedItems.length > 0 &&
    !unifiedQuery.isFetchingNextPage;

  const renderFooter = useCallback(() => {
    if (unifiedItems.length === 0) return null;
    if (unifiedLoadError) {
      return (
        <Squircle style={styles.footerStateCard} testID="coach-history-unified-error-footer">
          <Text style={styles.footerErrorText}>{unifiedLoadErrorBody}</Text>
          <Button title={t('common.retry')} onPress={() => void unifiedQuery.refetch()} />
        </Squircle>
      );
    }
    if (!unifiedQuery.hasNextPage) return null;
    return (
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ disabled: unifiedQuery.isFetchingNextPage }}
        disabled={unifiedQuery.isFetchingNextPage}
        onPress={() => void unifiedQuery.fetchNextPage()}
        style={[
          styles.loadMoreButton,
          unifiedQuery.isFetchingNextPage ? styles.loadMoreButtonDisabled : null,
        ]}
        testID="coach-history-unified-load-more"
      >
        {unifiedQuery.isFetchingNextPage ? (
          <ActivityIndicator color={colors.primary} size="small" />
        ) : null}
        <Text style={styles.loadMoreButtonText}>
          {unifiedQuery.isFetchingNextPage
            ? t('coach.history_loading_more')
            : t('coach.history_load_more')}
        </Text>
      </TouchableOpacity>
    );
  }, [
    colors.primary,
    styles,
    t,
    unifiedItems.length,
    unifiedLoadError,
    unifiedLoadErrorBody,
    unifiedQuery,
  ]);

  const renderUnifiedFeed = () => {
    const showLoadingState =
      unifiedQuery.isFetching && !unifiedLoadError && unifiedItems.length === 0;
    const showErrorState =
      !showLoadingState && !!unifiedLoadError && unifiedItems.length === 0;
    const showEmptyState =
      !showLoadingState && !showErrorState && unifiedItems.length === 0;

    if (showLoadingState) {
      return (
        <View style={styles.stateContainer}>
          <ScreenState tone="loading" testID="coach-history-unified-loading-state" />
        </View>
      );
    }
    if (showErrorState) {
      return (
        <View style={styles.stateContainer}>
          <ScreenState
            tone="error"
            title={t('coach.error_title')}
            message={unifiedLoadErrorBody}
            actionLabel={t('common.retry')}
            onAction={() => void unifiedQuery.refetch()}
            testID="coach-history-unified-error-state"
          />
        </View>
      );
    }

    return (
      <FlatList<CoachUnifiedHistoryItem>
        data={unifiedItems}
        keyExtractor={getCoachUnifiedHistoryItemKey}
        renderItem={({ item }) => {
          if (isCoachUnifiedHistoryEntryItem(item)) {
            return renderEntryCard(item);
          }
          if (isCoachUnifiedHistoryConversationItem(item)) {
            return renderConversationCard(item);
          }
          return null;
        }}
        contentContainerStyle={[
          styles.content,
          showEmptyState ? styles.contentCentered : null,
        ]}
        keyboardShouldPersistTaps="handled"
        refreshing={isUnifiedRefreshing}
        onRefresh={() => void unifiedQuery.refetch()}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.listSeparator} />}
        testID="coach-history-unified-list"
        ListFooterComponent={renderFooter}
        ListEmptyComponent={
          showEmptyState ? (
            <ScreenState
              tone="empty"
              title={t('coach.history_empty_title')}
              message={t('coach.history_empty_body')}
              actionLabel={t('coach.action_bar.primary')}
              onAction={handleStartNewAdvice}
              testID="coach-history-unified-empty-state"
            />
          ) : null
        }
      />
    );
  };

  return (
    <AppScreen bottomInset={false} style={styles.safeArea}>
      <View style={styles.container}>
        <ModalHandle />

        <ScreenHeader
          title={t('coach.history_title')}
          onBack={handleClose}
          topInset={false}
          backTestID="coach-history-back-button"
        />

        {renderUnifiedFeed()}
      </View>
    </AppScreen>
  );
}

const createStyles = (colors: any, insets: { bottom: number }) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    stateContainer: {
      flex: 1,
      paddingHorizontal: SPACING.page,
      paddingTop: SPACING.lg,
      paddingBottom: insets.bottom + SPACING.xxxl,
    },
    content: {
      flexGrow: 1,
      paddingHorizontal: SPACING.page,
      paddingTop: SPACING.lg,
      paddingBottom: insets.bottom + SPACING.xxxl,
    },
    contentCentered: {
      justifyContent: 'center',
    },
    listSeparator: {
      height: SPACING.sm,
    },
    loadMoreButton: {
      minHeight: 52,
      marginTop: SPACING.lg,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: withAlpha(colors.primary, 0.14),
      backgroundColor: colors.surfaceAccent ?? withAlpha(colors.primary, 0.06),
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.xs,
      paddingHorizontal: SPACING.md, borderCurve: 'continuous',
    },
    loadMoreButtonDisabled: {
      opacity: 0.7,
    },
    loadMoreButtonText: {
      fontSize: SIZES.text14,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.primary,
      textAlign: 'center',
    },
    footerStateCard: {
      marginTop: SPACING.lg,
      padding: SPACING.md,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.07),
      backgroundColor: colors.cardBackground,
      gap: SPACING.sm, borderCurve: 'continuous',
    },
    footerErrorText: {
      fontSize: SIZES.text12,
      lineHeight: 18,
      color: colors.textMuted ?? colors.gray,
      textAlign: 'left',
    },
  });
