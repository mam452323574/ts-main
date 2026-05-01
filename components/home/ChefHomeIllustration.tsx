import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';

import {
  BORDER_RADIUS,
  ThemeColors,
  mixColors,
  withAlpha,
} from '@/constants/theme';

interface ChefHomeIllustrationProps {
  size: number;
  colors: ThemeColors;
  isDark: boolean;
  testID?: string;
}

const STEAM_DURATION_MS = 2600;

export function ChefHomeIllustration({
  size,
  colors,
  isDark,
  testID,
}: ChefHomeIllustrationProps) {
  const steam = useSharedValue(0);

  useEffect(() => {
    steam.value = withRepeat(
      withTiming(1, {
        duration: STEAM_DURATION_MS,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true,
    );
  }, [steam]);

  const palette = useMemo(() => {
    const warmAccent = mixColors(colors.warning, colors.gold, 0.22);
    const herb = mixColors(colors.success, colors.primary, 0.18);
    const tomato = mixColors(colors.error, colors.warning, 0.22);
    const surfaceFill = isDark
      ? withAlpha(colors.white, 0.08)
      : withAlpha(colors.white, 0.62);
    const surfaceStroke = withAlpha(warmAccent, isDark ? 0.35 : 0.24);
    const clocheTop = isDark
      ? mixColors(colors.cardBackground, warmAccent, 0.28)
      : mixColors(colors.white, warmAccent, 0.2);
    const clocheBottom = isDark
      ? mixColors(colors.cardBackground, colors.warning, 0.18)
      : mixColors(colors.white, colors.warning, 0.34);
    const clocheStroke = withAlpha(
      mixColors(colors.primaryText, warmAccent, isDark ? 0.42 : 0.28),
      isDark ? 0.72 : 0.4,
    );
    const plate = isDark
      ? withAlpha(colors.white, 0.14)
      : mixColors(colors.cardBackground, colors.primary, 0.04);
    const plateStroke = withAlpha(colors.primary, isDark ? 0.24 : 0.14);
    const chefWhite = isDark
      ? mixColors(colors.white, colors.gold, 0.04)
      : colors.white;

    return {
      warmAccent,
      herb,
      tomato,
      surfaceFill,
      surfaceStroke,
      clocheTop,
      clocheBottom,
      clocheStroke,
      plate,
      plateStroke,
      chefWhite,
      steam: withAlpha(colors.primaryText, isDark ? 0.38 : 0.28),
      shadow: withAlpha(colors.primaryText, isDark ? 0.32 : 0.08),
      goldWash: withAlpha(colors.gold, isDark ? 0.18 : 0.22),
      primaryWash: withAlpha(colors.primary, isDark ? 0.18 : 0.12),
    };
  }, [colors, isDark]);

  const steamStyle = useAnimatedStyle(() => ({
    opacity: 0.45 + steam.value * 0.35,
    transform: [{ translateY: -2 - steam.value * 4 }],
  }));

  return (
    <View
      style={[styles.container, { width: size, height: size }]}
      accessible={false}
      pointerEvents="none"
      testID={testID}
    >
      <LinearGradient
        colors={[palette.goldWash, palette.primaryWash, withAlpha(colors.white, 0)]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.backplate}
      />

      <Animated.View style={[styles.steamLayer, steamStyle]}>
        <Svg width="100%" height="100%" viewBox="0 0 100 100">
          <Path
            d="M 37 29 C 32 23 42 19 36 13"
            stroke={palette.steam}
            strokeWidth={2.1}
            strokeLinecap="round"
            fill="none"
          />
          <Path
            d="M 50 27 C 45 20 56 17 50 10"
            stroke={palette.steam}
            strokeWidth={2.2}
            strokeLinecap="round"
            fill="none"
          />
          <Path
            d="M 63 30 C 58 24 68 21 62 15"
            stroke={palette.steam}
            strokeWidth={2.1}
            strokeLinecap="round"
            fill="none"
          />
        </Svg>
      </Animated.View>

      <Svg width="100%" height="100%" viewBox="0 0 100 100">
        <Defs>
          <SvgLinearGradient id="chefCardCloche" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={palette.clocheTop} stopOpacity={1} />
            <Stop offset="100%" stopColor={palette.clocheBottom} stopOpacity={1} />
          </SvgLinearGradient>
          <SvgLinearGradient id="chefCardHandle" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor={palette.chefWhite} stopOpacity={1} />
            <Stop offset="100%" stopColor={palette.warmAccent} stopOpacity={0.8} />
          </SvgLinearGradient>
        </Defs>

        <Rect
          x={3}
          y={3}
          width={94}
          height={94}
          rx={22}
          ry={22}
          fill={palette.surfaceFill}
          stroke={palette.surfaceStroke}
          strokeWidth={1}
        />

        <Path
          d="M 18 82 C 18 78.1 32.3 75 50 75 C 67.7 75 82 78.1 82 82 C 82 85.9 67.7 89 50 89 C 32.3 89 18 85.9 18 82 Z"
          fill={palette.shadow}
        />
        <Path
          d="M 16 75 C 16 69.5 31.2 65 50 65 C 68.8 65 84 69.5 84 75 C 84 80.5 68.8 85 50 85 C 31.2 85 16 80.5 16 75 Z"
          fill={palette.plate}
          stroke={palette.plateStroke}
          strokeWidth={1.4}
        />
        <Path
          d="M 27 73 C 27 70.1 37.3 67.8 50 67.8 C 62.7 67.8 73 70.1 73 73 C 73 75.9 62.7 78.2 50 78.2 C 37.3 78.2 27 75.9 27 73 Z"
          fill={withAlpha(palette.plateStroke, isDark ? 0.22 : 0.12)}
        />

        <Path
          d="M 24 67 C 27 45 38 35 50 35 C 63 35 73 45 76 67 Z"
          fill="url(#chefCardCloche)"
          stroke={palette.clocheStroke}
          strokeWidth={1.5}
        />
        <Path
          d="M 21 67 H 79"
          stroke={palette.clocheStroke}
          strokeWidth={3}
          strokeLinecap="round"
        />
        <Path
          d="M 38 40 C 43 36 49 35 56 37"
          stroke={withAlpha(colors.white, isDark ? 0.45 : 0.75)}
          strokeWidth={2}
          strokeLinecap="round"
          fill="none"
        />
        <Path
          d="M 43 34 C 43 28 47 25 50 25 C 54 25 58 28 58 34"
          fill="none"
          stroke={palette.clocheStroke}
          strokeWidth={2}
          strokeLinecap="round"
        />
        <Circle cx={50} cy={28} r={4.4} fill="url(#chefCardHandle)" />

        <Circle cx={28} cy={62} r={2.8} fill={palette.tomato} />
        <Circle cx={72} cy={62} r={2.8} fill={palette.herb} />
        <Path
          d="M 70 58 C 75 55 77 57 76 62"
          stroke={palette.herb}
          strokeWidth={1.5}
          strokeLinecap="round"
          fill="none"
        />
        <Path
          d="M 26 58 C 22 56 21 59 23 62"
          stroke={palette.warmAccent}
          strokeWidth={1.5}
          strokeLinecap="round"
          fill="none"
        />

        <Path
          d="M 27 29 C 23 25 24 18 30 17 C 31 11 39 10 42 16 C 47 12 55 15 54 22 C 59 22 62 27 59 32 C 53 30 34 30 27 29 Z"
          fill={palette.chefWhite}
          stroke={withAlpha(palette.clocheStroke, isDark ? 0.4 : 0.22)}
          strokeWidth={1}
        />
        <Path
          d="M 31 30 H 55 V 36 H 31 Z"
          fill={mixColors(palette.chefWhite, palette.warmAccent, isDark ? 0.1 : 0.05)}
          stroke={withAlpha(palette.clocheStroke, isDark ? 0.35 : 0.2)}
          strokeWidth={1}
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: BORDER_RADIUS.lg + 10,
  },
  backplate: {
    ...StyleSheet.absoluteFillObject,
  },
  steamLayer: {
    ...StyleSheet.absoluteFillObject,
  },
});
