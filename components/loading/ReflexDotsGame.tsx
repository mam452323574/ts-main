import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useTheme } from '@/contexts/ThemeContext';

import type { LoadingMiniGameGameProps } from './LoadingMiniGame';
import { createLoadingMiniGameChrome } from './loadingMiniGameChrome';

interface Signal {
  id: number;
  isDecoy: boolean;
  size: number;
  x: number;
  y: number;
}

type TimeoutHandle = ReturnType<typeof setTimeout>;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

function resolveSpawnMs(compact: boolean, durationHintMs?: number) {
  const base = compact ? 620 : 440;
  if (!durationHintMs) {
    return base;
  }

  return clamp(Math.round(durationHintMs / 44), 360, base);
}

export function ReflexDotsGame({
  accentColor,
  active,
  compact,
  durationHintMs,
  labels,
  onComplete,
  variant,
}: LoadingMiniGameGameProps) {
  const { colors, isDark } = useTheme();
  const chrome = useMemo(
    () =>
      createLoadingMiniGameChrome({
        accentColor,
        colors,
        compact,
        isDark,
        variant,
      }),
    [accentColor, colors, compact, isDark, variant],
  );
  const { styles } = chrome;
  const [score, setScore] = useState(0);
  const [signals, setSignals] = useState<Signal[]>([]);
  const nextSignalIdRef = useRef(0);
  const signalTimeoutsRef = useRef<Map<number, TimeoutHandle>>(new Map());
  const spawnMs = resolveSpawnMs(compact, durationHintMs);
  const visibleMs = compact ? 680 : 780;

  const clearSignalTimeout = useCallback((id: number) => {
    const timeout = signalTimeoutsRef.current.get(id);
    if (typeof timeout !== 'undefined') {
      clearTimeout(timeout);
      signalTimeoutsRef.current.delete(id);
    }
  }, []);

  const clearAllSignalTimeouts = useCallback(() => {
    signalTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
    signalTimeoutsRef.current.clear();
  }, []);

  const spawnSignal = useCallback(() => {
    const id = nextSignalIdRef.current;
    nextSignalIdRef.current += 1;

    const signal: Signal = {
      id,
      isDecoy: Math.random() < 0.22,
      size: compact ? 22 : 26,
      x: Math.round(8 + Math.random() * 78),
      y: Math.round(12 + Math.random() * 62),
    };

    setSignals((currentSignals) => [...currentSignals.slice(-5), signal]);

    const timeout = setTimeout(() => {
      signalTimeoutsRef.current.delete(id);
      setSignals((currentSignals) =>
        currentSignals.filter((currentSignal) => currentSignal.id !== id),
      );
    }, visibleMs);

    signalTimeoutsRef.current.set(id, timeout);
  }, [compact, visibleMs]);

  useEffect(() => {
    if (!active) {
      setSignals([]);
      clearAllSignalTimeouts();
      return undefined;
    }

    const interval = setInterval(spawnSignal, spawnMs);
    spawnSignal();

    return () => {
      clearInterval(interval);
      clearAllSignalTimeouts();
    };
  }, [active, clearAllSignalTimeouts, spawnMs, spawnSignal]);

  useEffect(() => {
    if (!active || !durationHintMs || !onComplete) {
      return undefined;
    }

    const timeout = setTimeout(onComplete, Math.max(1000, durationHintMs));
    return () => clearTimeout(timeout);
  }, [active, durationHintMs, onComplete]);

  const handleSignalPress = useCallback(
    (signal: Signal) => {
      clearSignalTimeout(signal.id);
      setSignals((currentSignals) =>
        currentSignals.filter((currentSignal) => currentSignal.id !== signal.id),
      );
      setScore((currentScore) =>
        signal.isDecoy ? Math.max(0, currentScore - 1) : currentScore + 1,
      );
    },
    [clearSignalTimeout],
  );

  if (!active) {
    return null;
  }

  return (
    <View style={styles.card} testID="reflex-dots-game">
      <View style={styles.header}>
        <View style={styles.titleBlock}>
          <Text numberOfLines={1} style={styles.title}>
            {labels.title}
          </Text>
          <Text numberOfLines={1} style={styles.prompt}>
            {labels.reflexDotsPrompt}
          </Text>
        </View>
        <Text numberOfLines={1} style={styles.score} testID="reflex-dots-score">
          {labels.score} {score}
        </Text>
      </View>

      <View style={styles.playfield} testID="reflex-dots-playfield">
        {signals.map((signal) => (
          <Pressable
            accessibilityLabel={labels.reflexDotsPrompt}
            accessibilityRole="button"
            hitSlop={8}
            key={signal.id}
            onPress={() => handleSignalPress(signal)}
            style={[
              styles.marker,
              signal.isDecoy ? styles.markerDanger : styles.markerSecondary,
              {
                height: signal.size,
                left: `${signal.x}%`,
                top: `${signal.y}%`,
                width: signal.size,
                borderRadius: signal.size / 2,
              },
            ]}
            testID={signal.isDecoy ? 'reflex-signal-decoy' : 'reflex-signal-good'}
          />
        ))}
      </View>
    </View>
  );
}
