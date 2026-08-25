import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, View } from 'react-native';

import { useTheme } from '@/contexts/ThemeContext';
import { BORDER_RADIUS, SPACING, withAlpha } from '@/constants/theme';

import type { LoadingMiniGameGameProps } from '../LoadingMiniGame';
import { triggerLoadingMiniGameHaptic } from '../loadingMiniGameHaptics';

import {
  MINI_GAME_EASING,
  MiniGameFrame,
  useEntryPulse,
  useGameCompletion,
  useMiniGameChrome,
  useScoreBump,
} from './MiniGameFrame';

type Chrome = ReturnType<typeof useMiniGameChrome>;
type ShapeKind = 'circle' | 'square' | 'triangle' | 'diamond';
const ALL_SHAPES: ShapeKind[] = ['circle', 'square', 'triangle', 'diamond'];

interface Candidate {
  id: number;
  shape: ShapeKind;
}

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

interface ShapeIconProps {
  shape: ShapeKind;
  size: number;
  color: string;
  borderColor: string;
}

function ShapeIcon({ shape, size, color, borderColor }: ShapeIconProps) {
  if (shape === 'circle') {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          borderColor,
          borderWidth: 1, borderCurve: 'continuous',
        }}
      />
    );
  }
  if (shape === 'square') {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: BORDER_RADIUS.sm / 2,
          backgroundColor: color,
          borderColor,
          borderWidth: 1, borderCurve: 'continuous',
        }}
      />
    );
  }
  if (shape === 'diamond') {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: BORDER_RADIUS.sm / 2,
          backgroundColor: color,
          borderColor,
          borderWidth: 1,
          transform: [{ rotate: '45deg' }], borderCurve: 'continuous',
        }}
      />
    );
  }
  return (
    <View
      style={{
        width: 0,
        height: 0,
        borderLeftWidth: size / 2,
        borderRightWidth: size / 2,
        borderBottomWidth: size,
        borderStyle: 'solid',
        backgroundColor: 'transparent',
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderBottomColor: color,
      }}
    />
  );
}

interface ShapeCandidateProps {
  candidate: Candidate;
  size: number;
  chrome: Chrome;
  accessibilityLabel: string;
  onPress: (candidate: Candidate) => void;
  whiteColor: string;
  isDark: boolean;
  compact: boolean;
}

function ShapeCandidate({
  candidate,
  size,
  chrome,
  accessibilityLabel,
  onPress,
  whiteColor,
  isDark,
  compact,
}: ShapeCandidateProps) {
  const { scale, opacity } = useEntryPulse();
  const translateX = useRef(new Animated.Value(0)).current;
  const pulseScale = useRef(new Animated.Value(1)).current;
  const onPressRef = useRef(onPress);
  useEffect(() => {
    onPressRef.current = onPress;
  }, [onPress]);

  const handlePress = useCallback(() => {
    Animated.sequence([
      Animated.timing(pulseScale, {
        toValue: 1.18,
        duration: 90,
        easing: MINI_GAME_EASING.uiOut,
        useNativeDriver: true,
      }),
      Animated.spring(pulseScale, {
        toValue: 1,
        friction: 4,
        tension: 130,
        useNativeDriver: true,
      }),
    ]).start();
    onPressRef.current(candidate);
  }, [candidate, pulseScale]);

  // Expose shake via ref attached to translateX
  // (parent triggers via candidate.id mapped to shake; simpler: shake on local "wasWrong" prop)
  // We'll handle that by setting a key change in parent for incorrect — keeping it simple here.

  return (
    <Animated.View
      style={{
        width: compact ? 46 : 56,
        height: compact ? 46 : 56,
        opacity,
        transform: [{ scale: Animated.multiply(scale, pulseScale) }, { translateX }],
      }}
    >
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        onPress={handlePress}
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: BORDER_RADIUS.md,
          backgroundColor: withAlpha(chrome.accentColor, isDark ? 0.16 : 0.1),
          borderColor: withAlpha(whiteColor, 0.18),
          borderWidth: 1, borderCurve: 'continuous',
        }}
        testID={`same-shape-candidate-${candidate.id}`}
      >
        <ShapeIcon
          shape={candidate.shape}
          size={size}
          color={chrome.accentColor}
          borderColor={withAlpha(whiteColor, 0.5)}
        />
      </Pressable>
    </Animated.View>
  );
}

export function SameShapeGame({
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
  const scoreScale = useScoreBump(score);
  useGameCompletion(active, durationHintMs, onComplete);

  const [target, setTarget] = useState<ShapeKind>('circle');
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  useEffect(() => {
    const targetShape = pickRandom(ALL_SHAPES);
    setTarget(targetShape);
    const count = compact ? 3 : 4;
    const targetSlot = Math.floor(Math.random() * count);
    const next: Candidate[] = [];
    for (let i = 0; i < count; i++) {
      if (i === targetSlot) {
        next.push({ id: i, shape: targetShape });
      } else {
        const others = ALL_SHAPES.filter((s) => s !== targetShape);
        next.push({ id: i, shape: pickRandom(others) });
      }
    }
    setCandidates(next);
  }, [compact, round]);

  const handlePress = useCallback(
    (candidate: Candidate) => {
      if (candidate.shape === target) {
        setScore((s) => s + 2);
        triggerLoadingMiniGameHaptic('success');
      } else {
        setScore((s) => Math.max(0, s - 1));
        triggerLoadingMiniGameHaptic('miss');
      }
      setTimeout(() => setRound((r) => r + 1), 320);
    },
    [target],
  );

  if (!active) return null;

  const shapeSize = compact ? 20 : 26;

  return (
    <MiniGameFrame
      chrome={chrome}
      labels={labels}
      score={score}
      scoreScale={scoreScale}
      testID="same-shape-game"
      scoreTestID="same-shape-score"
      playfieldTestID="same-shape-playfield"
      playfieldChildren={
        <View style={{ flex: 1 }} pointerEvents="box-none">
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: compact ? 6 : 10,
              alignSelf: 'center',
              left: 0,
              right: 0,
              alignItems: 'center',
              zIndex: 2,
            }}
          >
            <View
              style={{
                paddingHorizontal: SPACING.sm,
                paddingVertical: SPACING.xs,
                borderRadius: BORDER_RADIUS.full,
                backgroundColor: withAlpha(chrome.accentColor, isDark ? 0.28 : 0.16),
                borderColor: withAlpha(colors.white, 0.4),
                borderWidth: 1, borderCurve: 'continuous',
              }}
            >
              <ShapeIcon
                shape={target}
                size={shapeSize - 4}
                color={colors.white}
                borderColor={withAlpha(colors.white, 0.6)}
              />
            </View>
          </View>
          <View
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-around',
              paddingTop: compact ? 22 : 28,
              paddingHorizontal: SPACING.sm,
            }}
            pointerEvents="box-none"
          >
            {candidates.map((c) => (
              <ShapeCandidate
                key={`${c.id}-${round}`}
                candidate={c}
                size={shapeSize}
                chrome={chrome}
                accessibilityLabel={labels.prompt}
                onPress={handlePress}
                whiteColor={colors.white}
                isDark={isDark}
                compact={compact}
              />
            ))}
          </View>
        </View>
      }
    />
  );
}
