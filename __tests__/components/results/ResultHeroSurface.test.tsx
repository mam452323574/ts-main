import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { render } from '@testing-library/react-native';

import { ResultHeroSurface } from '@/components/results/ResultHeroSurface';
import { useTheme } from '@/contexts/ThemeContext';

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: jest.fn(),
}));

const useWindowDimensionsSpy = jest.spyOn(
  require('react-native'),
  'useWindowDimensions',
);

const mockThemeColors = {
  background: '#F5F6FA',
  cardBackground: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  surfaceGlass: 'rgba(255, 255, 255, 0.86)',
  surfaceMuted: '#F7F8FC',
  surfaceAccent: '#EAF3FF',
  gray: '#808080',
  secondaryText: '#6E6E73',
  primary: '#007AFF',
  primaryText: '#1D1D1F',
  secondary: '#5856D6',
  accentGreen: '#34C759',
  success: '#34C759',
  warning: '#FF9500',
  error: '#FF3B30',
  gold: '#FFD700',
  white: '#FFFFFF',
  grayLight: '#F7F8FC',
  grayMedium: '#C7C7CC',
  lightGray: '#E5E5EA',
  darkGray: '#424242',
  primaryLight: '#E3F2FF',
  borderSubtle: '#E3E7EF',
  borderStrong: '#D5DBE7',
};

describe('ResultHeroSurface', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useTheme as jest.Mock).mockReturnValue({
      colors: mockThemeColors,
      isDark: false,
    });
  });

  it('keeps the hero stacked and centered in compact layouts', () => {
    useWindowDimensionsSpy.mockReturnValue({
      width: 350,
      height: 740,
      scale: 3,
      fontScale: 1,
    });

    const { getByTestId, getByText } = render(
      <ResultHeroSurface
        accentColor="#007AFF"
        title="Focus score"
        subtitle="Analysis complete"
        insight="Confidence is strong."
        visual={<Text>Gauge</Text>}
      />,
    );

    const bodyStyle = StyleSheet.flatten(getByTestId('result-hero-body').props.style);
    const copyStyle = StyleSheet.flatten(getByTestId('result-hero-copy').props.style);
    const titleStyle = StyleSheet.flatten(getByText('Focus score').props.style);

    expect(bodyStyle.flexDirection).toBe('column');
    expect(copyStyle.alignItems).toBe('center');
    expect(titleStyle.textAlign).toBe('center');
  });

  it('switches to an asymmetrical split layout above mobile widths', () => {
    useWindowDimensionsSpy.mockReturnValue({
      width: 440,
      height: 844,
      scale: 3,
      fontScale: 1,
    });

    const { getByTestId, getByText } = render(
      <ResultHeroSurface
        accentColor="#007AFF"
        title="Focus score"
        subtitle="Analysis complete"
        insight="Confidence is strong."
        visual={<Text>Gauge</Text>}
      />,
    );

    const bodyStyle = StyleSheet.flatten(getByTestId('result-hero-body').props.style);
    const copyStyle = StyleSheet.flatten(getByTestId('result-hero-copy').props.style);
    const titleStyle = StyleSheet.flatten(getByText('Focus score').props.style);
    const visualShellStyle = StyleSheet.flatten(
      getByTestId('result-hero-visual-shell').props.style,
    );

    expect(bodyStyle.flexDirection).toBe('row');
    expect(copyStyle.alignItems).toBe('flex-start');
    expect(copyStyle.maxWidth).toBe('56%');
    expect(titleStyle.textAlign).toBe('left');
    expect(visualShellStyle.borderRadius).toBe(24);
  });

  it('renders only the score shell in the visual column without an external halo', () => {
    useWindowDimensionsSpy.mockReturnValue({
      width: 390,
      height: 844,
      scale: 3,
      fontScale: 1,
    });

    const { getByTestId } = render(
      <ResultHeroSurface
        accentColor="#007AFF"
        title="Focus score"
        visual={<Text>Gauge</Text>}
      />,
    );

    const visualColumn = getByTestId('result-hero-visual-column');
    const [visualColumnChild] = visualColumn.children;

    expect(visualColumn.children).toHaveLength(1);
    expect(typeof visualColumnChild).not.toBe('string');
    expect((visualColumnChild as { props: { testID?: string } }).props.testID).toBe(
      'result-hero-visual-shell',
    );
  });

  it('renders a reusable abstract backdrop even when media is provided', () => {
    useWindowDimensionsSpy.mockReturnValue({
      width: 431,
      height: 844,
      scale: 3,
      fontScale: 1,
    });

    const { getByTestId, queryByTestId } = render(
      <ResultHeroSurface
        accentColor="#007AFF"
        backgroundMediaUri="file:///scan.jpg"
        title="Focus score"
        visual={<Text>Gauge</Text>}
      />,
    );

    expect(getByTestId('result-hero-abstract-backdrop')).toBeTruthy();
    expect(queryByTestId('result-hero-media-backdrop')).toBeNull();
  });

  it('keeps the hero backdrop cool instead of using a gold wash', () => {
    useWindowDimensionsSpy.mockReturnValue({
      width: 390,
      height: 844,
      scale: 3,
      fontScale: 1,
    });

    const { getByTestId } = render(
      <ResultHeroSurface
        accentColor="#007AFF"
        title="Focus score"
        visual={<Text>Gauge</Text>}
      />,
    );

    const backdropColors = [
      ...getByTestId('result-hero-base-gradient').props.colors,
      ...getByTestId('result-hero-accent-gradient').props.colors,
    ];

    expect(backdropColors).not.toContain(mockThemeColors.gold);
  });
});
