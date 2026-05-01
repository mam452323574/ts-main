import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '@/contexts/ThemeContext';
import { SIZES, FONT_WEIGHTS } from '@/constants/theme';

interface CircularProgressProps {
  value: number;
  size?: number;
  strokeWidth?: number;
  showText?: boolean;
  textStyle?: any;
}

export function CircularProgress({
  value,
  size = 140,
  strokeWidth = 10,
  showText = true,
  textStyle
}: CircularProgressProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const progress = ((100 - value) / 100) * circumference;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.lightGray}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.accentGreen}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={progress}
          strokeLinecap="round"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      {showText && (
        <View style={styles.textContainer}>
          <Text style={[styles.value, textStyle]}>{value}</Text>
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    position: 'absolute',
    alignItems: 'center',
  },
  value: {
    fontSize: SIZES.scoreNumber,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.primaryText,
    lineHeight: SIZES.scoreNumber,
  },
  label: {
    fontSize: SIZES.scoreSub,
    fontWeight: FONT_WEIGHTS.regular,
    color: colors.gray,
    lineHeight: SIZES.scoreSub + 2,
  },
  sublabel: {
    fontSize: SIZES.scoreSub,
    fontWeight: FONT_WEIGHTS.regular,
    color: colors.gray,
    lineHeight: SIZES.scoreSub + 2,
  },
});
