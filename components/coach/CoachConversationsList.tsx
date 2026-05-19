import { useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@/components/Button';
import { ScreenState } from '@/components/ScreenState';
import { Squircle } from '@/components/Squircle';
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
import { useArchiveCoachConversation } from '@/hooks/queries/useArchiveCoachConversation';
import { useInfiniteCoachConversations } from '@/hooks/queries/useInfiniteCoachConversations';
import { formatCoachTimestamp } from '@/utils/coachFormatting';
import {
  buildCoachConversationDisplayTitle,
  formatCoachConversationCounter,
  formatCoachConversationStatusLabel,
} from '@/utils/coachConversationFormatting';
import { resolveCoachUserFacingErrorMessage } from '@/utils/coachLocalization';
import {
  COACH_CONVERSATION_FREE_USER_LIMIT,
  COACH_CONVERSATION_PER_CONVERSATION_LIMIT,
  type CoachConversation,
} from '@/shared/coachConversation';
import { resolveCoachPersonaPresentation } from '@/utils/coachEntryPersona';
import type { CoachPersonaKey } from '@/shared/coachPersonas';

const COPY = {
  title: 'Conversations',
  startNewCta: 'Démarrer une conversation',
  loadMoreCta: 'Afficher plus',
  loadingMoreLabel: 'Chargement…',
  emptyTitle: 'Aucune conversation pour le moment',
  emptyBody: 'Lance ta première conversation avec ton coach pour la retrouver ici.',
  showArchivedLabel: 'Afficher les conversations archivées',
  archivedBadge: 'Archivée',
  endedBadge: 'Terminée',
  quotaReachedBadge: 'Complète',
  freeConsumedBadge: 'Conversation gratuite consommée',
  counterTemplate: (count: number, limit: number) => `${count}/${limit} messages`,
  freeCounterTemplate: (count: number, limit: number) => `${count}/${limit} questions`,
  archiveA11y: 'Archiver',
  fallbackTitle: 'Conversation avec le coach',
  errorRetry: 'Réessayer',
  errorTitle: 'Impossible de charger',
};

interface CoachConversationsListProps {
  includeArchived: boolean;
  onToggleArchived: (value: boolean) => void;
  onStartNew: () => void;
  testID?: string;
}

export function CoachConversationsList({
  includeArchived,
  onToggleArchived,
  onStartNew,
  testID = 'coach-conversations-list',
}: CoachConversationsListProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const { locale, t } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const {
    items,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
    error,
  } = useInfiniteCoachConversations({ includeArchived });

  const archiveMutation = useArchiveCoachConversation();
  const loadError = error instanceof Error ? error : null;
  const loadErrorBody = useMemo(
    () => resolveCoachUserFacingErrorMessage(loadError, t),
    [loadError, t],
  );

  const showLoadingState = isFetching && !loadError && items.length === 0;
  const showErrorState = !showLoadingState && !!loadError && items.length === 0;
  const showEmptyState = !showLoadingState && !showErrorState && items.length === 0;
  const isRefreshing = isFetching && items.length > 0 && !isFetchingNextPage;

  const handlePressItem = useCallback(
    (conversation: CoachConversation) => {
      router.push({
        pathname: '/coach/chat' as any,
        params: { id: conversation.id },
      });
    },
    [router],
  );

  const handleArchive = useCallback(
    (conversation: CoachConversation) => {
      if (conversation.status === 'archived') return;
      void archiveMutation.mutateAsync({ conversationId: conversation.id });
    },
    [archiveMutation],
  );

  const renderItem = useCallback(
    ({ item }: { item: CoachConversation }) => {
      const personaPresentation = resolveCoachPersonaPresentation(
        item.persona_key as CoachPersonaKey,
      );
      const counterLabel = formatCoachConversationCounter(
        item,
        {
          perConversation: COPY.counterTemplate,
          freePerConversation: COPY.freeCounterTemplate,
        },
        COACH_CONVERSATION_PER_CONVERSATION_LIMIT,
        COACH_CONVERSATION_FREE_USER_LIMIT,
      );
      const statusLabel = formatCoachConversationStatusLabel(item, {
        active: '',
        ended: COPY.endedBadge,
        quota_reached: COPY.quotaReachedBadge,
        archived: COPY.archivedBadge,
        free_consumed: COPY.freeConsumedBadge,
        conversation_full: COPY.quotaReachedBadge,
      });
      const dateLabel = formatCoachTimestamp(
        item.last_user_message_at ?? item.updated_at,
        locale,
      );
      const title = buildCoachConversationDisplayTitle(
        item,
        null,
        COPY.fallbackTitle,
      );
      const canArchive = item.status !== 'archived';

      return (
        <CoachConversationCard
          conversation={item}
          title={title}
          personaLabel={t(personaPresentation.titleTranslationKey)}
          counterLabel={counterLabel}
          statusLabel={statusLabel}
          dateLabel={dateLabel}
          onPress={() => handlePressItem(item)}
          onArchive={canArchive ? () => handleArchive(item) : null}
          archiveA11yLabel={COPY.archiveA11y}
          testID={`${testID}-card-${item.id}`}
        />
      );
    },
    [handleArchive, handlePressItem, locale, t, testID],
  );

  const renderFooter = useCallback(() => {
    if (showEmptyState) return null;
    if (loadError && items.length > 0) {
      return (
        <Squircle style={styles.footerErrorCard} testID={`${testID}-error-footer`}>
          <Text style={styles.footerErrorText}>{loadErrorBody}</Text>
          <Button title={COPY.errorRetry} onPress={() => void refetch()} />
        </Squircle>
      );
    }
    if (!hasNextPage) return null;
    return (
      <Pressable
        accessibilityRole="button"
        disabled={isFetchingNextPage}
        onPress={() => void fetchNextPage()}
        style={[styles.loadMoreButton, isFetchingNextPage ? styles.loadMoreButtonDisabled : null]}
        testID={`${testID}-load-more`}
      >
        {isFetchingNextPage ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : null}
        <Text style={styles.loadMoreText}>
          {isFetchingNextPage ? COPY.loadingMoreLabel : COPY.loadMoreCta}
        </Text>
      </Pressable>
    );
  }, [
    colors.primary,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    items.length,
    loadError,
    loadErrorBody,
    refetch,
    showEmptyState,
    styles,
    testID,
  ]);

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.controlsRow}>
        <Text style={styles.controlsLabel}>{COPY.showArchivedLabel}</Text>
        <Switch
          value={includeArchived}
          onValueChange={onToggleArchived}
          testID={`${testID}-archived-switch`}
        />
      </View>

      {showLoadingState ? (
        <View style={styles.stateContainer}>
          <ScreenState tone="loading" testID={`${testID}-loading`} />
        </View>
      ) : null}

      {showErrorState ? (
        <View style={styles.stateContainer}>
          <ScreenState
            tone="error"
            title={COPY.errorTitle}
            message={loadErrorBody}
            actionLabel={COPY.errorRetry}
            onAction={() => void refetch()}
            testID={`${testID}-error`}
          />
        </View>
      ) : null}

      {!showLoadingState && !showErrorState ? (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshing={isRefreshing}
          onRefresh={() => void refetch()}
          ListFooterComponent={renderFooter}
          ListEmptyComponent={
            showEmptyState ? (
              <ScreenState
                tone="empty"
                title={COPY.emptyTitle}
                message={COPY.emptyBody}
                actionLabel={COPY.startNewCta}
                onAction={onStartNew}
                testID={`${testID}-empty`}
              />
            ) : null
          }
          testID={`${testID}-flatlist`}
        />
      ) : null}
    </View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    controlsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACING.sm,
      paddingHorizontal: SPACING.page,
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.xs,
    },
    controlsLabel: {
      flex: 1,
      fontSize: SIZES.text12,
      color: withAlpha(colors.primaryText, 0.65),
      fontWeight: FONT_WEIGHTS.semiBold,
    },
    stateContainer: {
      flex: 1,
      paddingHorizontal: SPACING.page,
      paddingTop: SPACING.lg,
    },
    listContent: {
      flexGrow: 1,
      paddingHorizontal: SPACING.page,
      paddingTop: SPACING.xs,
      paddingBottom: SPACING.xxxl,
    },
    separator: {
      height: SPACING.sm,
    },
    footerErrorCard: {
      marginTop: SPACING.lg,
      padding: SPACING.md,
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: withAlpha(colors.error, 0.06),
      borderWidth: 1,
      borderColor: withAlpha(colors.error, 0.32),
      gap: SPACING.sm,
    },
    footerErrorText: {
      fontSize: SIZES.text14,
      color: colors.error,
    },
    loadMoreButton: {
      minHeight: 52,
      marginTop: SPACING.lg,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: withAlpha(colors.primary, 0.18),
      backgroundColor: withAlpha(colors.primary, 0.06),
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.xs,
      paddingHorizontal: SPACING.md,
    },
    loadMoreButtonDisabled: {
      opacity: 0.6,
    },
    loadMoreText: {
      fontSize: SIZES.text14,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.primary,
    },
  });
