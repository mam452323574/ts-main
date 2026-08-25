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

interface Bug {
  id: number;
  size: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  durationMs: number;
  bonus: boolean;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

function makeBug(id: number, compact: boolean): Bug {
  const horizontal = Math.random() > 0.5;
  const direction = Math.random() > 0.5 ? 1 : -1;
  const baseY = 12 + Math.random() * 64;
  const baseX = 12 + Math.random() * 64;
  const bonus = Math.random() < 0.14;
  return {
    id,
    size: (compact ? 22 : 28) + Math.round(Math.random() * (bonus ? 8 : 5)),
    startX: horizontal ? (direction > 0 ? -10 : 110) : baseX,
    startY: horizontal ? baseY : direction > 0 ? -10 : 110,
    endX: horizontal ? (direction > 0 ? 110 : -10) : baseX,
    endY: horizontal ? baseY : direction > 0 ? 110 : -10,
    durationMs: clamp(2200 + Math.random() * 800, 1800, 3200),
    bonus,
  };
}

interface AnimatedBugProps {
  bug: Bug;
  chrome: ReturnType<typeof useMiniGameChrome>;
  onPress: () => void;
  onExit: () => void;
  accessibilityLabel: string;
}

function AnimatedBug({ bug, chrome, onPress, onExit, accessibilityLabel }: AnimatedBugProps) {
  const progress = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.4)).current;
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
      duration: bug.durationMs,
      easing: MINI_GAME_EASING.linear,
      useNativeDriver: false,
    });
    travel.start(({ finished }) => {
      if (finished) onExitRef.current();
    });
    return () => {
      travel.stop();
    };
  }, [bug.durationMs, opacity, progress, scale]);

  const handlePress = useCallback(() => {
    Animated.parallel([
      Animated.timing(scale, {
        toValue: 0.2,
        duration: 120,
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
    onPressRef.current();
  }, [opacity, scale]);

  const left = progress.interpolate({ inputRange: [0, 1], outputRange: [`${bug.startX}%`, `${bug.endX}%`] });
  const top = progress.interpolate({ inputRange: [0, 1], outputRange: [`${bug.startY}%`, `${bug.endY}%`] });

  return (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left,
        top,
        width: bug.size,
        height: bug.size,
      }}
    >
      <Animated.View
        pointerEvents="box-none"
        style={[
          chrome.styles.marker,
          bug.bonus ? chrome.styles.markerBonus : chrome.styles.markerPrimary,
          {
            top: 0,
            left: 0,
            height: bug.size,
            width: bug.size,
            borderRadius: bug.size / 2,
            opacity,
            transform: [{ scale }],
            borderCurve: 'continuous',
          },
        ]}
      >
        <LinearGradient
          colors={bug.bonus ? chrome.gradients.markerBonus : chrome.gradients.markerPrimary}
          start={{ x: 0.2, y: 0.15 }}
          end={{ x: 0.85, y: 0.95 }}
          style={[chrome.styles.markerGradientFill, { borderRadius: bug.size / 2, borderCurve: 'continuous' }]}
          pointerEvents="none"
        />
        <Pressable
          accessibilityLabel={accessibilityLabel}
          accessibilityRole="button"
          hitSlop={8}
          onPress={handlePress}
          style={StyleSheet.absoluteFill}
          testID={bug.bonus ? 'bug-squash-bonus' : 'bug-squash-bug'}
        />
      </Animated.View>
    </Animated.View>
  );
}

export function BugSquashGame({
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
  const [bugs, setBugs] = useState<Bug[]>([]);
  const nextIdRef = useRef(0);
  const scoreScale = useScoreBump(score);
  useGameCompletion(active, durationHintMs, onComplete);

  const spawnBug = useCallback(() => {
    const id = nextIdRef.current++;
    setBugs((current) => [...current.slice(-5), makeBug(id, compact)]);
  }, [compact]);

  useEffect(() => {
    if (!active) {
      setBugs([]);
      return undefined;
    }
    const spawnMs = compact ? 780 : 700;
    const interval = setInterval(spawnBug, spawnMs);
    spawnBug();
    return () => clearInterval(interval);
  }, [active, compact, spawnBug]);

  const handleBugPress = useCallback(
    (bug: Bug) => {
      setBugs((current) => current.filter((b) => b.id !== bug.id));
      const value = bug.bonus ? 3 : 1;
      setScore((current) => current + value);
      triggerLoadingMiniGameHaptic(bug.bonus ? 'bonus' : 'success');
    },
    [],
  );

  const handleBugExit = useCallback((bug: Bug) => {
    setBugs((current) => current.filter((b) => b.id !== bug.id));
  }, []);

  if (!active) {
    return null;
  }

  return (
    <MiniGameFrame
      chrome={chrome}
      labels={labels}
      score={score}
      scoreScale={scoreScale}
      testID="bug-squash-game"
      scoreTestID="bug-squash-score"
      playfieldTestID="bug-squash-playfield"
      playfieldChildren={bugs.map((bug) => (
        <AnimatedBug
          key={bug.id}
          bug={bug}
          chrome={chrome}
          accessibilityLabel={labels.prompt}
          onPress={() => handleBugPress(bug)}
          onExit={() => handleBugExit(bug)}
        />
      ))}
    />
  );
}
