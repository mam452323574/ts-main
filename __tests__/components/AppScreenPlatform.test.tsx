import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import { AppScreen } from '@/components/AppScreen';

const mockUseSafeAreaInsets = jest.fn(() => ({
  top: 22,
  bottom: 34,
  left: 0,
  right: 0,
}));
const mockThemeColors = {
  background: '#F6F6F3',
};

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: mockThemeColors,
    isDark: false,
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => mockUseSafeAreaInsets(),
}));

describe('AppScreen platform layout', () => {
  const originalPlatform = Platform.OS;

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: originalPlatform,
    });
    jest.clearAllMocks();
  });

  it('uses native iOS scroll keyboard insets without adding a KeyboardAvoidingView wrapper', () => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'ios',
    });

    render(
      <AppScreen scroll keyboard>
        <Text>Body</Text>
      </AppScreen>,
    );

    const scrollView = screen.UNSAFE_getByType(ScrollView);
    const contentStyle = StyleSheet.flatten(scrollView.props.contentContainerStyle);

    expect(scrollView.props.automaticallyAdjustKeyboardInsets).toBe(true);
    expect(screen.UNSAFE_queryByType(KeyboardAvoidingView)).toBeNull();
    expect(contentStyle).toEqual(
      expect.objectContaining({
        paddingTop: 22,
        paddingBottom: 34,
      }),
    );
  });

  it('keeps Android scroll keyboard handling on KeyboardAvoidingView height behavior', () => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'android',
    });

    render(
      <AppScreen scroll keyboard>
        <Text>Body</Text>
      </AppScreen>,
    );

    const scrollView = screen.UNSAFE_getByType(ScrollView);
    const keyboardShell = screen.UNSAFE_getByType(KeyboardAvoidingView);

    expect(scrollView.props.automaticallyAdjustKeyboardInsets).toBe(false);
    expect(keyboardShell.props.behavior).toBe('height');
  });
});
