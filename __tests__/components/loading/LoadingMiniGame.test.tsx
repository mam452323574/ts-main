import React from 'react';
import { StyleSheet, View } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';

import { LoadingMiniGame } from '@/components/loading/LoadingMiniGame';
import { FloatDodgeGame } from '@/components/loading/FloatDodgeGame';
import { ReflexDotsGame } from '@/components/loading/ReflexDotsGame';
import { TapTargetsGame } from '@/components/loading/TapTargetsGame';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: jest.fn(),
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: jest.fn(),
}));

const labels = {
  title: 'Mini-game',
  score: 'Score',
  tapTargetsPrompt: 'Tap the signals',
  floatDodgePrompt: 'Keep the signal afloat',
  reflexDotsPrompt: 'Tap the right dots',
};

const translations: Record<string, string> = {
  'loading_mini_game.title': labels.title,
  'loading_mini_game.score': labels.score,
  'loading_mini_game.tap_targets_prompt': labels.tapTargetsPrompt,
  'loading_mini_game.float_dodge_prompt': labels.floatDodgePrompt,
  'loading_mini_game.reflex_dots_prompt': labels.reflexDotsPrompt,
};

const themeColors = {
  background: '#000000',
  cardBackground: '#121212',
  surfaceMuted: '#242426',
  primaryText: '#F7F7F7',
  textMuted: '#8E8E93',
  gray: '#8E8E93',
  white: '#FFFFFF',
  primary: '#65A9F3',
  success: '#6EC8A5',
  warning: '#D49A55',
  gold: '#D7BD76',
  error: '#FF5E57',
};

const gameProps = {
  active: true,
  compact: false,
  labels,
  variant: 'coach' as const,
};

describe('LoadingMiniGame', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();

    (useLanguage as jest.Mock).mockReturnValue({
      t: (key: string) => translations[key] ?? key,
    });

    (useTheme as jest.Mock).mockReturnValue({
      colors: themeColors,
      isDark: true,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('returns null when inactive or disabled', () => {
    const inactive = render(<LoadingMiniGame active={false} />);
    expect(inactive.queryByText(labels.title)).toBeNull();

    const disabled = render(<LoadingMiniGame active enabled={false} />);
    expect(disabled.queryByText(labels.title)).toBeNull();
  });

  it('keeps the random game stable across rerenders', () => {
    const randomSpy = jest.spyOn(Math, 'random');
    randomSpy.mockReturnValueOnce(0.05).mockReturnValue(0.95);

    const rendered = render(<LoadingMiniGame active />);

    expect(rendered.getByTestId('tap-targets-game')).toBeTruthy();

    rendered.rerender(<LoadingMiniGame active durationHintMs={9000} />);

    expect(rendered.getByTestId('tap-targets-game')).toBeTruthy();
    expect(rendered.queryByTestId('reflex-dots-game')).toBeNull();
  });

  it('renders each mini-game without crashing', () => {
    const rendered = render(
      <View>
        <TapTargetsGame {...gameProps} />
        <FloatDodgeGame {...gameProps} />
        <ReflexDotsGame {...gameProps} />
      </View>,
    );

    expect(rendered.getByTestId('tap-targets-game')).toBeTruthy();
    expect(rendered.getByTestId('float-dodge-game')).toBeTruthy();
    expect(rendered.getByTestId('reflex-dots-game')).toBeTruthy();
  });

  it('uses the same shared frame across mini-games for the same variant', () => {
    const rendered = render(
      <View>
        <TapTargetsGame {...gameProps} />
        <FloatDodgeGame {...gameProps} />
        <ReflexDotsGame {...gameProps} />
      </View>,
    );

    const tapFrame = StyleSheet.flatten(
      rendered.getByTestId('tap-targets-game').props.style,
    );
    const floatFrame = StyleSheet.flatten(
      rendered.getByTestId('float-dodge-game').props.style,
    );
    const reflexFrame = StyleSheet.flatten(
      rendered.getByTestId('reflex-dots-game').props.style,
    );

    expect(floatFrame).toMatchObject({
      backgroundColor: tapFrame.backgroundColor,
      borderColor: tapFrame.borderColor,
      borderRadius: tapFrame.borderRadius,
      height: tapFrame.height,
      padding: tapFrame.padding,
      shadowColor: tapFrame.shadowColor,
    });
    expect(reflexFrame).toMatchObject({
      backgroundColor: tapFrame.backgroundColor,
      borderColor: tapFrame.borderColor,
      borderRadius: tapFrame.borderRadius,
      height: tapFrame.height,
      padding: tapFrame.padding,
      shadowColor: tapFrame.shadowColor,
    });
  });

  it('propagates accentColor into the selected mini-game chrome', () => {
    const randomSpy = jest.spyOn(Math, 'random');
    randomSpy.mockReturnValueOnce(0.05).mockReturnValue(0.5);

    const rendered = render(
      <LoadingMiniGame active accentColor="#FF7A33" />,
    );

    const flattenedStyle = StyleSheet.flatten(
      rendered.getByTestId('tap-targets-game').props.style,
    );

    expect(flattenedStyle.shadowColor).toBe('#FF7A33');
  });

  it('increments TapTargetsGame score when a target is pressed', () => {
    const rendered = render(<TapTargetsGame {...gameProps} />);

    fireEvent.press(rendered.getAllByTestId('tap-target')[0]);

    expect(rendered.getByTestId('tap-targets-score')).toHaveTextContent('Score 1');
  });

  it('increments FloatDodgeGame score over time', () => {
    const rendered = render(<FloatDodgeGame {...gameProps} />);

    act(() => {
      jest.advanceTimersByTime(760);
    });

    expect(rendered.getByTestId('float-dodge-score')).toHaveTextContent('Score 1');
  });

  it('increments ReflexDotsGame score when a good signal is pressed', () => {
    const randomSpy = jest.spyOn(Math, 'random');
    randomSpy.mockReturnValue(0.5);

    const rendered = render(<ReflexDotsGame {...gameProps} />);

    fireEvent.press(rendered.getAllByTestId('reflex-signal-good')[0]);

    expect(rendered.getByTestId('reflex-dots-score')).toHaveTextContent('Score 1');
  });

  it('cleans timers on unmount', () => {
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

    const tapTargets = render(
      <TapTargetsGame {...gameProps} durationHintMs={2000} onComplete={jest.fn()} />,
    );
    tapTargets.unmount();

    const floatDodge = render(
      <FloatDodgeGame {...gameProps} durationHintMs={2000} onComplete={jest.fn()} />,
    );
    floatDodge.unmount();

    const reflexDots = render(
      <ReflexDotsGame {...gameProps} durationHintMs={2000} onComplete={jest.fn()} />,
    );
    reflexDots.unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();
    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  it('uses a smaller compact layout', () => {
    const rendered = render(
      <TapTargetsGame {...gameProps} compact variant="superScan" />,
    );

    const flattenedStyle = StyleSheet.flatten(
      rendered.getByTestId('tap-targets-game').props.style,
    );

    expect(flattenedStyle.height).toBe(118);
  });

  it('keeps compact score text constrained to a stable line', () => {
    const rendered = render(
      <TapTargetsGame {...gameProps} compact variant="superScan" />,
    );

    const scoreNode = rendered.getByTestId('tap-targets-score');
    const flattenedStyle = StyleSheet.flatten(scoreNode.props.style);

    expect(scoreNode.props.numberOfLines).toBe(1);
    expect(flattenedStyle.width).toBe(78);
  });

  it('calls onComplete after the duration hint without blocking play', () => {
    const onComplete = jest.fn();
    const rendered = render(
      <FloatDodgeGame {...gameProps} durationHintMs={1200} onComplete={onComplete} />,
    );

    fireEvent.press(rendered.getByTestId('float-dodge-control'));

    act(() => {
      jest.advanceTimersByTime(1199);
    });
    expect(onComplete).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
