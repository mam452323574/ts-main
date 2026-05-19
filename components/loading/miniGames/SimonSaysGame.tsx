import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme } from '@/contexts/ThemeContext';
import { BORDER_RADIUS, SPACING, mixColors, withAlpha } from '@/constants/theme';

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
type Slot = 0 | 1 | 2 | 3;
type Phase = 'show' | 'input' | 'gap';

function makeSequence(len: number): Slot[] {
  return Array.from({ length: len }, () => Math.floor(Math.random() * 4) as Slot);
}

interface SimonSlotProps {
  slot: Slot;
  baseColor: string;
  chrome: Chrome;
  isHighlighted: boolean;
  phase: Phase;
  accessibilityLabel: string;
  onPress: (slot: Slot) => void;
  whiteColor: string;
  isDark: boolean;
}

function SimonSlot({
  slot,
  baseColor,
  chrome,
  isHighlighted,
  phase,
  accessibilityLabel,
  onPress,
  whiteColor,
  isDark,
}: SimonSlotProps) {
  const { scale, opacity } = useEntryPulse();
  const pulseScale = useRef(new Animated.Value(1)).current;
  const onPressRef = useRef(onPress);
  useEffect(() => {
    onPressRef.current = onPress;
  }, [onPress]);

  useEffect(() => {
    if (isHighlighted) {
      Animated.sequence([
        Animated.timing(pulseScale, {
          toValue: 1.18,
          duration: 110,
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
    }
  }, [isHighlighted, pulseScale]);

  const dimOpacity = phase === 'input' && !isHighlighted ? 0.66 : 1;

  const handlePress = useCallback(() => {
    onPressRef.current(slot);
  }, [slot]);

  return (
    <View
      style={{ width: '50%', height: '50%', padding: SPACING.xs }}
      pointerEvents="box-none"
    >
      <Animated.View
        style={{
          flex: 1,
          opacity: Animated.multiply(opacity, dimOpacity),
          transform: [{ scale: Animated.multiply(scale, pulseScale) }],
        }}
      >
        <Pressable
          accessibilityLabel={accessibilityLabel}
          accessibilityRole="button"
          onPress={handlePress}
          style={{ flex: 1 }}
          testID={`simon-says-slot-${slot}`}
          disabled={phase !== 'input'}
        >
          <View
            style={{
              flex: 1,
              borderRadius: BORDER_RADIUS.md,
              backgroundColor: isHighlighted
                ? baseColor
                : withAlpha(baseColor, isDark ? 0.32 : 0.22),
              borderColor: withAlpha(whiteColor, isHighlighted ? 0.7 : 0.25),
              borderWidth: 1,
              overflow: 'hidden', borderCurve: 'continuous',
            }}
          >
            <LinearGradient
              colors={[withAlpha(whiteColor, isHighlighted ? 0.55 : 0.15), 'transparent']}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={{ flex: 1 }}
            />
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

export function SimonSaysGame({
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
  const [, setRound] = useState(1);
  const [sequence, setSequence] = useState<Slot[]>(() => makeSequence(3));
  const [phase, setPhase] = useState<Phase>('show');
  const [highlightedSlot, setHighlightedSlot] = useState<Slot | null>(null);
  const [inputIndex, setInputIndex] = useState(0);
  const scoreScale = useScoreBump(score);
  useGameCompletion(active, durationHintMs, onComplete);

  const stepMs = compact ? 460 : 520;

  useEffect(() => {
    if (!active || phase !== 'show') return undefined;
    let cancelled = false;
    let idx = 0;
    const advance = () => {
      if (cancelled) return;
      if (idx >= sequence.length) {
        setHighlightedSlot(null);
        setPhase('input');
        setInputIndex(0);
        return;
      }
      const slot = sequence[idx]!;
      setHighlightedSlot(slot);
      setTimeout(() => {
        if (cancelled) return;
        setHighlightedSlot(null);
        setTimeout(() => {
          idx += 1;
          advance();
        }, stepMs / 2);
      }, stepMs);
    };
    setTimeout(advance, 400);
    return () => {
      cancelled = true;
    };
  }, [active, phase, sequence, stepMs]);

  const handleSlotPress = useCallback(
    (slot: Slot) => {
      if (phase !== 'input') return;
      setHighlightedSlot(slot);
      setTimeout(() => setHighlightedSlot(null), 160);
      const expected = sequence[inputIndex];
      if (slot === expected) {
        triggerLoadingMiniGameHaptic('success');
        const nextIndex = inputIndex + 1;
        if (nextIndex >= sequence.length) {
          setScore((s) => s + sequence.length);
          setPhase('gap');
          setTimeout(() => {
            setRound((r) => r + 1);
            setSequence(makeSequence(Math.min(7, 3 + Math.floor(score / 6))));
            setPhase('show');
          }, 600);
        } else {
          setInputIndex(nextIndex);
        }
      } else {
        triggerLoadingMiniGameHaptic('miss');
        setScore((s) => Math.max(0, s - 1));
        setPhase('gap');
        setTimeout(() => {
          setSequence(makeSequence(3));
          setInputIndex(0);
          setPhase('show');
        }, 600);
      }
    },
    [inputIndex, phase, score, sequence],
  );

  const slotColors: string[] = useMemo(
    () => [
      chrome.accentColor,
      chrome.secondaryAccentColor,
      colors.gold,
      mixColors(chrome.accentColor, colors.warning, 0.4),
    ],
    [chrome.accentColor, chrome.secondaryAccentColor, colors.gold, colors.warning],
  );

  if (!active) return null;

  return (
    <MiniGameFrame
      chrome={chrome}
      labels={labels}
      score={score}
      scoreScale={scoreScale}
      testID="simon-says-game"
      scoreTestID="simon-says-score"
      playfieldTestID="simon-says-playfield"
      playfieldChildren={
        <View
          style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', padding: 6 }}
          pointerEvents="box-none"
        >
          {([0, 1, 2, 3] as Slot[]).map((slot) => (
            <SimonSlot
              key={slot}
              slot={slot}
              baseColor={slotColors[slot] ?? chrome.accentColor}
              chrome={chrome}
              isHighlighted={highlightedSlot === slot}
              phase={phase}
              accessibilityLabel={labels.prompt}
              onPress={handleSlotPress}
              whiteColor={colors.white}
              isDark={isDark}
            />
          ))}
        </View>
      }
    />
  );
}
