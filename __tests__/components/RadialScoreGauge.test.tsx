import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { RadialScoreGauge } from '../../components/RadialScoreGauge';
import { useTheme } from '../../contexts/ThemeContext';

jest.mock('../../contexts/ThemeContext', () => ({
  useTheme: jest.fn(),
}));

jest.mock('react-native-svg', () => ({
  __esModule: true,
  default: 'Svg',
  Circle: 'Circle',
}));

const useWindowDimensionsSpy = jest.spyOn(require('react-native'), 'useWindowDimensions');

describe('RadialScoreGauge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useWindowDimensionsSpy.mockReturnValue({
      width: 390,
      height: 844,
      scale: 3,
      fontScale: 1,
    });

    (useTheme as jest.Mock).mockReturnValue({
      colors: {
        cardBackground: '#FFFFFF',
        gray: '#808080',
        lightGray: '#D3D3D3',
        primaryText: '#1D1D1F',
        white: '#FFFFFF',
      },
      isDark: false,
    });
  });

  it('renders correctly with given props', () => {
    const { getByText } = render(
      <RadialScoreGauge score={75} maxScore={100} label="Performance" color="#4CAF50" />,
    );

    expect(getByText('Performance')).toBeTruthy();
    expect(getByText('75')).toBeTruthy();
    expect(getByText('/100')).toBeTruthy();
  });

  it('renders with low score', () => {
    const { getByText } = render(
      <RadialScoreGauge score={10} maxScore={50} label="Low Score" color="#F44336" />,
    );

    expect(getByText('Low Score')).toBeTruthy();
    expect(getByText('10')).toBeTruthy();
    expect(getByText('/50')).toBeTruthy();
  });

  it('keeps long labels within the dedicated label slot', () => {
    const { getByText } = render(
      <RadialScoreGauge
        score={92}
        maxScore={100}
        label="Score de santé assiette vraiment plus long en espagnol"
        color="#2196F3"
      />,
    );

    expect(getByText('Score de santé assiette vraiment plus long en espagnol').props.numberOfLines).toBe(2);
    expect(getByText('Score de santé assiette vraiment plus long en espagnol').props.minimumFontScale).toBe(0.84);
  });

  it('shrinks gauge typography and padding on compact widths', () => {
    useWindowDimensionsSpy.mockReturnValue({
      width: 320,
      height: 640,
      scale: 2,
      fontScale: 1,
    });

    const { getByTestId } = render(
      <RadialScoreGauge score={88} maxScore={100} label="Very long compact label" color="#2196F3" />,
    );

    const rootStyle = StyleSheet.flatten(getByTestId('radial-score-gauge').props.style);
    const valueStyle = StyleSheet.flatten(getByTestId('radial-score-value').props.style);
    const maxStyle = StyleSheet.flatten(getByTestId('radial-score-max').props.style);

    expect(rootStyle.paddingHorizontal).toBe(12);
    expect(rootStyle.borderRadius).toBe(16);
    expect(valueStyle.fontSize).toBe(40);
    expect(valueStyle.lineHeight).toBe(44);
    expect(maxStyle.fontSize).toBe(16);
  });
});
