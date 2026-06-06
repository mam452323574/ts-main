import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { SuperScanIndicator } from '@/components/SuperScanIndicator';
import {
  DARK_COLORS,
  LIGHT_COLORS,
  getAndroidLightSurface,
  getThemeTokens,
  mixColors,
} from '@/constants/theme';

const mockThemeState = {
  colors: LIGHT_COLORS,
  isDark: false,
};

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => mockThemeState,
}));

const getStyles = (style: any) => (Array.isArray(style) ? style : [style]);

describe('SuperScanIndicator', () => {
  const originalPlatform = Platform.OS;

  beforeEach(() => {
    mockThemeState.colors = LIGHT_COLORS;
    mockThemeState.isDark = false;
  });

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: originalPlatform, configurable: true });
  });

  it('uses warm locked styling on Android in light theme for free users', () => {
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    const lockedSurface = getAndroidLightSurface(LIGHT_COLORS, {
      accentColor: LIGHT_COLORS.gray,
      shadowColor: LIGHT_COLORS.gray,
      backgroundAlpha: 0.05,
      borderAlpha: 0.12,
      overlayAlpha: 0.08,
      shadowOpacity: 0.06,
      shadowRadius: 14,
      shadowOffsetY: 6,
      elevation: 2,
    });
    const expectedLockedGradient = [
      mixColors(LIGHT_COLORS.lightGray, LIGHT_COLORS.cardBackground, 0.08),
      mixColors(LIGHT_COLORS.lightGray, LIGHT_COLORS.gray, 0.14),
      mixColors(LIGHT_COLORS.lightGray, LIGHT_COLORS.cardBackground, 0.08),
    ];

    const { UNSAFE_getAllByType, getByTestId, getByText } = render(
      <SuperScanIndicator
        isPremium={false}
        onLockedPress={jest.fn()}
        eligibility={{ success: true, allowed: false, message: 'locked' }}
      />
    );

    expect(getByText('Super Scan')).toBeTruthy();

    const gradients = UNSAFE_getAllByType('LinearGradient' as any);
    expect(gradients[0].props.colors).toEqual(expectedLockedGradient);

    const shellStyles = getStyles(getByTestId('super-scan-shell').props.style);
    const surfaceStyles = getStyles(getByTestId('super-scan-surface').props.style);

    expect(shellStyles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          shadowColor: lockedSurface.shadowStyle.shadowColor,
          elevation: 2,
        }),
      ])
    );
    expect(surfaceStyles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          backgroundColor: lockedSurface.backgroundColor,
          borderColor: lockedSurface.borderColor,
        }),
        expect.objectContaining({
          overflow: 'hidden',
        }),
      ])
    );
  });

  it('keeps the premium icon gradient on Android in light theme for premium users', () => {
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    const premiumSurface = getAndroidLightSurface(LIGHT_COLORS, {
      accentColor: LIGHT_COLORS.gold,
      shadowColor: LIGHT_COLORS.gold,
      backgroundAlpha: 0.08,
      borderAlpha: 0.16,
      overlayAlpha: 0.16,
      shadowOpacity: 0.12,
      shadowRadius: 18,
      shadowOffsetY: 8,
      elevation: 4,
    });
    const expectedPremiumGradient = [
      mixColors(LIGHT_COLORS.gold, LIGHT_COLORS.white, 0.18),
      mixColors(LIGHT_COLORS.gold, LIGHT_COLORS.warning, 0.22),
      mixColors(LIGHT_COLORS.warning, LIGHT_COLORS.gold, 0.68),
    ];

    const { UNSAFE_getAllByType, UNSAFE_getByType, getByTestId, getByText } = render(
      <SuperScanIndicator
        isPremium={true}
        eligibility={{
          success: true,
          allowed: true,
          message: 'available',
          remaining: 1,
        }}
      />
    );

    const gradients = UNSAFE_getAllByType('LinearGradient' as any);
    expect(gradients[0].props.colors).toEqual(expectedPremiumGradient);

    const shellStyles = getStyles(getByTestId('super-scan-shell').props.style);
    const surfaceStyles = getStyles(getByTestId('super-scan-surface').props.style);

    expect(shellStyles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          elevation: 4,
          shadowColor: premiumSurface.shadowStyle.shadowColor,
        }),
      ])
    );
    expect(surfaceStyles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          backgroundColor: premiumSurface.backgroundColor,
          borderColor: premiumSurface.borderColor,
        }),
      ])
    );
    expect(StyleSheet.flatten(getByText('1/1').props.style).color).toBe(
      getThemeTokens(false).premium.foreground,
    );
    expect(UNSAFE_getByType('Zap' as any).props.color).toBe(
      getThemeTokens(false).premium.foreground,
    );
  });

  it('keeps the existing gold premium foreground in dark mode', () => {
    mockThemeState.colors = DARK_COLORS;
    mockThemeState.isDark = true;

    const { UNSAFE_getByType, getByText } = render(
      <SuperScanIndicator
        isPremium
        eligibility={{
          success: true,
          allowed: true,
          message: 'available',
          remaining: 1,
        }}
      />,
    );

    expect(StyleSheet.flatten(getByText('1/1').props.style).color).toBe(DARK_COLORS.gold);
    expect(UNSAFE_getByType('Zap' as any).props.color).toBe(DARK_COLORS.gold);
  });
});
