import React, { useEffect, useMemo } from 'react';
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
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

import {
  BORDER_RADIUS,
  ThemeColors,
  mixColors,
  withAlpha,
} from '@/constants/theme';

interface FridgeScanIllustrationProps {
  size: number;
  colors: ThemeColors;
  isDark: boolean;
  testID?: string;
}

const SCAN_TOP_PCT = 0.22;
const SCAN_BOTTOM_PCT = 0.78;
const SCAN_LEFT_PCT = 0.18;
const SCAN_WIDTH_PCT = 0.64;
const SCAN_DURATION_MS = 2400;

export function FridgeScanIllustration({
  size,
  colors,
  isDark,
  testID,
}: FridgeScanIllustrationProps) {
  const scan = useSharedValue(0);

  useEffect(() => {
    scan.value = withRepeat(
      withTiming(1, {
        duration: SCAN_DURATION_MS,
        easing: Easing.linear,
      }),
      -1,
      false,
    );
  }, [scan]);

  const palette = useMemo(() => {
    const apple = mixColors('#E63946', colors.primary, 0.18);
    const leaf = mixColors(colors.accentGreen, colors.primary, 0.2);
    const banana = mixColors('#FCBF49', colors.primary, 0.12);
    const orange = mixColors('#F77F00', colors.primary, 0.14);
    const orangeShade = withAlpha(
      mixColors('#C7570B', colors.primary, 0.2),
      0.45,
    );
    const berry = mixColors('#A06CD5', colors.secondary, 0.3);
    const berryStem = mixColors(colors.accentGreen, colors.primary, 0.4);
    const scanColor = withAlpha(colors.primary, isDark ? 0.95 : 0.85);
    const haloOuter = withAlpha(colors.primary, 0);
    const haloInner = withAlpha(colors.primary, isDark ? 0.28 : 0.18);
    const surfaceFill = isDark
      ? withAlpha(colors.primary, 0.08)
      : withAlpha(colors.white, 0.55);
    const surfaceStroke = withAlpha(colors.primary, isDark ? 0.28 : 0.18);
    const scanAccentBg = withAlpha(colors.primary, isDark ? 0.22 : 0.13);
    const scanAccentRing = withAlpha(colors.primary, isDark ? 0.72 : 0.48);
    const scanAccentCore = isDark
      ? mixColors(colors.white, colors.primary, 0.22)
      : colors.primary;
    const scanLineColor = colors.primary;
    return {
      apple,
      leaf,
      banana,
      orange,
      orangeShade,
      berry,
      berryStem,
      scanColor,
      haloOuter,
      haloInner,
      surfaceFill,
      surfaceStroke,
      scanAccentBg,
      scanAccentRing,
      scanAccentCore,
      scanLineColor,
    };
  }, [colors, isDark]);

  const scanRange = (SCAN_BOTTOM_PCT - SCAN_TOP_PCT) * size;
  const scanTop = SCAN_TOP_PCT * size;
  const scanLeft = SCAN_LEFT_PCT * size;
  const scanWidth = SCAN_WIDTH_PCT * size;
  const transparent = withAlpha(palette.scanLineColor, 0);

  const scanLineStyle = useAnimatedStyle(() => {
    const t = scan.value;
    let opacity: number;
    if (t < 0.12) {
      opacity = (t / 0.12) * 0.85;
    } else if (t > 0.88) {
      opacity = ((1 - t) / 0.12) * 0.85;
    } else {
      opacity = 0.85;
    }
    return {
      transform: [{ translateY: t * scanRange }],
      opacity,
    };
  });

  return (
    <View
      style={[styles.container, { width: size, height: size }]}
      accessible={false}
      pointerEvents="none"
      testID={testID}
    >
      <Svg width="100%" height="100%" viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id="fridgeScanHalo" cx="50%" cy="52%" r="50%">
            <Stop offset="0%" stopColor={palette.haloInner} stopOpacity={1} />
            <Stop offset="100%" stopColor={palette.haloOuter} stopOpacity={0} />
          </RadialGradient>
        </Defs>

        <Rect
          x={2}
          y={2}
          width={96}
          height={96}
          rx={18}
          ry={18}
          fill={palette.surfaceFill}
          stroke={palette.surfaceStroke}
          strokeWidth={1}
        />

        <Circle cx={50} cy={52} r={48} fill="url(#fridgeScanHalo)" />

        <Circle cx={30} cy={62} r={10} fill={palette.apple} />
        <Path
          d="M 30 52 Q 33 49 36 50"
          stroke={palette.leaf}
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
        />

        <Path
          d="M 46 38 Q 54 28 62 38 Q 58 39.5 54 39.5 Q 50 39.5 46 38 Z"
          fill={palette.banana}
        />

        <Circle cx={68} cy={62} r={9} fill={palette.orange} />
        <Circle cx={68} cy={62} r={3.2} fill={palette.orangeShade} />
        <Path
          d="M 68 53.5 L 68 51"
          stroke={palette.leaf}
          strokeWidth={1.6}
          strokeLinecap="round"
        />

        <Circle cx={46} cy={76} r={4.5} fill={palette.berry} />
        <Circle cx={54} cy={78} r={4.5} fill={palette.berry} />
        <Path
          d="M 48 71.5 Q 50 70 52 71.5"
          stroke={palette.berryStem}
          strokeWidth={1.2}
          fill="none"
          strokeLinecap="round"
        />

        <Path
          d="M 18 28 L 18 22 L 24 22"
          stroke={palette.scanColor}
          strokeWidth={2.2}
          fill="none"
          strokeLinecap="round"
        />
        <Path
          d="M 76 22 L 82 22 L 82 28"
          stroke={palette.scanColor}
          strokeWidth={2.2}
          fill="none"
          strokeLinecap="round"
        />
        <Path
          d="M 18 72 L 18 78 L 24 78"
          stroke={palette.scanColor}
          strokeWidth={2.2}
          fill="none"
          strokeLinecap="round"
        />
        <Path
          d="M 76 78 L 82 78 L 82 72"
          stroke={palette.scanColor}
          strokeWidth={2.2}
          fill="none"
          strokeLinecap="round"
        />
        <Circle cx={78.5} cy={78.5} r={5.8} fill={palette.scanAccentBg} />
        <Circle
          cx={78.5}
          cy={78.5}
          r={4.1}
          fill="none"
          stroke={palette.scanAccentRing}
          strokeWidth={1}
        />
        <Circle cx={78.5} cy={78.5} r={1.8} fill={palette.scanAccentCore} />
      </Svg>

      <Animated.View
        style={[
          styles.scanLineWrap,
          {
            top: scanTop,
            left: scanLeft,
            width: scanWidth,
          },
          scanLineStyle,
        ]}
      >
        <LinearGradient
          colors={[transparent, palette.scanLineColor, transparent]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.scanLineGradient}
        />
      </Animated.View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: BORDER_RADIUS.lg + 6,
  },
  scanLineWrap: {
    position: 'absolute',
    height: 2,
    borderRadius: 1,
  },
  scanLineGradient: {
    flex: 1,
    height: 2,
    borderRadius: 1,
  },
});
