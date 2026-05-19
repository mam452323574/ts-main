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
  useScoreBump,
} from './MiniGameFrame';

interface Gate {
  id: number;
  y: number;
  side: 'left' | 'right';
  passed: boolean;
  hit: boolean;
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

function makeGate(id: number, side: 'left' | 'right'): Gate {
  return { id, y: 100, side, passed: false, hit: false };
}

export function SlalomGame({
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
  const [playerX, setPlayerX] = useState(50);
  const playerXRef = useRef(50);
  const playerXAnim = useRef(new Animated.Value(50)).current;
  const playerScale = useRef(new Animated.Value(1)).current;
  // `playerXAnim` animates `left` (a layout prop) and must run on the JS driver.
  // Keep this pulse on the same driver so the player `<Animated.View>` doesn't
  // mix native + JS driven values on one node, which throws on Fabric.
  const triggerPlayerPulse = useCallback(() => {
    Animated.sequence([
      Animated.timing(playerScale, {
        toValue: 1.22,
        duration: 90,
        easing: MINI_GAME_EASING.uiOut,
        useNativeDriver: false,
      }),
      Animated.spring(playerScale, {
        toValue: 1,
        friction: 4,
        tension: 130,
        useNativeDriver: false,
      }),
    ]).start();
  }, [playerScale]);
  const hitFlashOpacity = useRef(new Animated.Value(0)).current;
  const [gates, setGates] = useState<Gate[]>(() => [makeGate(0, 'left')]);
  const gatesRef = useRef<Gate[]>([makeGate(0, 'left')]);
  const nextIdRef = useRef(1);
  const scoreScale = useScoreBump(score);
  useGameCompletion(active, durationHintMs, onComplete);

  const flashHit = useCallback(() => {
    hitFlashOpacity.setValue(0.45);
    Animated.timing(hitFlashOpacity, {
      toValue: 0,
      duration: 320,
      easing: MINI_GAME_EASING.uiOut,
      useNativeDriver: true,
    }).start();
  }, [hitFlashOpacity]);

  const moveMs = compact ? 90 : 80;

  useEffect(() => {
    playerXRef.current = playerX;
    Animated.spring(playerXAnim, {
      toValue: playerX,
      friction: 7,
      tension: 90,
      useNativeDriver: false,
    }).start();
  }, [playerX, playerXAnim]);

  useEffect(() => {
    if (!active) return undefined;
    const interval = setInterval(() => {
      let scoreDelta = 0;
      let haptic: 'success' | 'miss' | null = null;
      const updated: Gate[] = [];
      for (const gate of gatesRef.current) {
        const ny = gate.y - (compact ? 2.4 : 2.8);
        const newGate: Gate = { ...gate, y: ny };
        const inLane = ny <= 60 && ny >= 50;
        if (!newGate.hit && inLane) {
          if (newGate.side === 'left' && playerXRef.current > 50) {
            newGate.hit = true;
            scoreDelta -= 1;
            haptic = 'miss';
          } else if (newGate.side === 'right' && playerXRef.current < 50) {
            newGate.hit = true;
            scoreDelta -= 1;
            haptic = 'miss';
          }
        }
        if (!newGate.passed && ny < 48) {
          newGate.passed = true;
          if (!newGate.hit) {
            scoreDelta += 2;
            haptic = 'success';
          }
        }
        if (ny > -10) {
          updated.push(newGate);
        }
      }
      const last = updated[updated.length - 1];
      if (!last || last.y < 60) {
        const nextSide = last?.side === 'left' ? 'right' : 'left';
        updated.push(makeGate(nextIdRef.current++, nextSide));
      }
      gatesRef.current = updated;
      setGates(updated);
      if (scoreDelta !== 0) {
        setScore((s) => Math.max(0, s + scoreDelta));
      }
      if (haptic === 'miss') {
        flashHit();
      }
      if (haptic) {
        triggerLoadingMiniGameHaptic(haptic);
      }
    }, moveMs);
    return () => clearInterval(interval);
  }, [active, compact, flashHit, moveMs]);

  const handleLeftPress = useCallback(() => {
    const nx = clamp(playerXRef.current - (compact ? 14 : 18), 10, 90);
    playerXRef.current = nx;
    setPlayerX(nx);
    triggerPlayerPulse();
    triggerLoadingMiniGameHaptic('success');
  }, [compact, triggerPlayerPulse]);

  const handleRightPress = useCallback(() => {
    const nx = clamp(playerXRef.current + (compact ? 14 : 18), 10, 90);
    playerXRef.current = nx;
    setPlayerX(nx);
    triggerPlayerPulse();
    triggerLoadingMiniGameHaptic('success');
  }, [compact, triggerPlayerPulse]);

  if (!active) return null;

  const playerSize = compact ? 22 : 28;
  const gateWidth = 35;

  return (
    <MiniGameFrame
      chrome={chrome}
      labels={labels}
      score={score}
      scoreScale={scoreScale}
      testID="slalom-game"
      scoreTestID="slalom-score"
      playfieldTestID="slalom-playfield"
      playfieldChildren={
        <>
          {/* Center line */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: '50%',
              top: 0,
              bottom: 0,
              width: 1,
              marginLeft: -0.5,
              backgroundColor: withAlpha(colors.white, isDark ? 0.12 : 0.18),
            }}
          />
          {/* Player line */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: '8%',
              right: '8%',
              top: '55%',
              height: 1,
              backgroundColor: withAlpha(chrome.accentColor, 0.45),
            }}
          />
          {gates.map((g) => {
            const left = g.side === 'left' ? 0 : 100 - gateWidth;
            return (
              <View
                key={g.id}
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: `${left}%`,
                  top: `${g.y}%`,
                  width: `${gateWidth}%`,
                  height: compact ? 10 : 12,
                  borderRadius: 6,
                  marginTop: compact ? -5 : -6,
                  backgroundColor: g.hit
                    ? withAlpha(colors.error, isDark ? 0.55 : 0.4)
                    : withAlpha(chrome.secondaryAccentColor, isDark ? 0.5 : 0.35),
                  borderColor: g.hit
                    ? withAlpha(colors.error, 0.8)
                    : withAlpha(colors.white, 0.4),
                  borderWidth: 1, borderCurve: 'continuous',
                }}
                testID={g.hit ? 'slalom-gate-hit' : 'slalom-gate'}
              />
            );
          })}
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: playerXAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
              top: '55%',
              width: playerSize,
              height: playerSize,
              borderRadius: playerSize / 2,
              marginLeft: -playerSize / 2,
              marginTop: -playerSize / 2,
              backgroundColor: chrome.accentColor,
              borderColor: withAlpha(colors.white, 0.85),
              borderWidth: 2,
              shadowColor: chrome.accentColor,
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.6,
              shadowRadius: 8,
              elevation: 3,
              transform: [{ scale: playerScale }], borderCurve: 'continuous',
            }}
            testID="slalom-player"
          >
            <LinearGradient
              colors={[withAlpha(colors.white, 0.5), 'transparent']}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={{ flex: 1, borderRadius: playerSize / 2, borderCurve: 'continuous' }}
            />
          </Animated.View>
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
          <View style={{ flex: 1, flexDirection: 'row' }} pointerEvents="box-none">
            <Pressable
              accessibilityLabel={labels.prompt}
              accessibilityRole="button"
              onPress={handleLeftPress}
              style={{ flex: 1 }}
              testID="slalom-left"
            />
            <Pressable
              accessibilityLabel={labels.prompt}
              accessibilityRole="button"
              onPress={handleRightPress}
              style={{ flex: 1 }}
              testID="slalom-right"
            />
          </View>
        </>
      }
    />
  );
}
