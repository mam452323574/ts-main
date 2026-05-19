import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { AppScreen } from '@/components/AppScreen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ScreenState } from '@/components/ScreenState';
import { CoachMessageBubble } from '@/components/coach/chat/CoachMessageBubble';
import { CoachTypingIndicator } from '@/components/coach/chat/CoachTypingIndicator';
import { CoachChatComposer } from '@/components/coach/chat/CoachChatComposer';
import { CoachVoiceDictationOverlay } from '@/components/coach/chat/CoachVoiceDictationOverlay';
import { CoachChatHeader } from '@/components/coach/chat/CoachChatHeader';
import {
  CoachQuotaBanner,
  resolveCoachQuotaBannerKind,
} from '@/components/coach/chat/CoachQuotaBanner';
import { CoachConversationStarter } from '@/components/coach/chat/CoachConversationStarter';
import { CoachPremiumUpsellInline } from '@/components/coach/chat/CoachPremiumUpsellInline';
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
import { useArchiveCoachConversation } from '@/hooks/queries/useArchiveCoachConversation';
import { useCoachConversation } from '@/hooks/queries/useCoachConversation';
import { useCoachConversationMessages } from '@/hooks/queries/useCoachConversationMessages';
import { useCoachConversationQuota } from '@/hooks/queries/useCoachConversationQuota';
import { useSendCoachMessage } from '@/hooks/queries/useSendCoachMessage';
import { useStartCoachConversation } from '@/hooks/queries/useStartCoachConversation';
import { useChatAutoScroll } from '@/hooks/useChatAutoScroll';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useVoiceDictation } from '@/hooks/useVoiceDictation';
import {
  COACH_CONVERSATION_USER_MESSAGE_MAX_LENGTH,
  canSendMessageInCoachConversation,
  type CoachConversationMessage,
  type CoachConversationQuotaStatus,
} from '@/shared/coachConversation';
import { CoachServiceError } from '@/services/coach';
import { generateCoachConversationClientRequestId } from '@/services/coachConversation';
import type { CoachPersonaKey } from '@/shared/coachPersonas';
import { getCoachPersonaVisual } from '@/shared/coachPersonaVisuals';
import { resolveCoachPersonaKeyFromProfile } from '@/utils/coachPersona';
import { getCoachPersona } from '@/shared/coachPersonas';

// V1 hardcoded French copy. Locale-aware overrides will come during the
// i18n pass in step 10. The Edge Function still localises welcome messages
// based on the user's locale.
const COPY = {
  fr: {
    title: 'Conversation Coach',
    backLabel: 'Retour',
    archiveLabel: 'Archiver',
    archiveConfirmTitle: 'Archiver la conversation ?',
    archiveConfirmBody: "Elle restera visible dans l'historique sous l'onglet Conversations.",
    archiveCancel: 'Annuler',
    archiveConfirm: 'Archiver',
    quotaPremiumTitle: 'Aujourd’hui',
    quotaPremiumNormalBody: '{used} / {limit} messages envoyés',
    quotaPremiumWarning: 'Plus que {available} message(s) aujourd’hui',
    quotaPremiumExhausted: 'Limite quotidienne atteinte',
    quotaPremiumExhaustedBody: 'Reviens demain pour continuer ta conversation.',
    quotaFreeTitle: 'Conversation gratuite',
    quotaFreeActive: '{remaining} message(s) restant(s)',
    quotaFreeWarning: 'Dernière question gratuite',
    quotaFreeExhausted: 'Conversation gratuite épuisée',
    quotaFreeExhaustedBody: 'Passe premium pour continuer à discuter avec le coach.',
    perConversationReached: 'Cette conversation est complète. Démarre-en une nouvelle pour continuer.',
    composerPlaceholder: 'Écris à ton coach…',
    composerSendLabel: 'Envoyer',
    micA11yLabel: 'Enregistrer un message vocal',
    micUnavailable: 'Dictée non disponible sur ce support',
    voiceOverlayCancelHint: 'Glisse pour annuler',
    voiceOverlaySendLabel: 'Envoyer le vocal',
    voiceOverlayTimerA11yLabel: (seconds: number) =>
      `Enregistrement, ${seconds} seconde${seconds > 1 ? 's' : ''}`,
    starterTitle: 'Pose ta première question',
    starterSubtitle:
      'Ton coach va analyser tes scans et te répondre comme s’il était à tes côtés. Choisis une idée ou écris ta question.',
    suggestion_sleep: 'Comment améliorer mon sommeil cette semaine ?',
    suggestion_routine: 'Aide-moi à organiser ma journée pour me sentir mieux.',
    suggestion_nutrition: 'Donne-moi 3 idées simples pour bien manger ce midi.',
    suggestion_motivation: "J'ai du mal à m'y mettre, comment tu m’aiderais ?",
    errorTitle: 'Le coach n’a pas pu répondre',
    errorBody: 'Vérifie ta connexion ou réessaie dans un instant.',
    errorRetry: 'Réessayer',
    userSendPending: 'Envoi…',
    userSendFailed: 'Échec de l’envoi',
    userSendRetryA11y: 'Réessayer l’envoi',
    upsellCta: 'Passer premium',
    conversationEnded: 'Conversation terminée',
    conversationArchived: 'Conversation archivée',
    quotaReachedTitle: 'Cette conversation est terminée',
    quotaReachedBody: 'Démarre une nouvelle conversation pour continuer.',
    upsellTitle: 'Continue avec premium',
    upsellBody:
      'Tu as épuisé ta conversation gratuite. Passe premium pour discuter sans limite avec ton coach.',
    upsellCtaLong: 'Découvrir les avantages premium',
    notFoundTitle: 'Conversation introuvable',
    notFoundBody: 'Cette conversation a été supprimée ou tu n’y as pas accès.',
    loadingTitle: 'Chargement…',
    emptyState: 'Le coach attend ta première question.',
  },
};

const SUGGESTIONS = ['suggestion_sleep', 'suggestion_routine', 'suggestion_nutrition', 'suggestion_motivation'] as const;

function formatQuotaCopy(template: string, replacements: Record<string, string | number>) {
  let output = template;
  for (const [key, value] of Object.entries(replacements)) {
    output = output.replace(`{${key}}`, String(value));
  }
  return output;
}

function resolveQuotaBannerInputs(
  quota: CoachConversationQuotaStatus | null | undefined,
  copy: typeof COPY['fr'],
) {
  const kind = resolveCoachQuotaBannerKind(quota);
  if (!kind || !quota) return null;
  if (kind === 'premium_normal') {
    return {
      kind,
      title: copy.quotaPremiumTitle,
      body: formatQuotaCopy(copy.quotaPremiumNormalBody, {
        used: quota.premium_today_used,
        limit: quota.premium_today_limit ?? 40,
      }),
      cta: null as string | null,
    };
  }
  if (kind === 'premium_warning') {
    return {
      kind,
      title: copy.quotaPremiumTitle,
      body: formatQuotaCopy(copy.quotaPremiumWarning, {
        available: quota.premium_today_available ?? 0,
      }),
      cta: null,
    };
  }
  if (kind === 'premium_exhausted') {
    return {
      kind,
      title: copy.quotaPremiumExhausted,
      body: copy.quotaPremiumExhaustedBody,
      cta: null,
    };
  }
  if (kind === 'free_active') {
    return {
      kind,
      title: copy.quotaFreeTitle,
      body: formatQuotaCopy(copy.quotaFreeActive, {
        remaining: quota.free_remaining_messages ?? 0,
      }),
      cta: null,
    };
  }
  if (kind === 'free_warning') {
    return {
      kind,
      title: copy.quotaFreeTitle,
      body: copy.quotaFreeWarning,
      cta: null,
    };
  }
  return {
    kind,
    title: copy.quotaFreeExhausted,
    body: copy.quotaFreeExhaustedBody,
    cta: copy.upsellCta,
  };
}

type MessageListItem = {
  type: 'message';
  message: CoachConversationMessage | DraftMessage | OutboxUserMessage;
};

type DraftMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  status: 'streaming';
  conversation_id: string;
  user_id: string;
  model: string | null;
  provider: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  generation_ms: number | null;
  error_code: string | null;
  metadata: Record<string, unknown>;
};

// UI-only optimistic user message held in screen state. Kept separate from
// CoachConversationMessage so the shared/coachConversation contract isn't
// polluted with client-side states. Reconciled by clientRequestId.
type OutboxUserMessage = {
  kind: 'outbox-user';
  id: string;
  role: 'user';
  clientRequestId: string;
  conversationId: string | null;
  content: string;
  created_at: string;
  uiStatus: 'pending' | 'failed';
};

export default function CoachChatScreen() {
  const router = useRouter();
  const { user, userProfile } = useAuth();
  const { locale } = useLanguage();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const copy = COPY.fr;
  const styles = useMemo(() => createStyles(colors, insets), [colors, insets]);

  const reduceMotion = useReducedMotion();
  const {
    listRef,
    onScroll: handleListScroll,
    onScrollBeginDrag: handleListScrollBeginDrag,
    onScrollEndDrag: handleListScrollEndDrag,
    onMomentumScrollEnd: handleListMomentumScrollEnd,
    onContentSizeChange: handleListContentSizeChange,
    scrollToBottom,
  } = useChatAutoScroll<MessageListItem>({ reduceMotion });

  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const conversationIdParam = useMemo(() => {
    if (!params.id) return null;
    return Array.isArray(params.id) ? params.id[0] ?? null : params.id;
  }, [params.id]);

  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    conversationIdParam,
  );
  const [composerValue, setComposerValue] = useState('');
  const [streamingDraft, setStreamingDraft] = useState<DraftMessage | null>(null);
  const [streamingError, setStreamingError] = useState<string | null>(null);
  const [outboxUserMessages, setOutboxUserMessages] = useState<OutboxUserMessage[]>([]);
  const pendingClientRequestIdRef = useRef<string | null>(null);

  // Typewriter dedup state — see plan: a message animates only if its id and
  // its trimmed content are both absent from these sets. We seed them with
  // the initial message snapshot so historical messages never re-animate,
  // and we add (id, content) on each animation completion so the draft →
  // persisted transition (same content, different id) doesn't restart it.
  const seenMessageIdsRef = useRef<Set<string>>(new Set());
  const seenContentsRef = useRef<Set<string>>(new Set());
  const initialMarkDoneRef = useRef(false);

  useEffect(() => {
    if (conversationIdParam) {
      setActiveConversationId(conversationIdParam);
    }
  }, [conversationIdParam]);

  const personaKeyFromProfile = useMemo(
    () => resolveCoachPersonaKeyFromProfile(userProfile),
    [userProfile],
  );
  const personaDefinition = useMemo(
    () => getCoachPersona(personaKeyFromProfile as CoachPersonaKey),
    [personaKeyFromProfile],
  );
  const personaVisual = useMemo(
    () => getCoachPersonaVisual(personaKeyFromProfile as CoachPersonaKey),
    [personaKeyFromProfile],
  );

  const quotaQuery = useCoachConversationQuota();
  const conversationQuery = useCoachConversation({ conversationId: activeConversationId });
  const messagesQuery = useCoachConversationMessages({
    conversationId: activeConversationId,
  });
  const startMutation = useStartCoachConversation();
  const sendMutation = useSendCoachMessage();
  const archiveMutation = useArchiveCoachConversation();

  const voiceDictation = useVoiceDictation({
    locale,
    onTranscript: (transcript) => {
      if (transcript) setComposerValue(transcript);
    },
  });

  const conversation = conversationQuery.data ?? null;
  const personaKey = (conversation?.persona_key as CoachPersonaKey | undefined) ?? personaKeyFromProfile;
  const quota = quotaQuery.data;

  const messages = useMemo(() => {
    if (!messagesQuery.items) return [];
    return [...messagesQuery.items];
  }, [messagesQuery.items]);

  // Seed historical messages synchronously into the dedup sets on the first
  // render where the query has actually resolved for this conversation.
  // Running this in the render path — instead of a post-commit useEffect —
  // ensures `renderItem` reads populated sets on the very same render, so
  // historical bubbles never briefly flag with shouldAnimateTypewriter=true
  // (which would also fire entrance fade-ins and per-bubble haptics).
  //
  // Gate on `messagesQuery.dataUpdatedAt > 0` rather than `messages.length`:
  // for a brand-new conversation the first resolution lands with an empty
  // array, and we still want to mark "initial done" so the subsequent
  // refetch (which carries the freshly-sent user+assistant pair) is treated
  // as new and animates normally. Mutating refs during render is supported
  // by React for one-shot initialisation guarded by a flag.
  if (!initialMarkDoneRef.current && messagesQuery.dataUpdatedAt > 0) {
    for (const m of messages) {
      seenMessageIdsRef.current.add(m.id);
      if (m.role === 'assistant' && m.content) {
        seenContentsRef.current.add(m.content.trim());
      }
    }
    initialMarkDoneRef.current = true;
  }

  const handleTypewriterComplete = useCallback(
    (id: string, content: string) => {
      seenMessageIdsRef.current.add(id);
      if (content) seenContentsRef.current.add(content.trim());
      scrollToBottom();
    },
    [scrollToBottom],
  );

  // Safety net: if the streaming draft is cleared (mutation success) before
  // the typewriter inside the bubble completes, mark the last seen draft
  // content as already-shown so the refetched persisted message (same content,
  // different UUID) does NOT restart the animation.
  const previousDraftContentRef = useRef<string>('');
  useEffect(() => {
    const currentTrimmed = streamingDraft?.content?.trim() ?? '';
    const previousTrimmed = previousDraftContentRef.current;
    if (previousTrimmed && !currentTrimmed) {
      seenContentsRef.current.add(previousTrimmed);
    }
    previousDraftContentRef.current = currentTrimmed;
  }, [streamingDraft]);

  const canSend = useMemo(() => {
    if (!conversation && !activeConversationId) {
      if (!quota) return true;
      if (quota.tier === 'free' && quota.free_used) return false;
      if (quota.tier === 'premium' && (quota.premium_today_available ?? 0) <= 0) return false;
      return true;
    }
    if (!conversation || !quota) return false;
    return canSendMessageInCoachConversation(conversation, quota);
  }, [conversation, quota, activeConversationId]);

  const quotaBannerInputs = useMemo(
    () => resolveQuotaBannerInputs(quota, copy),
    [quota, copy],
  );

  const isBusy = sendMutation.isPending || startMutation.isPending;
  const composerDisabled = !canSend || (conversation && conversation.status !== 'active');

  // Shared send path used by both the initial send (handleSend) and retry
  // (handleRetryUserMessage). The clientRequestId is reused on retry so the
  // backend's UNIQUE (user_id, client_request_id) constraint deduplicates,
  // preventing message doublons after a successful retry.
  const performSend = useCallback(
    async ({
      clientRequestId,
      content,
      conversationId,
    }: {
      clientRequestId: string;
      content: string;
      conversationId: string | null;
    }) => {
      setStreamingError(null);
      pendingClientRequestIdRef.current = clientRequestId;
      try {
        let convId = conversationId;
        if (!convId) {
          const start = await startMutation.mutateAsync({
            personaKey: personaKey as CoachPersonaKey,
          });
          convId = start.conversation_id;
          setActiveConversationId(convId);
          setOutboxUserMessages((prev) =>
            prev.map((m) =>
              m.clientRequestId === clientRequestId
                ? { ...m, conversationId: convId }
                : m,
            ),
          );
        }
        setStreamingDraft({
          id: `draft-assistant-${clientRequestId}`,
          role: 'assistant',
          content: '',
          created_at: new Date().toISOString(),
          status: 'streaming',
          conversation_id: convId,
          user_id: user?.id ?? '',
          model: null,
          provider: null,
          prompt_tokens: null,
          completion_tokens: null,
          generation_ms: null,
          error_code: null,
          metadata: {},
        });
        await sendMutation.mutateAsync({
          conversationId: convId,
          content,
          clientRequestId,
          onAssistantUpdate: (assistantContent) => {
            setStreamingDraft((draft) =>
              draft
                ? { ...draft, content: assistantContent, status: 'streaming' }
                : draft,
            );
          },
          onComplete: () => {
            setStreamingDraft(null);
          },
        });
        // Server confirmed: drop the optimistic copy. The invalidateQueries
        // already fired in useSendCoachMessage will refetch and surface the
        // persisted server message in its place.
        setOutboxUserMessages((prev) =>
          prev.filter((m) => m.clientRequestId !== clientRequestId),
        );
      } catch (error) {
        const message =
          error instanceof CoachServiceError ? error.message : copy.errorBody;
        setStreamingError(message);
        setStreamingDraft(null);
        setOutboxUserMessages((prev) =>
          prev.map((m) =>
            m.clientRequestId === clientRequestId
              ? { ...m, uiStatus: 'failed' }
              : m,
          ),
        );
      } finally {
        pendingClientRequestIdRef.current = null;
      }
    },
    [startMutation, sendMutation, personaKey, user?.id, copy.errorBody],
  );

  const handleSend = useCallback(async () => {
    const trimmed = composerValue.trim();
    if (!trimmed) return;
    const clientRequestId = generateCoachConversationClientRequestId();
    setComposerValue('');
    setOutboxUserMessages((prev) => [
      ...prev,
      {
        kind: 'outbox-user',
        id: `outbox-user-${clientRequestId}`,
        role: 'user',
        clientRequestId,
        conversationId: activeConversationId,
        content: trimmed,
        created_at: new Date().toISOString(),
        uiStatus: 'pending',
      },
    ]);
    await performSend({
      clientRequestId,
      content: trimmed,
      conversationId: activeConversationId,
    });
  }, [composerValue, activeConversationId, performSend]);

  const handleRetryUserMessage = useCallback(
    (entry: OutboxUserMessage) => {
      if (sendMutation.isPending || startMutation.isPending) return;
      setOutboxUserMessages((prev) =>
        prev.map((m) =>
          m.clientRequestId === entry.clientRequestId
            ? { ...m, uiStatus: 'pending' }
            : m,
        ),
      );
      setStreamingError(null);
      void performSend({
        clientRequestId: entry.clientRequestId,
        content: entry.content,
        conversationId: entry.conversationId ?? activeConversationId,
      });
    },
    [sendMutation.isPending, startMutation.isPending, activeConversationId, performSend],
  );

  const handlePressMic = useCallback(() => {
    if (!voiceDictation.isSupported) return;
    if (voiceDictation.isListening) {
      void voiceDictation.stop();
    } else {
      void voiceDictation.start();
    }
  }, [voiceDictation]);

  const handleCancelVoice = useCallback(() => {
    void voiceDictation.stop();
    setComposerValue('');
  }, [voiceDictation]);

  const handleConfirmVoice = useCallback(() => {
    void voiceDictation.stop();
    void handleSend();
  }, [voiceDictation, handleSend]);

  const handleArchive = useCallback(() => {
    if (!activeConversationId) return;
    const proceed = async () => {
      try {
        await archiveMutation.mutateAsync({ conversationId: activeConversationId });
        router.back();
      } catch {
        // surfaced via mutation state if needed
      }
    };

    if (Platform.OS === 'web') {
      void proceed();
      return;
    }

    Alert.alert(
      copy.archiveConfirmTitle,
      copy.archiveConfirmBody,
      [
        { text: copy.archiveCancel, style: 'cancel' },
        { text: copy.archiveConfirm, style: 'destructive', onPress: () => void proceed() },
      ],
      { cancelable: true },
    );
  }, [activeConversationId, archiveMutation, router, copy]);

  const handleClose = useCallback(() => {
    if (router.canDismiss()) {
      router.dismiss();
      return;
    }
    router.back();
  }, [router]);

  // The starter is mutually exclusive with the FlatList (see render below), so
  // we must also hide it as soon as an optimistic outbox message exists —
  // otherwise the user's bubble stays invisible until startMutation resolves
  // and activeConversationId flips, which defeats the optimistic-render goal.
  const showStarter =
    !activeConversationId &&
    messages.length === 0 &&
    outboxUserMessages.length === 0;
  const hasStreamingContent = Boolean(streamingDraft?.content?.trim());
  const showTypingIndicator = sendMutation.isPending && !hasStreamingContent;

  // Keep the indicator mounted across its fade-out so the dots don't pop
  // out the instant `showTypingIndicator` flips to false. `visible` drives
  // the entrance/exit animation inside the indicator; `indicatorMounted`
  // is only cleared once the exit fade finishes via `onExited`.
  const [indicatorMounted, setIndicatorMounted] = useState(false);
  useEffect(() => {
    if (showTypingIndicator) setIndicatorMounted(true);
  }, [showTypingIndicator]);
  const handleTypingIndicatorExited = useCallback(() => {
    setIndicatorMounted(false);
  }, []);

  const listData: MessageListItem[] = useMemo(() => {
    const items: MessageListItem[] = messages.map((message) => ({
      type: 'message' as const,
      message,
    }));
    // Optimistic user messages appear between the server-fetched history and
    // the streaming assistant draft. They are removed on successful send
    // (refetch surfaces the persisted version) and flipped to 'failed' on error.
    for (const outbox of outboxUserMessages) {
      items.push({ type: 'message', message: outbox });
    }
    // Only surface the streaming draft once it carries content. While the
    // draft is empty, the CoachTypingIndicator handles the "thinking" state,
    // so we avoid rendering an empty assistant bubble above the dots.
    if (streamingDraft && streamingDraft.content.trim().length > 0) {
      items.push({ type: 'message', message: streamingDraft });
    }
    return items;
  }, [messages, outboxUserMessages, streamingDraft]);

  // FlatList inversée : on inverse pour avoir le plus récent en bas.
  const inverseData = useMemo(() => [...listData].reverse(), [listData]);

  // Force-scroll to the visual bottom right after the user sends a message
  // (optimistic append). We watch listData rather than calling inside
  // handleSend because the optimistic state lands asynchronously.
  const previousListLengthRef = useRef(listData.length);
  useEffect(() => {
    const prev = previousListLengthRef.current;
    previousListLengthRef.current = listData.length;
    if (
      listData.length > prev &&
      listData[listData.length - 1]?.message.role === 'user'
    ) {
      scrollToBottom({ force: true });
    }
  }, [listData, scrollToBottom]);

  // Soft-scroll when the typing indicator appears — respects near-bottom gate
  // so a user reading historical messages is not yanked down.
  useEffect(() => {
    if (showTypingIndicator) scrollToBottom();
  }, [showTypingIndicator, scrollToBottom]);

  const renderItem = useCallback(
    ({ item }: { item: MessageListItem }) => {
      const message = item.message;
      if ('kind' in message) {
        const outbox = message as OutboxUserMessage;
        return (
          <View style={styles.messageItem}>
            <CoachMessageBubble
              id={outbox.id}
              role="user"
              content={outbox.content}
              timestamp={outbox.created_at}
              userSendStatus={outbox.uiStatus}
              onRetrySend={
                outbox.uiStatus === 'failed'
                  ? () => handleRetryUserMessage(outbox)
                  : undefined
              }
              userSendFailedLabel={copy.userSendFailed}
              userSendRetryLabel={copy.errorRetry}
              userSendPendingLabel={copy.userSendPending}
              testID={`coach-chat-message-outbox-${outbox.clientRequestId}`}
            />
          </View>
        );
      }
      const isDraft = 'status' in message && message.status === 'streaming';
      const trimmedContent = message.content?.trim() ?? '';
      // Single predicate drives both the typewriter and the entrance
      // animation, so the two cannot drift out of sync.
      const isNewAssistantMessage =
        message.role === 'assistant' &&
        trimmedContent.length > 0 &&
        !seenMessageIdsRef.current.has(message.id) &&
        !seenContentsRef.current.has(trimmedContent);
      return (
        <View style={styles.messageItem}>
          <CoachMessageBubble
            id={message.id}
            role={message.role}
            content={message.content}
            status={message.status}
            timestamp={message.created_at}
            personaKey={personaKey}
            isStreaming={isDraft}
            shouldAnimateTypewriter={isNewAssistantMessage}
            shouldAnimateEntrance={isNewAssistantMessage}
            onTypewriterComplete={handleTypewriterComplete}
            errorLabel={
              message.role === 'assistant' && message.status === 'error'
                ? copy.errorBody
                : null
            }
            testID={`coach-chat-message-${message.id}`}
          />
        </View>
      );
    },
    [
      personaKey,
      styles.messageItem,
      copy.errorBody,
      copy.errorRetry,
      copy.userSendFailed,
      copy.userSendPending,
      handleTypewriterComplete,
      handleRetryUserMessage,
    ],
  );

  if (!user?.id) {
    return (
      <AppScreen>
        <ScreenHeader title={copy.title} onBack={handleClose} />
        <ScreenState tone="error" title={copy.notFoundTitle} message={copy.notFoundBody} />
      </AppScreen>
    );
  }

  return (
    <AppScreen keyboard bottomInset={false} style={styles.screen}>
      <View style={styles.container}>
        <CoachChatHeader
          personaKey={personaKey}
          personaDefinition={personaDefinition}
          personaVisual={personaVisual}
          onBack={handleClose}
          onArchive={handleArchive}
          showArchive={Boolean(activeConversationId)}
          archiveLabel={copy.archiveLabel}
          backLabel={copy.backLabel}
          fallbackTitle={copy.title}
          topInset={false}
          testID="coach-chat-screen-header"
        />

        {quotaBannerInputs ? (
          <CoachQuotaBanner
            kind={quotaBannerInputs.kind}
            title={quotaBannerInputs.title}
            body={quotaBannerInputs.body}
            ctaLabel={quotaBannerInputs.cta}
            onPress={quotaBannerInputs.cta ? () => router.push('/premium-upgrade' as any) : null}
            testID="coach-chat-quota-banner"
          />
        ) : null}

        {quota?.tier === 'free' && quota.free_used ? (
          <CoachPremiumUpsellInline
            title={copy.upsellTitle}
            body={copy.upsellBody}
            ctaLabel={copy.upsellCtaLong}
            onPress={() => router.push('/premium-upgrade' as any)}
            testID="coach-chat-upsell-inline"
          />
        ) : null}

        {conversation && conversation.status === 'quota_reached' ? (
          <View style={styles.statusBanner} testID="coach-chat-quota-reached-banner">
            <Text style={styles.statusBannerTitle}>{copy.quotaReachedTitle}</Text>
            <Text style={styles.statusBannerBody}>{copy.quotaReachedBody}</Text>
          </View>
        ) : null}

        {conversation && conversation.status === 'ended' ? (
          <View style={styles.statusBanner} testID="coach-chat-ended-banner">
            <Text style={styles.statusBannerTitle}>{copy.conversationEnded}</Text>
          </View>
        ) : null}

        {streamingError ? (
          <View style={[styles.statusBanner, styles.statusBannerError]} testID="coach-chat-error-banner">
            <Text style={[styles.statusBannerTitle, styles.statusBannerErrorText]}>
              {copy.errorTitle}
            </Text>
            <Text style={[styles.statusBannerBody, styles.statusBannerErrorText]}>
              {streamingError}
            </Text>
          </View>
        ) : null}

        <View style={styles.listShell}>
          {showStarter ? (
            <CoachConversationStarter
              personaKey={personaKey as CoachPersonaKey}
              title={copy.starterTitle}
              subtitle={copy.starterSubtitle}
              suggestions={SUGGESTIONS.map((id) => ({ id, label: copy[id] }))}
              onSelectSuggestion={(suggestion) => setComposerValue(suggestion.label)}
              testID="coach-chat-starter"
            />
          ) : (
            <FlatList
              ref={listRef}
              data={inverseData}
              inverted
              keyExtractor={(item) => item.message.id}
              renderItem={renderItem}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              onScroll={handleListScroll}
              scrollEventThrottle={16}
              onScrollBeginDrag={handleListScrollBeginDrag}
              onScrollEndDrag={handleListScrollEndDrag}
              onMomentumScrollEnd={handleListMomentumScrollEnd}
              onContentSizeChange={handleListContentSizeChange}
              testID="coach-chat-message-list"
              ListHeaderComponent={
                indicatorMounted ? (
                  <CoachTypingIndicator
                    personaKey={personaKey}
                    visible={showTypingIndicator}
                    onExited={handleTypingIndicatorExited}
                    testID="coach-chat-typing"
                  />
                ) : null
              }
              ListEmptyComponent={
                conversationQuery.isPending ? (
                  <ScreenState tone="loading" testID="coach-chat-loading" />
                ) : (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyStateText}>{copy.emptyState}</Text>
                  </View>
                )
              }
            />
          )}
        </View>

        <View style={[styles.composerShell, { paddingBottom: Math.max(insets.bottom, SPACING.sm) }]}>
          <CoachChatComposer
            value={composerValue}
            onChangeText={setComposerValue}
            onSend={handleSend}
            placeholder={copy.composerPlaceholder}
            sendLabel={copy.composerSendLabel}
            disabled={Boolean(composerDisabled)}
            busy={isBusy}
            maxLength={COACH_CONVERSATION_USER_MESSAGE_MAX_LENGTH}
            micEnabled={voiceDictation.isSupported}
            isListening={voiceDictation.isListening}
            micUnavailableLabel={voiceDictation.isSupported ? null : copy.micUnavailable}
            micA11yLabel={copy.micA11yLabel}
            onPressMic={handlePressMic}
            renderRecordingOverlay={() => (
              <CoachVoiceDictationOverlay
                visible={voiceDictation.isListening}
                interimTranscript={composerValue}
                cancelHint={copy.voiceOverlayCancelHint}
                sendLabel={copy.voiceOverlaySendLabel}
                timerA11yLabel={copy.voiceOverlayTimerA11yLabel}
                onCancel={handleCancelVoice}
                onConfirm={handleConfirmVoice}
                canConfirm={composerValue.trim().length > 0 && !isBusy}
                testID="coach-chat-voice-overlay"
              />
            )}
            testID="coach-chat-composer"
          />
        </View>
      </View>
    </AppScreen>
  );
}

const createStyles = (colors: any, insets: { bottom: number }) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
    },
    container: {
      flex: 1,
    },
    statusBanner: {
      marginHorizontal: SPACING.page,
      marginTop: SPACING.xs,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: withAlpha(colors.primaryText, 0.05),
      borderWidth: 1,
      borderColor: withAlpha(colors.primaryText, 0.06),
      gap: 4,
    },
    statusBannerTitle: {
      fontSize: SIZES.text14,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.primaryText,
    },
    statusBannerBody: {
      fontSize: SIZES.text12,
      lineHeight: 16,
      color: withAlpha(colors.primaryText, 0.65),
    },
    statusBannerError: {
      backgroundColor: withAlpha(colors.error, 0.08),
      borderColor: withAlpha(colors.error, 0.32),
    },
    statusBannerErrorText: {
      color: colors.error,
    },
    listShell: {
      flex: 1,
    },
    listContent: {
      paddingHorizontal: SPACING.page,
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.lg,
      gap: SPACING.xs,
    },
    messageItem: {
      width: '100%',
    },
    emptyState: {
      paddingTop: SPACING.xl,
      paddingHorizontal: SPACING.page,
      alignItems: 'center',
    },
    emptyStateText: {
      fontSize: SIZES.text14,
      color: withAlpha(colors.primaryText, 0.6),
      textAlign: 'center',
    },
    composerShell: {
      paddingHorizontal: SPACING.page,
      paddingTop: SPACING.sm,
      backgroundColor: colors.background,
    },
  });
