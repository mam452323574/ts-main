import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  Text,
  View,
  type DimensionValue,
} from 'react-native';

import { useTheme } from '@/contexts/ThemeContext';

import type { LoadingMiniGameGameProps } from './LoadingMiniGame';
import { createLoadingMiniGameChrome } from './loadingMiniGameChrome';
import { triggerLoadingMiniGameHaptic } from './loadingMiniGameHaptics';

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

export function FloatDodgeGame({
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
  const [playerY, setPlayerY] = useState(52);
  const playerYRef = useRef(52);
  const nextObstacleIdRef = useRef(1);
  const [obstacles, setObstacles] = useState<Obstacle[]>(() => [makeObstacle(0, 88)]);
  const obstaclesRef = useRef<Obstacle[]>(obstacles);
  const movementMs = compact ? 170 : 150;
  const scoreMs = compact ? 1250 : 1100;
  const gapRadius = compact ? 25 : 27;
  const movementStep = compact ? 4 : 4.6;

  useEffect(() => {
    playerYRef.current = playerY;
  }, [playerY]);

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

  return (
    <View style={styles.card} testID="float-dodge-game">
      <View style={styles.header}>
        <View style={styles.titleBlock}>
          <Text numberOfLines={1} style={styles.title}>
            {labels.title}
          </Text>
          <Text numberOfLines={1} style={styles.prompt}>
            {labels.floatDodgePrompt}
          </Text>
        </View>
        <Text numberOfLines={1} style={styles.score} testID="float-dodge-score">
          {labels.score} {score}
        </Text>
      </View>

      <Pressable
        accessibilityLabel={labels.floatDodgePrompt}
        accessibilityRole="button"
        onPress={handlePress}
        style={styles.playfield}
        testID="float-dodge-control"
      >
        <View
          style={[
            styles.player,
            {
              top: `${playerY}%`,
            },
          ]}
          testID="float-dodge-player"
        />

        {obstacles.map((obstacle) => {
          const topHeight =
            `${Math.max(8, obstacle.gapY - gapRadius)}%` as DimensionValue;
          const bottomTop =
            `${Math.min(82, obstacle.gapY + gapRadius)}%` as DimensionValue;
          const bottomHeight =
            `${Math.max(8, 100 - (obstacle.gapY + gapRadius))}%` as DimensionValue;

          return (
            <View
              key={obstacle.id}
              pointerEvents="none"
              style={[
                styles.obstacleColumn,
                {
                  left: `${obstacle.x}%`,
                },
              ]}
              testID={obstacle.hit ? 'float-dodge-obstacle-hit' : 'float-dodge-obstacle'}
            >
              <View
                style={[
                  styles.obstacleSegment,
                  obstacle.hit && styles.obstacleSegmentHit,
                  { height: topHeight, top: 0 },
                ]}
              />
              <View
                style={[
                  styles.obstacleSegment,
                  obstacle.hit && styles.obstacleSegmentHit,
                  {
                    height: bottomHeight,
                    top: bottomTop,
                  },
                ]}
              />
            </View>
          );
        })}
      </Pressable>
    </View>
  );
}
