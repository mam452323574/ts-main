import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme } from '@/contexts/ThemeContext';
import { SPACING, withAlpha } from '@/constants/theme';

import type { LoadingMiniGameGameProps } from '../LoadingMiniGame';
import { triggerLoadingMiniGameHaptic } from '../loadingMiniGameHaptics';

import {
  MINI_GAME_EASING,
  MiniGameFrame,
  useEntryPulse,
  useGameCompletion,
  useMiniGameChrome,
  useScoreBump,
} from './MiniGameFrame';

type Tone = 'cool' | 'warm' | 'bonus';
type Chrome = ReturnType<typeof useMiniGameChrome>;
type TimeoutHandle = ReturnType<typeof setTimeout>;

interface Dot {
  id: number;
  tone: Tone;
  size: number;
  x: number;
  y: number;
}

function pickTone(): Tone {
  const r = Math.random();
  if (r < 0.34) return 'cool';
  if (r < 0.68) return 'warm';
  return 'bonus';
}

interface AnimatedColorDotProps {
  dot: Dot;
  chrome: Chrome;
  accessibilityLabel: string;
  onPress: (dot: Dot) => void;
}

function AnimatedColorDot({ dot, chrome, accessibilityLabel, onPress }: AnimatedColorDotProps) {
  const { scale, opacity } = useEntryPulse();
  const onPressRef = useRef(onPress);
  useEffect(() => {
    onPressRef.current = onPress;
  }, [onPress]);

  const handlePress = useCallback(() => {
    Animated.parallel([
      Animated.timing(scale, {
        toValue: 1.3,
        duration: 80,
        easing: MINI_GAME_EASING.uiOut,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 140,
        easing: MINI_GAME_EASING.uiOut,
        useNativeDriver: true,
      }),
    ]).start();
    onPressRef.current(dot);
  }, [dot, opacity, scale]);

  const toneStyle =
    dot.tone === 'bonus'
      ? chrome.styles.markerBonus
      : dot.tone === 'warm'
        ? chrome.styles.markerSecondary
        : chrome.styles.markerPrimary;
  const gradient =
    dot.tone === 'bonus'
      ? chrome.gradients.markerBonus
      : dot.tone === 'warm'
        ? chrome.gradients.markerSecondary
        : chrome.gradients.markerPrimary;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        chrome.styles.marker,
        toneStyle,
        {
          height: dot.size,
          width: dot.size,
          borderRadius: dot.size / 2,
          left: `${dot.x}%`,
          top: `${dot.y}%`,
          opacity,
          transform: [{ scale }], borderCurve: 'continuous',
        },
      ]}
    >
      <LinearGradient
        colors={gradient}
        start={{ x: 0.2, y: 0.15 }}
        end={{ x: 0.85, y: 0.95 }}
        style={[chrome.styles.markerGradientFill, { borderRadius: dot.size / 2, borderCurve: 'continuous' }]}
        pointerEvents="none"
      />
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        hitSlop={6}
        onPress={handlePress}
        style={StyleSheet.absoluteFill}
        testID={`color-match-dot-${dot.tone}`}
      />
    </Animated.View>
  );
}

export function ColorMatchGame({
  accentColor,
  active,
  compact,
  durationHintMs,
  labels,
  onComplete,
  variant,
  cardHeight,
}: LoadingMiniGameGameProps) {
  const chrome = useMiniGameChrome({ accentColor, compact, variant, cardHeight });
  const { colors, isDark } = useTheme();
  const [score, setScore] = useState(0);
  const [dots, setDots] = useState<Dot[]>([]);
  const [targetTone, setTargetTone] = useState<Tone>('cool');
  const nextIdRef = useRef(0);
  const timeoutsRef = useRef<Map<number, TimeoutHandle>>(new Map());
  const scoreScale = useScoreBump(score);
  const targetScale = useRef(new Animated.Value(1)).current;
  useGameCompletion(active, durationHintMs, onComplete);

  const spawnMs = compact ? 700 : 620;
  const visibleMs = compact ? 1500 : 1700;

  const clearAll = useCallback(() => {
    timeoutsRef.current.forEach((t) => clearTimeout(t));
    timeoutsRef.current.clear();
  }, []);

  const spawnDot = useCallback(() => {
    const id = nextIdRef.current++;
    const dot: Dot = {
      id,
      tone: pickTone(),
      size: (compact ? 26 : 32) + Math.round(Math.random() * 6),
      x: 6 + Math.round(Math.random() * 82),
      y: 10 + Math.round(Math.random() * 72),
    };
    setDots((current) => [...current.slice(-5), dot]);
    const handle = setTimeout(() => {
      timeoutsRef.current.delete(id);
      setDots((current) => current.filter((d) => d.id !== id));
    }, visibleMs);
    timeoutsRef.current.set(id, handle);
  }, [compact, visibleMs]);

  useEffect(() => {
    if (!active) {
      setDots([]);
      clearAll();
      return undefined;
    }
    spawnDot();
    const spawnInterval = setInterval(spawnDot, spawnMs);
    const toneInterval = setInterval(() => {
      setTargetTone((current) => {
        const tones: Tone[] = ['cool', 'warm', 'bonus'];
        const others = tones.filter((t) => t !== current);
        return others[Math.floor(Math.random() * others.length)] ?? 'cool';
      });
      Animated.sequence([
        Animated.timing(targetScale, {
          toValue: 1.25,
          duration: 110,
          easing: MINI_GAME_EASING.uiOut,
          useNativeDriver: true,
        }),
        Animated.spring(targetScale, {
          toValue: 1,
          friction: 4,
          tension: 130,
          useNativeDriver: true,
        }),
      ]).start();
    }, compact ? 2400 : 2800);
    return () => {
      clearInterval(spawnInterval);
      clearInterval(toneInterval);
      clearAll();
    };
  }, [active, clearAll, compact, spawnDot, spawnMs, targetScale]);

  const handleDotPress = useCallback(
    (dot: Dot) => {
      const handle = timeoutsRef.current.get(dot.id);
      if (handle) {
        clearTimeout(handle);
        timeoutsRef.current.delete(dot.id);
      }
      setTimeout(() => {
        setDots((current) => current.filter((d) => d.id !== dot.id));
      }, 140);
      if (dot.tone === targetTone) {
        setScore((s) => s + (dot.tone === 'bonus' ? 3 : 1));
        triggerLoadingMiniGameHaptic(dot.tone === 'bonus' ? 'bonus' : 'success');
      } else {
        setScore((s) => Math.max(0, s - 1));
        triggerLoadingMiniGameHaptic('miss');
      }
    },
    [targetTone],
  );

  const targetGradient = useMemo(() => {
    if (targetTone === 'bonus') return chrome.gradients.markerBonus;
    if (targetTone === 'warm') return chrome.gradients.markerSecondary;
    return chrome.gradients.markerPrimary;
  }, [chrome.gradients, targetTone]);

  const targetIndicatorSize = compact ? 20 : 24;

  const targetIndicator = (
    <Animated.View
      pointerEvents="none"
      style={[
        chrome.styles.marker,
        chrome.styles.markerPrimary,
        {
          position: 'absolute',
          top: SPACING.xs,
          right: SPACING.xs,
          width: targetIndicatorSize,
          height: targetIndicatorSize,
          borderRadius: targetIndicatorSize / 2,
          zIndex: 2,
          transform: [{ scale: targetScale }],
          borderColor: withAlpha(colors.white, isDark ? 0.8 : 0.95),
          borderWidth: 2, borderCurve: 'continuous',
        },
      ]}
      testID="color-match-target"
    >
      <LinearGradient
        colors={targetGradient}
        start={{ x: 0.2, y: 0.15 }}
        end={{ x: 0.85, y: 0.95 }}
        style={[chrome.styles.markerGradientFill, { borderRadius: targetIndicatorSize / 2, borderCurve: 'continuous' }]}
        pointerEvents="none"
      />
    </Animated.View>
  );

  if (!active) {
    return null;
  }

  return (
    <MiniGameFrame
      chrome={chrome}
      labels={labels}
      score={score}
      scoreScale={scoreScale}
      testID="color-match-game"
      scoreTestID="color-match-score"
      playfieldTestID="color-match-playfield"
      playfieldChildren={
        <>
          {targetIndicator}
          {dots.map((dot) => (
            <AnimatedColorDot
              key={dot.id}
              dot={dot}
              chrome={chrome}
              accessibilityLabel={labels.prompt}
              onPress={handleDotPress}
            />
          ))}
        </>
      }
    />
  );
}
