import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme } from '@/contexts/ThemeContext';

import type { LoadingMiniGameGameProps } from '../LoadingMiniGame';
import { createLoadingMiniGameChrome } from '../loadingMiniGameChrome';
import { triggerLoadingMiniGameHaptic } from '../loadingMiniGameHaptics';

import { MINI_GAME_EASING } from './MiniGameFrame';

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

interface AnimatedTargetProps {
  target: Target;
  markerStyle: ReturnType<typeof createLoadingMiniGameChrome>['styles']['marker'];
  toneStyle: ReturnType<typeof createLoadingMiniGameChrome>['styles']['markerPrimary'];
  bonusStyle?: ReturnType<typeof createLoadingMiniGameChrome>['styles']['markerBonus'];
  gradientFillStyle: ReturnType<typeof createLoadingMiniGameChrome>['styles']['markerGradientFill'];
  gradientColors: readonly [string, string];
  accessibilityLabel: string;
  onPress: () => void;
}

function AnimatedTarget({
  target,
  markerStyle,
  toneStyle,
  bonusStyle,
  gradientFillStyle,
  gradientColors,
  accessibilityLabel,
  onPress,
}: AnimatedTargetProps) {
  const scale = useRef(new Animated.Value(0.55)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        friction: 5,
        tension: 140,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 160,
        easing: MINI_GAME_EASING.uiOut,
        useNativeDriver: true,
      }),
    ]).start();
  }, [scale, opacity]);

  const handlePress = useCallback(() => {
    Animated.sequence([
      Animated.timing(scale, {
        toValue: 1.2,
        duration: 60,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 0.4,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
    Animated.timing(opacity, {
      toValue: 0,
      duration: 120,
      useNativeDriver: true,
    }).start();
    onPress();
  }, [scale, opacity, onPress]);

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        markerStyle,
        toneStyle,
        bonusStyle,
        {
          height: target.size,
          left: `${target.x}%`,
          top: `${target.y}%`,
          width: target.size,
          borderRadius: target.size / 2,
          opacity,
          transform: [{ scale }], borderCurve: 'continuous',
        },
      ]}
    >
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0.2, y: 0.15 }}
        end={{ x: 0.85, y: 0.95 }}
        style={[gradientFillStyle, { borderRadius: target.size / 2, borderCurve: 'continuous' }]}
        pointerEvents="none"
      />
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        hitSlop={8}
        onPress={handlePress}
        style={StyleSheet.absoluteFill}
        testID="tap-target"
      />
    </Animated.View>
  );
}

export function TapTargetsGame({
  accentColor,
  active,
  compact,
  durationHintMs,
  labels,
  onComplete,
  variant,
  cardHeight,
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
        cardHeight,
      }),
    [accentColor, colors, compact, isDark, variant, cardHeight],
  );
  const { styles, gradients } = chrome;
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [targets, setTargets] = useState<Target[]>([]);
  const nextTargetIdRef = useRef(0);
  const targetTimeoutsRef = useRef<Map<number, TimeoutHandle>>(new Map());
  const spawnMs = resolveSpawnMs(compact, durationHintMs);
  const visibleMs = compact ? 1450 : 1700;
  const scoreScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (score === 0) {
      return;
    }
    Animated.sequence([
      Animated.timing(scoreScale, {
        toValue: 1.16,
        duration: 110,
        useNativeDriver: true,
      }),
      Animated.spring(scoreScale, {
        toValue: 1,
        friction: 5,
        tension: 120,
        useNativeDriver: true,
      }),
    ]).start();
  }, [score, scoreScale]);

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
      <LinearGradient
        colors={gradients.card}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.cardGradientOverlay}
        pointerEvents="none"
      />

      <View style={styles.header}>
        <View style={styles.titleBlock}>
          <Text numberOfLines={1} style={styles.title}>
            {labels.title}
          </Text>
          <Text numberOfLines={1} style={styles.prompt}>
            {labels.prompt}
          </Text>
        </View>
        <Animated.View
          style={[styles.score, { transform: [{ scale: scoreScale }] }]}
          testID="tap-targets-score"
        >
          <LinearGradient
            colors={gradients.score}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.scoreGradient}
            pointerEvents="none"
          />
          <Text numberOfLines={1} style={styles.scoreText}>
            {labels.score} {score}
          </Text>
        </Animated.View>
      </View>

      <View style={styles.playfield} testID="tap-targets-playfield">
        <LinearGradient
          colors={gradients.playfieldAmbient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.playfieldAmbient}
          pointerEvents="none"
        />
        {targets.map((target) => {
          const gradientColors =
            target.kind === 'bonus'
              ? gradients.markerBonus
              : target.tone === 'warm'
                ? gradients.markerSecondary
                : gradients.markerPrimary;
          return (
            <AnimatedTarget
              key={target.id}
              target={target}
              markerStyle={styles.marker}
              toneStyle={
                target.tone === 'warm' ? styles.markerSecondary : styles.markerPrimary
              }
              bonusStyle={target.kind === 'bonus' ? styles.markerBonus : undefined}
              gradientFillStyle={styles.markerGradientFill}
              gradientColors={gradientColors}
              accessibilityLabel={labels.prompt}
              onPress={() => handleTargetPress(target)}
            />
          );
        })}
      </View>
    </View>
  );
}
