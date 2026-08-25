import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, View } from 'react-native';

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

export function BarStopGame({
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
  const progress = useRef(new Animated.Value(0)).current;
  const progressValueRef = useRef(0);
  const lockedRef = useRef(false);
  const cursorScale = useRef(new Animated.Value(1)).current;
  const triggerCursorPulse = usePulseTrigger(cursorScale);
  const scoreScale = useScoreBump(score);
  useGameCompletion(active, durationHintMs, onComplete);

  const sweepMs = compact ? 1400 : 1600;

  useEffect(() => {
    if (!active) return undefined;
    lockedRef.current = false;
    progress.setValue(0);
    const id = progress.addListener(({ value }) => {
      progressValueRef.current = value;
    });
    Animated.timing(progress, {
      toValue: 1,
      duration: sweepMs,
      easing: MINI_GAME_EASING.linear,
      useNativeDriver: false,
    }).start();
    return () => {
      progress.removeListener(id);
      progress.stopAnimation();
    };
  }, [active, round, progress, sweepMs]);

  const handlePress = useCallback(() => {
    if (lockedRef.current) return;
    lockedRef.current = true;
    progress.stopAnimation();
    const distance = Math.abs(progressValueRef.current - 0.5);
    if (distance < 0.05) {
      setScore((s) => s + 4);
      triggerCursorPulse();
      triggerLoadingMiniGameHaptic('bonus');
    } else if (distance < 0.15) {
      setScore((s) => s + 2);
      triggerCursorPulse();
      triggerLoadingMiniGameHaptic('success');
    } else if (distance < 0.3) {
      setScore((s) => s + 1);
      triggerCursorPulse();
      triggerLoadingMiniGameHaptic('success');
    } else {
      setScore((s) => Math.max(0, s - 1));
      triggerLoadingMiniGameHaptic('miss');
    }
    setTimeout(() => {
      setRound((r) => r + 1);
    }, 480);
  }, [progress, triggerCursorPulse]);

  if (!active) return null;

  const cursorLeft = progress.interpolate({ inputRange: [0, 1], outputRange: ['2%', '98%'] });
  const trackHeight = compact ? 18 : 24;

  return (
    <MiniGameFrame
      chrome={chrome}
      labels={labels}
      score={score}
      scoreScale={scoreScale}
      testID="bar-stop-game"
      scoreTestID="bar-stop-score"
      playfieldTestID="bar-stop-playfield"
      playfieldWrapper={
        <Pressable
          accessibilityLabel={labels.prompt}
          accessibilityRole="button"
          onPress={handlePress}
          testID="bar-stop-control"
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
              backgroundColor: withAlpha(chrome.accentColor, isDark ? 0.12 : 0.08),
              overflow: 'hidden', borderCurve: 'continuous',
            }}
          >
            <View
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: '35%',
                right: '35%',
                backgroundColor: withAlpha(colors.gold, isDark ? 0.4 : 0.28),
              }}
            />
            <View
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: '47%',
                right: '47%',
                backgroundColor: withAlpha(colors.gold, isDark ? 0.75 : 0.5),
              }}
            />
          </View>
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: '50%',
              marginTop: -(trackHeight + 8) / 2,
              left: cursorLeft,
              marginLeft: -3,
              width: 6,
              height: trackHeight + 8,
            }}
            testID="bar-stop-cursor"
          >
            <Animated.View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                borderRadius: 3,
                backgroundColor: colors.white,
                shadowColor: chrome.accentColor,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.6,
                shadowRadius: 8,
                elevation: 3,
                borderCurve: 'continuous',
                transform: [{ scaleY: cursorScale }],
              }}
            />
          </Animated.View>
        </>
      }
    />
  );
}
