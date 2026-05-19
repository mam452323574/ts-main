import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme } from '@/contexts/ThemeContext';

import type {
  LoadingMiniGameGameProps,
  LoadingMiniGameLabels,
} from '../LoadingMiniGame';
import { createLoadingMiniGameChrome } from '../loadingMiniGameChrome';

export type LoadingMiniGameChrome = ReturnType<typeof createLoadingMiniGameChrome>;

interface UseMiniGameChromeArgs {
  accentColor?: string;
  compact: boolean;
  variant: 'coach' | 'scan';
  cardHeight?: number;
}

export function useMiniGameChrome({
  accentColor,
  compact,
  variant,
  cardHeight,
}: UseMiniGameChromeArgs): LoadingMiniGameChrome {
  const { colors, isDark } = useTheme();
  return useMemo(
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
}

export function useScoreBump(score: number): Animated.Value {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (score === 0) {
      return;
    }
    Animated.sequence([
      Animated.timing(scale, {
        toValue: 1.16,
        duration: 110,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 5,
        tension: 120,
        useNativeDriver: true,
      }),
    ]).start();
  }, [score, scale]);
  return scale;
}

export function useGameCompletion(
  active: boolean,
  durationHintMs: number | undefined,
  onComplete: (() => void) | undefined,
) {
  useEffect(() => {
    if (!active || !durationHintMs || !onComplete) {
      return undefined;
    }
    const timeout = setTimeout(onComplete, Math.max(1000, durationHintMs));
    return () => clearTimeout(timeout);
  }, [active, durationHintMs, onComplete]);
}

export const MINI_GAME_EASING = {
  uiOut: Easing.out(Easing.cubic),
  motionOut: Easing.out(Easing.quad),
  linear: Easing.linear,
} as const;

export function useEntryPulse(): {
  scale: Animated.Value;
  opacity: Animated.Value;
} {
  const scale = useRef(new Animated.Value(0.55)).current;
  const opacity = useRef(new Animated.Value(0)).current;
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
  return { scale, opacity };
}

export function useExitFade(
  scale: Animated.Value,
  opacity: Animated.Value,
): () => void {
  return useCallback(() => {
    Animated.parallel([
      Animated.timing(scale, {
        toValue: 0.3,
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
  }, [scale, opacity]);
}

export function usePulseTrigger(scale: Animated.Value): () => void {
  return useCallback(() => {
    Animated.sequence([
      Animated.timing(scale, {
        toValue: 1.22,
        duration: 90,
        easing: MINI_GAME_EASING.uiOut,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 4,
        tension: 130,
        useNativeDriver: true,
      }),
    ]).start();
  }, [scale]);
}

export function useShakeTrigger(translateX: Animated.Value): () => void {
  return useCallback(() => {
    Animated.sequence([
      Animated.timing(translateX, {
        toValue: -6,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(translateX, {
        toValue: 6,
        duration: 60,
        useNativeDriver: true,
      }),
      Animated.timing(translateX, {
        toValue: -4,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.spring(translateX, {
        toValue: 0,
        friction: 4,
        tension: 130,
        useNativeDriver: true,
      }),
    ]).start();
  }, [translateX]);
}

interface PlayfieldWrapperProps {
  style?: unknown;
  testID?: string;
}

interface MiniGameFrameProps {
  chrome: LoadingMiniGameChrome;
  labels: LoadingMiniGameLabels;
  score: number;
  scoreScale: Animated.Value;
  testID: string;
  scoreTestID?: string;
  playfieldTestID?: string;
  playfieldChildren?: React.ReactNode;
  playfieldWrapper?: React.ReactElement<PlayfieldWrapperProps>;
  children?: React.ReactNode;
  scoreDisplay?: string;
}

export function MiniGameFrame({
  chrome,
  labels,
  score,
  scoreScale,
  testID,
  scoreTestID,
  playfieldTestID,
  playfieldChildren,
  playfieldWrapper,
  scoreDisplay,
}: MiniGameFrameProps) {
  const { styles, gradients } = chrome;

  const playfieldContent = (
    <>
      <LinearGradient
        colors={gradients.playfieldAmbient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.playfieldAmbient}
        pointerEvents="none"
      />
      {playfieldChildren}
    </>
  );

  const playfield = playfieldWrapper
    ? React.cloneElement(
        playfieldWrapper,
        {
          style: [playfieldWrapper.props.style as never, styles.playfield].filter(Boolean) as never,
          testID: playfieldTestID,
        },
        playfieldContent,
      )
    : (
        <View style={styles.playfield} testID={playfieldTestID}>
          {playfieldContent}
        </View>
      );

  return (
    <View style={styles.card} testID={testID}>
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
          testID={scoreTestID}
        >
          <LinearGradient
            colors={gradients.score}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.scoreGradient}
            pointerEvents="none"
          />
          <Text numberOfLines={1} style={styles.scoreText}>
            {scoreDisplay ?? `${labels.score} ${score}`}
          </Text>
        </Animated.View>
      </View>

      {playfield}
    </View>
  );
}

export type MiniGameProps = LoadingMiniGameGameProps;
