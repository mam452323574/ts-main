import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable } from 'react-native';

import { useTheme } from '@/contexts/ThemeContext';
import { withAlpha } from '@/constants/theme';

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

interface Waypoint {
  x: number;
  y: number;
}

function makeWaypoints(round: number): Waypoint[] {
  const count = 4 + (round % 3);
  const points: Waypoint[] = [{ x: 10, y: 50 }];
  for (let i = 1; i < count - 1; i++) {
    const t = i / (count - 1);
    const x = 10 + t * 80 + (Math.random() - 0.5) * 12;
    const y = 50 + (Math.random() - 0.5) * 60;
    points.push({ x, y: Math.max(15, Math.min(85, y)) });
  }
  points.push({ x: 90, y: 50 });
  return points;
}

interface PathDotProps {
  idx: number;
  wp: Waypoint;
  size: number;
  chrome: Chrome;
  isNext: boolean;
  completed: boolean;
  accessibilityLabel: string;
  onPress: (index: number) => void;
  goldColor: string;
  whiteColor: string;
  isDark: boolean;
}

function PathDot({
  idx,
  wp,
  size,
  chrome,
  isNext,
  completed,
  accessibilityLabel,
  onPress,
  goldColor,
  whiteColor,
  isDark,
}: PathDotProps) {
  const { scale, opacity } = useEntryPulse();
  const pulseScale = useRef(new Animated.Value(1)).current;
  const onPressRef = useRef(onPress);
  useEffect(() => {
    onPressRef.current = onPress;
  }, [onPress]);

  useEffect(() => {
    if (completed) {
      Animated.sequence([
        Animated.timing(pulseScale, {
          toValue: 1.3,
          duration: 100,
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
    }
  }, [completed, pulseScale]);

  const handlePress = useCallback(() => {
    onPressRef.current(idx);
  }, [idx]);

  return (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: `${wp.x}%`,
        top: `${wp.y}%`,
        width: size,
        height: size,
        borderRadius: size / 2,
        marginLeft: -size / 2,
        marginTop: -size / 2,
        backgroundColor: completed
          ? chrome.accentColor
          : isNext
            ? withAlpha(goldColor, 0.85)
            : withAlpha(chrome.accentColor, isDark ? 0.3 : 0.2),
        borderColor: withAlpha(whiteColor, isNext ? 0.95 : 0.4),
        borderWidth: isNext ? 2.5 : 1,
        opacity,
        transform: [{ scale: Animated.multiply(scale, pulseScale) }], borderCurve: 'continuous',
      }}
    >
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        hitSlop={10}
        onPress={handlePress}
        style={{ flex: 1 }}
        testID={`path-trace-wp-${idx}`}
      />
    </Animated.View>
  );
}

interface PathSegmentProps {
  midX: number;
  midY: number;
  length: number;
  angleDeg: number;
  completed: boolean;
  chrome: Chrome;
  isDark: boolean;
}

function PathSegment({ midX, midY, length, angleDeg, completed, chrome, isDark }: PathSegmentProps) {
  const op = useRef(new Animated.Value(completed ? 1 : 0.3)).current;
  useEffect(() => {
    Animated.timing(op, {
      toValue: completed ? 1 : 0.3,
      duration: 240,
      easing: MINI_GAME_EASING.uiOut,
      useNativeDriver: true,
    }).start();
  }, [completed, op]);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: `${midX}%`,
        top: `${midY}%`,
        width: `${length}%`,
        height: 4,
        marginTop: -2,
        borderRadius: 2,
        transform: [
          { translateX: -((length / 2) * 0.01 * 100) / 2 - 60 },
          { rotate: `${angleDeg}deg` },
        ],
        backgroundColor: chrome.accentColor,
        opacity: op, borderCurve: 'continuous',
      }}
    />
  );
}

export function PathTraceGame({
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
  const waypoints = useMemo(() => makeWaypoints(round), [round]);
  const [reached, setReached] = useState<number>(0);
  const scoreScale = useScoreBump(score);
  useGameCompletion(active, durationHintMs, onComplete);

  const handleWaypointTouch = useCallback(
    (index: number) => {
      if (index === reached) {
        const next = reached + 1;
        if (next >= waypoints.length) {
          setScore((s) => s + waypoints.length);
          triggerLoadingMiniGameHaptic('bonus');
          setTimeout(() => {
            setRound((r) => r + 1);
            setReached(0);
          }, 500);
        } else {
          setReached(next);
          triggerLoadingMiniGameHaptic('success');
        }
      } else if (index < reached) {
        // already passed, ignore
      } else {
        setReached(0);
        setScore((s) => Math.max(0, s - 1));
        triggerLoadingMiniGameHaptic('miss');
      }
    },
    [reached, waypoints.length],
  );

  if (!active) return null;

  const dotSize = compact ? 18 : 22;

  return (
    <MiniGameFrame
      chrome={chrome}
      labels={labels}
      score={score}
      scoreScale={scoreScale}
      testID="path-trace-game"
      scoreTestID="path-trace-score"
      playfieldTestID="path-trace-playfield"
      playfieldChildren={
        <>
          {waypoints.slice(0, -1).map((wp, idx) => {
            const next = waypoints[idx + 1]!;
            const midX = (wp.x + next.x) / 2;
            const midY = (wp.y + next.y) / 2;
            const dx = next.x - wp.x;
            const dy = next.y - wp.y;
            const length = Math.hypot(dx, dy);
            const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
            const completed = idx < reached;
            return (
              <PathSegment
                key={`seg-${idx}-${round}`}
                midX={midX}
                midY={midY}
                length={length}
                angleDeg={angleDeg}
                completed={completed}
                chrome={chrome}
                isDark={isDark}
              />
            );
          })}
          {waypoints.map((wp, idx) => (
            <PathDot
              key={`wp-${idx}-${round}`}
              idx={idx}
              wp={wp}
              size={dotSize}
              chrome={chrome}
              isNext={idx === reached}
              completed={idx < reached}
              accessibilityLabel={labels.prompt}
              onPress={handleWaypointTouch}
              goldColor={colors.gold}
              whiteColor={colors.white}
              isDark={isDark}
            />
          ))}
        </>
      }
    />
  );
}
