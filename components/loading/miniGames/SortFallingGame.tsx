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

type Side = 'left' | 'right';

interface Item {
  id: number;
  startX: number;
  durationMs: number;
  side: Side;
  scoreSide: Side | null;
}

function makeItem(id: number): Item {
  const startX = 22 + Math.random() * 56;
  const side: Side = Math.random() > 0.5 ? 'left' : 'right';
  return {
    id,
    startX,
    durationMs: 2400 + Math.random() * 800,
    side,
    scoreSide: null,
  };
}

interface FallingItemProps {
  item: Item;
  chrome: ReturnType<typeof useMiniGameChrome>;
  accessibilityLabel: string;
  onAssign: (id: number, side: Side) => void;
  onMiss: (id: number) => void;
  whiteColor: string;
}

function FallingItem({
  item,
  chrome,
  accessibilityLabel,
  onAssign,
  onMiss,
  whiteColor,
}: FallingItemProps) {
  const progress = useRef(new Animated.Value(0)).current;
  const offsetX = useRef(new Animated.Value(0)).current;
  const pulseScale = useRef(new Animated.Value(1)).current;
  const onMissRef = useRef(onMiss);
  const onAssignRef = useRef(onAssign);
  useEffect(() => {
    onMissRef.current = onMiss;
    onAssignRef.current = onAssign;
  }, [onMiss, onAssign]);

  useEffect(() => {
    const travel = Animated.timing(progress, {
      toValue: 1,
      duration: item.durationMs,
      easing: MINI_GAME_EASING.motionOut,
      useNativeDriver: false,
    });
    travel.start(({ finished }) => {
      if (finished) onMissRef.current(item.id);
    });
    return () => travel.stop();
  }, [item.durationMs, item.id, progress]);

  const triggerAssignPulse = useCallback(() => {
    Animated.sequence([
      Animated.timing(pulseScale, {
        toValue: 1.22,
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
  }, [pulseScale]);

  const handleLeft = useCallback(() => {
    Animated.timing(offsetX, {
      toValue: -120,
      duration: 280,
      easing: MINI_GAME_EASING.uiOut,
      useNativeDriver: false,
    }).start();
    triggerAssignPulse();
    onAssignRef.current(item.id, 'left');
  }, [item.id, offsetX, triggerAssignPulse]);
  const handleRight = useCallback(() => {
    Animated.timing(offsetX, {
      toValue: 120,
      duration: 280,
      easing: MINI_GAME_EASING.uiOut,
      useNativeDriver: false,
    }).start();
    triggerAssignPulse();
    onAssignRef.current(item.id, 'right');
  }, [item.id, offsetX, triggerAssignPulse]);

  const top = progress.interpolate({ inputRange: [0, 1], outputRange: ['-8%', '92%'] });
  const size = 30;

  const isLeftItem = item.side === 'left';

  return (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: `${item.startX}%`,
        top,
        width: size,
        height: size,
        marginLeft: -size / 2,
        marginTop: -size / 2,
        transform: [{ translateX: offsetX }],
      }}
    >
      <Animated.View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          borderRadius: size / 2,
          borderCurve: 'continuous',
          transform: [{ scale: pulseScale }],
        }}
      >
        <View
          style={{
            flex: 1,
            borderRadius: size / 2,
            backgroundColor: isLeftItem
              ? chrome.accentColor
              : chrome.secondaryAccentColor,
            borderColor: withAlpha(whiteColor, 0.7),
            borderWidth: 1,
            overflow: 'hidden', borderCurve: 'continuous',
          }}
        >
          <LinearGradient
            colors={[withAlpha(whiteColor, 0.5), 'transparent']}
            start={{ x: 0.3, y: 0.1 }}
            end={{ x: 0.7, y: 0.95 }}
            style={{ flex: 1 }}
          />
        </View>
        <View
          style={{
            position: 'absolute',
            left: -100,
            width: 60,
            top: 0,
            bottom: 0,
          }}
          pointerEvents="box-none"
        >
          <Pressable
            accessibilityLabel={accessibilityLabel}
            accessibilityRole="button"
            hitSlop={20}
            onPress={handleLeft}
            style={{ flex: 1 }}
            testID="sort-falling-left"
          />
        </View>
        <View
          style={{
            position: 'absolute',
            right: -100,
            width: 60,
            top: 0,
            bottom: 0,
          }}
          pointerEvents="box-none"
        >
          <Pressable
            accessibilityLabel={accessibilityLabel}
            accessibilityRole="button"
            hitSlop={20}
            onPress={handleRight}
            style={{ flex: 1 }}
            testID="sort-falling-right"
          />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

export function SortFallingGame({
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
  const [items, setItems] = useState<Item[]>([]);
  const nextIdRef = useRef(0);
  const scoreScale = useScoreBump(score);
  useGameCompletion(active, durationHintMs, onComplete);

  useEffect(() => {
    if (!active) {
      setItems([]);
      return undefined;
    }
    const spawnMs = compact ? 1200 : 1050;
    const spawn = () => {
      const id = nextIdRef.current++;
      setItems((current) => [...current.slice(-4), makeItem(id)]);
    };
    spawn();
    const interval = setInterval(spawn, spawnMs);
    return () => clearInterval(interval);
  }, [active, compact]);

  const handleAssign = useCallback((id: number, side: Side) => {
    setItems((current) => {
      const item = current.find((i) => i.id === id);
      if (!item || item.scoreSide) return current;
      if (item.side === side) {
        setScore((s) => s + 1);
        triggerLoadingMiniGameHaptic('success');
      } else {
        setScore((s) => Math.max(0, s - 1));
        triggerLoadingMiniGameHaptic('miss');
      }
      return current.map((i) => (i.id === id ? { ...i, scoreSide: side } : i));
    });
    setTimeout(() => {
      setItems((current) => current.filter((i) => i.id !== id));
    }, 320);
  }, []);

  const handleMiss = useCallback((id: number) => {
    setItems((current) => {
      const item = current.find((i) => i.id === id);
      if (item && !item.scoreSide) {
        setScore((s) => Math.max(0, s - 1));
      }
      return current.filter((i) => i.id !== id);
    });
  }, []);

  if (!active) return null;

  return (
    <MiniGameFrame
      chrome={chrome}
      labels={labels}
      score={score}
      scoreScale={scoreScale}
      testID="sort-falling-game"
      scoreTestID="sort-falling-score"
      playfieldTestID="sort-falling-playfield"
      playfieldChildren={
        <>
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: '18%',
              backgroundColor: withAlpha(chrome.accentColor, isDark ? 0.18 : 0.1),
              borderTopRightRadius: BORDER_RADIUS.sm,
              borderBottomRightRadius: BORDER_RADIUS.sm, borderCurve: 'continuous',
            }}
            testID="sort-falling-bin-left"
          />
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              right: 0,
              top: 0,
              bottom: 0,
              width: '18%',
              backgroundColor: withAlpha(chrome.secondaryAccentColor, isDark ? 0.18 : 0.1),
              borderTopLeftRadius: BORDER_RADIUS.sm,
              borderBottomLeftRadius: BORDER_RADIUS.sm, borderCurve: 'continuous',
            }}
            testID="sort-falling-bin-right"
          />
          {items.map((item) => (
            <FallingItem
              key={item.id}
              item={item}
              chrome={chrome}
              accessibilityLabel={labels.prompt}
              onAssign={handleAssign}
              onMiss={handleMiss}
              whiteColor={colors.white}
            />
          ))}
        </>
      }
    />
  );
}
