import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { Button } from '@/components/Button';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ScreenSection } from '@/components/ScreenSection';
import { ScreenState } from '@/components/ScreenState';
import { SegmentedControl } from '@/components/SegmentedControl';
import { SettingRow } from '@/components/SettingRow';
import { Surface } from '@/components/Surface';
import {
  DARK_COLORS,
  FONT_FAMILIES,
  FONTS,
  LIGHT_COLORS,
  getCtaColors,
  getThemedSurface,
  getThemeTokens,
} from '@/constants/theme';

let mockThemeState = {
  colors: LIGHT_COLORS,
  isDark: false,
};

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => mockThemeState,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 12, right: 0, bottom: 8, left: 0 }),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: 'light',
  },
}));

jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { Text } = require('react-native');

  return {
    AlertCircle: ({ color, size }: { color: string; size: number }) => (
      <Text testID="alert-circle">{`${color}:${size}`}</Text>
    ),
    CheckCircle2: ({ color, size }: { color: string; size: number }) => (
      <Text testID="check-circle">{`${color}:${size}`}</Text>
    ),
    ChevronLeft: ({ color, size }: { color: string; size: number }) => (
      <Text testID="chevron-left">{`${color}:${size}`}</Text>
    ),
    ChevronRight: ({ color, size }: { color: string; size: number }) => (
      <Text testID="chevron-right">{`${color}:${size}`}</Text>
    ),
    X: ({ color, size }: { color: string; size: number }) => (
      <Text testID="x-icon">{`${color}:${size}`}</Text>
    ),
    Info: ({ color, size }: { color: string; size: number }) => (
      <Text testID="info-icon">{`${color}:${size}`}</Text>
    ),
    RefreshCw: ({ color, size }: { color: string; size: number }) => (
      <Text testID="refresh-cw">{`${color}:${size}`}</Text>
    ),
  };
});

const hexToRgb = (hex: string) => {
  const normalized = hex.replace('#', '');
  return {
    r: parseInt(normalized.slice(0, 2), 16) / 255,
    g: parseInt(normalized.slice(2, 4), 16) / 255,
    b: parseInt(normalized.slice(4, 6), 16) / 255,
  };
};

const channelLuminance = (value: number) =>
  value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;

const contrastRatio = (left: string, right: string) => {
  const leftRgb = hexToRgb(left);
  const rightRgb = hexToRgb(right);
  const leftLum =
    0.2126 * channelLuminance(leftRgb.r) +
    0.7152 * channelLuminance(leftRgb.g) +
    0.0722 * channelLuminance(leftRgb.b);
  const rightLum =
    0.2126 * channelLuminance(rightRgb.r) +
    0.7152 * channelLuminance(rightRgb.g) +
    0.0722 * channelLuminance(rightRgb.b);
  const lighter = Math.max(leftLum, rightLum);
  const darker = Math.min(leftLum, rightLum);

  return (lighter + 0.05) / (darker + 0.05);
};

describe('premium design system primitives', () => {
  it('keeps display and accent typography on native system aliases', () => {
    expect(FONT_FAMILIES.display).toBe(FONT_FAMILIES.body);
    expect(FONT_FAMILIES.accent).toBe(FONT_FAMILIES.body);
    expect(FONTS.display).toBe(FONT_FAMILIES.body);
    expect(FONTS.accent).toBe(FONT_FAMILIES.body);
    expect(FONT_FAMILIES.display).not.toBe('SpaceGrotesk');
    expect(FONT_FAMILIES.accent).not.toBe('Orbitron');
  });

  beforeEach(() => {
    mockThemeState = {
      colors: LIGHT_COLORS,
      isDark: false,
    };
  });

  it('keeps core CTA and screen tokens contrast-safe in both themes', () => {
    [
      { colors: LIGHT_COLORS, isDark: false },
      { colors: DARK_COLORS, isDark: true },
    ].forEach(({ colors, isDark }) => {
      const tokens = getThemeTokens(isDark);
      const cta = getCtaColors(colors, isDark);

      expect(contrastRatio(tokens.screen.background, tokens.screen.foreground)).toBeGreaterThanOrEqual(12);
      expect(contrastRatio(cta.primaryBackground, cta.primaryForeground)).toBeGreaterThanOrEqual(12);
      expect(contrastRatio(tokens.premium.accent, tokens.premium.foreground)).toBeGreaterThanOrEqual(4.5);
    });
  });

  it('renders Surface from the shared surface resolver', () => {
    mockThemeState = {
      colors: DARK_COLORS,
      isDark: true,
    };
    const expectedSurface = getThemedSurface({
      colors: DARK_COLORS,
      isDark: true,
      variant: 'premium',
      accentColor: DARK_COLORS.gold,
    });

    render(
      <Surface variant="premium" accentColor={DARK_COLORS.gold} testID="premium-surface">
        <Text>Premium body</Text>
      </Surface>,
    );

    expect(StyleSheet.flatten(screen.getByTestId('premium-surface').props.style)).toEqual(
      expect.objectContaining({
        backgroundColor: expectedSurface.backgroundColor,
        borderColor: expectedSurface.borderColor,
        borderWidth: 1,
      }),
    );
  });

  it('supports inset Surface groups for dense native lists', () => {
    const expectedSurface = getThemedSurface({
      colors: LIGHT_COLORS,
      isDark: false,
      variant: 'inset',
    });

    render(
      <Surface variant="inset" testID="inset-surface">
        <Text>Grouped rows</Text>
      </Surface>,
    );

    expect(StyleSheet.flatten(screen.getByTestId('inset-surface').props.style)).toEqual(
      expect.objectContaining({
        backgroundColor: expectedSurface.backgroundColor,
        borderColor: expectedSurface.borderColor,
      }),
    );
  });

  it('renders ScreenHeader with stable side action slots', () => {
    const onBack = jest.fn();

    render(
      <ScreenHeader
        title="Analytics"
        subtitle="Progression"
        onBack={onBack}
        backTestID="header-back"
      />,
    );

    expect(screen.getByText('Analytics')).toBeTruthy();
    expect(screen.getByText('Progression')).toBeTruthy();

    fireEvent.press(screen.getByTestId('header-back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('renders inline ScreenHeader without bar chrome', () => {
    render(<ScreenHeader title="Social" variant="inline" topInset={false} testID="inline-header" />);

    expect(screen.getByText('Social')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId('inline-header').props.style)).toEqual(
      expect.objectContaining({
        backgroundColor: 'transparent',
        borderBottomColor: 'transparent',
      }),
    );
  });

  it('renders SegmentedControl options with one selected state', () => {
    const onChange = jest.fn();

    render(
      <SegmentedControl
        value="week"
        onChange={onChange}
        options={[
          { value: 'week', label: '7 days', testID: 'segment-week' },
          { value: 'month', label: '30 days', testID: 'segment-month' },
          { value: 'beforeAfter', label: 'Before / After', testID: 'segment-before-after' },
        ]}
      />,
    );

    expect(StyleSheet.flatten(screen.getByTestId('segment-week').props.style)).toEqual(
      expect.objectContaining({
        alignItems: 'center',
        height: 34,
        justifyContent: 'center',
        paddingVertical: 0,
      }),
    );
    expect(StyleSheet.flatten(screen.getByText('7 days').props.style)).toEqual(
      expect.objectContaining({
        includeFontPadding: false,
        lineHeight: 16,
        textAlignVertical: 'center',
      }),
    );
    expect(StyleSheet.flatten(screen.getByText('Before / After').props.style)).toEqual(
      expect.objectContaining({
        fontSize: 11,
        lineHeight: 15,
      }),
    );
    fireEvent.press(screen.getByTestId('segment-month'));
    expect(onChange).toHaveBeenCalledWith('month');
  });

  it('uses semantic CTA colors for the primary Button variant', () => {
    const onPress = jest.fn();
    render(<Button title="Continue" onPress={onPress} testID="cta-button" />);

    expect(screen.getByText('Continue')).toHaveStyle({
      color: getCtaColors(LIGHT_COLORS, false).primaryForeground,
    });

    fireEvent.press(screen.getByTestId('cta-button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders ScreenSection and SettingRow as shared grouped settings primitives', () => {
    const onPress = jest.fn();

    render(
      <ScreenSection title="Preferences" testID="preferences-section">
        <SettingRow
          title="Notifications"
          description="Reminders and updates"
          onPress={onPress}
          testID="notifications-row"
        />
      </ScreenSection>,
    );

    expect(screen.getByText('Preferences')).toBeTruthy();
    expect(screen.getByText('Reminders and updates')).toBeTruthy();
    fireEvent.press(screen.getByTestId('notifications-row'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders ScreenState with shared surface and CTA primitives', () => {
    const onAction = jest.fn();

    render(
      <ScreenState
        tone="error"
        title="Unable to load"
        message="Try again in a moment."
        actionLabel="Retry"
        onAction={onAction}
        testID="screen-state"
        actionTestID="screen-state-action"
      />,
    );

    const expectedSurface = getThemedSurface({
      colors: LIGHT_COLORS,
      isDark: false,
      variant: 'danger',
      accentColor: LIGHT_COLORS.error,
    });

    expect(screen.getByText('Unable to load')).toBeTruthy();
    expect(screen.getByText('Try again in a moment.')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId('screen-state').props.style)).toEqual(
      expect.objectContaining({
        backgroundColor: expectedSurface.backgroundColor,
        borderColor: expectedSurface.borderColor,
      }),
    );

    fireEvent.press(screen.getByTestId('screen-state-action'));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
