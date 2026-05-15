import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useTheme } from '@/contexts/ThemeContext';

import type { LoadingMiniGameGameProps } from './LoadingMiniGame';
import { createLoadingMiniGameChrome } from './loadingMiniGameChrome';

interface Target {
  id: number;
  size: number;
  tone: 'cool' | 'warm';
  x: number;
  y: number;
}

type TimeoutHandle = ReturnType<typeof setTimeout>;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

function resolveSpawnMs(compact: boolean, durationHintMs?: number) {
  const base = compact ? 660 : 520;
  if (!durationHintMs) {
    return base;
  }

  return clamp(Math.round(durationHintMs / 36), 430, base);
}

export function TapTargetsGame({
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
  const [targets, setTargets] = useState<Target[]>([]);
  const nextTargetIdRef = useRef(0);
  const targetTimeoutsRef = useRef<Map<number, TimeoutHandle>>(new Map());
  const spawnMs = resolveSpawnMs(compact, durationHintMs);
  const visibleMs = compact ? 900 : 1100;

  const clearTargetTimeout = useCallback((id: number) => {
    const timeout = targetTimeoutsRef.current.get(id);
    if (typeof timeout !== 'undefined') {
      clearTimeout(timeout);
      targetTimeoutsRef.current.delete(id);
    }
  }, []);

  const clearAllTargetTimeouts = useCallback(() => {
    targetTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
    targetTimeoutsRef.current.clear();
  }, []);

  const spawnTarget = useCallback(() => {
    const id = nextTargetIdRef.current;
    nextTargetIdRef.current += 1;

    const target: Target = {
      id,
      size: compact ? 24 : 30,
      tone: Math.random() > 0.5 ? 'cool' : 'warm',
      x: Math.round(8 + Math.random() * 78),
      y: Math.round(12 + Math.random() * 64),
    };

    setTargets((currentTargets) => [...currentTargets.slice(-4), target]);

    const timeout = setTimeout(() => {
      targetTimeoutsRef.current.delete(id);
      setTargets((currentTargets) =>
        currentTargets.filter((currentTarget) => currentTarget.id !== id),
      );
    }, visibleMs);

    targetTimeoutsRef.current.set(id, timeout);
  }, [compact, visibleMs]);

  useEffect(() => {
    if (!active) {
      setTargets([]);
      clearAllTargetTimeouts();
      return undefined;
    }

    const interval = setInterval(spawnTarget, spawnMs);
    spawnTarget();

    return () => {
      clearInterval(interval);
      clearAllTargetTimeouts();
    };
  }, [active, clearAllTargetTimeouts, spawnMs, spawnTarget]);

  useEffect(() => {
    if (!active || !durationHintMs || !onComplete) {
      return undefined;
    }

    const timeout = setTimeout(onComplete, Math.max(1000, durationHintMs));
    return () => clearTimeout(timeout);
  }, [active, durationHintMs, onComplete]);

  const handleTargetPress = useCallback(
    (targetId: number) => {
      clearTargetTimeout(targetId);
      setTargets((currentTargets) =>
        currentTargets.filter((target) => target.id !== targetId),
      );
      setScore((currentScore) => currentScore + 1);
    },
    [clearTargetTimeout],
  );

  if (!active) {
    return null;
  }

  return (
    <View style={styles.card} testID="tap-targets-game">
      <View style={styles.header}>
        <View style={styles.titleBlock}>
          <Text numberOfLines={1} style={styles.title}>
            {labels.title}
          </Text>
          <Text numberOfLines={1} style={styles.prompt}>
            {labels.tapTargetsPrompt}
          </Text>
        </View>
        <Text numberOfLines={1} style={styles.score} testID="tap-targets-score">
          {labels.score} {score}
        </Text>
      </View>

      <View style={styles.playfield} testID="tap-targets-playfield">
        <View style={[styles.trackLine, styles.trackLineTop]} />
        <View style={[styles.trackLine, styles.trackLineBottom]} />
        {targets.map((target) => (
          <Pressable
            accessibilityLabel={labels.tapTargetsPrompt}
            accessibilityRole="button"
            hitSlop={8}
            key={target.id}
            onPress={() => handleTargetPress(target.id)}
            style={[
              styles.marker,
              target.tone === 'warm'
                ? styles.markerSecondary
                : styles.markerPrimary,
              {
                height: target.size,
                left: `${target.x}%`,
                top: `${target.y}%`,
                width: target.size,
                borderRadius: target.size / 2,
              },
            ]}
            testID="tap-target"
          />
        ))}
      </View>
    </View>
  );
}
