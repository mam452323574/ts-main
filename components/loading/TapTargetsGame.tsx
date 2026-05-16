import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useTheme } from '@/contexts/ThemeContext';

import type { LoadingMiniGameGameProps } from './LoadingMiniGame';
import { createLoadingMiniGameChrome } from './loadingMiniGameChrome';
import { triggerLoadingMiniGameHaptic } from './loadingMiniGameHaptics';

interface Target {
  id: number;
  kind: 'standard' | 'bonus';
  size: number;
  tone: 'cool' | 'warm';
  value: number;
  x: number;
  y: number;
}

type TimeoutHandle = ReturnType<typeof setTimeout>;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

function resolveSpawnMs(compact: boolean, durationHintMs?: number) {
  const base = compact ? 880 : 740;
  if (!durationHintMs) {
    return base;
  }

  return clamp(Math.round(durationHintMs / 30), compact ? 620 : 660, base);
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
  const [streak, setStreak] = useState(0);
  const [targets, setTargets] = useState<Target[]>([]);
  const nextTargetIdRef = useRef(0);
  const targetTimeoutsRef = useRef<Map<number, TimeoutHandle>>(new Map());
  const spawnMs = resolveSpawnMs(compact, durationHintMs);
  const visibleMs = compact ? 1450 : 1700;

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
    const isBonus = Math.random() < 0.16;
    const baseSize = compact ? 28 : 36;
    const sizeRange = isBonus ? 8 : 6;

    const target: Target = {
      id,
      kind: isBonus ? 'bonus' : 'standard',
      size: baseSize + Math.round(Math.random() * sizeRange),
      tone: Math.random() > 0.5 ? 'cool' : 'warm',
      value: isBonus ? 3 : 1,
      x: Math.round(6 + Math.random() * 82),
      y: Math.round(10 + Math.random() * 70),
    };

    setTargets((currentTargets) => [...currentTargets.slice(-5), target]);

    const timeout = setTimeout(() => {
      targetTimeoutsRef.current.delete(id);
      setTargets((currentTargets) =>
        currentTargets.filter((currentTarget) => currentTarget.id !== id),
      );
      setStreak(0);
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
    (target: Target) => {
      clearTargetTimeout(target.id);
      setTargets((currentTargets) =>
        currentTargets.filter((currentTarget) => currentTarget.id !== target.id),
      );
      setStreak((currentStreak) => {
        const nextStreak = currentStreak + 1;
        const streakBonus = nextStreak > 0 && nextStreak % 3 === 0 ? 1 : 0;
        setScore((currentScore) => currentScore + target.value + streakBonus);
        triggerLoadingMiniGameHaptic(
          target.kind === 'bonus' || streakBonus > 0 ? 'bonus' : 'success',
        );
        return nextStreak;
      });
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
            onPress={() => handleTargetPress(target)}
            style={[
              styles.marker,
              target.tone === 'warm'
                ? styles.markerSecondary
                : styles.markerPrimary,
              target.kind === 'bonus' && styles.markerBonus,
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
