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

type Light = 'green' | 'red' | 'amber';

function pickLight(prev: Light): Light {
  const r = Math.random();
  if (prev === 'green') {
    return r < 0.6 ? 'red' : r < 0.85 ? 'amber' : 'green';
  }
  if (r < 0.45) return 'green';
  if (r < 0.75) return prev === 'red' ? 'amber' : 'red';
  return prev === 'red' ? 'green' : 'red';
}

export function GreenLightGame({
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
  const { colors } = useTheme();
  const [score, setScore] = useState(0);
  const [light, setLight] = useState<Light>('red');
  const cooldownRef = useRef(false);
  const lightRef = useRef<Light>('red');
  const lightScale = useRef(new Animated.Value(1)).current;
  const triggerLightPulse = usePulseTrigger(lightScale);
  const greenOpacity = useRef(new Animated.Value(0)).current;
  const redOpacity = useRef(new Animated.Value(1)).current;
  const amberOpacity = useRef(new Animated.Value(0)).current;
  const scoreScale = useScoreBump(score);
  useGameCompletion(active, durationHintMs, onComplete);

  useEffect(() => {
    lightRef.current = light;
    Animated.parallel([
      Animated.timing(greenOpacity, {
        toValue: light === 'green' ? 1 : 0,
        duration: 180,
        easing: MINI_GAME_EASING.uiOut,
        useNativeDriver: true,
      }),
      Animated.timing(redOpacity, {
        toValue: light === 'red' ? 1 : 0,
        duration: 180,
        easing: MINI_GAME_EASING.uiOut,
        useNativeDriver: true,
      }),
      Animated.timing(amberOpacity, {
        toValue: light === 'amber' ? 1 : 0,
        duration: 180,
        easing: MINI_GAME_EASING.uiOut,
        useNativeDriver: true,
      }),
    ]).start();
    Animated.sequence([
      Animated.timing(lightScale, {
        toValue: 1.08,
        duration: 110,
        easing: MINI_GAME_EASING.uiOut,
        useNativeDriver: true,
      }),
      Animated.spring(lightScale, {
        toValue: 1,
        friction: 4,
        tension: 130,
        useNativeDriver: true,
      }),
    ]).start();
  }, [amberOpacity, greenOpacity, light, lightScale, redOpacity]);

  useEffect(() => {
    if (!active) return undefined;
    const tick = () => {
      const next = pickLight(lightRef.current);
      setLight(next);
      const delayMs =
        next === 'green'
          ? 600 + Math.random() * 500
          : next === 'amber'
            ? 380 + Math.random() * 240
            : 700 + Math.random() * 600;
      timeoutId = setTimeout(tick, delayMs);
    };
    let timeoutId = setTimeout(tick, 500);
    return () => clearTimeout(timeoutId);
  }, [active]);

  const handlePress = useCallback(() => {
    if (cooldownRef.current) return;
    cooldownRef.current = true;
    setTimeout(() => {
      cooldownRef.current = false;
    }, 200);
    if (lightRef.current === 'green') {
      setScore((s) => s + 2);
      triggerLightPulse();
      triggerLoadingMiniGameHaptic('success');
    } else if (lightRef.current === 'amber') {
      Animated.sequence([
        Animated.timing(lightScale, {
          toValue: 0.85,
          duration: 90,
          easing: MINI_GAME_EASING.uiOut,
          useNativeDriver: true,
        }),
        Animated.spring(lightScale, {
          toValue: 1,
          friction: 4,
          tension: 130,
          useNativeDriver: true,
        }),
      ]).start();
      triggerLoadingMiniGameHaptic('miss');
    } else {
      Animated.sequence([
        Animated.timing(lightScale, {
          toValue: 0.8,
          duration: 90,
          easing: MINI_GAME_EASING.uiOut,
          useNativeDriver: true,
        }),
        Animated.spring(lightScale, {
          toValue: 1,
          friction: 4,
          tension: 130,
          useNativeDriver: true,
        }),
      ]).start();
      setScore((s) => Math.max(0, s - 1));
      triggerLoadingMiniGameHaptic('miss');
    }
  }, [lightScale, triggerLightPulse]);

  if (!active) return null;

  const lightSize = compact ? 76 : 96;
  const currentColor =
    light === 'green' ? colors.success : light === 'amber' ? colors.gold : colors.error;

  return (
    <MiniGameFrame
      chrome={chrome}
      labels={labels}
      score={score}
      scoreScale={scoreScale}
      testID="green-light-game"
      scoreTestID="green-light-score"
      playfieldTestID="green-light-playfield"
      playfieldWrapper={
        <Pressable
          accessibilityLabel={labels.prompt}
          accessibilityRole="button"
          onPress={handlePress}
          testID="green-light-control"
        />
      }
      playfieldChildren={
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
          <Animated.View
            style={{
              width: lightSize,
              height: lightSize,
              borderRadius: lightSize / 2,
              borderColor: withAlpha(colors.white, 0.85),
              borderWidth: 3,
              overflow: 'hidden',
              shadowColor: currentColor,
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.85,
              shadowRadius: 18,
              elevation: 8,
              transform: [{ scale: lightScale }], borderCurve: 'continuous',
            }}
            testID={`green-light-${light}`}
          >
            <Animated.View
              pointerEvents="none"
              style={{
                ...absoluteFill,
                backgroundColor: colors.success,
                opacity: greenOpacity,
              }}
            />
            <Animated.View
              pointerEvents="none"
              style={{
                ...absoluteFill,
                backgroundColor: colors.error,
                opacity: redOpacity,
              }}
            />
            <Animated.View
              pointerEvents="none"
              style={{
                ...absoluteFill,
                backgroundColor: colors.gold,
                opacity: amberOpacity,
              }}
            />
            <LinearGradient
              colors={[withAlpha(colors.white, 0.5), 'transparent']}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={{ flex: 1 }}
            />
          </Animated.View>
        </View>
      }
    />
  );
}

const absoluteFill = {
  position: 'absolute' as const,
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
};
