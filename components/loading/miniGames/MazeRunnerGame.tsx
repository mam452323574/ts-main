import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme } from '@/contexts/ThemeContext';
import { withAlpha } from '@/constants/theme';

import type { LoadingMiniGameGameProps } from '../LoadingMiniGame';
import { triggerLoadingMiniGameHaptic } from '../loadingMiniGameHaptics';

import {
  MINI_GAME_EASING,
  MiniGameFrame,
  useGameCompletion,
  useMiniGameChrome,
  usePulseTrigger,
  useScoreBump,
} from './MiniGameFrame';

interface Obstacle {
  id: number;
  y: number;
  amplitudeX: number;
  speed: number;
  phase: number;
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

export function MazeRunnerGame({
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
  const [playerX, setPlayerX] = useState(15);
  const [playerY, setPlayerY] = useState(50);
  const playerXRef = useRef(15);
  const playerYRef = useRef(50);
  const playerXAnim = useRef(new Animated.Value(15)).current;
  const playerYAnim = useRef(new Animated.Value(50)).current;
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  const tickRef = useRef(0);
  const hitFlashOpacity = useRef(new Animated.Value(0)).current;
  const goalScale = useRef(new Animated.Value(1)).current;
  const triggerGoalPulse = usePulseTrigger(goalScale);
  const playerScale = useRef(new Animated.Value(1)).current;
  const triggerPlayerPulse = usePulseTrigger(playerScale);
  const scoreScale = useScoreBump(score);
  useGameCompletion(active, durationHintMs, onComplete);

  const flashHit = useCallback(() => {
    hitFlashOpacity.setValue(0.55);
    Animated.timing(hitFlashOpacity, {
      toValue: 0,
      duration: 340,
      easing: MINI_GAME_EASING.uiOut,
      useNativeDriver: true,
    }).start();
  }, [hitFlashOpacity]);

  useEffect(() => {
    if (!active) return;
    const count = compact ? 2 : 3;
    const next: Obstacle[] = [];
    for (let i = 0; i < count; i++) {
      next.push({
        id: i,
        y: 25 + (50 / Math.max(1, count - 1)) * i + (Math.random() - 0.5) * 8,
        amplitudeX: 25 + Math.random() * 15,
        speed: 1.4 + Math.random() * 0.8,
        phase: Math.random() * Math.PI * 2,
      });
    }
    setObstacles(next);
  }, [active, compact]);

  useEffect(() => {
    if (!active) return undefined;
    const interval = setInterval(() => {
      tickRef.current += 1;
      const t = tickRef.current / 30;
      setObstacles((current) =>
        current.map((o) => ({ ...o, phase: o.phase + 0.08 * o.speed })),
      );
      // Collision check
      setObstacles((current) => {
        for (const o of current) {
          const ox = 50 + Math.sin(o.phase) * o.amplitudeX;
          const dx = ox - playerXRef.current;
          const dy = o.y - playerYRef.current;
          if (Math.hypot(dx, dy) < 9) {
            setPlayerX(15);
            setPlayerY(50);
            playerXRef.current = 15;
            playerYRef.current = 50;
            setScore((s) => Math.max(0, s - 1));
            flashHit();
            triggerLoadingMiniGameHaptic('miss');
            break;
          }
        }
        return current;
      });
      // Goal check
      if (playerXRef.current > 88) {
        triggerGoalPulse();
        setPlayerX(15);
        setPlayerY(50);
        playerXRef.current = 15;
        playerYRef.current = 50;
        setScore((s) => s + 3);
        triggerLoadingMiniGameHaptic('bonus');
      }
    }, 60);
    return () => clearInterval(interval);
  }, [active, flashHit, triggerGoalPulse]);

  useEffect(() => {
    Animated.spring(playerXAnim, {
      toValue: playerX,
      friction: 7,
      tension: 90,
      useNativeDriver: false,
    }).start();
    Animated.spring(playerYAnim, {
      toValue: playerY,
      friction: 7,
      tension: 90,
      useNativeDriver: false,
    }).start();
  }, [playerX, playerY, playerXAnim, playerYAnim]);

  const handleZonePress = useCallback(
    (dx: number, dy: number) => {
      const step = 8;
      const nx = clamp(playerXRef.current + dx * step, 8, 92);
      const ny = clamp(playerYRef.current + dy * step, 12, 88);
      playerXRef.current = nx;
      playerYRef.current = ny;
      setPlayerX(nx);
      setPlayerY(ny);
      triggerPlayerPulse();
      triggerLoadingMiniGameHaptic('success');
    },
    [triggerPlayerPulse],
  );

  if (!active) return null;

  const playerSize = compact ? 14 : 18;
  const obstacleSize = compact ? 18 : 22;

  return (
    <MiniGameFrame
      chrome={chrome}
      labels={labels}
      score={score}
      scoreScale={scoreScale}
      testID="maze-runner-game"
      scoreTestID="maze-runner-score"
      playfieldTestID="maze-runner-playfield"
      playfieldChildren={
        <>
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              right: 6,
              top: '50%',
              marginTop: -12,
              width: 5,
              height: 24,
              borderRadius: 2,
              backgroundColor: withAlpha(colors.gold, 0.85),
              transform: [{ scaleY: goalScale }], borderCurve: 'continuous',
            }}
            testID="maze-runner-goal"
          />
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              backgroundColor: colors.error,
              opacity: hitFlashOpacity,
            }}
          />
          {obstacles.map((o) => {
            const x = 50 + Math.sin(o.phase) * o.amplitudeX;
            return (
              <View
                key={o.id}
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: `${x}%`,
                  top: `${o.y}%`,
                  width: obstacleSize,
                  height: obstacleSize,
                  borderRadius: obstacleSize / 2,
                  marginLeft: -obstacleSize / 2,
                  marginTop: -obstacleSize / 2,
                  backgroundColor: withAlpha(colors.error, isDark ? 0.5 : 0.4),
                  borderColor: withAlpha(colors.error, 0.8),
                  borderWidth: 1, borderCurve: 'continuous',
                }}
                testID={`maze-runner-obstacle-${o.id}`}
              />
            );
          })}
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: playerXAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
              top: playerYAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
              width: playerSize,
              height: playerSize,
              marginLeft: -playerSize / 2,
              marginTop: -playerSize / 2,
            }}
            testID="maze-runner-player"
          >
            <Animated.View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                borderRadius: playerSize / 2,
                backgroundColor: chrome.accentColor,
                borderColor: withAlpha(colors.white, 0.85),
                borderWidth: 2,
                borderCurve: 'continuous',
                transform: [{ scale: playerScale }],
              }}
            />
          </Animated.View>
          <View
            style={{ flex: 1, flexDirection: 'row' }}
            pointerEvents="box-none"
          >
            <View style={{ flex: 1 }} pointerEvents="box-none">
              <Pressable
                style={{ flex: 1 }}
                accessibilityLabel={labels.prompt}
                onPress={() => handleZonePress(0, -1)}
                testID="maze-runner-up"
              />
              <Pressable
                style={{ flex: 1 }}
                accessibilityLabel={labels.prompt}
                onPress={() => handleZonePress(0, 1)}
                testID="maze-runner-down"
              />
            </View>
            <View style={{ flex: 1 }} pointerEvents="box-none">
              <Pressable
                style={{ flex: 1 }}
                accessibilityLabel={labels.prompt}
                onPress={() => handleZonePress(1, 0)}
                testID="maze-runner-right"
              />
              <Pressable
                style={{ flex: 1 }}
                accessibilityLabel={labels.prompt}
                onPress={() => handleZonePress(-1, 0)}
                testID="maze-runner-left"
              />
            </View>
          </View>
        </>
      }
    />
  );
}
