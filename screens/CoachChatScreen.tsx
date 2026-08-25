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
import { pickRandomStarterSuggestions } from '@/shared/coachChatStarterSuggestions';
import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SIZES,
  SPACING,
  withAlpha,
} from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useAdsGate } from '@/contexts/AdsContext';
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
  COACH_CONVERSATION_FREE_USER_LIMIT,
  COACH_CONVERSATION_USER_MESSAGE_MAX_LENGTH,
  canSendMessageInCoachConversation,
  getCoachConversationFreeNextRechargeAt,
  getCoachConversationFreeRemainingMessages,
  isCoachConversationFreeQuotaExhausted,
  type CoachConversationMessage,
  type CoachConversationQuotaStatus,
} from '@/shared/coachConversation';
import { CoachServiceError } from '@/services/coach';
import {
  generateCoachConversationClientRequestId,
  getCoachConversationQuotaFromError,
  isCoachConversationQuotaExhaustedError,
} from '@/services/coachConversation';
import { getCoachConversationQuotaQueryKey } from '@/hooks/queries/coachConversationQueryKeys';
import { useQueryClient } from '@tanstack/react-query';
import type { CoachPersonaKey } from '@/shared/coachPersonas';
import { getCoachPersona, isCoachPersonaKey } from '@/shared/coachPersonas';
import { getCoachPersonaVisual } from '@/shared/coachPersonaVisuals';
import { resolveCoachPersonaKeyFromProfile } from '@/utils/coachPersona';
import { formatCoachConversationQuotaDuration } from '@/utils/coachConversationFormatting';

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
    quotaFreeCounter: 'Messages gratuits : {remaining}/{limit}',
    quotaFreeWarning: 'Dernier message',
    quotaFreeExhaustedBody:
      'Tu peux attendre la prochaine recharge ou passer premium pour continuer.',
    quotaFreeExhaustedCountdown: 'Recharge gratuite dans {duration}',
    // Used when the server does not provide a recharge timestamp (or while the
    // refetch triggered by an overdue timestamp is in flight). Voluntarily
    // vague — saying "imminente" was misleading when the recharge never came.
    quotaFreeExhaustedFallback: 'Recharge gratuite à venir',
    perConversationReached: 'Cette conversation est complète. Démarre-en une nouvelle pour continuer.',
    composerPlaceholder: 'Écris à ton coach…',
    composerSendLabel: 'Envoyer',
    micA11yLabel: 'Enregistrer un message vocal',
    micUnavailable: 'Dictée vocale indisponible ici — appuie pour en savoir plus',
    micUnavailableTitle: 'Dictée vocale indisponible',
    micUnavailableBody:
      "La dictée vocale ne fonctionne pas dans Expo Go. Installe un build de développement de l'app pour l'utiliser sur ton téléphone. Sur ordinateur, ouvre l'app dans Chrome ou Edge.",
    micPermissionDenied: 'Accès au micro refusé. Autorise le micro dans les réglages pour pouvoir dicter.',
    voiceOverlayCancelHint: 'Glisse pour annuler',
    voiceOverlaySendLabel: 'Envoyer le vocal',
    voiceOverlayTimerA11yLabel: (seconds: number) =>
      `Enregistrement, ${seconds} seconde${seconds > 1 ? 's' : ''}`,
    starterTitle: 'Pose ta première question',
    starterSubtitle:
      'Ton coach va analyser tes scans et te répondre comme s’il était à tes côtés. Choisis une idée ou écris ta question.',
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
    upsellTitle: 'Continuer avec premium',
    upsellBody:
      'Continue maintenant et profite de plus de messages avec ton coach.',
    upsellCtaLong: 'Découvrir les avantages premium',
    notFoundTitle: 'Conversation introuvable',
    notFoundBody: 'Cette conversation a été supprimée ou tu n’y as pas accès.',
    loadingTitle: 'Chargement…',
    emptyState: 'Le coach attend ta première question.',
  },
};

// Number of starter suggestions displayed while a conversation is still empty.
// Picked deterministically from `COACH_CHAT_STARTER_SUGGESTIONS_FR` using the
// conversation id as seed — same thread always re-renders the same quartet,
// a brand-new "Nouvelle conv" lands on a fresh roll.
const STARTER_SUGGESTION_COUNT = 4;

function formatQuotaCopy(template: string, replacements: Record<string, string | number>) {
  let output = template;
  for (const [key, value] of Object.entries(replacements)) {
    output = output.replace(`{${key}}`, String(value));
  }
  return output;
}

function formatRechargeCountdownLabel(
  nextRechargeAt: string | null | undefined,
  nowMs: number,
) {
  if (!nextRechargeAt) return null;
  const targetMs = Date.parse(nextRechargeAt);
  if (!Number.isFinite(targetMs)) return null;
  const remaining = targetMs - nowMs;
  if (remaining <= 0) return null;
  return formatCoachConversationQuotaDuration(remaining);
}

function resolveQuotaBannerInputs(
  quota: CoachConversationQuotaStatus | null | undefined,
  copy: typeof COPY['fr'],
  nowMs: number,
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
  // Prefer the server-side limit so the counter stays consistent with backend
  // enforcement when the value drifts (rollouts, A/B). Falls back to the
  // shared client constant only when the payload doesn't carry one.
  const freeMessageLimit =
    quota.free_message_limit ?? COACH_CONVERSATION_FREE_USER_LIMIT;
  const freeCounter = formatQuotaCopy(copy.quotaFreeCounter, {
    remaining: getCoachConversationFreeRemainingMessages(quota),
    limit: freeMessageLimit,
  });
  if (kind === 'free_active') {
    return {
      kind,
      title: freeCounter,
      body: null,
      cta: null,
    };
  }
  if (kind === 'free_warning') {
    return {
      kind,
      title: freeCounter,
      body: copy.quotaFreeWarning,
      cta: null,
    };
  }
  const rechargeCountdown = formatRechargeCountdownLabel(
    getCoachConversationFreeNextRechargeAt(quota),
    nowMs,
  );
  return {
    kind,
    title: freeCounter,
    body: rechargeCountdown
      ? formatQuotaCopy(copy.quotaFreeExhaustedCountdown, {
          duration: rechargeCountdown,
        })
      : copy.quotaFreeExhaustedFallback,
    // The free-exhausted banner doubles as the premium CTA so we never render
    // a second standalone upsell card next to it (see CoachChatScreen JSX).
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
  const { presentRewardedAdGate } = useAdsGate();
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

  const params = useLocalSearchParams<{
    id?: string | string[];
    persona_key?: string | string[];
    new?: string | string[];
  }>();
  const conversationIdParam = useMemo(() => {
    if (!params.id) return null;
    return Array.isArray(params.id) ? params.id[0] ?? null : params.id;
  }, [params.id]);
  const personaKeyFromParam = useMemo<CoachPersonaKey | null>(() => {
    const raw = Array.isArray(params.persona_key) ? params.persona_key[0] : params.persona_key;
    return isCoachPersonaKey(raw) ? raw : null;
  }, [params.persona_key]);
  // Legacy links may pass ?new=1. Keep accepting them while the inbox now
  // creates a thread first and opens this screen with its conversation id.
  const forceNew = useMemo(() => {
    const raw = Array.isArray(params.new) ? params.new[0] : params.new;
    return raw === '1' || raw === 'true';
  }, [params.new]);

  const queryClient = useQueryClient();

  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    forceNew ? null : conversationIdParam,
  );
  const [composerValue, setComposerValue] = useState('');
  const [streamingDraft, setStreamingDraft] = useState<DraftMessage | null>(null);
  const [streamingError, setStreamingError] = useState<string | null>(null);
  const [outboxUserMessages, setOutboxUserMessages] = useState<OutboxUserMessage[]>([]);
  const pendingClientRequestIdRef = useRef<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // Typewriter dedup state — see plan: a message animates only if its id and
  // its trimmed content are both absent from these sets. We seed them with
  // the initial message snapshot so historical messages never re-animate,
  // and we add (id, content) on each animation completion so the draft →
  // persisted transition (same content, different id) doesn't restart it.
  const seenMessageIdsRef = useRef<Set<string>>(new Set());
  const seenContentsRef = useRef<Set<string>>(new Set());
  const initialMarkDoneRef = useRef(false);

  useEffect(() => {
    if (forceNew) {
      // A legacy "new=1" flag still wins over a stale id. Reset the dedup
      // state so the next start_coach_conversation lands cleanly.
      setActiveConversationId(null);
      initialMarkDoneRef.current = false;
      seenMessageIdsRef.current.clear();
      seenContentsRef.current.clear();
      return;
    }
    if (conversationIdParam) {
      setActiveConversationId(conversationIdParam);
    }
  }, [conversationIdParam, forceNew]);

  const personaKeyFromProfile = useMemo(
    () => resolveCoachPersonaKeyFromProfile(userProfile),
    [userProfile],
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
  // For an existing conversation, conversation.persona_key is authoritative.
  // For a fresh thread (no activeConversationId), honour an explicit
  // persona_key query param so the "Nouveau sujet" CTA can pin the coach.
  // Otherwise fall back to the user's profile preference.
  const personaKey = (conversation?.persona_key as CoachPersonaKey | undefined)
    ?? (activeConversationId ? personaKeyFromProfile : (personaKeyFromParam ?? personaKeyFromProfile));
  const personaDefinition = useMemo(
    () => getCoachPersona(personaKey as CoachPersonaKey),
    [personaKey],
  );
  const personaVisual = useMemo(
    () => getCoachPersonaVisual(personaKey as CoachPersonaKey),
    [personaKey],
  );
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
      if (quota.tier === 'free' && isCoachConversationFreeQuotaExhausted(quota)) {
        return false;
      }
      if (quota.tier === 'premium' && (quota.premium_today_available ?? 0) <= 0) return false;
      return true;
    }
    if (!conversation || !quota) return false;
    return canSendMessageInCoachConversation(conversation, quota);
  }, [conversation, quota, activeConversationId]);

  const isFreeQuotaExhausted = useMemo(
    () => !!quota && quota.tier === 'free' && isCoachConversationFreeQuotaExhausted(quota),
    [quota],
  );

  const freeNextRechargeAt = useMemo(
    () => (quota ? getCoachConversationFreeNextRechargeAt(quota) : null),
    [quota],
  );

  // Tick the local clock every 30s while the user is in the exhausted state,
  // so the recharge countdown stays in sync without forcing a refetch. The
  // useCoachConversationQuota query already schedules a refetch at the next
  // recharge timestamp — this is purely a UI ticker.
  useEffect(() => {
    if (!isFreeQuotaExhausted || !freeNextRechargeAt) {
      return undefined;
    }
    setNowMs(Date.now());
    const intervalId = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(intervalId);
  }, [isFreeQuotaExhausted, freeNextRechargeAt]);

  // Defensive refetch when the next-recharge timestamp is already in the past:
  // the TanStack `refetchInterval` in useCoachConversationQuota normally fires
  // around that moment, but a stale render (screen mount, app resume, clock
  // drift) can otherwise leave the user stuck on the "à venir" fallback
  // indefinitely. Invalidating the cached query forces a fresh server quota.
  const isFreeRechargeOverdue = useMemo(() => {
    if (!isFreeQuotaExhausted || !freeNextRechargeAt) return false;
    const targetMs = Date.parse(freeNextRechargeAt);
    return Number.isFinite(targetMs) && targetMs <= nowMs;
  }, [isFreeQuotaExhausted, freeNextRechargeAt, nowMs]);

  useEffect(() => {
    if (!isFreeRechargeOverdue || !user?.id) return;
    void queryClient.invalidateQueries({
      queryKey: getCoachConversationQuotaQueryKey(user.id),
    });
  }, [isFreeRechargeOverdue, queryClient, user?.id]);

  const quotaBannerInputs = useMemo(
    () => resolveQuotaBannerInputs(quota, copy, nowMs),
    [quota, copy, nowMs],
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
        // Server quota errors carry the latest quota snapshot in details so we
        // can refresh the UI without an extra round trip. Surface a clear
        // message when the quota is exhausted, and drop the optimistic copy
        // since the server did NOT persist the message (no double consumption
        // on retry — the unique client_request_id guard would short-circuit
        // anyway, but we also remove it locally).
        const quotaFromError = getCoachConversationQuotaFromError(error);
        if (quotaFromError && user?.id) {
          queryClient.setQueryData(
            getCoachConversationQuotaQueryKey(user.id),
            quotaFromError,
          );
        }
        const isQuotaError = isCoachConversationQuotaExhaustedError(error);
        const message = isQuotaError
          ? copy.quotaFreeExhaustedBody
          : error instanceof CoachServiceError
            ? error.message
            : copy.errorBody;
        setStreamingError(message);
        setStreamingDraft(null);
        if (isQuotaError) {
          // Drop the optimistic user bubble so the chat doesn't keep a
          // "pending" message that will never be sent.
          setOutboxUserMessages((prev) =>
            prev.filter((m) => m.clientRequestId !== clientRequestId),
          );
        } else {
          setOutboxUserMessages((prev) =>
            prev.map((m) =>
              m.clientRequestId === clientRequestId
                ? { ...m, uiStatus: 'failed' }
                : m,
            ),
          );
        }
      } finally {
        pendingClientRequestIdRef.current = null;
      }
    },
    [
      startMutation,
      sendMutation,
      personaKey,
      user?.id,
      copy.errorBody,
      copy.quotaFreeExhaustedBody,
      queryClient,
    ],
  );

  const handleSend = useCallback(async () => {
    const trimmed = composerValue.trim();
    if (!trimmed) return;
    if (!activeConversationId) {
      const adGateOutcome = await presentRewardedAdGate('coach');
      if (adGateOutcome === 'skipped') {
        return;
      }
    }

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
  }, [composerValue, activeConversationId, performSend, presentRewardedAdGate]);

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
    if (!voiceDictation.isSupported) {
      // The mic looks disabled but stays tappable so we can explain *why*
      // instead of the tap silently doing nothing (e.g. inside Expo Go, where
      // the native speech module is not bundled).
      Alert.alert(copy.micUnavailableTitle, copy.micUnavailableBody);
      return;
    }
    if (voiceDictation.isListening) {
      void voiceDictation.stop();
    } else {
      void voiceDictation.start();
    }
  }, [voiceDictation, copy.micUnavailableTitle, copy.micUnavailableBody]);

  // Surface the few voice errors that the user can actually act on (mic
  // permission denied). Transient ones (no-speech, aborted) stay silent.
  const micErrorLabel = useMemo(() => {
    const err = voiceDictation.error;
    if (!err || !voiceDictation.isSupported) return null;
    if (err.includes('not-allowed') || err.includes('service-not-allowed')) {
      return copy.micPermissionDenied;
    }
    return null;
  }, [voiceDictation.error, voiceDictation.isSupported, copy.micPermissionDenied]);

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

  // Single back step: the chat is now a regular page under /coach/chat, so
  // router.back() returns to whichever screen pushed us (the inbox in the
  // canonical flow). We keep router.dismiss() as a defensive fallback for
  // deep-links / single-screen stacks where back has nowhere to go.
  const handleClose = useCallback(() => {
    const canGoBack =
      typeof router.canGoBack === 'function' ? router.canGoBack() : false;
    if (canGoBack) {
      router.back();
      return;
    }
    const canDismiss =
      typeof router.canDismiss === 'function' ? router.canDismiss() : false;
    if (canDismiss) {
      router.dismiss();
      return;
    }
    router.back();
  }, [router]);

  // The starter is mutually exclusive with the FlatList (see render below), so
  // we must also hide it as soon as an optimistic outbox message exists —
  // otherwise the user's bubble stays invisible until startMutation resolves
  // and activeConversationId flips, which defeats the optimistic-render goal.
  //
  // We also surface the starter on a freshly-created conversation (id present
  // but no real turn yet) so the "Nouvelle conv" CTA in the inbox lands the
  // user on the suggestion grid rather than an empty chat. The
  // `dataUpdatedAt > 0` gate prevents a flash on an *existing* conversation
  // that's still loading its history.
  const messagesResolved =
    !activeConversationId || messagesQuery.dataUpdatedAt > 0;
  // The backend seeds an auto-generated `system` welcome message on creation,
  // so "no messages" is never true for a fresh thread. Gate on the absence of
  // a real conversational turn (user/assistant) instead — the welcome alone
  // must not suppress the suggestions.
  const hasConversationalTurns = messages.some(
    (m) => m.role === 'user' || m.role === 'assistant',
  );
  const showStarter =
    messagesResolved &&
    !hasConversationalTurns &&
    outboxUserMessages.length === 0;

  // 4 deterministic-per-conversation suggestions sampled from the FR pool
  // (~250 entries). Same conv → same picks across re-renders ; new conv → new
  // roll. We seed with the active conversation id, falling back to a stable
  // sentinel so the legacy `?new=1` path still gets a consistent quartet
  // until the first message lands.
  const starterSuggestions = useMemo(() => {
    const seed = activeConversationId ?? 'coach-chat-fresh-thread';
    return pickRandomStarterSuggestions(STARTER_SUGGESTION_COUNT, { seed });
  }, [activeConversationId]);
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

        {/* Single unified card: when the free quota is exhausted, the banner
            carries the counter + countdown AND the premium CTA. The standalone
            CoachPremiumUpsellInline is intentionally not rendered here so the
            user never sees two stacked quota/upsell pop-ups at once. */}
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
              suggestions={starterSuggestions.map((label, index) => ({
                id: `starter-${index}`,
                label,
              }))}
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
            errorLabel={micErrorLabel}
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
