import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '@/contexts/ThemeContext';
import { FONT_WEIGHTS } from '@/constants/theme';
import {
  RESULT_TEXT_PROPS,
  getResultLayoutState,
  getResultSurfaceChrome,
} from '@/utils/resultLayout';

interface RadialScoreGaugeProps {
  score: number;
  maxScore?: number;
  label: string;
  color: string;
  size?: number;
  labelMaxLines?: number;
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export const RadialScoreGauge: React.FC<RadialScoreGaugeProps> = ({
  score,
  maxScore = 100,
  label,
  color,
  size,
  labelMaxLines = 2,
}) => {
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const layout = useMemo(() => getResultLayoutState(width), [width]);
  const styles = useMemo(() => createStyles(layout), [layout]);
  const animatedValue = useRef(new Animated.Value(0)).current;

  const gaugeSize = size ?? layout.scoreGaugeSize;
  const strokeWidth = layout.isCompact ? 11 : 12;
  const radius = (gaugeSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const percentage = Math.min(Math.max(score / maxScore, 0), 1);

  useEffect(() => {
    Animated.timing(animatedValue, {
      toValue: percentage,
      duration: 1200,
      useNativeDriver: false,
    }).start();
  }, [animatedValue, percentage]);

  const strokeDashoffset = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, circumference * (1 - percentage)],
  });

  return (
    <View
      testID="radial-score-gauge"
      style={[
        styles.container,
        getResultSurfaceChrome({
          colors,
          isDark,
          kind: 'standard',
        }),
      ]}
    >
      <View style={styles.labelWrap}>
        <Text
          {...RESULT_TEXT_PROPS}
          testID="radial-score-label"
          adjustsFontSizeToFit
          ellipsizeMode="tail"
          minimumFontScale={0.86}
          numberOfLines={labelMaxLines}
          style={[styles.label, { color: colors.gray }]}
        >
          {label}
        </Text>
      </View>

      <View style={styles.gaugeContainer}>
        <Svg width={gaugeSize} height={gaugeSize} style={styles.svg}>
          <Circle
            cx={gaugeSize / 2}
            cy={gaugeSize / 2}
            r={radius}
            stroke={colors.lightGray}
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          <AnimatedCircle
            cx={gaugeSize / 2}
            cy={gaugeSize / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            rotation="-90"
            origin={`${gaugeSize / 2}, ${gaugeSize / 2}`}
          />
        </Svg>

        <View style={styles.scoreContainer}>
          <Text
            {...RESULT_TEXT_PROPS}
            testID="radial-score-value"
            adjustsFontSizeToFit
            minimumFontScale={0.82}
            numberOfLines={1}
            style={[styles.scoreValue, { color }]}
          >
            {score}
          </Text>
          <Text
            {...RESULT_TEXT_PROPS}
            testID="radial-score-max"
            adjustsFontSizeToFit
            minimumFontScale={0.82}
            numberOfLines={1}
            style={[styles.scoreMax, { color: colors.gray }]}
          >
            /{maxScore}
          </Text>
        </View>
      </View>
    </View>
  );
};

const createStyles = (layout: ReturnType<typeof getResultLayoutState>) =>
  StyleSheet.create({
    container: {
      borderRadius: layout.standardRadius,
      borderWidth: 1,
      paddingHorizontal: layout.blockPadding,
      paddingVertical: layout.blockPadding,
      alignItems: 'center',
      minWidth: 0,
    },
    labelWrap: {
      width: '100%',
      minWidth: layout.scoreGaugeSize,
      minHeight: layout.isCompact ? 42 : 40,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: layout.sectionGap,
    },
    label: {
      fontSize: layout.bodyTextFontSize,
      lineHeight: layout.bodyTextLineHeight,
      fontWeight: FONT_WEIGHTS.medium,
      textAlign: 'center',
      alignSelf: 'stretch',
      flexShrink: 1,
      minWidth: 0,
      includeFontPadding: false,
    },
    gaugeContainer: {
      position: 'relative',
      alignItems: 'center',
      justifyContent: 'center',
    },
    svg: {
      transform: [{ rotate: '0deg' }],
    },
    scoreContainer: {
      position: 'absolute',
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'center',
      alignSelf: 'center',
      maxWidth: '82%',
      minWidth: 0,
    },
    scoreValue: {
      fontSize: layout.gaugeValueFontSize,
      lineHeight: layout.gaugeValueLineHeight,
      fontWeight: FONT_WEIGHTS.bold,
      includeFontPadding: false,
    },
    scoreMax: {
      marginLeft: 4,
      fontSize: layout.gaugeMaxFontSize,
      lineHeight: layout.gaugeMaxLineHeight,
      fontWeight: FONT_WEIGHTS.medium,
      includeFontPadding: false,
    },
  });

export default RadialScoreGauge;
