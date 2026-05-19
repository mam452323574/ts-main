import { useCallback, useEffect, useRef } from 'react';
import type { FlatList, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

/**
 * Defensive auto-scroll helper for an inverted chat FlatList.
 *
 * In an inverted list, `contentOffset.y === 0` corresponds to the visual
 * bottom (newest message), and `y` grows as the user scrolls toward older
 * history. We follow the bottom while the latest assistant bubble grows
 * (typewriter), but only when the user is already near the bottom and not
 * actively dragging — so a user reading historical messages is never
 * yanked back down.
 *
 * Strategy: trailing-edge throttle on `onContentSizeChange` (fires once per
 * line-wrap, never per character), gated on near-bottom and not-dragging.
 *
 * The hook stores all interaction state in mutable refs to avoid re-renders
 * during scroll events.
 */

type UseChatAutoScrollOptions = {
  /** Distance from the visual bottom (in px) under which we consider the user "near bottom". Default 200. */
  threshold?: number;
  /** Minimum interval between programmatic scrolls (ms). Default 300. */
  throttleMs?: number;
  /** When true, programmatic scrolls are instant (no animation). Pass `useReducedMotion()`. */
  reduceMotion?: boolean;
};

type ScrollToBottomOptions = {
  /** Bypass the near-bottom + dragging gates and the throttle. Use after explicit user actions (e.g. send). */
  force?: boolean;
};

export type UseChatAutoScrollResult<T> = {
  listRef: React.RefObject<FlatList<T> | null>;
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onScrollBeginDrag: () => void;
  onScrollEndDrag: () => void;
  onMomentumScrollEnd: () => void;
  onContentSizeChange: () => void;
  scrollToBottom: (opts?: ScrollToBottomOptions) => void;
};

const DEFAULT_THRESHOLD = 200;
const DEFAULT_THROTTLE_MS = 300;

export function useChatAutoScroll<T>(
  options: UseChatAutoScrollOptions = {},
): UseChatAutoScrollResult<T> {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const throttleMs = options.throttleMs ?? DEFAULT_THROTTLE_MS;
  const reduceMotion = options.reduceMotion ?? false;

  const listRef = useRef<FlatList<T>>(null);

  // At mount, inverted FlatList renders at offset 0 (visual bottom).
  const isNearBottomRef = useRef(true);
  const isDraggingRef = useRef(false);
  const lastScrollAtRef = useRef(0);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduceMotionRef = useRef(reduceMotion);
  reduceMotionRef.current = reduceMotion;

  const performScroll = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    list.scrollToOffset({ offset: 0, animated: !reduceMotionRef.current });
    lastScrollAtRef.current = Date.now();
  }, []);

  const clearPendingTimer = useCallback(() => {
    if (pendingTimerRef.current !== null) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
  }, []);

  const scheduleThrottledScroll = useCallback(() => {
    const elapsed = Date.now() - lastScrollAtRef.current;
    if (elapsed >= throttleMs) {
      clearPendingTimer();
      performScroll();
      return;
    }
    if (pendingTimerRef.current !== null) {
      // A trailing call is already scheduled — let it fire.
      return;
    }
    pendingTimerRef.current = setTimeout(() => {
      pendingTimerRef.current = null;
      if (isDraggingRef.current) return;
      if (!isNearBottomRef.current) return;
      performScroll();
    }, throttleMs - elapsed);
  }, [throttleMs, clearPendingTimer, performScroll]);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = event.nativeEvent.contentOffset.y;
      isNearBottomRef.current = y < threshold;
    },
    [threshold],
  );

  const onScrollBeginDrag = useCallback(() => {
    isDraggingRef.current = true;
  }, []);

  const onScrollEndDrag = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  const onMomentumScrollEnd = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  const onContentSizeChange = useCallback(() => {
    if (!listRef.current) return;
    if (isDraggingRef.current) return;
    if (!isNearBottomRef.current) return;
    scheduleThrottledScroll();
  }, [scheduleThrottledScroll]);

  const scrollToBottom = useCallback(
    (opts?: ScrollToBottomOptions) => {
      if (!listRef.current) return;
      if (opts?.force) {
        clearPendingTimer();
        performScroll();
        return;
      }
      if (isDraggingRef.current) return;
      if (!isNearBottomRef.current) return;
      scheduleThrottledScroll();
    },
    [clearPendingTimer, performScroll, scheduleThrottledScroll],
  );

  useEffect(() => {
    return () => {
      clearPendingTimer();
    };
  }, [clearPendingTimer]);

  return {
    listRef,
    onScroll,
    onScrollBeginDrag,
    onScrollEndDrag,
    onMomentumScrollEnd,
    onContentSizeChange,
    scrollToBottom,
  };
}
