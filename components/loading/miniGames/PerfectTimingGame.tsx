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

export function PerfectTimingGame({
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
  const progress = useRef(new Animated.Value(0)).current;
  const progressValueRef = useRef(0);
  const directionRef = useRef(1);
  const cooldownRef = useRef(false);
  const cursorScale = useRef(new Animated.Value(1)).current;
  const triggerCursorPulse = usePulseTrigger(cursorScale);
  const scoreScale = useScoreBump(score);
  useGameCompletion(active, durationHintMs, onComplete);

  const cycleMs = compact ? 1300 : 1500;
  const cursorSize = compact ? 14 : 18;

  useEffect(() => {
    if (!active) return undefined;
    const id = progress.addListener(({ value }) => {
      progressValueRef.current = value;
    });
    const animate = () => {
      Animated.timing(progress, {
        toValue: directionRef.current > 0 ? 1 : 0,
        duration: cycleMs,
        easing: MINI_GAME_EASING.motionOut,
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (!finished) return;
        directionRef.current *= -1;
        animate();
      });
    };
    animate();
    return () => {
      progress.removeListener(id);
      progress.stopAnimation();
    };
  }, [active, cycleMs, progress]);

  const handlePress = useCallback(() => {
    if (cooldownRef.current) return;
    cooldownRef.current = true;
    setTimeout(() => {
      cooldownRef.current = false;
    }, 220);
    const distance = Math.abs(progressValueRef.current - 0.5);
    if (distance < 0.07) {
      setScore((s) => s + 3);
      triggerCursorPulse();
      triggerLoadingMiniGameHaptic('bonus');
    } else if (distance < 0.18) {
      setScore((s) => s + 1);
      triggerCursorPulse();
      triggerLoadingMiniGameHaptic('success');
    } else {
      setScore((s) => Math.max(0, s - 1));
      triggerLoadingMiniGameHaptic('miss');
    }
  }, [triggerCursorPulse]);

  if (!active) return null;

  const cursorLeft = progress.interpolate({ inputRange: [0, 1], outputRange: ['2%', '98%'] });
  const trackHeight = compact ? 16 : 22;

  return (
    <MiniGameFrame
      chrome={chrome}
      labels={labels}
      score={score}
      scoreScale={scoreScale}
      testID="perfect-timing-game"
      scoreTestID="perfect-timing-score"
      playfieldTestID="perfect-timing-playfield"
      playfieldWrapper={
        <Pressable
          accessibilityLabel={labels.prompt}
          accessibilityRole="button"
          onPress={handlePress}
          testID="perfect-timing-control"
        />
      }
      playfieldChildren={
        <>
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: '50%',
              marginTop: -trackHeight / 2,
              left: '4%',
              right: '4%',
              height: trackHeight,
              borderRadius: trackHeight / 2,
              backgroundColor: withAlpha(chrome.accentColor, isDark ? 0.16 : 0.1),
              overflow: 'hidden', borderCurve: 'continuous',
            }}
          >
            <View
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: '43%',
                right: '43%',
                backgroundColor: withAlpha(colors.success, isDark ? 0.55 : 0.32),
              }}
            />
            <View
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: '36%',
                width: 2,
                backgroundColor: withAlpha(colors.success, 0.85),
              }}
            />
            <View
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                right: '36%',
                width: 2,
                backgroundColor: withAlpha(colors.success, 0.85),
              }}
            />
          </View>
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: '50%',
              left: cursorLeft,
              marginTop: -cursorSize / 2,
              marginLeft: -cursorSize / 2,
              width: cursorSize,
              height: cursorSize,
            }}
            testID="perfect-timing-cursor"
          >
            <Animated.View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                borderRadius: cursorSize / 2,
                backgroundColor: colors.white,
                borderColor: chrome.accentColor,
                borderWidth: 2,
                shadowColor: chrome.accentColor,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.45,
                shadowRadius: 8,
                elevation: 3,
                borderCurve: 'continuous',
                transform: [{ scale: cursorScale }],
              }}
            >
              <LinearGradient
                colors={[withAlpha(colors.white, 0.8), 'transparent']}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={{ flex: 1, borderRadius: cursorSize / 2, borderCurve: 'continuous' }}
              />
            </Animated.View>
          </Animated.View>
        </>
      }
    />
  );
}
