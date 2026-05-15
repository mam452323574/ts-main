import { act, renderHook } from '@testing-library/react-native';

import { useSmoothLoadingProgress } from '@/hooks/useSmoothLoadingProgress';

const baseOptions = {
  active: true,
  done: false,
  durationMs: 30_000,
  holdPercent: 97,
  finishDurationMs: 450,
};

describe('useSmoothLoadingProgress', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('starts at zero when activated', () => {
    const { result } = renderHook(() => useSmoothLoadingProgress(baseOptions));

    expect(result.current.progress).toBe(0);
    expect(result.current.shouldShowLoading).toBe(true);
    expect(result.current.isComplete).toBe(false);
  });

  it('moves close to the hold percentage after the expected duration', () => {
    const { result } = renderHook(() => useSmoothLoadingProgress(baseOptions));

    act(() => {
      jest.advanceTimersByTime(30_000);
    });

    expect(result.current.progress).toBeGreaterThanOrEqual(96.5);
    expect(result.current.progress).toBeLessThanOrEqual(97);
  });

  it('does not reach 100 before done is true', () => {
    const { result } = renderHook(() => useSmoothLoadingProgress(baseOptions));

    act(() => {
      jest.advanceTimersByTime(60_000);
    });

    expect(result.current.progress).toBe(97);
    expect(result.current.isComplete).toBe(false);
    expect(result.current.shouldShowLoading).toBe(true);
  });

  it('finishes quickly once done becomes true', () => {
    const { result, rerender } = renderHook(
      (options: typeof baseOptions) => useSmoothLoadingProgress(options),
      { initialProps: baseOptions },
    );

    act(() => {
      jest.advanceTimersByTime(10_000);
    });

    rerender({ ...baseOptions, done: true });

    expect(result.current.isFinishing).toBe(true);
    expect(result.current.shouldShowLoading).toBe(true);

    act(() => {
      jest.advanceTimersByTime(450);
    });

    expect(result.current.progress).toBe(100);
    expect(result.current.isComplete).toBe(true);
    expect(result.current.shouldShowLoading).toBe(false);
  });

  it('cleans timers on unmount', () => {
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
    const { unmount } = renderHook(() => useSmoothLoadingProgress(baseOptions));

    unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});
