import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseTypewriterOptions {
  /** The full message to reveal. Changing this restarts the animation. */
  fullText: string;
  /** When false, the full text is revealed immediately and `onComplete` fires. */
  enabled?: boolean;
  /** Hard ceiling for the animation duration on long messages. */
  maxDurationMs?: number;
  /** Floor for short messages, so they don't pop instantly. */
  minDurationMs?: number;
  /** Adds tiny pauses after sentence-ending and intra-sentence punctuation. */
  punctuationPauses?: boolean;
  /** Fires once the displayed text catches up with `fullText`. */
  onComplete?: () => void;
}

export interface UseTypewriterResult {
  displayedText: string;
  isTyping: boolean;
  skipToEnd: () => void;
}

// Tuning constants — readable defaults that mirror ChatGPT/Gemini cadence.
const DEFAULT_MAX_DURATION_MS = 4500;
const DEFAULT_MIN_DURATION_MS = 1000;
const BASELINE_MS_PER_CHAR = 22;
const MIN_CHAR_INTERVAL_MS = 15; // never strobe
const MAX_CHAR_INTERVAL_MS = 35; // never feel sluggish
const SENTENCE_PAUSE_MS = 90; // after . ? !
const PHRASE_PAUSE_MS = 35; // after , ; :

const SENTENCE_PUNCT = new Set(['.', '!', '?']);
const PHRASE_PUNCT = new Set([',', ';', ':']);

/**
 * Simulates a typewriter effect on the consumer side while the backend
 * returns the full response in a single payload. Intended to be hosted by
 * a leaf component (e.g. a chat bubble) so the parent screen is not
 * re-rendered on every character tick.
 */
export function useTypewriter({
  fullText,
  enabled = true,
  maxDurationMs = DEFAULT_MAX_DURATION_MS,
  minDurationMs = DEFAULT_MIN_DURATION_MS,
  punctuationPauses = true,
  onComplete,
}: UseTypewriterOptions): UseTypewriterResult {
  const [displayedText, setDisplayedText] = useState<string>(() =>
    enabled && fullText ? '' : fullText ?? '',
  );
  const [isTyping, setIsTyping] = useState<boolean>(false);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fullTextRef = useRef<string>(fullText);
  const onCompleteRef = useRef<typeof onComplete>(onComplete);
  const isMountedRef = useRef<boolean>(true);

  // Keep refs current without retriggering the typing effect.
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    fullTextRef.current = fullText;
  }, [fullText]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  const clearScheduled = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const skipToEnd = useCallback(() => {
    clearScheduled();
    if (!isMountedRef.current) return;
    setDisplayedText(fullTextRef.current);
    setIsTyping(false);
    onCompleteRef.current?.();
  }, [clearScheduled]);

  useEffect(() => {
    clearScheduled();

    if (!fullText) {
      setDisplayedText('');
      setIsTyping(false);
      return;
    }

    if (!enabled) {
      setDisplayedText(fullText);
      setIsTyping(false);
      onCompleteRef.current?.();
      return;
    }

    const length = fullText.length;

    // Aim for ~22ms/char, but clamp the total between min and max duration.
    // For very long messages this means we'll plateau at MIN_CHAR_INTERVAL_MS
    // and slightly exceed maxDurationMs — acceptable, the consumer can call
    // skipToEnd() if needed.
    const targetDuration = Math.max(
      minDurationMs,
      Math.min(maxDurationMs, length * BASELINE_MS_PER_CHAR),
    );
    const idealInterval = targetDuration / length;
    const charInterval = Math.max(
      MIN_CHAR_INTERVAL_MS,
      Math.min(MAX_CHAR_INTERVAL_MS, idealInterval),
    );

    setDisplayedText('');
    setIsTyping(true);

    let index = 0;

    const writeNext = () => {
      if (!isMountedRef.current) return;

      if (index >= length) {
        timeoutRef.current = null;
        setIsTyping(false);
        onCompleteRef.current?.();
        return;
      }

      index += 1;
      setDisplayedText(fullText.slice(0, index));

      // Decide the delay BEFORE writing the next char, based on the char we
      // just wrote. This means a period adds a pause after itself, not before.
      const justWrote = fullText[index - 1];
      let nextDelay = charInterval;
      if (punctuationPauses) {
        if (SENTENCE_PUNCT.has(justWrote)) {
          nextDelay += SENTENCE_PAUSE_MS;
        } else if (PHRASE_PUNCT.has(justWrote)) {
          nextDelay += PHRASE_PAUSE_MS;
        }
      }

      timeoutRef.current = setTimeout(writeNext, nextDelay);
    };

    // Emit the first char synchronously so the bubble never flashes empty.
    writeNext();

    return () => {
      clearScheduled();
    };
  }, [
    fullText,
    enabled,
    maxDurationMs,
    minDurationMs,
    punctuationPauses,
    clearScheduled,
  ]);

  return { displayedText, isTyping, skipToEnd };
}
