import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme } from '@/contexts/ThemeContext';

import type { LoadingMiniGameGameProps } from '../LoadingMiniGame';
import { createLoadingMiniGameChrome } from '../loadingMiniGameChrome';
import { triggerLoadingMiniGameHaptic } from '../loadingMiniGameHaptics';

import { MINI_GAME_EASING } from './MiniGameFrame';

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

interface AnimatedSignalProps {
  signal: Signal;
  markerStyle: ReturnType<typeof createLoadingMiniGameChrome>['styles']['marker'];
  toneStyle: ReturnType<typeof createLoadingMiniGameChrome>['styles']['markerPrimary'];
  bonusStyle?: ReturnType<typeof createLoadingMiniGameChrome>['styles']['markerBonus'];
  decoyRingStyle?: ReturnType<typeof createLoadingMiniGameChrome>['styles']['decoyPulseRing'];
  gradientFillStyle: ReturnType<typeof createLoadingMiniGameChrome>['styles']['markerGradientFill'];
  gradientColors: readonly [string, string];
  accessibilityLabel: string;
  testID: string;
  onPress: () => void;
}

function AnimatedSignal({
  signal,
  markerStyle,
  toneStyle,
  bonusStyle,
  decoyRingStyle,
  gradientFillStyle,
  gradientColors,
  accessibilityLabel,
  testID,
  onPress,
}: AnimatedSignalProps) {
  const scale = useRef(new Animated.Value(0.55)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const decoyPulse = useRef(new Animated.Value(0.4)).current;

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

  useEffect(() => {
    if (signal.kind !== 'decoy') {
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(decoyPulse, {
          toValue: 0.95,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(decoyPulse, {
          toValue: 0.4,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [signal.kind, decoyPulse]);

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
          height: signal.size,
          left: `${signal.x}%`,
          top: `${signal.y}%`,
          width: signal.size,
          borderRadius: signal.size / 2,
          opacity,
          transform: [{ scale }], borderCurve: 'continuous',
        },
      ]}
    >
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0.2, y: 0.15 }}
        end={{ x: 0.85, y: 0.95 }}
        style={[gradientFillStyle, { borderRadius: signal.size / 2, borderCurve: 'continuous' }]}
        pointerEvents="none"
      />
      {signal.kind === 'decoy' && decoyRingStyle ? (
        <Animated.View
          pointerEvents="none"
          style={[decoyRingStyle, { opacity: decoyPulse }]}
        />
      ) : null}
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        hitSlop={8}
        onPress={handlePress}
        style={StyleSheet.absoluteFill}
        testID={testID}
      />
    </Animated.View>
  );
}

export function ReflexDotsGame({
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
  const [signals, setSignals] = useState<Signal[]>([]);
  const nextSignalIdRef = useRef(0);
  const signalTimeoutsRef = useRef<Map<number, TimeoutHandle>>(new Map());
  const spawnMs = resolveSpawnMs(compact, durationHintMs);
  const visibleMs = compact ? 1100 : 1280;
  const scoreScale = useRef(new Animated.Value(1)).current;
  const flashOpacity = useRef(new Animated.Value(0)).current;

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
      if (signal.kind === 'decoy') {
        flashOpacity.setValue(0.35);
        Animated.timing(flashOpacity, {
          toValue: 0,
          duration: 280,
          useNativeDriver: true,
        }).start();
      }
      triggerLoadingMiniGameHaptic(
        signal.kind === 'decoy'
          ? 'miss'
          : signal.kind === 'bonus'
            ? 'bonus'
            : 'success',
      );
    },
    [clearSignalTimeout, flashOpacity],
  );

  if (!active) {
    return null;
  }

  return (
    <View style={styles.card} testID="reflex-dots-game">
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
          testID="reflex-dots-score"
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

      <View style={styles.playfield} testID="reflex-dots-playfield">
        <LinearGradient
          colors={gradients.playfieldAmbient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.playfieldAmbient}
          pointerEvents="none"
        />
        {signals.map((signal) => {
          const gradientColors =
            signal.kind === 'decoy'
              ? gradients.markerDanger
              : signal.kind === 'bonus'
                ? gradients.markerBonus
                : gradients.markerSecondary;
          return (
            <AnimatedSignal
              key={signal.id}
              signal={signal}
              markerStyle={styles.marker}
              toneStyle={
                signal.kind === 'decoy' ? styles.markerDanger : styles.markerSecondary
              }
              bonusStyle={signal.kind === 'bonus' ? styles.markerBonus : undefined}
              decoyRingStyle={
                signal.kind === 'decoy' ? styles.decoyPulseRing : undefined
              }
              gradientFillStyle={styles.markerGradientFill}
              gradientColors={gradientColors}
              accessibilityLabel={labels.prompt}
              testID={
                signal.kind === 'decoy'
                  ? 'reflex-signal-decoy'
                  : signal.kind === 'bonus'
                    ? 'reflex-signal-bonus'
                    : 'reflex-signal-good'
              }
              onPress={() => handleSignalPress(signal)}
            />
          );
        })}
        <Animated.View
          pointerEvents="none"
          style={[styles.playfieldFlashOverlay, { opacity: flashOpacity }]}
        />
      </View>
    </View>
  );
}
