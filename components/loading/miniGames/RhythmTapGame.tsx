import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme } from '@/contexts/ThemeContext';
import { BORDER_RADIUS, withAlpha } from '@/constants/theme';

import type { LoadingMiniGameGameProps } from '../LoadingMiniGame';
import { triggerLoadingMiniGameHaptic } from '../loadingMiniGameHaptics';

import {
  MINI_GAME_EASING,
  MiniGameFrame,
  useGameCompletion,
  useMiniGameChrome,
  useScoreBump,
} from './MiniGameFrame';

interface Pulse {
  id: number;
  lane: number;
  spawnedAt: number;
}

const LANES = 3;

export function RhythmTapGame({
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
  const [pulses, setPulses] = useState<Pulse[]>([]);
  const nextIdRef = useRef(0);
  const targetScales = useRef<Animated.Value[]>([
    new Animated.Value(1),
    new Animated.Value(1),
    new Animated.Value(1),
  ]).current;
  const scoreScale = useScoreBump(score);
  useGameCompletion(active, durationHintMs, onComplete);

  const pulseLaneTarget = useCallback(
    (lane: number) => {
      const target = targetScales[lane];
      if (!target) return;
      Animated.sequence([
        Animated.timing(target, {
          toValue: 1.3,
          duration: 90,
          easing: MINI_GAME_EASING.uiOut,
          useNativeDriver: true,
        }),
        Animated.spring(target, {
          toValue: 1,
          friction: 4,
          tension: 130,
          useNativeDriver: true,
        }),
      ]).start();
    },
    [targetScales],
  );

  const beatMs = compact ? 720 : 800;
  const travelMs = beatMs * 2;
  const hitWindowMs = 220;
  const targetPercent = 78;

  useEffect(() => {
    if (!active) {
      setPulses([]);
      return undefined;
    }
    const spawn = () => {
      const lane = Math.floor(Math.random() * LANES);
      const id = nextIdRef.current++;
      const now = Date.now();
      setPulses((current) => [...current.slice(-6), { id, lane, spawnedAt: now }]);
      setTimeout(() => {
        setPulses((current) => current.filter((p) => p.id !== id));
      }, travelMs + 200);
    };
    const interval = setInterval(spawn, beatMs);
    spawn();
    return () => clearInterval(interval);
  }, [active, beatMs, travelMs]);

  const handleLaneTap = useCallback(
    (lane: number) => {
      const now = Date.now();
      let bestId: number | null = null;
      let bestDelta = Infinity;
      for (const pulse of pulses) {
        if (pulse.lane !== lane) continue;
        const elapsed = now - pulse.spawnedAt;
        const targetTime = (travelMs * targetPercent) / 100;
        const delta = Math.abs(elapsed - targetTime);
        if (delta < bestDelta) {
          bestDelta = delta;
          bestId = pulse.id;
        }
      }
      if (bestId !== null && bestDelta < hitWindowMs) {
        setPulses((current) => current.filter((p) => p.id !== bestId));
        pulseLaneTarget(lane);
        if (bestDelta < hitWindowMs / 3) {
          setScore((s) => s + 3);
          triggerLoadingMiniGameHaptic('bonus');
        } else {
          setScore((s) => s + 1);
          triggerLoadingMiniGameHaptic('success');
        }
      } else {
        setScore((s) => Math.max(0, s - 1));
        triggerLoadingMiniGameHaptic('miss');
      }
    },
    [pulseLaneTarget, pulses, travelMs],
  );

  if (!active) return null;

  return (
    <MiniGameFrame
      chrome={chrome}
      labels={labels}
      score={score}
      scoreScale={scoreScale}
      testID="rhythm-tap-game"
      scoreTestID="rhythm-tap-score"
      playfieldTestID="rhythm-tap-playfield"
      playfieldChildren={
        <View style={{ flex: 1, flexDirection: 'row' }} pointerEvents="box-none">
          {Array.from({ length: LANES }).map((_, lane) => (
            <View key={lane} style={{ flex: 1, position: 'relative' }} pointerEvents="box-none">
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: '20%',
                  right: '20%',
                  top: 0,
                  bottom: 0,
                  backgroundColor: withAlpha(chrome.accentColor, isDark ? 0.08 : 0.05),
                  borderRadius: BORDER_RADIUS.sm, borderCurve: 'continuous',
                }}
              />
              <Animated.View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: '10%',
                  right: '10%',
                  top: `${targetPercent}%`,
                  height: compact ? 10 : 12,
                  borderRadius: BORDER_RADIUS.full,
                  backgroundColor: withAlpha(chrome.accentColor, 0.45),
                  borderColor: withAlpha(colors.white, 0.5),
                  borderWidth: 1,
                  marginTop: compact ? -5 : -6,
                  transform: [{ scaleY: targetScales[lane] ?? new Animated.Value(1) }], borderCurve: 'continuous',
                }}
              />
              {pulses
                .filter((p) => p.lane === lane)
                .map((pulse) => (
                  <RhythmPulse
                    key={pulse.id}
                    pulse={pulse}
                    chrome={chrome}
                    travelMs={travelMs}
                  />
                ))}
              <Pressable
                accessibilityLabel={labels.prompt}
                accessibilityRole="button"
                onPress={() => handleLaneTap(lane)}
                style={{ flex: 1 }}
                testID={`rhythm-tap-lane-${lane}`}
              />
            </View>
          ))}
        </View>
      }
    />
  );
}

function RhythmPulse({
  pulse,
  chrome,
  travelMs,
}: {
  pulse: Pulse;
  chrome: ReturnType<typeof useMiniGameChrome>;
  travelMs: number;
}) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: travelMs,
      easing: MINI_GAME_EASING.motionOut,
      useNativeDriver: false,
    }).start();
  }, [progress, travelMs]);

  const top = progress.interpolate({ inputRange: [0, 1], outputRange: ['-10%', '110%'] });
  const size = 18;

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top,
        left: '50%',
        marginLeft: -size / 2,
        width: size,
        height: size,
        borderRadius: size / 2, borderCurve: 'continuous',
      }}
    >
      <LinearGradient
        colors={chrome.gradients.markerPrimary}
        start={{ x: 0.2, y: 0.15 }}
        end={{ x: 0.85, y: 0.95 }}
        style={{ flex: 1, borderRadius: size / 2, borderCurve: 'continuous' }}
      />
    </Animated.View>
  );
}
