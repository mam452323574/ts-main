import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme } from '@/contexts/ThemeContext';
import { mixColors, withAlpha } from '@/constants/theme';

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

type Chrome = ReturnType<typeof useMiniGameChrome>;

interface Dot {
  id: number;
  x: number;
  y: number;
  size: number;
  isOdd: boolean;
}

function distributeDots(count: number): { x: number; y: number }[] {
  const positions: { x: number; y: number }[] = [];
  let attempts = 0;
  while (positions.length < count && attempts < 200) {
    const x = 12 + Math.random() * 76;
    const y = 14 + Math.random() * 70;
    const minDist = 22;
    if (positions.every((p) => Math.hypot(p.x - x, p.y - y) > minDist)) {
      positions.push({ x, y });
    }
    attempts += 1;
  }
  while (positions.length < count) {
    positions.push({ x: 14 + positions.length * 14, y: 50 });
  }
  return positions;
}

interface OddDotProps {
  dot: Dot;
  baseSize: number;
  chrome: Chrome;
  accessibilityLabel: string;
  onPress: (dot: Dot) => void;
  whiteColor: string;
  oddColor: string;
  baseColor: string;
}

function OddDot({
  dot,
  baseSize,
  chrome,
  accessibilityLabel,
  onPress,
  whiteColor,
  oddColor,
  baseColor,
}: OddDotProps) {
  const { scale, opacity } = useEntryPulse();
  const pulseScale = useRef(new Animated.Value(1)).current;
  const onPressRef = useRef(onPress);
  useEffect(() => {
    onPressRef.current = onPress;
  }, [onPress]);

  const handlePress = useCallback(() => {
    Animated.sequence([
      Animated.timing(pulseScale, {
        toValue: 1.22,
        duration: 90,
        easing: MINI_GAME_EASING.uiOut,
        useNativeDriver: true,
      }),
      Animated.spring(pulseScale, {
        toValue: 1,
        friction: 4,
        tension: 130,
        useNativeDriver: true,
      }),
    ]).start();
    onPressRef.current(dot);
  }, [dot, pulseScale]);

  const fill = dot.isOdd && dot.size === baseSize ? oddColor : baseColor;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        chrome.styles.marker,
        chrome.styles.markerPrimary,
        {
          left: `${dot.x}%`,
          top: `${dot.y}%`,
          width: dot.size,
          height: dot.size,
          borderRadius: dot.size / 2,
          marginLeft: -dot.size / 2,
          marginTop: -dot.size / 2,
          backgroundColor: fill,
          borderColor: withAlpha(whiteColor, 0.5),
          opacity,
          transform: [{ scale: Animated.multiply(scale, pulseScale) }], borderCurve: 'continuous',
        },
      ]}
    >
      <LinearGradient
        colors={[withAlpha(whiteColor, 0.32), 'transparent']}
        start={{ x: 0.3, y: 0.1 }}
        end={{ x: 0.7, y: 0.95 }}
        style={[chrome.styles.markerGradientFill, { borderRadius: dot.size / 2, borderCurve: 'continuous' }]}
        pointerEvents="none"
      />
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        hitSlop={6}
        onPress={handlePress}
        style={StyleSheet.absoluteFill}
        testID={`odd-one-out-dot-${dot.id}`}
      />
    </Animated.View>
  );
}

export function OddOneOutGame({
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
  const [round, setRound] = useState(0);
  const [dots, setDots] = useState<Dot[]>([]);
  const scoreScale = useScoreBump(score);
  useGameCompletion(active, durationHintMs, onComplete);

  const baseSize = compact ? 26 : 32;

  useEffect(() => {
    const count = compact ? 5 : 6;
    const oddIndex = Math.floor(Math.random() * count);
    const variation = Math.random() > 0.5 ? 'size' : 'color';
    const positions = distributeDots(count);
    const next: Dot[] = positions.map((p, i) => ({
      id: i,
      x: p.x,
      y: p.y,
      size: variation === 'size' && i === oddIndex ? baseSize + 8 : baseSize,
      isOdd: i === oddIndex,
    }));
    setDots(next);
  }, [baseSize, compact, round]);

  const handlePress = useCallback((dot: Dot) => {
    if (dot.isOdd) {
      setScore((s) => s + 2);
      triggerLoadingMiniGameHaptic('success');
    } else {
      setScore((s) => Math.max(0, s - 1));
      triggerLoadingMiniGameHaptic('miss');
    }
    setTimeout(() => setRound((r) => r + 1), 280);
  }, []);

  if (!active) return null;

  const oddColor = mixColors(chrome.accentColor, colors.warning, 0.45);
  const baseColor = withAlpha(chrome.accentColor, isDark ? 0.42 : 0.32);

  return (
    <MiniGameFrame
      chrome={chrome}
      labels={labels}
      score={score}
      scoreScale={scoreScale}
      testID="odd-one-out-game"
      scoreTestID="odd-one-out-score"
      playfieldTestID="odd-one-out-playfield"
      playfieldChildren={dots.map((dot) => (
        <OddDot
          key={`${dot.id}-${round}`}
          dot={dot}
          baseSize={baseSize}
          chrome={chrome}
          accessibilityLabel={labels.prompt}
          onPress={handlePress}
          whiteColor={colors.white}
          oddColor={oddColor}
          baseColor={baseColor}
        />
      ))}
    />
  );
}
