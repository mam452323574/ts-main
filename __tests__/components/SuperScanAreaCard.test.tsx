import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';

import { SuperScanAreaCard } from '@/components/SuperScanAreaCard';
import { LIGHT_COLORS } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { resolveSuperScanAreaTheme } from '@/utils/superScanVisualTheme';

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: jest.fn(),
}));

const useWindowDimensionsSpy = jest.spyOn(
  require('react-native'),
  'useWindowDimensions',
);

describe('SuperScanAreaCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useWindowDimensionsSpy.mockReturnValue({
      width: 390,
      height: 844,
      scale: 3,
      fontScale: 1,
    });

    (useTheme as jest.Mock).mockReturnValue({
      colors: LIGHT_COLORS,
      isDark: false,
    });
  });

  const labels = {
    dominantType: 'Dominant type',
    subcutaneousFat: 'Subcutaneous fat',
    waterRetention: 'Water retention',
    definition: 'Definition',
    confidence: 'Confidence',
    explanation: 'Explanation',
    advice: 'Advice',
  };

  it('applies distinct palettes for water-driven and subcutaneous-driven areas', () => {
    const waterTheme = resolveSuperScanAreaTheme({
      colors: LIGHT_COLORS,
      isDark: false,
      area: {
        dominantType: 'Retencion de agua',
        subcutaneousFatPercent: '24%',
        waterRetentionPercent: '16%',
        definitionPercent: '42%',
      },
    });
    const contourTheme = resolveSuperScanAreaTheme({
      colors: LIGHT_COLORS,
      isDark: false,
      area: {
        dominantType: 'Subcutanea',
        subcutaneousFatPercent: '28%',
        waterRetentionPercent: '12%',
        definitionPercent: '38%',
      },
    });

    const { getByTestId } = render(
      <>
        <SuperScanAreaCard
          area={{
            id: 'water-area',
            areaName: 'Lower face',
            dominantType: 'Retencion de agua',
            subcutaneousFatPercent: '24%',
            waterRetentionPercent: '16%',
            definitionPercent: '42%',
            confidencePercent: '82%',
            explanation: 'Water-led area.',
            actionableAdvice: 'Stay consistent.',
          }}
          labels={labels}
          testID="area-card-water"
          theme={waterTheme}
        />
        <SuperScanAreaCard
          area={{
            id: 'subcutaneous-area',
            areaName: 'Abdomen',
            dominantType: 'Subcutanea',
            subcutaneousFatPercent: '28%',
            waterRetentionPercent: '12%',
            definitionPercent: '38%',
            confidencePercent: '84%',
            explanation: 'Contour-led area.',
            actionableAdvice: 'Lift and walk.',
          }}
          labels={labels}
          testID="area-card-subcutaneous"
          theme={contourTheme}
        />
      </>,
    );

    const waterRootStyle = StyleSheet.flatten(
      getByTestId('area-card-water').props.style,
    );
    const contourRootStyle = StyleSheet.flatten(
      getByTestId('area-card-subcutaneous').props.style,
    );
    const waterBadgeStyle = StyleSheet.flatten(
      getByTestId('area-card-water-dominant-badge').props.style,
    );
    const contourBadgeStyle = StyleSheet.flatten(
      getByTestId('area-card-subcutaneous-dominant-badge').props.style,
    );

    expect(waterRootStyle.borderColor).not.toBe(contourRootStyle.borderColor);
    expect(waterBadgeStyle.backgroundColor).not.toBe(
      contourBadgeStyle.backgroundColor,
    );
  });

  it('emphasizes the locally dominant metric while keeping confidence neutral', () => {
    const theme = resolveSuperScanAreaTheme({
      colors: LIGHT_COLORS,
      isDark: false,
      area: {
        dominantType: '',
        subcutaneousFatPercent: '18%',
        waterRetentionPercent: '33%',
        definitionPercent: '22%',
      },
    });

    const { getByTestId } = render(
      <SuperScanAreaCard
        area={{
          id: 'water-highlight',
          areaName: 'Jawline',
          dominantType: '',
          subcutaneousFatPercent: '18%',
          waterRetentionPercent: '33%',
          definitionPercent: '22%',
          confidencePercent: '79%',
          explanation: 'Water retention leads here.',
          actionableAdvice: 'Sleep and lower sodium swings.',
        }}
        labels={labels}
        testID="area-card-highlight"
        theme={theme}
      />,
    );

    const waterTileStyle = StyleSheet.flatten(
      getByTestId('area-card-highlight-water-retention-tile').props.style,
    );
    const subcutaneousTileStyle = StyleSheet.flatten(
      getByTestId('area-card-highlight-subcutaneous-fat-tile').props.style,
    );
    const confidenceTileStyle = StyleSheet.flatten(
      getByTestId('area-card-highlight-confidence-tile').props.style,
    );
    const waterValueStyle = StyleSheet.flatten(
      getByTestId('area-card-highlight-water-retention').props.style,
    );
    const confidenceValueStyle = StyleSheet.flatten(
      getByTestId('area-card-highlight-confidence').props.style,
    );

    expect(theme.highlightMetricKey).toBe('waterRetention');
    expect(waterTileStyle.backgroundColor).not.toBe(
      subcutaneousTileStyle.backgroundColor,
    );
    expect(waterTileStyle.backgroundColor).not.toBe(
      confidenceTileStyle.backgroundColor,
    );
    expect(waterValueStyle.color).not.toBe(confidenceValueStyle.color);
  });
});
