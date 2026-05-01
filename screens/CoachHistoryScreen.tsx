import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';

import { Button } from '@/components/Button';
import { ModalHandle } from '@/components/ModalHandle';
import { CoachHistoryCard } from '@/components/coach/CoachHistoryCard';
import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SIZES,
  SPACING,
  withAlpha,
} from '@/constants/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useInfiniteCoachHistory } from '@/hooks/queries';
import { resolveCoachEntryPersonaPresentation } from '@/utils/coachEntryPersona';
import { formatCoachHistoryDate } from '@/utils/coachFormatting';
import {
  resolveCoachCtaLabel,
  resolveCoachDisclaimerText,
  resolveCoachUserFacingErrorMessage,
} from '@/utils/coachLocalization';
import { resolveCoachCtaRoute } from '@/utils/coachRoutes';

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
        <View style={styles.footerStateCard} testID="coach-history-footer-error-state">
          <Text style={styles.footerErrorText}>{loadErrorBody}</Text>
          <Button title={t('common.retry')} onPress={handleRetry} />
        </View>
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
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.container}>
        <ModalHandle />

        <View style={styles.header}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            onPress={handleClose}
            style={styles.backButton}
            testID="coach-history-back-button"
          >
            <ChevronLeft color={colors.primaryText} size={20} />
          </TouchableOpacity>

          <View style={styles.headerCopy}>
            <Text style={styles.headerTitle}>{t('coach.history_title')}</Text>
            <Text style={styles.headerSubtitle}>{t('coach.history_screen_body')}</Text>
          </View>
        </View>

        {showLoadingState ? (
          <View style={styles.stateContainer}>
            <View
              style={[styles.stateCard, styles.stateCardCentered]}
              testID="coach-history-loading-state"
            >
              <ActivityIndicator color={colors.primary} />
            </View>
          </View>
        ) : null}

        {showErrorState ? (
          <View style={styles.stateContainer}>
            <View style={styles.stateCard} testID="coach-history-error-state">
              <Text style={styles.stateTitle}>{t('coach.error_title')}</Text>
              <Text style={styles.stateBody}>{loadErrorBody}</Text>
              <View style={styles.stateAction}>
                <Button title={t('common.retry')} onPress={handleRetry} />
              </View>
            </View>
          </View>
        ) : null}

        {!showLoadingState && !showErrorState ? (
          <FlatList
            data={historyEntries}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const personaPresentation = resolveCoachEntryPersonaPresentation(item);
              const ctaRoute = resolveCoachCtaRoute(item.cta_route);
              const entryTimestamp = item.generated_at ?? item.created_at;
              const modeLabel = item.prompt_type
                ? t(`coach.prompts.${item.prompt_type}.title`)
                : null;

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
                <View style={styles.stateCard} testID="coach-history-empty-state">
                  <Text style={styles.stateTitle}>{t('coach.history_empty_title')}</Text>
                  <Text style={styles.stateBody}>{t('coach.history_empty_body')}</Text>
                  <View style={styles.stateAction}>
                    <Button
                      title={t('coach.action_bar.primary')}
                      onPress={handleStartNewAdvice}
                    />
                  </View>
                </View>
              ) : null
            }
          />
        ) : null}
      </View>
    </SafeAreaView>
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
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.06),
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
      paddingHorizontal: SPACING.md,
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
      gap: SPACING.sm,
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
      justifyContent: 'flex-start',
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
