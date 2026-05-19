import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

import { TrajectoryPreviewCard } from '@/components/TrajectoryPreviewCard';

const originalPlatform = Platform.OS;
const mockLineChartProps: any[] = [];
const useWindowDimensionsSpy = jest.spyOn(
  require('react-native'),
  'useWindowDimensions',
);

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      primary: '#007AFF',
      gold: '#FFD700',
      warning: '#FF9500',
      white: '#FFFFFF',
      gray: '#8E8E93',
      lightGray: '#D1D1D6',
      cardBackground: '#FFFFFF',
      primaryText: '#1D1D1F',
      background: '#F2F2F7',
    },
    isDark: false,
  }),
}));

jest.mock('react-native-chart-kit', () => ({
  LineChart: (props: any) => {
    const ReactLocal = require('react');
    const { View: RNView } = require('react-native');
    mockLineChartProps.push(props);
    return ReactLocal.createElement(RNView, { testID: 'mock-line-chart' });
  },
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children, ...props }: any) => {
    const ReactLocal = require('react');
    const { View: RNView } = require('react-native');
    return ReactLocal.createElement(RNView, props, children);
  },
}));

jest.mock('expo-blur', () => ({
  BlurView: ({ children, ...props }: any) => {
    const ReactLocal = require('react');
    const { View: RNView } = require('react-native');
    return ReactLocal.createElement(RNView, props, children);
  },
}));

jest.mock('lucide-react-native', () => ({
  Lock: () => {
    const ReactLocal = require('react');
    const { View: RNView } = require('react-native');
    return ReactLocal.createElement(RNView, { testID: 'mock-lock-icon' });
  },
}));

const buildProjectionPoints = (series: number[]) => {
  const baseDate = new Date('2026-03-27T00:00:00Z');

  return series.map((chartValue, index) => {
    const day = index * 5;
    const nextDate = new Date(baseDate);
    nextDate.setUTCDate(baseDate.getUTCDate() + day);

    return {
      id: `day_${day}`,
      day,
      date: nextDate.toISOString().slice(0, 10),
      chartValue,
      displayValue: Math.round(chartValue),
    };
  });
};

const lockedSeries = [74, 75.1, 76.2, 77.1, 78.1, 78.8, 79.2];
const unlockedSeries = [74, 75.8, 77.9, 80.1, 82.2, 84, 85];
const loadingSeries = [74, 74, 74, 74, 74, 74, 74];

const lockedModel = {
  shouldRender: true,
  premiumRenderState: 'locked' as const,
  hookLabel: 'Potential',
  title: '30-day projection',
  badgeLabel: 'PREMIUM',
  headline: 'Unlock your 30-day projection.',
  subtitle: 'Premium reveals the 30-day curve.',
  ctaLabel: 'Unlock my projection',
  points: buildProjectionPoints(lockedSeries),
  series: lockedSeries,
  checkpoints: [],
};

const unlockedModel = {
  shouldRender: true,
  premiumRenderState: 'unlocked' as const,
  hookLabel: 'Estimated',
  title: '30-day projection',
  badgeLabel: 'ACTIVE',
  headline: 'At this pace, Face score could reach 85/100 in 30 days.',
  subtitle: 'Built from this scan and your recent trend.',
  footnote: 'Indicative estimate, not medical advice.',
  points: buildProjectionPoints(unlockedSeries),
  series: unlockedSeries,
  checkpoints: [
    { id: 'day_0', label: 'Today', value: '74/100' },
    { id: 'day_15', label: 'Day 15', value: '80/100' },
    { id: 'day_30', label: 'Day 30', value: '85/100', isHighlighted: true },
  ],
};

const loadingModel = {
  shouldRender: true,
  premiumRenderState: 'loading' as const,
  hookLabel: 'Syncing',
  title: '30-day projection',
  badgeLabel: 'UPDATING',
  headline: 'Preparing your 30-day projection.',
  subtitle: 'Your premium preview will refresh in a moment.',
  points: buildProjectionPoints(loadingSeries),
  series: loadingSeries,
  checkpoints: [],
};

const getLatestLineChartProps = () =>
  mockLineChartProps[mockLineChartProps.length - 1];

const extractAlpha = (color: string) => {
  const match = color.match(/rgba\(\s*\d+,\s*\d+,\s*\d+,\s*([0-9.]+)\s*\)/);
  return match ? Number(match[1]) : 1;
};

describe('TrajectoryPreviewCard', () => {
  beforeEach(() => {
    mockLineChartProps.length = 0;
    Object.defineProperty(Platform, 'OS', {
      value: originalPlatform,
      configurable: true,
    });
    useWindowDimensionsSpy.mockReturnValue({
      width: 390,
      height: 844,
      scale: 3,
      fontScale: 1,
    });
  });

  it('renders the locked premium teaser state and CTA', () => {
    const onPress = jest.fn();
    const { UNSAFE_getByProps, getByText, getByTestId, queryByTestId } = render(
      <TrajectoryPreviewCard model={lockedModel} onPress={onPress} />,
    );
    const lineChartProps = getLatestLineChartProps();

    expect(getByTestId('trajectory-preview-card')).toBeTruthy();
    expect(UNSAFE_getByProps({ testID: 'mock-line-chart' })).toBeTruthy();
    expect(UNSAFE_getByProps({ testID: 'trajectory-preview-lock' })).toBeTruthy();
    expect(UNSAFE_getByProps({ testID: 'trajectory-preview-blur' })).toBeTruthy();
    expect(queryByTestId('trajectory-preview-note')).toBeNull();
    expect(queryByTestId('trajectory-preview-checkpoints')).toBeNull();
    expect(getByText('Potential')).toBeTruthy();
    expect(getByText('30-day projection')).toBeTruthy();
    expect(getByText('Unlock your 30-day projection.')).toBeTruthy();
    expect(getByText('Premium reveals the 30-day curve.')).toBeTruthy();
    expect(lineChartProps.withHorizontalLines).toBe(true);
    expect(lineChartProps.withShadow).toBe(true);
    expect(lineChartProps.withHorizontalLabels).toBe(false);
    expect(lineChartProps.withVerticalLabels).toBe(false);
    expect(lineChartProps.segments).toBe(3);
    expect(lineChartProps.hidePointsAtIndex).toEqual([1, 2, 4, 5]);
    expect(lineChartProps.chartConfig.propsForLabels).toEqual({ fontSize: 0 });
    expect(lineChartProps.chartConfig.propsForBackgroundLines).toMatchObject({
      strokeDasharray: '10 10',
      strokeOpacity: 0.62,
    });
    expect(lineChartProps.data.datasets[0].strokeWidth).toBe(2.25);
    expect(lineChartProps.chartConfig.strokeWidth).toBe(2.25);
    expect(extractAlpha(lineChartProps.chartConfig.fillShadowGradientFrom)).toBeLessThan(0.18);
    expect(extractAlpha(lineChartProps.chartConfig.fillShadowGradientTo)).toBeLessThanOrEqual(0.03);
    expect(lineChartProps.getDotProps(lockedSeries[0], 0)).toMatchObject({
      r: '3.2',
      strokeWidth: '1.5',
    });
    expect(lineChartProps.getDotProps(lockedSeries[6], 6)).toMatchObject({
      r: '4.2',
      strokeWidth: '2',
    });
    expect(
      lineChartProps.renderDotContent({ x: 20, y: 30, index: 0, indexData: lockedSeries[0] }),
    ).toBeNull();
    expect(
      lineChartProps.renderDotContent({ x: 20, y: 30, index: 6, indexData: lockedSeries[6] }),
    ).toMatchObject({
      props: {
        cx: 20,
        cy: 30,
        fill: 'none',
        r: 7.75,
        strokeWidth: 1.2,
      },
    });

    fireEvent.press(getByTestId('trajectory-preview-cta'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders the unlocked premium projection without blur and highlights the day 30 checkpoint', () => {
    const { getByTestId, getByText, queryByTestId } = render(
      <TrajectoryPreviewCard model={unlockedModel} />,
    );
    const lineChartProps = getLatestLineChartProps();

    expect(queryByTestId('trajectory-preview-blur')).toBeNull();
    expect(queryByTestId('trajectory-preview-lock')).toBeNull();
    expect(queryByTestId('trajectory-preview-cta')).toBeNull();
    expect(getByTestId('trajectory-preview-checkpoints')).toBeTruthy();
    expect(getByTestId('trajectory-preview-checkpoint-day_0')).toBeTruthy();
    expect(getByTestId('trajectory-preview-checkpoint-day_15')).toBeTruthy();
    expect(getByTestId('trajectory-preview-checkpoint-day_30')).toBeTruthy();
    expect(getByTestId('trajectory-preview-note')).toBeTruthy();
    expect(getByText('Estimated')).toBeTruthy();
    expect(getByText('ACTIVE')).toBeTruthy();
    expect(getByText('Indicative estimate, not medical advice.')).toBeTruthy();

    const todayStyle = StyleSheet.flatten(
      getByTestId('trajectory-preview-checkpoint-day_0').props.style,
    );
    const day30Style = StyleSheet.flatten(
      getByTestId('trajectory-preview-checkpoint-day_30').props.style,
    );

    expect(day30Style.backgroundColor).not.toBe(todayStyle.backgroundColor);
    expect(lineChartProps.hidePointsAtIndex).toEqual([1, 2, 4, 5]);
    expect(lineChartProps.getDotProps(unlockedSeries[6], 6)).toMatchObject({
      r: '4.2',
      strokeWidth: '2',
    });
  });

  it('renders the neutral loading state without CTA or premium content checkpoints', () => {
    const { getByTestId, getByText, queryByTestId } = render(
      <TrajectoryPreviewCard model={loadingModel} onPress={jest.fn()} />,
    );
    const lineChartProps = getLatestLineChartProps();

    expect(getByTestId('trajectory-preview-loading-state')).toBeTruthy();
    expect(queryByTestId('trajectory-preview-blur')).toBeNull();
    expect(queryByTestId('trajectory-preview-lock')).toBeNull();
    expect(queryByTestId('trajectory-preview-cta')).toBeNull();
    expect(queryByTestId('trajectory-preview-checkpoints')).toBeNull();
    expect(queryByTestId('trajectory-preview-note')).toBeNull();
    expect(getByText('Syncing')).toBeTruthy();
    expect(getByText('UPDATING')).toBeTruthy();
    expect(lineChartProps.segments).toBe(3);
    expect(lineChartProps.data.datasets[0].strokeWidth).toBe(2);
    expect(lineChartProps.hidePointsAtIndex).toEqual([1, 2, 4, 5]);
    expect(lineChartProps.getDotProps(loadingSeries[6], 6)).toMatchObject({
      r: '3.2',
      strokeWidth: '1.5',
    });
    expect(
      lineChartProps.renderDotContent({ x: 20, y: 30, index: 6, indexData: loadingSeries[6] }),
    ).toBeNull();
  });

  it('enables the native Android blur method on Android', () => {
    Object.defineProperty(Platform, 'OS', {
      value: 'android',
      configurable: true,
    });

    const { getByTestId } = render(
      <TrajectoryPreviewCard model={lockedModel} onPress={jest.fn()} />,
    );

    expect(
      getByTestId('trajectory-preview-card')
        .findByProps({ testID: 'trajectory-preview-blur' })
        .props.experimentalBlurMethod,
    ).toBe('dimezisBlurView');
  });

  it('switches to compact typography on narrow widths', () => {
    useWindowDimensionsSpy.mockReturnValue({
      width: 320,
      height: 640,
      scale: 2,
      fontScale: 1,
    });

    const { getByTestId } = render(
      <TrajectoryPreviewCard model={lockedModel} onPress={jest.fn()} />,
    );

    const hookStyle = StyleSheet.flatten(
      getByTestId('trajectory-preview-hook').props.style,
    );
    const headlineStyle = StyleSheet.flatten(
      getByTestId('trajectory-preview-headline').props.style,
    );
    const subtitleStyle = StyleSheet.flatten(
      getByTestId('trajectory-preview-subtitle').props.style,
    );
    const ctaStyle = StyleSheet.flatten(
      getByTestId('trajectory-preview-cta-text').props.style,
    );
    const lineChartProps = getLatestLineChartProps();
    const chartStyle = StyleSheet.flatten(lineChartProps.style);

    expect(hookStyle.textTransform).toBe('uppercase');
    expect(headlineStyle.fontSize).toBe(16);
    expect(headlineStyle.lineHeight).toBe(22);
    expect(subtitleStyle.lineHeight).toBe(20);
    expect(ctaStyle.lineHeight).toBe(20);
    expect(chartStyle.marginLeft).toBe(-8);
    expect(chartStyle.paddingRight).toBe(14);
    expect(chartStyle.paddingTop).toBe(10);
    expect(chartStyle.paddingBottom).toBe(8);
  });

  it('supports the super scan premium variant with muted warm accents instead of default gold', () => {
    const { UNSAFE_getByProps, getByTestId } = render(
      <TrajectoryPreviewCard
        model={lockedModel}
        onPress={jest.fn()}
        visualVariant="super-scan-premium"
      />,
    );

    const badgeStyle = StyleSheet.flatten(
      getByTestId('trajectory-preview-badge').props.style,
    );
    const lockStyle = StyleSheet.flatten(
      UNSAFE_getByProps({ testID: 'trajectory-preview-lock' }).props.style,
    );
    const ctaStyle = StyleSheet.flatten(
      getByTestId('trajectory-preview-cta-text').props.style,
    );

    expect(badgeStyle.color).not.toBe('#FFD700');
    expect(lockStyle.borderColor).not.toBe('rgba(255, 215, 0, 0.28)');
    expect(ctaStyle.color).not.toBe('#FFD700');
    expect(typeof ctaStyle.color).toBe('string');
  });
});
