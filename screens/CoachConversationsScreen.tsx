import { useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MessageSquarePlus } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { AppScreen } from '@/components/AppScreen';
import { Button } from '@/components/Button';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ScreenState } from '@/components/ScreenState';
import { CoachConversationInboxRow } from '@/components/coach/CoachConversationInboxRow';
import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SIZES,
  SPACING,
  getMainPageChrome,
  withAlpha,
} from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useAdsGate } from '@/contexts/AdsContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useInfiniteCoachConversations } from '@/hooks/queries/useInfiniteCoachConversations';
import { useStartCoachConversation } from '@/hooks/queries/useStartCoachConversation';
import type { CoachConversationInboxItem } from '@/shared/coachConversation';
import {
  getCoachPersona,
  isCoachPersonaKey,
  type CoachPersonaKey,
} from '@/shared/coachPersonas';
import { getCoachPersonaVisual } from '@/shared/coachPersonaVisuals';
import { getCoachConversationCtaChrome } from '@/utils/coachActionButtonChrome';
import { getCoachConversationTint } from '@/utils/coachConversationTint';
import { formatCoachHistoryDate } from '@/utils/coachHistory';
import { resolveCoachUserFacingErrorMessage } from '@/utils/coachLocalization';
import { resolveCoachPersonaKeyFromProfile } from '@/utils/coachPersona';

type PersonaParamState =
  | { kind: 'absent' }
  | { kind: 'valid'; personaKey: CoachPersonaKey }
  | { kind: 'invalid' };

function resolvePersonaParam(rawPersonaKey: string | undefined): PersonaParamState {
  if (typeof rawPersonaKey !== 'string' || rawPersonaKey.trim().length === 0) {
    return { kind: 'absent' };
  }
  if (isCoachPersonaKey(rawPersonaKey)) {
    return { kind: 'valid', personaKey: rawPersonaKey };
  }
  return { kind: 'invalid' };
}

export function CoachConversationsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ persona_key?: string | string[] }>();
  const { locale, t } = useLanguage();
  const { colors, isDark } = useTheme();
  const { presentRewardedAdGate } = useAdsGate();
  const { userProfile } = useAuth();
  const chrome = useMemo(
    () => getMainPageChrome(colors, isDark, 'coach'),
    [colors, isDark],
  );
  const styles = useMemo(
    () => createStyles(isDark, chrome),
    [chrome, isDark],
  );

  const rawPersonaKey = Array.isArray(params.persona_key)
    ? params.persona_key[0]
    : params.persona_key;
  const personaParam = useMemo(
    () => resolvePersonaParam(rawPersonaKey),
    [rawPersonaKey],
  );

  // The filter persona for the list query — null means "all coaches".
  const filterPersonaKey =
    personaParam.kind === 'valid' ? personaParam.personaKey : null;

  // The persona used when the user taps "start a new conversation". In the
  // filtered inbox we honour the URL persona; in the global inbox we fall back
  // to the user's profile preference so a free user keeps gentle_supportive
  // and a premium user keeps whatever they have selected.
  const profilePersonaKey = useMemo(
    () => resolveCoachPersonaKeyFromProfile(userProfile),
    [userProfile],
  );
  const newConversationPersonaKey: CoachPersonaKey =
    personaParam.kind === 'valid'
      ? personaParam.personaKey
      : profilePersonaKey;

  // Title: filtered → coach name. Global → "Messages".
  const isFilteredMode = personaParam.kind === 'valid';
  const filteredCoachName = isFilteredMode
    ? t(getCoachPersona(personaParam.personaKey).titleTranslationKey)
    : null;
  const screenTitle = filteredCoachName
    ?? t('coach.conversations_inbox.title_global');

  // The query is enabled in both global (filterPersonaKey=null) and filtered
  // modes. Only the "invalid persona_key" branch disables it so we don't fire
  // a request when the URL is malformed.
  const conversationsQuery = useInfiniteCoachConversations({
    personaKey: filterPersonaKey,
    enabled: personaParam.kind !== 'invalid',
  });
  const startMutation = useStartCoachConversation();

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleCreateConversation = useCallback(async () => {
    if (startMutation.isPending) {
      return;
    }

    try {
      const adGateOutcome = await presentRewardedAdGate('coach');
      if (adGateOutcome === 'skipped') {
        return;
      }

      const result = await startMutation.mutateAsync({
        personaKey: newConversationPersonaKey,
      });
      router.push({
        pathname: '/coach/chat',
        params: { id: result.conversation_id },
      } as any);
    } catch (error) {
      Alert.alert(
        t('coach.conversations_inbox.create_error_title'),
        resolveCoachUserFacingErrorMessage(error, t),
      );
    }
  }, [newConversationPersonaKey, presentRewardedAdGate, router, startMutation, t]);

  const resolveTitle = useCallback(
    (conversation: CoachConversationInboxItem) => {
      // Global inbox (multi-coach) — the row's primary identity is the coach
      // name, like in any DM app. The conversation topic moves to the preview
      // line (last_message_preview).
      if (!isFilteredMode) {
        return t(getCoachPersona(conversation.persona_key).titleTranslationKey);
      }
      // Per-coach inbox — the coach is constant, so surface the topic instead.
      const title = conversation.title?.trim();
      if (title) return title;
      const firstMessage = conversation.first_user_message_preview?.trim();
      if (firstMessage) return firstMessage;
      return t('coach.conversations_inbox.untitled');
    },
    [isFilteredMode, t],
  );

  // Surface the most recent message excerpt as the primary preview. When the
  // server hasn't (yet) populated `last_message_preview` — typical for a fresh
  // conversation that only carries the user's opening line — fall back to
  // `first_user_message_preview` so the user sees the actual thread topic
  // instead of the "no preview" placeholder.
  const resolvePreview = useCallback(
    (conversation: CoachConversationInboxItem) => {
      const last = conversation.last_message_preview?.trim();
      if (last) return last;
      const first = conversation.first_user_message_preview?.trim();
      if (first) return `${first}…`;
      return t('coach.conversations_inbox.no_preview');
    },
    [t],
  );

  const resolveStatus = useCallback(
    (conversation: CoachConversationInboxItem) => {
      if (conversation.status === 'ended') {
        return t('coach.conversations_inbox.status_ended');
      }
      if (conversation.status === 'quota_reached') {
        return t('coach.conversations_inbox.status_full');
      }
      if (conversation.status === 'archived') {
        return t('coach.conversations_inbox.status_archived');
      }
      return null;
    },
    [t],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: CoachConversationInboxItem; index: number }) => {
      const variant = index === 0 ? 'featured' : 'compact';
      const visual = getCoachPersonaVisual(item.persona_key);
      const accentTint = getCoachConversationTint(item.id, visual.haloTint);

      return (
        <View
          style={[
            styles.cardSlot,
            variant === 'featured'
              ? styles.cardSlotLatest
              : styles.cardSlotAligned,
          ]}
        >
          <CoachConversationInboxRow
            conversation={item}
            title={resolveTitle(item)}
            preview={resolvePreview(item)}
            dateLabel={formatCoachHistoryDate(
              item.last_message_at ?? item.updated_at,
              locale,
              t,
            )}
            statusLabel={resolveStatus(item)}
            variant={variant}
            accentTint={accentTint}
            onPress={() =>
              router.push({
                pathname: '/coach/chat',
                params: { id: item.id },
              } as any)
            }
            testID={`coach-conversations-item-${item.id}`}
          />
        </View>
      );
    },
    [locale, resolvePreview, resolveStatus, resolveTitle, router, styles, t],
  );

  const error = conversationsQuery.error instanceof Error
    ? conversationsQuery.error
    : null;
  const errorBody = resolveCoachUserFacingErrorMessage(error, t);
  const hasItems = conversationsQuery.items.length > 0;

  const renderFooter = useCallback(() => {
    if (!hasItems || !conversationsQuery.hasNextPage) {
      return null;
    }
    return (
      <Button
        title={
          conversationsQuery.isFetchingNextPage
            ? t('coach.conversations_inbox.loading_more')
            : t('coach.conversations_inbox.load_more')
        }
        onPress={() => void conversationsQuery.fetchNextPage()}
        loading={conversationsQuery.isFetchingNextPage}
        disabled={conversationsQuery.isFetchingNextPage}
        variant="ghost"
        testID="coach-conversations-load-more"
      />
    );
  }, [conversationsQuery, hasItems, t]);

  const newConversationA11yLabel = isFilteredMode && filteredCoachName
    ? t('coach.conversations_inbox.new_a11y', { coachName: filteredCoachName })
    : t('coach.conversations_inbox.new_global_a11y');

  // The CTA borrows the persona's haloTint via the inbox-tuned variant of the
  // canonical chrome helper. The bolder mix (≈45–50 % accent over the card
  // surface vs ≈8–26 % for the composer) makes Noah / Mira / Axel etc. read
  // as distinct colours from a glance instead of looking like the same
  // neutral dark pill in light mode.
  const newConversationVisual = getCoachPersonaVisual(newConversationPersonaKey);
  const newConversationChrome = useMemo(
    () => getCoachConversationCtaChrome(colors, isDark, newConversationVisual.haloTint),
    [colors, isDark, newConversationVisual.haloTint],
  );
  const newConversationLabel = t('coach.conversations_inbox.new_conversation_short');

  const handlePressNewConversation = useCallback(() => {
    if (startMutation.isPending) return;
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    void handleCreateConversation();
  }, [handleCreateConversation, startMutation.isPending]);

  const header = (
    <ScreenHeader
      title={screenTitle}
      onBack={handleBack}
      topInset
      backTestID="coach-conversations-back"
      rightSlotGrow
      right={
        personaParam.kind !== 'invalid' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={newConversationA11yLabel}
            accessibilityState={{ disabled: startMutation.isPending }}
            disabled={startMutation.isPending}
            onPress={handlePressNewConversation}
            style={({ pressed }) => [
              styles.newConvButton,
              {
                backgroundColor: newConversationChrome.backgroundColor,
                borderColor: newConversationChrome.borderColor,
                shadowColor: newConversationChrome.accentColor,
                transform: [{ scale: pressed ? 0.96 : 1 }],
              },
              startMutation.isPending ? styles.newConvButtonDisabled : null,
            ]}
            testID="coach-conversations-new"
          >
            {startMutation.isPending ? (
              <ActivityIndicator
                color={newConversationChrome.foregroundColor}
                size="small"
              />
            ) : (
              <MessageSquarePlus
                color={newConversationChrome.foregroundColor}
                size={20}
                strokeWidth={2.4}
              />
            )}
            <Text
              style={[
                styles.newConvButtonLabel,
                { color: newConversationChrome.foregroundColor },
              ]}
              numberOfLines={1}
            >
              {newConversationLabel}
            </Text>
          </Pressable>
        ) : null
      }
      testID="coach-conversations-header"
      borderless
      style={styles.header}
    />
  );

  if (personaParam.kind === 'invalid') {
    return (
      <AppScreen
        topInset={false}
        bottomInset={false}
        style={styles.screen}
        testID="coach-conversations-screen"
      >
        {header}
        <View style={styles.stateContainer}>
          <ScreenState
            tone="error"
            title={t('coach.conversations_inbox.invalid_title')}
            message={t('coach.conversations_inbox.invalid_body')}
            actionLabel={t('common.back')}
            onAction={handleBack}
            testID="coach-conversations-invalid-state"
          />
        </View>
      </AppScreen>
    );
  }

  const showInitialLoading =
    conversationsQuery.isFetching && !error && !hasItems;
  const showInitialError = !!error && !hasItems;

  // Two distinct empty states: filtered ("with this coach") vs global ("any
  // coach"). The CTA in both cases creates a new conversation with the right
  // persona (filtered → URL persona ; global → profile persona).
  const emptyStateTitle = isFilteredMode && filteredCoachName
    ? t('coach.conversations_inbox.empty_title', { coachName: filteredCoachName })
    : t('coach.conversations_inbox.empty_global_title');
  const emptyStateBody = isFilteredMode
    ? t('coach.conversations_inbox.empty_body')
    : t('coach.conversations_inbox.empty_global_body');
  const emptyStateActionLabel = isFilteredMode
    ? t('coach.conversations_inbox.new_conversation')
    : t('coach.conversations_inbox.start_conversation_cta');

  return (
    <AppScreen
      topInset={false}
      bottomInset={false}
      style={styles.screen}
      testID="coach-conversations-screen"
    >
      {header}
      {showInitialLoading ? (
        <View style={styles.stateContainer}>
          <ScreenState tone="loading" testID="coach-conversations-loading-state" />
        </View>
      ) : showInitialError ? (
        <View style={styles.stateContainer}>
          <ScreenState
            tone="error"
            title={t('coach.conversations_inbox.error_title')}
            message={errorBody}
            actionLabel={t('common.retry')}
            onAction={() => void conversationsQuery.refetch()}
            testID="coach-conversations-error-state"
          />
        </View>
      ) : (
        <FlatList
          data={conversationsQuery.items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          style={styles.listHost}
          refreshing={conversationsQuery.isFetching && !conversationsQuery.isFetchingNextPage}
          onRefresh={() => void conversationsQuery.refetch()}
          contentContainerStyle={!hasItems ? styles.emptyList : styles.list}
          ListEmptyComponent={
            <ScreenState
              tone="empty"
              title={emptyStateTitle}
              message={emptyStateBody}
              actionLabel={emptyStateActionLabel}
              onAction={() => void handleCreateConversation()}
              actionLoading={startMutation.isPending}
              actionDisabled={startMutation.isPending}
              testID="coach-conversations-empty-state"
              actionTestID="coach-conversations-empty-new"
            />
          }
          ListFooterComponent={renderFooter}
          testID="coach-conversations-list"
        />
      )}
    </AppScreen>
  );
}

const createStyles = (
  isDark: boolean,
  chrome: ReturnType<typeof getMainPageChrome>,
) =>
  StyleSheet.create({
    screen: {
      position: 'relative',
      overflow: 'hidden',
      backgroundColor: isDark ? chrome.canvasElevated : chrome.canvas,
    },
    header: {
      zIndex: 2,
      backgroundColor: withAlpha(
        chrome.headerBackground,
        isDark ? 0.94 : 0.88,
      ),
      borderBottomWidth: 0,
    },
    stateContainer: {
      flex: 1,
      justifyContent: 'center',
      padding: SPACING.page,
      zIndex: 1,
    },
    listHost: {
      flex: 1,
      zIndex: 1,
    },
    list: {
      paddingHorizontal: SPACING.page,
      paddingTop: SPACING.md,
      paddingBottom: SPACING.xxl,
      gap: SPACING.md,
    },
    emptyList: {
      flexGrow: 1,
      justifyContent: 'center',
      padding: SPACING.page,
      zIndex: 1,
    },
    cardSlot: {
      width: '100%',
    },
    cardSlotLatest: {
      paddingHorizontal: 0,
      transform: [{ translateX: 0 }],
    },
    cardSlotAligned: {
      paddingHorizontal: 0,
      transform: [{ translateX: 0 }],
    },
    newConvButton: {
      flexDirection: 'row',
      alignItems: 'center',
      // ~20 % bump across the board: padding, min height, gap, icon and
      // label all scale together so the proportions stay clean.
      gap: SPACING.xs + 2,
      paddingHorizontal: SPACING.md,
      paddingVertical: 10,
      minHeight: 44,
      borderRadius: BORDER_RADIUS.pill,
      borderWidth: 1,
      borderCurve: 'continuous',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: isDark ? 0.22 : 0.14,
      shadowRadius: 16,
      elevation: 4,
    },
    newConvButtonDisabled: {
      opacity: 0.5,
    },
    newConvButtonLabel: {
      fontSize: SIZES.text16,
      lineHeight: 20,
      fontWeight: FONT_WEIGHTS.semiBold,
      letterSpacing: 0.1,
    },
  });
