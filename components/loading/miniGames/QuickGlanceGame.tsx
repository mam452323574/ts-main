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
type Phase = 'show' | 'hidden' | 'gap';

interface Card {
  id: number;
  color: string;
}

interface GlanceCardProps {
  card: Card;
  chrome: Chrome;
  phase: Phase;
  accessibilityLabel: string;
  onPress: (card: Card) => void;
  isDark: boolean;
  whiteColor: string;
}

function GlanceCard({
  card,
  chrome,
  phase,
  accessibilityLabel,
  onPress,
  isDark,
  whiteColor,
}: GlanceCardProps) {
  const { scale, opacity } = useEntryPulse();
  const pulseScale = useRef(new Animated.Value(1)).current;
  const revealOpacity = useRef(new Animated.Value(1)).current;
  const onPressRef = useRef(onPress);
  useEffect(() => {
    onPressRef.current = onPress;
  }, [onPress]);

  useEffect(() => {
    Animated.timing(revealOpacity, {
      toValue: phase === 'show' ? 1 : 0,
      duration: 220,
      easing: MINI_GAME_EASING.uiOut,
      useNativeDriver: true,
    }).start();
  }, [phase, revealOpacity]);

  const handlePress = useCallback(() => {
    if (phase !== 'hidden') return;
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
    onPressRef.current(card);
  }, [card, phase, pulseScale]);

  return (
    <View
      style={{ flex: 1, padding: SPACING.xs, height: '70%', marginTop: 16 }}
      pointerEvents="box-none"
    >
      <Animated.View
        style={{
          flex: 1,
          opacity,
          transform: [{ scale: Animated.multiply(scale, pulseScale) }],
        }}
      >
        <Pressable
          accessibilityLabel={accessibilityLabel}
          accessibilityRole="button"
          onPress={handlePress}
          style={{ flex: 1 }}
          testID={`quick-glance-card-${card.id}`}
          disabled={phase !== 'hidden'}
        >
          <View
            style={{
              flex: 1,
              borderRadius: BORDER_RADIUS.md,
              backgroundColor: withAlpha(chrome.accentColor, isDark ? 0.22 : 0.14),
              borderColor: withAlpha(whiteColor, 0.18),
              borderWidth: 1,
              overflow: 'hidden', borderCurve: 'continuous',
            }}
          >
            <Animated.View
              style={{
                ...StyleSheetAbsoluteFill,
                opacity: revealOpacity,
                backgroundColor: card.color,
                borderRadius: BORDER_RADIUS.md, borderCurve: 'continuous',
              }}
              pointerEvents="none"
            >
              <LinearGradient
                colors={[withAlpha(whiteColor, 0.45), 'transparent']}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={{ flex: 1, borderRadius: BORDER_RADIUS.md, borderCurve: 'continuous' }}
              />
            </Animated.View>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const StyleSheetAbsoluteFill = {
  position: 'absolute' as const,
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
};

export function QuickGlanceGame({
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

  const palette = useMemo(
    () => [
      chrome.accentColor,
      chrome.secondaryAccentColor,
      colors.gold,
      mixColors(chrome.accentColor, colors.warning, 0.45),
      mixColors(chrome.secondaryAccentColor, colors.success, 0.4),
    ],
    [chrome.accentColor, chrome.secondaryAccentColor, colors.gold, colors.warning, colors.success],
  );

  const [cards, setCards] = useState<Card[]>([]);
  const [targetId, setTargetId] = useState(0);
  const [phase, setPhase] = useState<Phase>('show');

  useEffect(() => {
    const count = compact ? 3 : 4;
    const usedColors = new Set<string>();
    const next: Card[] = [];
    for (let i = 0; i < count; i++) {
      let color = palette[Math.floor(Math.random() * palette.length)] ?? palette[0]!;
      let attempts = 0;
      while (usedColors.has(color) && attempts < 6) {
        color = palette[Math.floor(Math.random() * palette.length)] ?? palette[0]!;
        attempts += 1;
      }
      usedColors.add(color);
      next.push({ id: i, color });
    }
    setCards(next);
    setTargetId(Math.floor(Math.random() * count));
    setPhase('show');
  }, [compact, palette, round]);

  useEffect(() => {
    if (!active || phase !== 'show') return undefined;
    const showMs = compact ? 1100 : 1300;
    const timeout = setTimeout(() => setPhase('hidden'), showMs);
    return () => clearTimeout(timeout);
  }, [active, compact, phase, round]);

  const handlePress = useCallback(
    (card: Card) => {
      if (phase !== 'hidden') return;
      if (card.id === targetId) {
        triggerLoadingMiniGameHaptic('success');
        setScore((s) => s + 2);
      } else {
        triggerLoadingMiniGameHaptic('miss');
        setScore((s) => Math.max(0, s - 1));
      }
      setPhase('gap');
      setTimeout(() => setRound((r) => r + 1), 500);
    },
    [phase, targetId],
  );

  if (!active) return null;

  const targetColor = cards[targetId]?.color ?? chrome.accentColor;

  return (
    <MiniGameFrame
      chrome={chrome}
      labels={labels}
      score={score}
      scoreScale={scoreScale}
      testID="quick-glance-game"
      scoreTestID="quick-glance-score"
      playfieldTestID="quick-glance-playfield"
      playfieldChildren={
        <View
          style={{ flex: 1, flexDirection: 'row', padding: SPACING.sm, alignItems: 'center' }}
          pointerEvents="box-none"
        >
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: compact ? SPACING.xs : SPACING.sm,
              alignSelf: 'center',
              flexDirection: 'row',
              alignItems: 'center',
              zIndex: 2,
              left: 0,
              right: 0,
              justifyContent: 'center',
            }}
          >
            <View
              style={{
                width: compact ? 14 : 18,
                height: compact ? 14 : 18,
                borderRadius: BORDER_RADIUS.full,
                backgroundColor: targetColor,
                borderColor: withAlpha(colors.white, 0.9),
                borderWidth: 2, borderCurve: 'continuous',
              }}
              testID="quick-glance-target"
            />
          </View>
          {cards.map((card) => (
            <GlanceCard
              key={`${card.id}-${round}`}
              card={card}
              chrome={chrome}
              phase={phase}
              accessibilityLabel={labels.prompt}
              onPress={handlePress}
              isDark={isDark}
              whiteColor={colors.white}
            />
          ))}
        </View>
      }
    />
  );
}
