import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
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
import { CoachConversationsList } from '@/components/coach/CoachConversationsList';
import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SIZES,
  SPACING,
  withAlpha,
} from '@/constants/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useInfiniteCoachHistory } from '@/hooks/queries/useInfiniteCoachHistory';
import { resolveCoachEntryPersonaPresentation } from '@/utils/coachEntryPersona';
import { formatCoachHistoryDate } from '@/utils/coachFormatting';
import {
  resolveCoachCtaLabel,
  resolveCoachDisclaimerText,
  resolveCoachUserFacingErrorMessage,
} from '@/utils/coachLocalization';
import { resolveCoachCtaRoute } from '@/utils/coachRoutes';
import { Squircle } from '@/components/Squircle';

type CoachHistoryTab = 'requests' | 'conversations';

const TAB_COPY = {
  requests: 'Demandes',
  conversations: 'Conversations',
};

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
  const [activeTab, setActiveTab] = useState<CoachHistoryTab>('requests');
  const [includeArchivedConversations, setIncludeArchivedConversations] = useState(false);
  const excludeEntryId = Array.isArray(excludeEntryIdParam)
    ? excludeEntryIdParam[0] ?? null
    : excludeEntryIdParam ?? null;
  const {
    items: historyEntries,
    error: entriesError,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteCoachHistory({
    excludeEntryId,
  });
  const loadError = entriesError instanceof Error ? entriesError : null;
  const loadErrorBody = useMemo(
    () => resolveCoachUserFacingErrorMessage(loadError, t),
    [loadError, t],
  );
  const showLoadingState = isFetching && !loadError && historyEntries.length === 0;
  const showErrorState = !showLoadingState && !!loadError && historyEntries.length === 0;
  const showEmptyState = !showLoadingState && !showErrorState && historyEntries.length === 0;
  const isRefreshing =
    isFetching && historyEntries.length > 0 && !isFetchingNextPage;

  useEffect(() => {
    if (
      !hasInitializedExpandedHistoryEntry.current &&
      historyEntries.length > 0
    ) {
      setExpandedHistoryEntryId(historyEntries[0]?.id ?? null);
      hasInitializedExpandedHistoryEntry.current = true;
    }
  }, [historyEntries]);

  useEffect(() => {
    if (
      expandedHistoryEntryId &&
      !historyEntries.some((entry) => entry.id === expandedHistoryEntryId)
    ) {
      setExpandedHistoryEntryId(null);
    }
  }, [expandedHistoryEntryId, historyEntries]);

  const handleClose = () => {
    if (router.canDismiss()) {
      router.dismiss();
      return;
    }

    router.back();
  };

  const handleRetry = () => {
    void refetch();
  };

  const handleRefresh = () => {
    void refetch();
  };

  const handleStartNewAdvice = () => {
    if (router.canDismiss()) {
      router.dismiss();
      return;
    }

    router.push('/coach' as any);
  };

  const handleLoadMore = () => {
    if (!hasNextPage || isFetchingNextPage) {
      return;
    }

    void fetchNextPage();
  };

  const renderFooter = () => {
    if (showEmptyState) {
      return null;
    }

    if (loadError && historyEntries.length > 0) {
      return (
        <Squircle style={styles.footerStateCard} testID="coach-history-footer-error-state">
          <Text style={styles.footerErrorText}>{loadErrorBody}</Text>
          <Button title={t('common.retry')} onPress={handleRetry} />
        </Squircle>
      );
    }

    if (!hasNextPage) {
      return null;
    }

    return (
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ disabled: isFetchingNextPage }}
        disabled={isFetchingNextPage}
        onPress={handleLoadMore}
        style={[
          styles.loadMoreButton,
          isFetchingNextPage ? styles.loadMoreButtonDisabled : null,
        ]}
        testID="coach-history-load-more-button"
      >
        {isFetchingNextPage ? (
          <ActivityIndicator
            color={colors.primary}
            size="small"
            testID="coach-history-load-more-spinner"
          />
        ) : null}
        <Text style={styles.loadMoreButtonText}>
          {isFetchingNextPage
            ? t('coach.history_loading_more')
            : t('coach.history_load_more')}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <AppScreen bottomInset={false} style={styles.safeArea}>
      <View style={styles.container}>
        <ModalHandle />

        <ScreenHeader
          title={t('coach.history_title')}
          subtitle={t('coach.history_screen_body')}
          onBack={handleClose}
          topInset={false}
          backTestID="coach-history-back-button"
        />

        <View style={styles.tabSelectorRow} testID="coach-history-tab-selector">
          {(['requests', 'conversations'] as CoachHistoryTab[]).map((tab) => {
            const isActive = activeTab === tab;
            return (
              <Pressable
                key={tab}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                onPress={() => setActiveTab(tab)}
                style={[styles.tabPill, isActive ? styles.tabPillActive : null]}
                testID={`coach-history-tab-${tab}`}
              >
                <Text style={[styles.tabPillLabel, isActive ? styles.tabPillLabelActive : null]}>
                  {TAB_COPY[tab]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {activeTab === 'conversations' ? (
          <CoachConversationsList
            includeArchived={includeArchivedConversations}
            onToggleArchived={setIncludeArchivedConversations}
            onStartNew={handleStartNewAdvice}
            testID="coach-conversations-list"
          />
        ) : null}

        {activeTab === 'requests' && showLoadingState ? (
          <View style={styles.stateContainer}>
            <ScreenState tone="loading" testID="coach-history-loading-state" />
          </View>
        ) : null}

        {activeTab === 'requests' && showErrorState ? (
          <View style={styles.stateContainer}>
            <ScreenState
              tone="error"
              title={t('coach.error_title')}
              message={loadErrorBody}
              actionLabel={t('common.retry')}
              onAction={handleRetry}
              testID="coach-history-error-state"
            />
          </View>
        ) : null}

        {activeTab === 'requests' && !showLoadingState && !showErrorState ? (
          <FlatList
            data={historyEntries}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const personaPresentation = resolveCoachEntryPersonaPresentation(item);
              const ctaRoute = resolveCoachCtaRoute(item.cta_route);
              const entryTimestamp = item.generated_at ?? item.created_at;
              const modeLabel =
                item.question_text ??
                (item.prompt_type
                  ? t(`coach.prompts.${item.prompt_type}.title`)
                  : null);

              return (
                <CoachHistoryCard
                  title={item.title}
                  body={item.body}
                  dateLabel={formatCoachHistoryDate(
                    item.generated_at ?? item.created_at,
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
                  content={item.content ?? null}
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
                      inDays: (count: number) =>
                        t('coach.sections.in_days', { count }),
                      daysPerWeek: (count: number) =>
                        t('coach.sections.days_per_week', { count }),
                      minutes: (count: number) =>
                        t('coach.sections.minutes', { count }),
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
                  disclaimer={resolveCoachDisclaimerText(item.disclaimer, t)}
                  ctaLabel={resolveCoachCtaLabel(ctaRoute, item.cta_label, t)}
                  onCtaPress={ctaRoute ? () => router.push(ctaRoute) : null}
                  expanded={expandedHistoryEntryId === item.id}
                  onToggle={() =>
                    setExpandedHistoryEntryId((current) =>
                      current === item.id ? null : item.id,
                    )
                  }
                  testID={`coach-history-card-${item.id}`}
                />
              );
            }}
            contentContainerStyle={[
              styles.content,
              showEmptyState ? styles.contentCentered : null,
            ]}
            keyboardShouldPersistTaps="handled"
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={styles.listSeparator} />}
            testID="coach-history-list"
            ListFooterComponent={renderFooter}
            ListEmptyComponent={
              showEmptyState ? (
                <ScreenState
                  tone="empty"
                  title={t('coach.history_empty_title')}
                  message={t('coach.history_empty_body')}
                  actionLabel={t('coach.action_bar.primary')}
                  onAction={handleStartNewAdvice}
                  testID="coach-history-empty-state"
                />
              ) : null
            }
          />
        ) : null}
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
    tabSelectorRow: {
      flexDirection: 'row',
      gap: SPACING.xs,
      paddingHorizontal: SPACING.page,
      paddingBottom: SPACING.sm,
    },
    tabPill: {
      flex: 1,
      paddingVertical: SPACING.sm + 2,
      paddingHorizontal: SPACING.md,
      borderRadius: BORDER_RADIUS.pill,
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08),
      backgroundColor: colors.cardBackground,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tabPillActive: {
      backgroundColor: withAlpha(colors.primary, 0.12),
      borderColor: withAlpha(colors.primary, 0.32),
    },
    tabPillLabel: {
      fontSize: SIZES.text14,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: withAlpha(colors.primaryText, 0.65),
    },
    tabPillLabelActive: {
      color: colors.primary,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: SPACING.md,
      paddingHorizontal: SPACING.page,
      paddingBottom: SPACING.sm,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.cardBackground,
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.06), borderCurve: 'continuous',
    },
    headerCopy: {
      flex: 1,
      gap: 4,
      paddingTop: 4,
    },
    headerTitle: {
      fontSize: SIZES.text18,
      lineHeight: 24,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
    },
    headerSubtitle: {
      fontSize: SIZES.text12,
      lineHeight: 18,
      color: colors.textMuted ?? colors.gray,
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
    stateCard: {
      padding: SPACING.md + 2,
      borderRadius: BORDER_RADIUS.xl,
      backgroundColor: colors.cardBackground,
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.07),
      gap: SPACING.sm,
      alignItems: 'flex-start',
      justifyContent: 'flex-start', borderCurve: 'continuous',
    },
    stateCardCentered: {
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 72,
    },
    stateTitle: {
      fontSize: SIZES.text16,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
      textAlign: 'left',
    },
    stateBody: {
      fontSize: SIZES.text14,
      lineHeight: 20,
      color: colors.textMuted ?? colors.gray,
      textAlign: 'left',
    },
    stateAction: {
      alignSelf: 'stretch',
      paddingTop: SPACING.xs,
    },
  });
