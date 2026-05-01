import type { AbstractChartConfig } from 'react-native-chart-kit/dist/AbstractChart';

import { BORDER_RADIUS, withAlpha } from '@/constants/theme';

interface AnalyticsLikeLineChartConfigOptions {
  backgroundColor: string;
  lineColor: string;
  labelColor: string;
  fillShadowGradientFrom: string;
  fillShadowGradientTo: string;
  dotStrokeColor: string;
  backgroundGradientFrom?: string;
  backgroundGradientTo?: string;
  backgroundGradientFromOpacity?: number;
  backgroundGradientToOpacity?: number;
  fillShadowGradientOpacity?: number;
  fillShadowGradientFromOpacity?: number;
  fillShadowGradientToOpacity?: number;
  backgroundLineColor?: string;
  backgroundLineOpacity?: number;
  backgroundLineDasharray?: string;
  borderRadius?: number;
  strokeWidth?: number;
  dotRadius?: number;
  dotStrokeWidth?: number;
  labelFontSize?: number;
}

interface TrajectoryProjectionLineChartConfigOptions {
  isDark: boolean;
  lineColor: string;
  fillShadowGradientFrom: string;
  fillShadowGradientTo: string;
  dotStrokeColor: string;
  backgroundLineColor?: string;
  borderRadius?: number;
  strokeWidth?: number;
}

export const ANALYTICS_LIKE_LINE_CHART_PROPS = {
  bezier: true,
  withInnerLines: true,
  withOuterLines: false,
  withVerticalLines: false,
  withHorizontalLines: true,
  fromZero: true,
} as const;

export const TRAJECTORY_PREVIEW_LINE_CHART_PROPS = {
  ...ANALYTICS_LIKE_LINE_CHART_PROPS,
  withShadow: true,
  segments: 3,
} as const;

export function createAnalyticsLikeLineChartConfig(
  options: AnalyticsLikeLineChartConfigOptions,
): AbstractChartConfig {
  const {
    backgroundColor,
    backgroundGradientFrom = backgroundColor,
    backgroundGradientTo = backgroundColor,
    backgroundGradientFromOpacity,
    backgroundGradientToOpacity,
    lineColor,
    labelColor,
    fillShadowGradientFrom,
    fillShadowGradientTo,
    fillShadowGradientOpacity,
    fillShadowGradientFromOpacity,
    fillShadowGradientToOpacity,
    backgroundLineColor = labelColor,
    backgroundLineOpacity = 0.1,
    backgroundLineDasharray = '6',
    borderRadius = BORDER_RADIUS.lg,
    strokeWidth,
    dotRadius = 4,
    dotStrokeWidth = 2,
    dotStrokeColor,
    labelFontSize,
  } = options;

  const config: AbstractChartConfig = {
    backgroundColor,
    backgroundGradientFrom,
    backgroundGradientTo,
    decimalPlaces: 0,
    color: (opacity = 1) => withAlpha(lineColor, opacity),
    labelColor: () => labelColor,
    style: {
      borderRadius,
    },
    propsForBackgroundLines: {
      strokeDasharray: backgroundLineDasharray,
      stroke: backgroundLineColor,
      strokeOpacity: backgroundLineOpacity,
      strokeWidth: 1,
    },
    propsForDots: {
      r: String(dotRadius),
      strokeWidth: String(dotStrokeWidth),
      stroke: dotStrokeColor,
    },
    fillShadowGradientFrom,
    fillShadowGradientTo,
  };

  if (typeof backgroundGradientFromOpacity === 'number') {
    config.backgroundGradientFromOpacity = backgroundGradientFromOpacity;
  }

  if (typeof backgroundGradientToOpacity === 'number') {
    config.backgroundGradientToOpacity = backgroundGradientToOpacity;
  }

  if (typeof fillShadowGradientOpacity === 'number') {
    config.fillShadowGradientOpacity = fillShadowGradientOpacity;
  }

  if (typeof fillShadowGradientFromOpacity === 'number') {
    config.fillShadowGradientFromOpacity = fillShadowGradientFromOpacity;
  }

  if (typeof fillShadowGradientToOpacity === 'number') {
    config.fillShadowGradientToOpacity = fillShadowGradientToOpacity;
  }

  if (typeof strokeWidth === 'number') {
    config.strokeWidth = strokeWidth;
  }

  if (typeof labelFontSize === 'number') {
    config.propsForLabels = {
      fontSize: labelFontSize,
    };
  }

  return config;
}

export function createTrajectoryPreviewLineChartConfig(
  options: TrajectoryProjectionLineChartConfigOptions,
): AbstractChartConfig {
  const {
    isDark,
    lineColor,
    fillShadowGradientFrom,
    fillShadowGradientTo,
    dotStrokeColor,
    backgroundLineColor = withAlpha(lineColor, isDark ? 0.18 : 0.14),
    borderRadius,
    strokeWidth,
  } = options;

  return createAnalyticsLikeLineChartConfig({
    backgroundColor: 'transparent',
    backgroundGradientFrom: 'transparent',
    backgroundGradientTo: 'transparent',
    backgroundGradientFromOpacity: 0,
    backgroundGradientToOpacity: 0,
    lineColor,
    labelColor: 'transparent',
    fillShadowGradientFrom,
    fillShadowGradientTo,
    fillShadowGradientFromOpacity: 1,
    fillShadowGradientToOpacity: 1,
    backgroundLineColor,
    backgroundLineOpacity: 0.62,
    backgroundLineDasharray: '10 10',
    dotStrokeColor,
    borderRadius,
    strokeWidth,
    labelFontSize: 0,
  });
}
