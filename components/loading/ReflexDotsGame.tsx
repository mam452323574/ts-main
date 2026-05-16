import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useTheme } from '@/contexts/ThemeContext';

import type { LoadingMiniGameGameProps } from './LoadingMiniGame';
import { createLoadingMiniGameChrome } from './loadingMiniGameChrome';
import { triggerLoadingMiniGameHaptic } from './loadingMiniGameHaptics';

interface Signal {
  id: number;
  kind: 'good' | 'bonus' | 'decoy';
  size: number;
  value: number;
  x: number;
  y: number;
}

type TimeoutHandle = ReturnType<typeof setTimeout>;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

function resolveSpawnMs(compact: boolean, durationHintMs?: number) {
  const base = compact ? 800 : 680;
  if (!durationHintMs) {
    return base;
  }

  return clamp(Math.round(durationHintMs / 34), compact ? 580 : 540, base);
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
  const visibleMs = compact ? 1100 : 1280;

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
    const toneRoll = Math.random();
    const kind = toneRoll < 0.18 ? 'decoy' : toneRoll > 0.86 ? 'bonus' : 'good';
    const baseSize = compact ? 24 : 30;

    const signal: Signal = {
      id,
      kind,
      size: baseSize + Math.round(Math.random() * (kind === 'bonus' ? 7 : 5)),
      value: kind === 'bonus' ? 2 : kind === 'good' ? 1 : -1,
      x: Math.round(6 + Math.random() * 82),
      y: Math.round(10 + Math.random() * 70),
    };

    setSignals((currentSignals) => [...currentSignals.slice(-6), signal]);

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
        signal.value < 0
          ? Math.max(0, currentScore + signal.value)
          : currentScore + signal.value,
      );
      triggerLoadingMiniGameHaptic(
        signal.kind === 'decoy'
          ? 'miss'
          : signal.kind === 'bonus'
            ? 'bonus'
            : 'success',
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
              signal.kind === 'decoy' ? styles.markerDanger : styles.markerSecondary,
              signal.kind === 'bonus' && styles.markerBonus,
              {
                height: signal.size,
                left: `${signal.x}%`,
                top: `${signal.y}%`,
                width: signal.size,
                borderRadius: signal.size / 2,
              },
            ]}
            testID={
              signal.kind === 'decoy'
                ? 'reflex-signal-decoy'
                : signal.kind === 'bonus'
                  ? 'reflex-signal-bonus'
                  : 'reflex-signal-good'
            }
          />
        ))}
      </View>
    </View>
  );
}
