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

interface Obstacle {
  gapY: number;
  id: number;
  x: number;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

function makeObstacle(id: number, x = 100): Obstacle {
  return {
    gapY: Math.round(32 + Math.random() * 34),
    id,
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
  const [playerY, setPlayerY] = useState(54);
  const nextObstacleIdRef = useRef(1);
  const [obstacles, setObstacles] = useState<Obstacle[]>(() => [makeObstacle(0, 86)]);
  const movementMs = compact ? 150 : 120;
  const scoreMs = compact ? 900 : 760;

  useEffect(() => {
    if (!active) {
      return undefined;
    }

    const movementInterval = setInterval(() => {
      setPlayerY((currentY) => clamp(currentY + 3, 12, 82));
      setObstacles((currentObstacles) => {
        const movedObstacles = currentObstacles
          .map((obstacle) => ({ ...obstacle, x: obstacle.x - (compact ? 5 : 6) }))
          .filter((obstacle) => obstacle.x > -12);

        const lastObstacle = movedObstacles[movedObstacles.length - 1];
        if (!lastObstacle || lastObstacle.x < 58) {
          const nextObstacle = makeObstacle(nextObstacleIdRef.current);
          nextObstacleIdRef.current += 1;
          return [...movedObstacles, nextObstacle];
        }

        return movedObstacles;
      });
    }, movementMs);

    const scoreInterval = setInterval(() => {
      setScore((currentScore) => currentScore + 1);
    }, scoreMs);

    return () => {
      clearInterval(movementInterval);
      clearInterval(scoreInterval);
    };
  }, [active, compact, movementMs, scoreMs]);

  useEffect(() => {
    if (!active || !durationHintMs || !onComplete) {
      return undefined;
    }

    const timeout = setTimeout(onComplete, Math.max(1000, durationHintMs));
    return () => clearTimeout(timeout);
  }, [active, durationHintMs, onComplete]);

  const handlePress = useCallback(() => {
    setPlayerY((currentY) => clamp(currentY - (compact ? 18 : 22), 10, 82));
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
            `${Math.max(10, obstacle.gapY - 20)}%` as DimensionValue;
          const bottomTop =
            `${Math.min(76, obstacle.gapY + 20)}%` as DimensionValue;
          const bottomHeight =
            `${Math.max(10, 100 - (obstacle.gapY + 20))}%` as DimensionValue;

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
              testID="float-dodge-obstacle"
            >
              <View style={[styles.obstacleSegment, { height: topHeight, top: 0 }]} />
              <View
                style={[
                  styles.obstacleSegment,
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
