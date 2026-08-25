import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme } from '@/contexts/ThemeContext';
import { withAlpha } from '@/constants/theme';

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
type Phase = 'show' | 'input' | 'gap';

interface Spot {
  id: number;
  x: number;
  y: number;
}

function makeSpots(count: number): Spot[] {
  const spots: Spot[] = [];
  for (let i = 0; i < count; i++) {
    let attempts = 0;
    while (attempts < 24) {
      const x = 12 + Math.random() * 76;
      const y = 14 + Math.random() * 70;
      const tooClose = spots.some((s) => Math.hypot(s.x - x, s.y - y) < 22);
      if (!tooClose) {
        spots.push({ id: i, x, y });
        break;
      }
      attempts += 1;
    }
    if (spots.length <= i) {
      spots.push({ id: i, x: 12 + i * 18, y: 50 });
    }
  }
  return spots;
}

interface RecallSpotProps {
  spot: Spot;
  size: number;
  chrome: Chrome;
  isHighlighted: boolean;
  phase: Phase;
  accessibilityLabel: string;
  onPress: (spot: Spot) => void;
  whiteColor: string;
  isDark: boolean;
}

function RecallSpot({
  spot,
  size,
  chrome,
  isHighlighted,
  phase,
  accessibilityLabel,
  onPress,
  whiteColor,
  isDark,
}: RecallSpotProps) {
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
          toValue: 1.25,
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

  const handlePress = useCallback(() => {
    onPressRef.current(spot);
  }, [spot]);

  const dim = phase === 'show' && !isHighlighted ? 0.4 : 1;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        chrome.styles.marker,
        chrome.styles.markerPrimary,
        {
          left: `${spot.x}%`,
          top: `${spot.y}%`,
          width: size,
          height: size,
          borderRadius: size / 2,
          marginLeft: -size / 2,
          marginTop: -size / 2,
          opacity: Animated.multiply(opacity, dim),
          transform: [{ scale: Animated.multiply(scale, pulseScale) }],
          borderColor: isHighlighted
            ? withAlpha(whiteColor, 0.95)
            : withAlpha(whiteColor, isDark ? 0.4 : 0.65),
          borderWidth: isHighlighted ? 3 : 1,
          shadowOpacity: isHighlighted ? 0.9 : 0.3, borderCurve: 'continuous',
        },
      ]}
    >
      <LinearGradient
        colors={chrome.gradients.markerPrimary}
        start={{ x: 0.2, y: 0.15 }}
        end={{ x: 0.85, y: 0.95 }}
        style={[chrome.styles.markerGradientFill, { borderRadius: size / 2, borderCurve: 'continuous' }]}
        pointerEvents="none"
      />
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        hitSlop={6}
        onPress={handlePress}
        style={StyleSheet.absoluteFill}
        testID={`order-recall-spot-${spot.id}`}
        disabled={phase !== 'input'}
      />
    </Animated.View>
  );
}

export function OrderRecallGame({
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
  const [spots, setSpots] = useState<Spot[]>(() => makeSpots(4));
  const [order, setOrder] = useState<number[]>(() => [0, 1, 2, 3]);
  const [phase, setPhase] = useState<Phase>('show');
  const [highlight, setHighlight] = useState<number | null>(null);
  const [inputIndex, setInputIndex] = useState(0);
  const scoreScale = useScoreBump(score);
  useGameCompletion(active, durationHintMs, onComplete);

  useEffect(() => {
    const sequence = [...spots.map((s) => s.id)];
    for (let i = sequence.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [sequence[i], sequence[j]] = [sequence[j]!, sequence[i]!];
    }
    setOrder(sequence);
  }, [spots]);

  useEffect(() => {
    if (!active || phase !== 'show') return undefined;
    let cancelled = false;
    let idx = 0;
    const stepMs = compact ? 520 : 600;
    const tick = () => {
      if (cancelled) return;
      if (idx >= order.length) {
        setHighlight(null);
        setPhase('input');
        setInputIndex(0);
        return;
      }
      setHighlight(order[idx]!);
      setTimeout(() => {
        if (cancelled) return;
        setHighlight(null);
        setTimeout(() => {
          idx += 1;
          tick();
        }, stepMs / 3);
      }, stepMs);
    };
    setTimeout(tick, 360);
    return () => {
      cancelled = true;
    };
  }, [active, compact, order, phase, round]);

  const handleSpotPress = useCallback(
    (spot: Spot) => {
      if (phase !== 'input') return;
      const expected = order[inputIndex];
      setHighlight(spot.id);
      setTimeout(() => setHighlight(null), 160);
      if (spot.id === expected) {
        triggerLoadingMiniGameHaptic('success');
        const nextIndex = inputIndex + 1;
        if (nextIndex >= order.length) {
          setScore((s) => s + order.length);
          setPhase('gap');
          setTimeout(() => {
            setSpots(makeSpots(Math.min(6, 4 + Math.floor(score / 8))));
            setRound((r) => r + 1);
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
          setSpots(makeSpots(4));
          setRound((r) => r + 1);
          setPhase('show');
        }, 600);
      }
    },
    [inputIndex, order, phase, score],
  );

  if (!active) return null;

  const spotSize = compact ? 28 : 34;

  return (
    <MiniGameFrame
      chrome={chrome}
      labels={labels}
      score={score}
      scoreScale={scoreScale}
      testID="order-recall-game"
      scoreTestID="order-recall-score"
      playfieldTestID="order-recall-playfield"
      playfieldChildren={spots.map((spot) => (
        <RecallSpot
          key={`${spot.id}-${round}`}
          spot={spot}
          size={spotSize}
          chrome={chrome}
          isHighlighted={highlight === spot.id}
          phase={phase}
          accessibilityLabel={labels.prompt}
          onPress={handleSpotPress}
          whiteColor={colors.white}
          isDark={isDark}
        />
      ))}
    />
  );
}
