import { act, renderHook } from '@testing-library/react-native';

import { useTypewriter } from '@/hooks/useTypewriter';

describe('useTypewriter', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('returns the full text immediately when disabled', () => {
    const onComplete = jest.fn();
    const { result } = renderHook(() =>
      useTypewriter({
        fullText: 'Hello world',
        enabled: false,
        onComplete,
      }),
    );

    expect(result.current.displayedText).toBe('Hello world');
    expect(result.current.isTyping).toBe(false);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('returns an empty string when fullText is empty', () => {
    const { result } = renderHook(() =>
      useTypewriter({ fullText: '', enabled: true }),
    );

    expect(result.current.displayedText).toBe('');
    expect(result.current.isTyping).toBe(false);
  });

  it('reveals characters progressively when enabled', () => {
    const onComplete = jest.fn();
    const { result } = renderHook(() =>
      useTypewriter({
        fullText: 'abcdef',
        enabled: true,
        onComplete,
      }),
    );

    // First character is emitted synchronously in the effect.
    expect(result.current.displayedText).toBe('a');
    expect(result.current.isTyping).toBe(true);

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(result.current.displayedText).toBe('abcdef');
    expect(result.current.isTyping).toBe(false);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('skipToEnd reveals the full text and stops typing', () => {
    const onComplete = jest.fn();
    const { result } = renderHook(() =>
      useTypewriter({
        fullText: 'one two three four',
        enabled: true,
        onComplete,
      }),
    );

    expect(result.current.isTyping).toBe(true);

    act(() => {
      result.current.skipToEnd();
    });

    expect(result.current.displayedText).toBe('one two three four');
    expect(result.current.isTyping).toBe(false);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('restarts the animation when fullText changes', () => {
    const { result, rerender } = renderHook(
      ({ text }: { text: string }) =>
        useTypewriter({ fullText: text, enabled: true }),
      { initialProps: { text: 'first' } },
    );

    expect(result.current.displayedText).toBe('f');

    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(result.current.displayedText).toBe('first');

    rerender({ text: 'second message' });

    // New animation restarts from the first char of the new text.
    expect(result.current.displayedText).toBe('s');
    expect(result.current.isTyping).toBe(true);

    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(result.current.displayedText).toBe('second message');
  });

  it('clears the scheduled timeout when unmounted', () => {
    const onComplete = jest.fn();
    const { unmount } = renderHook(() =>
      useTypewriter({
        fullText: 'this is a longer message that takes a while to type out',
        enabled: true,
        onComplete,
      }),
    );

    unmount();

    act(() => {
      jest.advanceTimersByTime(10_000);
    });

    // onComplete must NOT fire after unmount.
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('applies a longer delay after sentence-ending punctuation', () => {
    // Two messages with the same length but different punctuation. The one
    // with a sentence-ending '.' should still be typing after the same delay
    // as the punctuation-free one finishes (approximately).
    const { result: punctuated } = renderHook(() =>
      useTypewriter({
        fullText: 'A. B',
        enabled: true,
        punctuationPauses: true,
      }),
    );

    const { result: smooth } = renderHook(() =>
      useTypewriter({
        fullText: 'AxB',
        enabled: true,
        punctuationPauses: true,
      }),
    );

    // After ~120ms the punctuated text should still be mid-stream because of
    // the extra +90ms pause after '.', while the smooth one progresses
    // through its 3 chars with only the base interval.
    act(() => {
      jest.advanceTimersByTime(120);
    });

    expect(punctuated.current.displayedText.length).toBeLessThanOrEqual(
      smooth.current.displayedText.length,
    );
  });

  it('respects the minimum duration for medium messages', () => {
    // A ~40-char message would normally finish in ~880ms at the 22ms/char
    // baseline. With minDurationMs=1500 the animation should stretch to fill
    // the floor (capped per-char by MAX_CHAR_INTERVAL_MS=35ms → total ~1365ms).
    const fullText = 'A medium-length message for testing ok!';
    const { result } = renderHook(() =>
      useTypewriter({
        fullText,
        enabled: true,
        minDurationMs: 1500,
        punctuationPauses: false,
      }),
    );

    expect(result.current.isTyping).toBe(true);

    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(result.current.isTyping).toBe(true);

    act(() => {
      jest.advanceTimersByTime(700);
    });
    expect(result.current.isTyping).toBe(true);
  });
});
