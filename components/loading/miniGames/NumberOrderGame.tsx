import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme } from '@/contexts/ThemeContext';
import { BORDER_RADIUS, FONT_WEIGHTS, SIZES, SPACING, withAlpha } from '@/constants/theme';

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

interface Cell {
  value: number;
  x: number;
  y: number;
}

function generateGrid(count: number, compact: boolean): Cell[] {
  const cells: Cell[] = [];
  const cols = compact ? 3 : 4;
  const rows = compact ? 3 : 3;
  const cellW = 100 / cols;
  const cellH = 100 / rows;
  const positions: { col: number; row: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      positions.push({ col: c, row: r });
    }
  }
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [positions[i], positions[j]] = [positions[j]!, positions[i]!];
  }
  for (let v = 1; v <= count; v++) {
    const pos = positions[v - 1] ?? { col: 0, row: 0 };
    cells.push({
      value: v,
      x: pos.col * cellW + cellW / 2,
      y: pos.row * cellH + cellH / 2,
    });
  }
  return cells;
}

interface NumberCellProps {
  cell: Cell;
  size: number;
  chrome: Chrome;
  isNext: boolean;
  done: boolean;
  accessibilityLabel: string;
  onPress: (cell: Cell) => void;
  textColor: string;
  fontSize: number;
}

function NumberCell({
  cell,
  size,
  chrome,
  isNext,
  done,
  accessibilityLabel,
  onPress,
  textColor,
  fontSize,
}: NumberCellProps) {
  const { scale, opacity } = useEntryPulse();
  const translateX = useRef(new Animated.Value(0)).current;
  const onPressRef = useRef(onPress);
  useEffect(() => {
    onPressRef.current = onPress;
  }, [onPress]);

  const handlePress = useCallback(() => {
    if (done) return;
    Animated.sequence([
      Animated.timing(scale, {
        toValue: 1.22,
        duration: 90,
        easing: MINI_GAME_EASING.uiOut,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 4,
        tension: 130,
        useNativeDriver: true,
      }),
    ]).start();
    onPressRef.current(cell);
  }, [cell, done, scale]);

  const toneStyle = isNext ? chrome.styles.markerPrimary : chrome.styles.markerSecondary;
  const gradient = isNext ? chrome.gradients.markerPrimary : chrome.gradients.markerSecondary;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        chrome.styles.marker,
        toneStyle,
        {
          height: size,
          width: size,
          borderRadius: size / 2,
          left: `${cell.x}%`,
          top: `${cell.y}%`,
          marginLeft: -size / 2,
          marginTop: -size / 2,
          opacity: done ? Animated.multiply(opacity, 0.32) : opacity,
          transform: [{ scale }, { translateX }], borderCurve: 'continuous',
        },
      ]}
    >
      <LinearGradient
        colors={gradient}
        start={{ x: 0.2, y: 0.15 }}
        end={{ x: 0.85, y: 0.95 }}
        style={[chrome.styles.markerGradientFill, { borderRadius: size / 2, borderCurve: 'continuous' }]}
        pointerEvents="none"
      />
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        onPress={handlePress}
        style={StyleSheet.absoluteFill}
        testID={`number-order-cell-${cell.value}`}
        disabled={done}
      >
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            style={{
              color: textColor,
              fontSize,
              fontWeight: FONT_WEIGHTS.bold,
            }}
          >
            {cell.value}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function NumberOrderGame({
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
  const [next, setNext] = useState(1);
  const [cells, setCells] = useState<Cell[]>(() => generateGrid(compact ? 7 : 9, compact));
  const [resetSeed, setResetSeed] = useState(0);
  const scoreScale = useScoreBump(score);
  useGameCompletion(active, durationHintMs, onComplete);

  const cellSize = compact ? 28 : 34;
  const fontSize = compact ? SIZES.text12 : SIZES.text14;

  useEffect(() => {
    if (!active) return undefined;
    if (next > cells.length) {
      const timeout = setTimeout(() => {
        setCells(generateGrid(compact ? 7 : 9, compact));
        setNext(1);
        setResetSeed((s) => s + 1);
      }, 400);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [active, compact, next, cells.length]);

  const handleCellPress = useCallback(
    (cell: Cell) => {
      if (cell.value === next) {
        setScore((s) => s + 1);
        setNext((n) => n + 1);
        triggerLoadingMiniGameHaptic('success');
      } else {
        setScore((s) => Math.max(0, s - 1));
        setNext(1);
        setResetSeed((s) => s + 1);
        triggerLoadingMiniGameHaptic('miss');
      }
    },
    [next],
  );

  if (!active) return null;

  return (
    <MiniGameFrame
      chrome={chrome}
      labels={labels}
      score={score}
      scoreScale={scoreScale}
      testID="number-order-game"
      scoreTestID="number-order-score"
      playfieldTestID="number-order-playfield"
      playfieldChildren={
        <>
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: SPACING.xs,
              left: SPACING.sm,
              paddingHorizontal: SPACING.sm,
              paddingVertical: 2,
              borderRadius: BORDER_RADIUS.full,
              backgroundColor: withAlpha(chrome.accentColor, isDark ? 0.32 : 0.18),
              zIndex: 2, borderCurve: 'continuous',
            }}
          >
            <Text
              style={{
                color: colors.white,
                fontSize: compact ? SIZES.text10 : SIZES.text12,
                fontWeight: FONT_WEIGHTS.bold,
              }}
              testID="number-order-next"
            >
              → {next > cells.length ? '✓' : next}
            </Text>
          </View>
          {cells.map((cell) => (
            <NumberCell
              key={`${cell.value}-${resetSeed}`}
              cell={cell}
              size={cellSize}
              chrome={chrome}
              isNext={cell.value === next}
              done={cell.value < next}
              accessibilityLabel={labels.prompt}
              onPress={handleCellPress}
              textColor={colors.white}
              fontSize={fontSize}
            />
          ))}
        </>
      }
    />
  );
}
