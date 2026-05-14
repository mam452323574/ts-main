import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { MetricCard } from '../../components/MetricCard';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { getResultSurfaceChrome } from '../../utils/resultLayout';
import { resolveResultItemTheme } from '../../utils/resultVisualTheme';
import { withAlpha } from '../../constants/theme';

jest.mock('../../contexts/ThemeContext', () => ({
  useTheme: jest.fn(),
}));

jest.mock('../../contexts/LanguageContext', () => ({
  useLanguage: jest.fn(),
}));

jest.mock('lucide-react-native', () => {
  const { Text } = require('react-native');
  return {
    Lock: () => <Text>LockIcon</Text>,
  };
});

const useWindowDimensionsSpy = jest.spyOn(
  require('react-native'),
  'useWindowDimensions',
);

const mockThemeColors = {
  background: '#F5F6FA',
  cardBackground: '#FFFFFF',
  surfaceMuted: '#F7F8FC',
  surfaceAccent: '#EAF3FF',
  secondaryText: '#6E6E73',
  textMuted: '#6E6E73',
  accent: '#007AFF',
  gray: '#808080',
  grayLight: '#F7F8FC',
  grayMedium: '#A0A0A0',
  lightGray: '#E5E5EA',
  darkGray: '#424242',
  borderSubtle: '#E3E7EF',
  borderStrong: '#D5DBE7',
  primary: '#FF5733',
  primaryText: '#000000',
  primaryLight: '#FFCCCB',
  primaryDark: '#C63F1E',
  secondary: '#5856D6',
  accentGreen: '#34C759',
  success: '#34C759',
  successLight: '#E8F9ED',
  warning: '#FF9500',
  error: '#FF3B30',
  gold: '#FFD700',
  goldLight: '#FFF8E1',
  white: '#FFFFFF',
};

function MockMetricIcon({
  size,
  strokeWidth,
}: {
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <Text testID="metric-card-custom-icon">
      {`size:${size ?? 'none'}|stroke:${strokeWidth ?? 'none'}`}
    </Text>
  );
}

describe('MetricCard', () => {
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

    (useLanguage as jest.Mock).mockReturnValue({
      t: (key: string) =>
        ({
          'metric_card.premium_label': 'PREMIUM',
          'metric_card.loading_label': 'Loading',
        })[key] ?? key,
    });
  });

  it('renders correctly with default props', () => {
    const { getByText } = render(
      <MetricCard
        title="Total Users"
        value="1,234"
        icon="icon"
        valueVariant="numeric"
      />,
    );

    expect(getByText('icon')).toBeTruthy();
    expect(getByText('Total Users')).toBeTruthy();
    expect(getByText('1,234')).toBeTruthy();
  });

  it('applies denser default proportions above the compact breakpoint', () => {
    const { getByTestId } = render(
      <MetricCard
        title="Hydration"
        value="88/100"
        icon={<MockMetricIcon />}
        valueVariant="fraction"
      />,
    );

    const rootStyle = StyleSheet.flatten(
      getByTestId('metric-card-root').props.style,
    );
    const iconWrapStyle = StyleSheet.flatten(
      getByTestId('metric-card-icon-wrap').props.style,
    );
    const titleStyle = StyleSheet.flatten(
      getByTestId('metric-card-title').props.style,
    );
    const valueStyle = StyleSheet.flatten(
      getByTestId('metric-card-value').props.style,
    );

    expect(rootStyle.paddingHorizontal).toBe(15);
    expect(rootStyle.paddingVertical).toBe(9);
    expect(rootStyle.minHeight).toBe(84);
    expect(rootStyle.alignItems).toBe('center');
    expect(rootStyle.gap).toBe(11);
    expect(rootStyle.marginBottom).toBeUndefined();
    expect(iconWrapStyle.width).toBe(60);
    expect(iconWrapStyle.height).toBe(60);
    expect(titleStyle.fontSize).toBe(13);
    expect(titleStyle.lineHeight).toBe(16);
    expect(titleStyle.fontWeight).toBe('500');
    expect(getByTestId('metric-card-title').props.minimumFontScale).toBe(0.82);
    expect(valueStyle.fontSize).toBe(20);
    expect(valueStyle.lineHeight).toBe(24);
    expect(valueStyle.fontWeight).toBe('700');
    expect(getByTestId('metric-card-custom-icon')).toHaveTextContent(
      'size:32|stroke:2.15'
    );
  });

  it('fits short text metric values on one line to avoid broken words', () => {
    const { getByTestId } = render(
      <MetricCard
        title="Face shape"
        value="Oval"
        icon="face"
        valueMaxLines={2}
        valueVariant="text"
      />,
    );

    expect(getByTestId('metric-card-value').props.numberOfLines).toBe(1);
    expect(getByTestId('metric-card-value').props.adjustsFontSizeToFit).toBe(true);
    expect(getByTestId('metric-card-value').props.minimumFontScale).toBe(0.82);
    expect(getByTestId('metric-card-value').props.ellipsizeMode).toBe('tail');
  });

  it('renders locked state without exposing the premium value', () => {
    const { UNSAFE_getByProps, getByTestId, getByText, queryByText } = render(
      <MetricCard title="Premium Feature" value="Secret" icon="star" isLocked />,
    );
    const rootStyle = StyleSheet.flatten(
      getByTestId('metric-card-root').props.style,
    );
    const blurOverlay = UNSAFE_getByProps({
      testID: 'metric-card-blur-overlay',
    });

    const blurOverlayStyle = StyleSheet.flatten(
      blurOverlay.props.style,
    );
    const lockedPlaceholderStyle = StyleSheet.flatten(
      blurOverlay.props.children.props.style,
    );
    const premiumTagStyle = StyleSheet.flatten(
      getByTestId('metric-card-premium-tag').props.style,
    );
    const premiumTagTextStyle = StyleSheet.flatten(
      getByText('PREMIUM').props.style,
    );

    expect(getByText('star')).toBeTruthy();
    expect(getByText('Premium Feature')).toBeTruthy();
    expect(UNSAFE_getByProps({ testID: 'metric-card-blur-overlay' })).toBeTruthy();
    expect(getByText('PREMIUM')).toBeTruthy();
    expect(getByText('LockIcon')).toBeTruthy();
    expect(queryByText('Secret')).toBeNull();
    expect(rootStyle.minHeight).toBe(84);
    expect(blurOverlayStyle.paddingVertical).toBe(3);
    expect(lockedPlaceholderStyle.height).toBe(11);
    expect(premiumTagStyle.paddingVertical).toBe(3);
    expect(premiumTagTextStyle.lineHeight).toBe(14);
  });

  it('applies the resolved semantic theme when provided', () => {
    const theme = resolveResultItemTheme({
      colors: mockThemeColors,
      isDark: false,
      theme: {
        tone: 'gold',
        surfaceVariant: 'emphasis',
        valueAccent: 'strong',
        iconAccent: 'strong',
      },
    });

    const { getByTestId } = render(
      <MetricCard
        title="Glow"
        value="8/10"
        icon={<MockMetricIcon />}
        theme={theme}
        valueVariant="fraction"
      />,
    );

    const rootStyle = StyleSheet.flatten(
      getByTestId('metric-card-root').props.style,
    );
    const iconWrapStyle = StyleSheet.flatten(
      getByTestId('metric-card-icon-wrap').props.style,
    );
    const valueStyle = StyleSheet.flatten(
      getByTestId('metric-card-value').props.style,
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

  it('handles premium press when locked', () => {
    const mockOnPremiumPress = jest.fn();
    const { getByLabelText } = render(
      <MetricCard
        title="Premium Mode"
        value="Secret"
        icon="lock"
        isLocked
        onPremiumPress={mockOnPremiumPress}
      />,
    );

    fireEvent.press(getByLabelText('Premium Mode. PREMIUM'));
    expect(mockOnPremiumPress).toHaveBeenCalledTimes(1);
  });

  it('renders a neutral loading state without exposing the premium value', () => {
    const { getByTestId, getByText, queryByText } = render(
      <MetricCard
        title="Premium Feature"
        value="Secret"
        icon="star"
        premiumRenderState="loading"
      />,
    );

    const rootStyle = StyleSheet.flatten(
      getByTestId('metric-card-root').props.style,
    );
    const blurOverlayStyle = StyleSheet.flatten(
      getByTestId('metric-card-loading-overlay').props.style,
    );
    const loadingPlaceholderStyle = StyleSheet.flatten(
      getByTestId('metric-card-loading-overlay').props.children.props.style,
    );
    const loadingTagStyle = StyleSheet.flatten(
      getByTestId('metric-card-loading-tag').props.style,
    );
    const loadingTagTextStyle = StyleSheet.flatten(
      getByText('Loading').props.style,
    );

    expect(getByTestId('metric-card-loading-overlay')).toBeTruthy();
    expect(getByTestId('metric-card-loading-tag')).toBeTruthy();
    expect(queryByText('Secret')).toBeNull();
    expect(rootStyle.minHeight).toBe(84);
    expect(blurOverlayStyle.paddingVertical).toBe(3);
    expect(loadingPlaceholderStyle.height).toBe(11);
    expect(loadingTagStyle.paddingVertical).toBe(3);
    expect(loadingTagTextStyle.lineHeight).toBe(14);
  });

  it('keeps long text metrics multi-line without a premium press handler', () => {
    const mockOnPremiumPress = jest.fn();
    const { getByTestId, getByText } = render(
      <MetricCard
        title="Quality"
        value="Ultra processed but still readable"
        icon="leaf"
        onPremiumPress={mockOnPremiumPress}
        valueVariant="text"
        valueMaxLines={3}
      />,
    );

    const value = getByText('Ultra processed but still readable');
    const valueStyle = StyleSheet.flatten(
      getByTestId('metric-card-value').props.style,
    );

    fireEvent.press(getByText('Quality'));
    expect(mockOnPremiumPress).not.toHaveBeenCalled();
    expect(value.props.numberOfLines).toBe(3);
    expect(value.props.adjustsFontSizeToFit).toBeUndefined();
    expect(value.props.minimumFontScale).toBeUndefined();
    expect(value.props.textBreakStrategy).toBe('simple');
    expect(value.props.android_hyphenationFrequency).toBe('none');
    expect(valueStyle.fontWeight).toBe('600');
  });

  it('keeps narrow multi-line text metrics readable with the reduced minimum height', () => {
    useWindowDimensionsSpy.mockReturnValue({
      width: 320,
      height: 640,
      scale: 2,
      fontScale: 1,
    });

    const { getByTestId, getByText } = render(
      <MetricCard
        title="Ingredient quality and overall nutritional density"
        value="Rich in fiber with a balanced nutrient profile"
        icon="leaf"
        valueVariant="text"
        valueMaxLines={3}
      />,
    );

    const rootStyle = StyleSheet.flatten(
      getByTestId('metric-card-root').props.style,
    );
    const title = getByText('Ingredient quality and overall nutritional density');
    const value = getByText('Rich in fiber with a balanced nutrient profile');
    const valueStyle = StyleSheet.flatten(
      getByTestId('metric-card-value').props.style,
    );

    expect(rootStyle.minHeight).toBe(72);
    expect(rootStyle.paddingVertical).toBe(7);
    expect(title.props.numberOfLines).toBe(2);
    expect(value.props.numberOfLines).toBe(3);
    expect(value.props.adjustsFontSizeToFit).toBeUndefined();
    expect(valueStyle.fontSize).toBe(18);
    expect(valueStyle.lineHeight).toBe(22);
    expect(valueStyle.fontWeight).toBe('600');
  });

  it('switches to compact spacing and icon sizing between 337px and 360px', () => {
    useWindowDimensionsSpy.mockReturnValue({
      width: 350,
      height: 740,
      scale: 3,
      fontScale: 1,
    });

    const { getByTestId } = render(
      <MetricCard
        title="Glycemic index"
        value="Very high value"
        icon={<MockMetricIcon />}
      />,
    );

    const rootStyle = StyleSheet.flatten(
      getByTestId('metric-card-root').props.style,
    );
    const iconWrapStyle = StyleSheet.flatten(
      getByTestId('metric-card-icon-wrap').props.style,
    );
    const valueStyle = StyleSheet.flatten(
      getByTestId('metric-card-value').props.style,
    );

    expect(rootStyle.paddingHorizontal).toBe(13);
    expect(rootStyle.paddingVertical).toBe(8);
    expect(rootStyle.minHeight).toBe(78);
    expect(rootStyle.gap).toBe(9);
    expect(iconWrapStyle.width).toBe(56);
    expect(iconWrapStyle.height).toBe(56);
    expect(valueStyle.fontSize).toBe(18);
    expect(valueStyle.lineHeight).toBe(22);
    expect(getByTestId('metric-card-custom-icon')).toHaveTextContent(
      'size:29|stroke:2.15'
    );
  });

  it('switches to narrow spacing and typography at 336px and below', () => {
    useWindowDimensionsSpy.mockReturnValue({
      width: 320,
      height: 640,
      scale: 2,
      fontScale: 1,
    });

    const { getByTestId } = render(
      <MetricCard
        title="Glycemic index"
        value="Very high value"
        icon={<MockMetricIcon />}
      />,
    );

    const rootStyle = StyleSheet.flatten(
      getByTestId('metric-card-root').props.style,
    );
    const iconWrapStyle = StyleSheet.flatten(
      getByTestId('metric-card-icon-wrap').props.style,
    );
    const titleStyle = StyleSheet.flatten(
      getByTestId('metric-card-title').props.style,
    );
    const valueStyle = StyleSheet.flatten(
      getByTestId('metric-card-value').props.style,
    );

    expect(rootStyle.paddingHorizontal).toBe(13);
    expect(rootStyle.paddingVertical).toBe(7);
    expect(rootStyle.minHeight).toBe(72);
    expect(rootStyle.alignItems).toBe('center');
    expect(rootStyle.gap).toBe(8);
    expect(iconWrapStyle.width).toBe(52);
    expect(iconWrapStyle.height).toBe(52);
    expect(titleStyle.fontSize).toBe(13);
    expect(titleStyle.lineHeight).toBe(16);
    expect(valueStyle.fontSize).toBe(18);
    expect(valueStyle.lineHeight).toBe(22);
    expect(valueStyle.fontWeight).toBe('600');
    expect(getByTestId('metric-card-custom-icon')).toHaveTextContent(
      'size:27|stroke:2.15'
    );
  });

  it('keeps locked and loading chrome compact under 360px', () => {
    useWindowDimensionsSpy.mockReturnValue({
      width: 320,
      height: 640,
      scale: 2,
      fontScale: 1,
    });

    const { UNSAFE_getByProps, getByTestId, getByText, rerender } = render(
      <MetricCard title="Premium Feature" value="Secret" icon="star" isLocked />,
    );
    const lockedBlurOverlay = UNSAFE_getByProps({
      testID: 'metric-card-blur-overlay',
    });

    const rootStyle = StyleSheet.flatten(
      getByTestId('metric-card-root').props.style,
    );
    const lockedBlurStyle = StyleSheet.flatten(
      lockedBlurOverlay.props.style,
    );
    const lockedPlaceholderStyle = StyleSheet.flatten(
      lockedBlurOverlay.props.children.props.style,
    );
    const lockedTagStyle = StyleSheet.flatten(
      getByTestId('metric-card-premium-tag').props.style,
    );
    const lockedTagTextStyle = StyleSheet.flatten(
      getByText('PREMIUM').props.style,
    );

    expect(rootStyle.minHeight).toBe(72);
    expect(lockedBlurStyle.paddingVertical).toBe(2);
    expect(lockedPlaceholderStyle.height).toBe(10);
    expect(lockedTagStyle.paddingVertical).toBe(2);
    expect(lockedTagTextStyle.lineHeight).toBe(13);

    rerender(
      <MetricCard
        title="Premium Feature"
        value="Secret"
        icon="star"
        premiumRenderState="loading"
      />,
    );

    const loadingBlurStyle = StyleSheet.flatten(
      getByTestId('metric-card-loading-overlay').props.style,
    );
    const loadingPlaceholderStyle = StyleSheet.flatten(
      getByTestId('metric-card-loading-overlay').props.children.props.style,
    );
    const loadingTagStyle = StyleSheet.flatten(
      getByTestId('metric-card-loading-tag').props.style,
    );
    const loadingTagTextStyle = StyleSheet.flatten(
      getByText('Loading').props.style,
    );

    expect(StyleSheet.flatten(getByTestId('metric-card-root').props.style).minHeight).toBe(72);
    expect(loadingBlurStyle.paddingVertical).toBe(2);
    expect(loadingPlaceholderStyle.height).toBe(10);
    expect(loadingTagStyle.paddingVertical).toBe(2);
    expect(loadingTagTextStyle.lineHeight).toBe(13);
  });

  it('keeps locked cards neutral even if a semantic theme is supplied', () => {
    const theme = resolveResultItemTheme({
      colors: mockThemeColors,
      isDark: false,
      theme: {
        tone: 'coral',
        surfaceVariant: 'emphasis',
        valueAccent: 'strong',
        iconAccent: 'strong',
      },
    });

    const { getByTestId } = render(
      <MetricCard
        title="Body fat"
        value="18%"
        icon={<MockMetricIcon />}
        premiumRenderState="locked"
        theme={theme}
      />,
    );

    const rootStyle = StyleSheet.flatten(
      getByTestId('metric-card-root').props.style,
    );
    const iconWrapStyle = StyleSheet.flatten(
      getByTestId('metric-card-icon-wrap').props.style,
    );

    expect(rootStyle.backgroundColor).toBe(mockThemeColors.cardBackground);
    expect(rootStyle.borderColor).toBe(withAlpha(mockThemeColors.primaryText, 0.06));
    expect(iconWrapStyle.backgroundColor).toBe(withAlpha(mockThemeColors.primary, 0.08));
    expect(iconWrapStyle.borderWidth).toBe(0);
  });
});
