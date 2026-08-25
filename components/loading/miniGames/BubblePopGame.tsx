import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import type { LoadingMiniGameGameProps } from '../LoadingMiniGame';
import { triggerLoadingMiniGameHaptic } from '../loadingMiniGameHaptics';

import {
  MINI_GAME_EASING,
  MiniGameFrame,
  useGameCompletion,
  useMiniGameChrome,
  useScoreBump,
} from './MiniGameFrame';

interface Bubble {
  id: number;
  x: number;
  size: number;
  durationMs: number;
  bonus: boolean;
}

function makeBubble(id: number, compact: boolean): Bubble {
  const bonus = Math.random() < 0.13;
  return {
    id,
    x: 8 + Math.random() * 84,
    size: (compact ? 26 : 32) + Math.round(Math.random() * (bonus ? 8 : 5)),
    durationMs: 2400 + Math.random() * 1000,
    bonus,
  };
}

interface AnimatedBubbleProps {
  bubble: Bubble;
  chrome: ReturnType<typeof useMiniGameChrome>;
  accessibilityLabel: string;
  onPress: () => void;
  onExit: () => void;
}

function AnimatedBubble({ bubble, chrome, accessibilityLabel, onPress, onExit }: AnimatedBubbleProps) {
  const progress = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.5)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const onExitRef = useRef(onExit);
  const onPressRef = useRef(onPress);
  useEffect(() => {
    onExitRef.current = onExit;
    onPressRef.current = onPress;
  }, [onExit, onPress]);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 5, tension: 140, useNativeDriver: true }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 160,
        easing: MINI_GAME_EASING.uiOut,
        useNativeDriver: true,
      }),
    ]).start();
    const travel = Animated.timing(progress, {
      toValue: 1,
      duration: bubble.durationMs,
      easing: MINI_GAME_EASING.motionOut,
      useNativeDriver: false,
    });
    travel.start(({ finished }) => {
      if (finished) onExitRef.current();
    });
    return () => travel.stop();
  }, [bubble.durationMs, opacity, progress, scale]);

  const handlePress = useCallback(() => {
    Animated.sequence([
      Animated.timing(scale, {
        toValue: 1.4,
        duration: 80,
        easing: MINI_GAME_EASING.uiOut,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 0.3,
        duration: 120,
        easing: MINI_GAME_EASING.uiOut,
        useNativeDriver: true,
      }),
    ]).start();
    Animated.timing(opacity, {
      toValue: 0,
      duration: 160,
      easing: MINI_GAME_EASING.uiOut,
      useNativeDriver: true,
    }).start();
    onPressRef.current();
  }, [opacity, scale]);

  const top = progress.interpolate({ inputRange: [0, 1], outputRange: ['98%', '-10%'] });

  return (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: `${bubble.x}%`,
        top,
        width: bubble.size,
        height: bubble.size,
      }}
    >
      <Animated.View
        pointerEvents="box-none"
        style={[
          chrome.styles.marker,
          bubble.bonus ? chrome.styles.markerBonus : chrome.styles.markerSecondary,
          {
            top: 0,
            left: 0,
            height: bubble.size,
            width: bubble.size,
            borderRadius: bubble.size / 2,
            opacity,
            transform: [{ scale }],
            borderCurve: 'continuous',
          },
        ]}
      >
        <LinearGradient
          colors={bubble.bonus ? chrome.gradients.markerBonus : chrome.gradients.markerSecondary}
          start={{ x: 0.3, y: 0.1 }}
          end={{ x: 0.7, y: 0.95 }}
          style={[chrome.styles.markerGradientFill, { borderRadius: bubble.size / 2, borderCurve: 'continuous' }]}
          pointerEvents="none"
        />
        <Pressable
          accessibilityLabel={accessibilityLabel}
          accessibilityRole="button"
          hitSlop={8}
          onPress={handlePress}
          style={StyleSheet.absoluteFill}
          testID={bubble.bonus ? 'bubble-pop-bonus' : 'bubble-pop-bubble'}
        />
      </Animated.View>
    </Animated.View>
  );
}

export function BubblePopGame({
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
  const [score, setScore] = useState(0);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const nextIdRef = useRef(0);
  const scoreScale = useScoreBump(score);
  useGameCompletion(active, durationHintMs, onComplete);

  const spawnMs = compact ? 700 : 620;

  useEffect(() => {
    if (!active) {
      setBubbles([]);
      return undefined;
    }
    const spawn = () => {
      const id = nextIdRef.current++;
      setBubbles((current) => [...current.slice(-6), makeBubble(id, compact)]);
    };
    spawn();
    const interval = setInterval(spawn, spawnMs);
    return () => clearInterval(interval);
  }, [active, compact, spawnMs]);

  const handlePress = useCallback((bubble: Bubble) => {
    setBubbles((current) => current.filter((b) => b.id !== bubble.id));
    setScore((s) => s + (bubble.bonus ? 3 : 1));
    triggerLoadingMiniGameHaptic(bubble.bonus ? 'bonus' : 'success');
  }, []);

  const handleExit = useCallback((bubble: Bubble) => {
    setBubbles((current) => current.filter((b) => b.id !== bubble.id));
  }, []);

  if (!active) return null;

  return (
    <MiniGameFrame
      chrome={chrome}
      labels={labels}
      score={score}
      scoreScale={scoreScale}
      testID="bubble-pop-game"
      scoreTestID="bubble-pop-score"
      playfieldTestID="bubble-pop-playfield"
      playfieldChildren={bubbles.map((bubble) => (
        <AnimatedBubble
          key={bubble.id}
          bubble={bubble}
          chrome={chrome}
          accessibilityLabel={labels.prompt}
          onPress={() => handlePress(bubble)}
          onExit={() => handleExit(bubble)}
        />
      ))}
    />
  );
}
