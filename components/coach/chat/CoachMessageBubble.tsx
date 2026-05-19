import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { AlertCircle } from 'lucide-react-native';

import { CoachPersonaAvatar } from '@/components/coach/CoachPersonaAvatar';
import { Squircle } from '@/components/Squircle';
import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SIZES,
  SPACING,
  withAlpha,
} from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useTypewriter } from '@/hooks/useTypewriter';
import { hapticMessageArrived } from '@/utils/haptics';
import type { CoachPersonaKey } from '@/shared/coachPersonas';
import { getCoachPersonaVisual } from '@/shared/coachPersonaVisuals';
import type {
  CoachConversationMessageRole,
  CoachConversationMessageStatus,
} from '@/shared/coachConversation';

export interface CoachMessageBubbleProps {
  id: string;
  role: CoachConversationMessageRole;
  content: string;
  status?: CoachConversationMessageStatus | null;
  timestamp?: string | null;
  errorLabel?: string | null;
  personaKey?: CoachPersonaKey | null;
  isStreaming?: boolean;
  /**
   * When true and role === 'assistant', the bubble reveals `content` via
   * the typewriter hook. The parent screen decides this so that historical
   * messages, refetches, and the draft→persisted transition don't restart
   * the animation.
   */
  shouldAnimateTypewriter?: boolean;
  /**
   * When true and role === 'assistant', the bubble fades in with a small
   * translateY on mount. Gated identically to `shouldAnimateTypewriter`:
   * only new (unseen) assistant messages animate. Honoured only when
   * Reduce Motion is OFF.
   */
  shouldAnimateEntrance?: boolean;
  /** Called when the typewriter reaches the end of `content`. */
  onTypewriterComplete?: (id: string, content: string) => void;
  /**
   * UI-only status for optimistic user messages. Distinct from the persisted
   * `CoachConversationMessageStatus` because it represents an in-flight or
   * locally-failed send, not a server-side state. Ignored for non-user roles.
   */
  userSendStatus?: 'pending' | 'failed' | null;
  /** Invoked when the user taps the retry affordance on a failed user bubble. */
  onRetrySend?: () => void;
  /** Localised label for the failed-send hint (e.g. "Échec de l'envoi"). */
  userSendFailedLabel?: string;
  /** Localised label for the retry affordance (e.g. "Réessayer"). */
  userSendRetryLabel?: string;
  /** Localised label for the pending-send hint (e.g. "Envoi…"). */
  userSendPendingLabel?: string;
  testID?: string;
}

const STREAMING_CURSOR = '█';

function formatTimestamp(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function CoachMessageBubbleComponent({
  id,
  role,
  content,
  status,
  timestamp,
  errorLabel,
  personaKey,
  isStreaming = false,
  shouldAnimateTypewriter = false,
  shouldAnimateEntrance = false,
  onTypewriterComplete,
  userSendStatus = null,
  onRetrySend,
  userSendFailedLabel,
  userSendRetryLabel,
  userSendPendingLabel,
  testID,
}: CoachMessageBubbleProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const personaVisual = personaKey ? getCoachPersonaVisual(personaKey) : null;
  const timestampLabel = formatTimestamp(timestamp);

  // Hooks must run unconditionally. For non-assistant roles the typewriter
  // is disabled, so it returns the full text immediately at near-zero cost.
  // Note: isStreaming (the draft flag in V1's synchronous flow) does NOT
  // disable the typewriter — the V1 backend delivers `content` in one shot
  // on the draft, which is exactly the moment we want to reveal progressively.
  const reduceMotion = useReducedMotion();
  const safeContent = content ?? '';
  const typewriterEnabled =
    role === 'assistant' &&
    shouldAnimateTypewriter &&
    !reduceMotion &&
    safeContent.trim().length > 0;

  const handleTypewriterComplete = useCallback(() => {
    onTypewriterComplete?.(id, safeContent);
  }, [id, safeContent, onTypewriterComplete]);

  const { displayedText, isTyping, skipToEnd } = useTypewriter({
    fullText: safeContent,
    enabled: typewriterEnabled,
    onComplete: typewriterEnabled ? handleTypewriterComplete : undefined,
  });

  const handleAssistantPress = useCallback(() => {
    if (isTyping) skipToEnd();
  }, [isTyping, skipToEnd]);

  // Entrance animation for new assistant messages. Gated by the same
  // "is-new" predicate as the typewriter (computed in the parent screen),
  // so historical messages, refetches, and the draft→persisted handoff
  // never replay this animation. Disabled when Reduce Motion is on.
  const entranceShouldRun =
    role === 'assistant' && shouldAnimateEntrance && !reduceMotion;
  const entranceOpacity = useSharedValue(entranceShouldRun ? 0 : 1);
  const entranceTranslateY = useSharedValue(entranceShouldRun ? 6 : 0);
  const didAnimateEntranceRef = useRef(false);

  useEffect(() => {
    if (didAnimateEntranceRef.current) return;
    if (role !== 'assistant' || !shouldAnimateEntrance) {
      didAnimateEntranceRef.current = true;
      return;
    }
    if (reduceMotion) {
      entranceOpacity.value = 1;
      entranceTranslateY.value = 0;
      didAnimateEntranceRef.current = true;
      return;
    }
    didAnimateEntranceRef.current = true;
    entranceOpacity.value = withTiming(1, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
    });
    entranceTranslateY.value = withTiming(0, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
    });
  }, [
    role,
    shouldAnimateEntrance,
    reduceMotion,
    entranceOpacity,
    entranceTranslateY,
  ]);

  const entranceStyle = useAnimatedStyle(() => ({
    opacity: entranceOpacity.value,
    transform: [{ translateY: entranceTranslateY.value }],
  }));

  // Subtle one-shot haptic when a fresh coach reply starts to appear. The
  // parent flags freshness via isStreaming (draft just received its first
  // char) or shouldAnimateTypewriter (brand-new persisted assistant message).
  // Historical messages, refetches, and user messages get neither flag, so
  // they never fire. The ref guarantees exactly-once per component instance.
  const hasTriggeredArrivalRef = useRef(false);
  useEffect(() => {
    if (hasTriggeredArrivalRef.current) return;
    if (role !== 'assistant') return;
    if (!isStreaming && !shouldAnimateTypewriter) return;
    hasTriggeredArrivalRef.current = true;
    hapticMessageArrived({ reduceMotion });
  }, [role, isStreaming, shouldAnimateTypewriter, reduceMotion]);

  if (role === 'system') {
    return (
      <View style={styles.systemRow} testID={testID}>
        <Squircle style={styles.systemBubble}>
          <Text style={styles.systemText}>{content}</Text>
        </Squircle>
      </View>
    );
  }

  if (role === 'user') {
    const isPending = userSendStatus === 'pending';
    const isFailed = userSendStatus === 'failed';
    const bubbleContent = (
      <Squircle
        style={[styles.userBubble, isFailed ? styles.userBubbleFailed : null]}
      >
        <Text style={styles.userText}>{content}</Text>
        {isPending && userSendPendingLabel ? (
          <Text style={styles.userPendingMeta}>{userSendPendingLabel}</Text>
        ) : null}
        {isFailed ? (
          <View style={styles.userFailedRow}>
            <AlertCircle size={14} color={colors.error} />
            {userSendFailedLabel ? (
              <Text style={styles.userFailedText}>{userSendFailedLabel}</Text>
            ) : null}
            {userSendRetryLabel ? (
              <Text style={styles.userRetryText}>{userSendRetryLabel}</Text>
            ) : null}
          </View>
        ) : null}
        {timestampLabel && !isPending && !isFailed ? (
          <Text style={styles.userMeta}>{timestampLabel}</Text>
        ) : null}
      </Squircle>
    );

    if (isFailed) {
      return (
        <View style={styles.userRow} testID={testID}>
          <Pressable
            onPress={onRetrySend}
            accessibilityRole="button"
            accessibilityLabel={userSendRetryLabel ?? userSendFailedLabel}
            testID={testID ? `${testID}-retry` : undefined}
          >
            {bubbleContent}
          </Pressable>
        </View>
      );
    }

    return (
      <View style={styles.userRow} testID={testID}>
        {bubbleContent}
      </View>
    );
  }

  const showError = status === 'error';
  const showPlaceholder = (status === 'pending' || status === 'streaming') && !safeContent.trim();
  const textToRender = typewriterEnabled ? displayedText : safeContent;
  // Hide the streaming cursor while the typewriter is actively writing —
  // the progressive reveal IS the "typing" signal, two indicators would be noisy.
  const showStreamingCursor = isStreaming && !(typewriterEnabled && isTyping);
  const accessibilityLabel = safeContent.trim().length > 0 ? safeContent : undefined;

  return (
    <Animated.View style={entranceStyle}>
      <Pressable
        onPress={handleAssistantPress}
        style={styles.assistantRow}
        accessible
        accessibilityRole="text"
        accessibilityLabel={accessibilityLabel}
        accessibilityLiveRegion="none"
        importantForAccessibility="yes"
        testID={testID}
      >
        {personaVisual ? (
          <View style={styles.avatar}>
            <CoachPersonaAvatar
              imageSource={personaVisual.imageSource}
              fallbackLabel={personaVisual.fallbackLabel}
              haloTint={personaVisual.haloTint}
              size={32}
              emphasis="subtle"
            />
          </View>
        ) : (
          <View style={styles.avatarSpacer} />
        )}
        <View style={styles.assistantContentColumn}>
          <Squircle
            style={[
              styles.assistantBubble,
              showError ? styles.assistantBubbleError : null,
            ]}
          >
            <Text
              style={[
                styles.assistantText,
                showError ? styles.assistantTextError : null,
              ]}
              importantForAccessibility="no-hide-descendants"
            >
              {showPlaceholder ? '…' : `${textToRender}${showStreamingCursor ? STREAMING_CURSOR : ''}`}
            </Text>
            {showError && errorLabel ? (
              <Text style={styles.assistantErrorLabel}>{errorLabel}</Text>
            ) : null}
          </Squircle>
          {timestampLabel ? (
            <Text style={styles.assistantMeta}>{timestampLabel}</Text>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    systemRow: {
      width: '100%',
      alignItems: 'center',
      paddingVertical: SPACING.xs,
    },
    systemBubble: {
      maxWidth: '92%',
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: withAlpha(colors.primaryText, 0.05),
      borderWidth: 1,
      borderColor: withAlpha(colors.primaryText, 0.06),
    },
    systemText: {
      fontSize: SIZES.text12,
      lineHeight: 18,
      color: colors.textMuted ?? colors.gray,
      textAlign: 'center',
    },
    userRow: {
      width: '100%',
      alignItems: 'flex-end',
      paddingVertical: SPACING.xs,
    },
    userBubble: {
      maxWidth: '85%',
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm + 2,
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: colors.surfaceAccent ?? withAlpha(colors.primary, 0.1),
      borderWidth: 1,
      borderColor: withAlpha(colors.primary, 0.16),
    },
    userBubbleFailed: {
      borderColor: withAlpha(colors.error, 0.4),
      backgroundColor: withAlpha(colors.error, 0.06),
    },
    userText: {
      fontSize: SIZES.text16,
      lineHeight: 22,
      color: colors.primaryText,
    },
    userMeta: {
      marginTop: 4,
      fontSize: SIZES.text12,
      color: withAlpha(colors.primaryText, 0.45),
      textAlign: 'right',
    },
    userPendingMeta: {
      marginTop: 4,
      fontSize: SIZES.text12,
      fontStyle: 'italic',
      color: withAlpha(colors.primaryText, 0.5),
      textAlign: 'right',
    },
    userFailedRow: {
      marginTop: SPACING.xs,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 6,
    },
    userFailedText: {
      fontSize: SIZES.text12,
      color: colors.error,
    },
    userRetryText: {
      fontSize: SIZES.text12,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.error,
      textDecorationLine: 'underline',
    },
    assistantRow: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingVertical: SPACING.xs,
      gap: SPACING.xs,
    },
    avatar: {
      width: 40,
      alignItems: 'center',
      justifyContent: 'flex-end',
    },
    avatarSpacer: {
      width: 40,
    },
    assistantContentColumn: {
      flex: 1,
      maxWidth: '85%',
    },
    assistantBubble: {
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm + 2,
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: colors.cardBackground,
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08),
    },
    assistantBubbleError: {
      borderColor: withAlpha(colors.error, 0.4),
      backgroundColor: withAlpha(colors.error, 0.06),
    },
    assistantText: {
      fontSize: SIZES.text16,
      lineHeight: 22,
      color: colors.primaryText,
    },
    assistantTextError: {
      color: colors.error,
    },
    assistantErrorLabel: {
      marginTop: SPACING.xs,
      fontSize: SIZES.text12,
      color: colors.error,
      fontWeight: FONT_WEIGHTS.semiBold,
    },
    assistantMeta: {
      marginTop: 4,
      fontSize: SIZES.text12,
      color: withAlpha(colors.primaryText, 0.45),
    },
  });

export const CoachMessageBubble = memo(CoachMessageBubbleComponent);
