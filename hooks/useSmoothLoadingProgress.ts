import { useEffect, useRef, useState } from 'react';

const DEFAULT_HOLD_PERCENT = 97;
const DEFAULT_FINISH_DURATION_MS = 450;
const PROGRESS_TICK_MS = 50;

type SmoothLoadingProgressPhase = 'idle' | 'running' | 'finishing' | 'complete';

interface UseSmoothLoadingProgressOptions {
  active: boolean;
  done: boolean;
  durationMs: number;
  holdPercent?: number;
  finishDurationMs?: number;
}

interface SmoothLoadingProgressState {
  progress: number;
  isFinishing: boolean;
  isComplete: boolean;
  shouldShowLoading: boolean;
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, value));
}

export function useSmoothLoadingProgress({
  active,
  done,
  durationMs,
  holdPercent = DEFAULT_HOLD_PERCENT,
  finishDurationMs = DEFAULT_FINISH_DURATION_MS,
}: UseSmoothLoadingProgressOptions): SmoothLoadingProgressState {
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<SmoothLoadingProgressPhase>('idle');
  const progressRef = useRef(0);
  const hasActiveCycleRef = useRef(false);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const resolvedHoldPercent = Math.min(99, clampPercent(holdPercent));
    const resolvedDurationMs = Math.max(1, durationMs);
    const resolvedFinishDurationMs = Math.max(1, finishDurationMs);

    if (!active) {
      hasActiveCycleRef.current = false;
      progressRef.current = 0;
      setProgress(0);
      setPhase('idle');
      return undefined;
    }

    if (done) {
      if (!hasActiveCycleRef.current) {
        progressRef.current = 100;
        setProgress(100);
        setPhase('complete');
        return undefined;
      }

      const startedAtMs = Date.now();
      const startProgress = Math.min(99, clampPercent(progressRef.current));

      setPhase('finishing');

      const finish = () => {
        const elapsedMs = Date.now() - startedAtMs;
        const ratio = Math.min(1, elapsedMs / resolvedFinishDurationMs);
        const nextProgress = startProgress + (100 - startProgress) * ratio;

        progressRef.current = nextProgress;
        setProgress(nextProgress);

        if (ratio >= 1) {
          if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
          }
          progressRef.current = 100;
          setProgress(100);
          setPhase('complete');
        }
      };

      finish();
      intervalId = setInterval(finish, PROGRESS_TICK_MS);

      return () => {
        if (intervalId) {
          clearInterval(intervalId);
        }
      };
    }

    hasActiveCycleRef.current = true;
    progressRef.current = 0;
    setProgress(0);
    setPhase('running');

    const startedAtMs = Date.now();
    const tick = () => {
      const elapsedMs = Date.now() - startedAtMs;
      const ratio = Math.min(1, elapsedMs / resolvedDurationMs);
      const nextProgress = Math.min(
        resolvedHoldPercent,
        resolvedHoldPercent * ratio,
      );

      progressRef.current = nextProgress;
      setProgress(nextProgress);
    };

    tick();
    intervalId = setInterval(tick, PROGRESS_TICK_MS);

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [active, done, durationMs, finishDurationMs, holdPercent]);

  const isFinishing = phase === 'finishing';
  const isComplete = phase === 'complete';
  const shouldShowLoading =
    active && (!done || phase === 'running' || phase === 'finishing');

  return {
    progress: clampPercent(progress),
    isFinishing,
    isComplete,
    shouldShowLoading,
  };
}
