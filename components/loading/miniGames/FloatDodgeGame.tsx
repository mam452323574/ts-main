import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  Text,
  View,
  type DimensionValue,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme } from '@/contexts/ThemeContext';

import type { LoadingMiniGameGameProps } from '../LoadingMiniGame';
import { createLoadingMiniGameChrome } from '../loadingMiniGameChrome';
import { triggerLoadingMiniGameHaptic } from '../loadingMiniGameHaptics';

interface Obstacle {
  gapY: number;
  hit: boolean;
  id: number;
  passed: boolean;
  x: number;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

function makeObstacle(id: number, x = 100): Obstacle {
  return {
    gapY: Math.round(30 + Math.random() * 40),
    hit: false,
    id,
    passed: false,
    x,
  };
}

interface AnimatedObstacleProps {
  obstacle: Obstacle;
  columnStyle: ReturnType<typeof createLoadingMiniGameChrome>['styles']['obstacleColumn'];
  segmentStyle: ReturnType<typeof createLoadingMiniGameChrome>['styles']['obstacleSegment'];
  segmentHitStyle: ReturnType<typeof createLoadingMiniGameChrome>['styles']['obstacleSegmentHit'];
  gradientFillStyle: ReturnType<typeof createLoadingMiniGameChrome>['styles']['obstacleGradientFill'];
  gradientColors: readonly [string, string];
  hitGradientColors: readonly [string, string];
  topHeight: DimensionValue;
  bottomTop: DimensionValue;
  bottomHeight: DimensionValue;
}

function AnimatedObstacle({
  obstacle,
  columnStyle,
  segmentStyle,
  segmentHitStyle,
  gradientFillStyle,
  gradientColors,
  hitGradientColors,
  topHeight,
  bottomTop,
  bottomHeight,
}: AnimatedObstacleProps) {
  const flashOpacity = useRef(new Animated.Value(0)).current;
  const wasHitRef = useRef(false);

  useEffect(() => {
    if (obstacle.hit && !wasHitRef.current) {
      wasHitRef.current = true;
      flashOpacity.setValue(0.5);
      Animated.timing(flashOpacity, {
        toValue: 0,
        duration: 320,
        useNativeDriver: true,
      }).start();
    }
  }, [obstacle.hit, flashOpacity]);

  return (
    <View
      pointerEvents="none"
      style={[
        columnStyle,
        {
          left: `${obstacle.x}%`,
        },
      ]}
      testID={obstacle.hit ? 'float-dodge-obstacle-hit' : 'float-dodge-obstacle'}
    >
      <View
        style={[
          segmentStyle,
          obstacle.hit && segmentHitStyle,
          { height: topHeight, top: 0 },
        ]}
      >
        <LinearGradient
          colors={obstacle.hit ? hitGradientColors : gradientColors}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={gradientFillStyle}
          pointerEvents="none"
        />
        <Animated.View
          pointerEvents="none"
          style={[gradientFillStyle, { backgroundColor: hitGradientColors[0], opacity: flashOpacity }]}
        />
      </View>
      <View
        style={[
          segmentStyle,
          obstacle.hit && segmentHitStyle,
          {
            height: bottomHeight,
            top: bottomTop,
          },
        ]}
      >
        <LinearGradient
          colors={obstacle.hit ? hitGradientColors : gradientColors}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={gradientFillStyle}
          pointerEvents="none"
        />
        <Animated.View
          pointerEvents="none"
          style={[gradientFillStyle, { backgroundColor: hitGradientColors[0], opacity: flashOpacity }]}
        />
      </View>
    </View>
  );
}

export function FloatDodgeGame({
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
  const [playerY, setPlayerY] = useState(52);
  const playerYRef = useRef(52);
  const playerYAnim = useRef(new Animated.Value(52)).current;
  const nextObstacleIdRef = useRef(1);
  const [obstacles, setObstacles] = useState<Obstacle[]>(() => [makeObstacle(0, 88)]);
  const obstaclesRef = useRef<Obstacle[]>(obstacles);
  const scoreScale = useRef(new Animated.Value(1)).current;
  const movementMs = compact ? 170 : 150;
  const scoreMs = compact ? 1250 : 1100;
  const gapRadius = compact ? 25 : 27;
  const movementStep = compact ? 4 : 4.6;

  useEffect(() => {
    playerYRef.current = playerY;
    Animated.spring(playerYAnim, {
      toValue: playerY,
      friction: 7,
      tension: 90,
      useNativeDriver: false,
    }).start();
  }, [playerY, playerYAnim]);

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

  useEffect(() => {
    if (!active) {
      return undefined;
    }

    const movementInterval = setInterval(() => {
      const nextPlayerY = clamp(
        playerYRef.current + (compact ? 2.3 : 2.6),
        10,
        86,
      );
      playerYRef.current = nextPlayerY;
      setPlayerY(nextPlayerY);
      let scoreDelta = 0;
      let hapticKind: 'success' | 'miss' | null = null;

      const movedObstacles = obstaclesRef.current
        .map((obstacle) => {
          const nextObstacle = {
            ...obstacle,
            x: obstacle.x - movementStep,
          };
          const playerYPosition = playerYRef.current;
          const isInPlayerLane = nextObstacle.x <= 22 && nextObstacle.x >= 13;
          const isOutsideGap =
            playerYPosition < nextObstacle.gapY - gapRadius ||
            playerYPosition > nextObstacle.gapY + gapRadius;

          if (!nextObstacle.hit && isInPlayerLane && isOutsideGap) {
            scoreDelta -= 1;
            hapticKind = 'miss';
            return { ...nextObstacle, hit: true };
          }

          if (!nextObstacle.passed && nextObstacle.x < 12) {
            if (!nextObstacle.hit) {
              scoreDelta += 2;
              hapticKind = 'success';
            }
            return { ...nextObstacle, passed: true };
          }

          return nextObstacle;
        })
        .filter((obstacle) => obstacle.x > -12);

      const lastObstacle = movedObstacles[movedObstacles.length - 1];
      const nextObstacles =
        !lastObstacle || lastObstacle.x < 52
          ? [...movedObstacles, makeObstacle(nextObstacleIdRef.current)]
          : movedObstacles;

      if (!lastObstacle || lastObstacle.x < 52) {
        nextObstacleIdRef.current += 1;
      }

      obstaclesRef.current = nextObstacles;
      setObstacles(nextObstacles);

      if (scoreDelta !== 0) {
        setScore((currentScore) => Math.max(0, currentScore + scoreDelta));
      }
      if (hapticKind) {
        triggerLoadingMiniGameHaptic(hapticKind);
      }
    }, movementMs);

    const scoreInterval = setInterval(() => {
      setScore((currentScore) => currentScore + 1);
    }, scoreMs);

    return () => {
      clearInterval(movementInterval);
      clearInterval(scoreInterval);
    };
  }, [active, compact, gapRadius, movementMs, movementStep, scoreMs]);

  useEffect(() => {
    if (!active || !durationHintMs || !onComplete) {
      return undefined;
    }

    const timeout = setTimeout(onComplete, Math.max(1000, durationHintMs));
    return () => clearTimeout(timeout);
  }, [active, durationHintMs, onComplete]);

  const handlePress = useCallback(() => {
    triggerLoadingMiniGameHaptic('success');
    const nextY = clamp(playerYRef.current - (compact ? 17 : 20), 8, 86);
    playerYRef.current = nextY;
    setPlayerY(nextY);
  }, [compact]);

  if (!active) {
    return null;
  }

  const playerTop = playerYAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.card} testID="float-dodge-game">
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
          testID="float-dodge-score"
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

      <Pressable
        accessibilityLabel={labels.prompt}
        accessibilityRole="button"
        onPress={handlePress}
        style={styles.playfield}
        testID="float-dodge-control"
      >
        <LinearGradient
          colors={gradients.playfieldAmbient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.playfieldAmbient}
          pointerEvents="none"
        />

        <Animated.View
          style={[
            styles.player,
            {
              top: playerTop,
            },
          ]}
          testID="float-dodge-player"
        >
          <View style={styles.playerBody} />
          <LinearGradient
            colors={gradients.playerHighlight}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.playerHighlight}
            pointerEvents="none"
          />
        </Animated.View>

        {obstacles.map((obstacle) => {
          const topHeight =
            `${Math.max(8, obstacle.gapY - gapRadius)}%` as DimensionValue;
          const bottomTop =
            `${Math.min(82, obstacle.gapY + gapRadius)}%` as DimensionValue;
          const bottomHeight =
            `${Math.max(8, 100 - (obstacle.gapY + gapRadius))}%` as DimensionValue;

          return (
            <AnimatedObstacle
              key={obstacle.id}
              obstacle={obstacle}
              columnStyle={styles.obstacleColumn}
              segmentStyle={styles.obstacleSegment}
              segmentHitStyle={styles.obstacleSegmentHit}
              gradientFillStyle={styles.obstacleGradientFill}
              gradientColors={gradients.obstacle}
              hitGradientColors={gradients.obstacleHit}
              topHeight={topHeight}
              bottomTop={bottomTop}
              bottomHeight={bottomHeight}
            />
          );
        })}
      </Pressable>
    </View>
  );
}
