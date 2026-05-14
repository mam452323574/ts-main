import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { ResultQuickStatCard } from '@/components/ResultQuickStatCard';
import { useTheme } from '@/contexts/ThemeContext';
import { getResultSurfaceChrome } from '@/utils/resultLayout';
import { resolveResultItemTheme } from '@/utils/resultVisualTheme';

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: jest.fn(),
}));

const useWindowDimensionsSpy = jest.spyOn(require('react-native'), 'useWindowDimensions');

const mockThemeColors = {
  background: '#F5F6FA',
  cardBackground: '#FFFFFF',
  surfaceMuted: '#F7F8FC',
  surfaceAccent: '#EAF3FF',
  gray: '#808080',
  primary: '#007AFF',
  primaryText: '#1D1D1F',
  secondaryText: '#6E6E73',
  textMuted: '#6E6E73',
  accent: '#007AFF',
  white: '#FFFFFF',
  grayLight: '#F7F8FC',
  grayMedium: '#C7C7CC',
  lightGray: '#E5E5EA',
  darkGray: '#424242',
  borderSubtle: '#E3E7EF',
  borderStrong: '#D5DBE7',
  primaryLight: '#E3F2FF',
  primaryDark: '#0056B3',
  secondary: '#5856D6',
  accentGreen: '#34C759',
  success: '#34C759',
  successLight: '#E8F9ED',
  warning: '#FF9500',
  error: '#FF3B30',
  gold: '#FFD700',
  goldLight: '#FFF8E1',
};

function MockQuickStatIcon({
  size,
  strokeWidth,
}: {
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <Text testID="result-quick-stat-custom-icon">
      {`size:${size ?? 'none'}|stroke:${strokeWidth ?? 'none'}`}
    </Text>
  );
}

describe('ResultQuickStatCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useWindowDimensionsSpy.mockReturnValue({
      width: 390,
      height: 844,
      scale: 3,
      fontScale: 1,
    });

    (useTheme as jest.Mock).mockReturnValue({
      colors: mockThemeColors,
      isDark: false,
    });
  });

  it('fits short text values on one line and preserves longer text values', () => {
    const { getByTestId, rerender } = render(
      <ResultQuickStatCard
        label="Face shape"
        value="Oval"
        valueMaxLines={2}
        valueVariant="text"
      />
    );

    expect(getByTestId('result-quick-stat-value').props.numberOfLines).toBe(1);
    expect(getByTestId('result-quick-stat-value').props.adjustsFontSizeToFit).toBe(true);
    expect(getByTestId('result-quick-stat-value').props.minimumFontScale).toBe(0.82);
    expect(getByTestId('result-quick-stat-value').props.textBreakStrategy).toBe('simple');
    expect(getByTestId('result-quick-stat-label').props.minimumFontScale).toBe(0.82);

    rerender(<ResultQuickStatCard label="Verdict" value="Very long text value" valueVariant="text" />);

    expect(getByTestId('result-quick-stat-value').props.numberOfLines).toBe(3);
    expect(getByTestId('result-quick-stat-value').props.adjustsFontSizeToFit).toBeUndefined();
    expect(getByTestId('result-quick-stat-value').props.minimumFontScale).toBeUndefined();

    rerender(<ResultQuickStatCard label="Calories" value="1234" valueVariant="numeric" />);

    expect(getByTestId('result-quick-stat-value').props.numberOfLines).toBe(1);
    expect(getByTestId('result-quick-stat-value').props.adjustsFontSizeToFit).toBe(true);
    expect(getByTestId('result-quick-stat-value').props.minimumFontScale).toBe(0.84);
  });

  it('scales React icons to a more prominent size in regular mode', () => {
    const { getByTestId } = render(
      <ResultQuickStatCard
        icon={<MockQuickStatIcon />}
        label="Calories"
        value="1234"
        valueVariant="numeric"
      />
    );

    const iconWrapStyle = StyleSheet.flatten(
      getByTestId('result-quick-stat-icon-wrap').props.style
    );
    const rootStyle = StyleSheet.flatten(
      getByTestId('result-quick-stat-card').props.style
    );
    const contentStyle = StyleSheet.flatten(
      getByTestId('result-quick-stat-content').props.style
    );
    const labelStyle = StyleSheet.flatten(
      getByTestId('result-quick-stat-label').props.style
    );
    const valueStyle = StyleSheet.flatten(
      getByTestId('result-quick-stat-value').props.style
    );

    expect(rootStyle.minHeight).toBe(112);
    expect(rootStyle.gap).toBe(10);
    expect(rootStyle.flexDirection).toBe('row');
    expect(rootStyle.flexBasis).toBe('100%');
    expect(rootStyle.alignItems).toBe('center');
    expect(rootStyle.paddingHorizontal).toBe(14);
    expect(rootStyle.paddingVertical).toBe(10);
    expect(iconWrapStyle.width).toBe(58);
    expect(iconWrapStyle.height).toBe(58);
    expect(contentStyle.justifyContent).toBe('center');
    expect(contentStyle.gap).toBe(3);
    expect(labelStyle.fontSize).toBe(12);
    expect(labelStyle.lineHeight).toBe(15);
    expect(labelStyle.letterSpacing).toBe(0);
    expect(valueStyle.fontSize).toBe(20);
    expect(valueStyle.lineHeight).toBe(24);
    expect(getByTestId('result-quick-stat-custom-icon')).toHaveTextContent(
      'size:32|stroke:2.2'
    );
  });

  it('gives full-width quick stats a stronger icon lane without changing text behavior', () => {
    const { getByTestId } = render(
      <ResultQuickStatCard
        fullWidth
        icon={<MockQuickStatIcon />}
        label="Verdict"
        value="Very balanced overall"
        valueVariant="text"
      />
    );

    const iconWrapStyle = StyleSheet.flatten(
      getByTestId('result-quick-stat-icon-wrap').props.style
    );
    const rootStyle = StyleSheet.flatten(
      getByTestId('result-quick-stat-card').props.style
    );

    expect(rootStyle.width).toBe('100%');
    expect(rootStyle.minHeight).toBe(112);
    expect(iconWrapStyle.width).toBe(60);
    expect(iconWrapStyle.height).toBe(60);
    expect(getByTestId('result-quick-stat-value').props.numberOfLines).toBe(3);
    expect(getByTestId('result-quick-stat-label').props.numberOfLines).toBe(2);
    expect(getByTestId('result-quick-stat-custom-icon')).toHaveTextContent(
      'size:34|stroke:2.2'
    );
  });

  it('reduces padding and height in compact mode without collapsing the content', () => {
    useWindowDimensionsSpy.mockReturnValue({
      width: 350,
      height: 740,
      scale: 3,
      fontScale: 1,
    });

    const { getByTestId } = render(
      <ResultQuickStatCard
        icon={<MockQuickStatIcon />}
        label="Muscle mass"
        value="Balanced"
        valueVariant="text"
      />
    );

    const rootStyle = StyleSheet.flatten(getByTestId('result-quick-stat-card').props.style);
    const iconWrapStyle = StyleSheet.flatten(
      getByTestId('result-quick-stat-icon-wrap').props.style
    );
    const labelStyle = StyleSheet.flatten(getByTestId('result-quick-stat-label').props.style);
    const valueStyle = StyleSheet.flatten(getByTestId('result-quick-stat-value').props.style);

    expect(rootStyle.paddingHorizontal).toBe(13);
    expect(rootStyle.paddingVertical).toBe(9);
    expect(rootStyle.minHeight).toBe(104);
    expect(rootStyle.gap).toBe(9);
    expect(iconWrapStyle.width).toBe(52);
    expect(iconWrapStyle.height).toBe(52);
    expect(labelStyle.fontSize).toBe(12);
    expect(labelStyle.lineHeight).toBe(14);
    expect(labelStyle.letterSpacing).toBe(0);
    expect(valueStyle.fontSize).toBe(17);
    expect(valueStyle.lineHeight).toBe(21);
    expect(getByTestId('result-quick-stat-custom-icon')).toHaveTextContent(
      'size:29|stroke:2.2'
    );
  });

  it('keeps the two-column variant compact in narrow mode', () => {
    useWindowDimensionsSpy.mockReturnValue({
      width: 320,
      height: 640,
      scale: 2,
      fontScale: 1,
    });

    const { getByTestId } = render(
      <ResultQuickStatCard label="Muscle mass" value="Balanced" valueVariant="text" />
    );

    const rootStyle = StyleSheet.flatten(getByTestId('result-quick-stat-card').props.style);
    const iconWrapStyle = StyleSheet.flatten(
      getByTestId('result-quick-stat-icon-wrap').props.style
    );
    const labelStyle = StyleSheet.flatten(getByTestId('result-quick-stat-label').props.style);
    const valueStyle = StyleSheet.flatten(getByTestId('result-quick-stat-value').props.style);

    expect(rootStyle.paddingHorizontal).toBe(12);
    expect(rootStyle.paddingVertical).toBe(8);
    expect(rootStyle.minHeight).toBe(100);
    expect(rootStyle.borderRadius).toBe(18);
    expect(rootStyle.gap).toBe(8);
    expect(rootStyle.flexDirection).toBe('row');
    expect(rootStyle.alignItems).toBe('center');
    expect(rootStyle.flexBasis).toBe('100%');
    expect(iconWrapStyle.width).toBe(48);
    expect(iconWrapStyle.height).toBe(48);
    expect(labelStyle.fontSize).toBe(12);
    expect(labelStyle.lineHeight).toBe(14);
    expect(labelStyle.letterSpacing).toBe(0);
    expect(valueStyle.fontSize).toBe(17);
    expect(valueStyle.lineHeight).toBe(21);
  });

  it('applies semantic theming to the quick stat surface, icon lane, and value', () => {
    const theme = resolveResultItemTheme({
      colors: mockThemeColors,
      isDark: false,
      theme: {
        tone: 'emerald',
        surfaceVariant: 'emphasis',
        valueAccent: 'strong',
        iconAccent: 'strong',
      },
    });

    const { getByTestId } = render(
      <ResultQuickStatCard
        icon={<MockQuickStatIcon />}
        label="Verdict"
        theme={theme}
        value="Balanced"
        valueVariant="text"
      />,
    );

    const rootStyle = StyleSheet.flatten(
      getByTestId('result-quick-stat-card').props.style,
    );
    const iconWrapStyle = StyleSheet.flatten(
      getByTestId('result-quick-stat-icon-wrap').props.style,
    );
    const valueStyle = StyleSheet.flatten(
      getByTestId('result-quick-stat-value').props.style,
    );
    const expectedChrome = getResultSurfaceChrome({
      colors: mockThemeColors,
      isDark: false,
      kind: 'standard',
      accentColor: theme.accentColor,
      surfaceVariant: theme.surfaceVariant,
    });

    expect(rootStyle.backgroundColor).toBe(expectedChrome.backgroundColor);
    expect(rootStyle.borderColor).toBe(expectedChrome.borderColor);
    expect(iconWrapStyle.backgroundColor).toBe(theme.iconSurfaceColor);
    expect(iconWrapStyle.borderColor).toBe(theme.iconBorderColor);
    expect(iconWrapStyle.borderWidth).toBe(1);
    expect(valueStyle.color).toBe(theme.valueColor);
  });
});
