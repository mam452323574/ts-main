import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Path, Text as SvgText } from 'react-native-svg';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/contexts/ThemeContext';
import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SIZES,
  SPACING,
  withAlpha,
} from '@/constants/theme';

interface EntryOfferWheelProps {
  labels: string[];
  disabled?: boolean;
  onSpinStart?: () => void;
  onSpinEnd: () => void;
  centerLabel: string;
  spinningCenterLabel: string;
  idleCaption: string;
  spinningCaption: string;
  testID?: string;
}

const AnimatedView = Animated.createAnimatedComponent(View);
const SEGMENT_COLORS = [
  '#F7C65F',
  '#F29C6B',
  '#E87F83',
  '#C77BE6',
  '#7E8EF1',
  '#57B9C9',
] as const;

function polarToCartesian(
  centerX: number,
  centerY: number,
  radius: number,
  angleInDegrees: number,
) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;

  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

function createSegmentPath(
  centerX: number,
  centerY: number,
  outerRadius: number,
  innerRadius: number,
  startAngle: number,
  endAngle: number,
) {
  const outerStart = polarToCartesian(centerX, centerY, outerRadius, endAngle);
  const outerEnd = polarToCartesian(centerX, centerY, outerRadius, startAngle);
  const innerStart = polarToCartesian(centerX, centerY, innerRadius, startAngle);
  const innerEnd = polarToCartesian(centerX, centerY, innerRadius, endAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 0 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerStart.x} ${innerStart.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 1 ${innerEnd.x} ${innerEnd.y}`,
    'Z',
  ].join(' ');
}

export function EntryOfferWheel({
  labels,
  disabled = false,
  onSpinStart,
  onSpinEnd,
  centerLabel,
  spinningCenterLabel,
  idleCaption,
  spinningCaption,
  testID,
}: EntryOfferWheelProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const rotation = useSharedValue(0);
  const [spinning, setSpinning] = useState(false);
  const segmentAngle = 360 / Math.max(labels.length, 1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const handleSpin = () => {
    if (disabled || spinning) {
      return;
    }

    setSpinning(true);
    onSpinStart?.();
    const targetIndex = labels.length > 0 ? (labels.length - 1) % labels.length : 0;
    const targetAngle = targetIndex * segmentAngle + segmentAngle / 2;

    rotation.value = withTiming(
      rotation.value + 900 + targetAngle,
      {
        duration: 2600,
        easing: Easing.out(Easing.cubic),
      },
      (finished) => {
        if (!finished) {
          return;
        }

        runOnJS(setSpinning)(false);
        runOnJS(onSpinEnd)();
      },
    );
  };

  return (
    <View style={styles.shell} testID={testID}>
      <View style={styles.pointerWrap}>
        <View style={styles.pointer} />
      </View>

      <Pressable
        accessibilityRole="button"
        disabled={disabled || spinning}
        onPress={handleSpin}
        style={({ pressed }) => [
          styles.pressable,
          (disabled || spinning) && styles.pressableDisabled,
          pressed && styles.pressablePressed,
        ]}
        testID={testID ? `${testID}-pressable` : undefined}
      >
        <AnimatedView style={animatedStyle}>
          <Svg width={280} height={280} viewBox="0 0 280 280">
            <Circle cx={140} cy={140} r={132} fill={withAlpha(colors.primaryText, 0.03)} />
            <G>
              {labels.map((label, index) => {
                const startAngle = index * segmentAngle;
                const endAngle = startAngle + segmentAngle;
                const midAngle = startAngle + segmentAngle / 2;
                const textPosition = polarToCartesian(140, 140, 92, midAngle);

                return (
                  <G key={`${label}-${index}`}>
                    <Path
                      d={createSegmentPath(140, 140, 128, 54, startAngle, endAngle)}
                      fill={SEGMENT_COLORS[index % SEGMENT_COLORS.length]}
                      stroke={withAlpha('#FFFFFF', 0.5)}
                      strokeWidth={2}
                    />
                    <SvgText
                      x={textPosition.x}
                      y={textPosition.y}
                      fill="#FFFFFF"
                      fontSize="12"
                      fontWeight="700"
                      textAnchor="middle"
                      alignmentBaseline="middle"
                    >
                      {label}
                    </SvgText>
                  </G>
                );
              })}
            </G>
            <Circle cx={140} cy={140} r={46} fill="#FFFFFF" />
            <Circle cx={140} cy={140} r={38} fill={colors.primary} />
            <SvgText
              x={140}
              y={140}
              fill="#FFFFFF"
              fontSize="14"
              fontWeight="700"
              textAnchor="middle"
              alignmentBaseline="middle"
            >
              {spinning ? spinningCenterLabel : centerLabel}
            </SvgText>
          </Svg>
        </AnimatedView>
      </Pressable>

      <Text style={styles.caption}>
        {spinning ? spinningCaption : idleCaption}
      </Text>
    </View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    shell: {
      alignItems: 'center',
      gap: SPACING.md,
    },
    pointerWrap: {
      width: 0,
      height: 0,
      borderLeftWidth: 16,
      borderRightWidth: 16,
      borderBottomWidth: 26,
      borderLeftColor: 'transparent',
      borderRightColor: 'transparent',
      borderBottomColor: colors.primaryText,
      transform: [{ rotate: '180deg' }],
      marginBottom: -6,
      zIndex: 2,
    },
    pointer: {
      borderRadius: BORDER_RADIUS.full,
    },
    pressable: {
      borderRadius: 160,
    },
    pressablePressed: {
      transform: [{ scale: 0.99 }],
    },
    pressableDisabled: {
      opacity: 0.72,
    },
    caption: {
      fontSize: SIZES.text12,
      lineHeight: 20,
      fontWeight: FONT_WEIGHTS.medium,
      color: colors.gray,
      textAlign: 'center',
      paddingHorizontal: SPACING.lg,
    },
  });
