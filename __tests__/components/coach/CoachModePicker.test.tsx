import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { CoachModePicker } from '@/components/coach/CoachModePicker';
import type { CoachPromptCategory } from '@/shared/coachPromptTypes';

jest.mock('@/contexts/ThemeContext', () => {
  const { DARK_COLORS } = require('@/constants/theme');

  return {
    useTheme: () => ({
      colors: DARK_COLORS,
      isDark: true,
    }),
  };
});

const CATEGORY_LABELS: Record<CoachPromptCategory, string> = {
  today: 'Today',
  plan: 'Plans',
  focus: 'Focus',
  vigilance: 'Watch',
  trend: 'Trends',
};

describe('CoachModePicker', () => {
  it('renders prompt rows grouped by category with the selected state', () => {
    render(
      <CoachModePicker
        availablePrompts={['latest_scan', 'weekly_plan', 'nutrition_focus']}
        selectedPromptType="weekly_plan"
        onSelect={jest.fn()}
        promptTitle={(prompt) => `Title ${prompt}`}
        promptSubtitle={(prompt) => `Subtitle ${prompt}`}
        categoryTitle={(category) => CATEGORY_LABELS[category]}
        testID="coach-mode-picker-test"
      />,
    );

    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getByText('Plans')).toBeTruthy();
    expect(screen.getByText('Focus')).toBeTruthy();
    expect(
      screen.getByTestId('coach-mode-picker-test-card-weekly_plan').props
        .accessibilityState?.selected,
    ).toBe(true);
    expect(
      screen.getByTestId('coach-mode-picker-test-card-weekly_plan-selected-badge'),
    ).toBeTruthy();
    expect(
      screen.getByTestId('coach-mode-picker-test-card-weekly_plan-artwork'),
    ).toBeTruthy();
  });

  it('keeps locked prompt rows pressable so the parent can open premium', () => {
    const onSelect = jest.fn();

    render(
      <CoachModePicker
        availablePrompts={['weekly_plan']}
        selectedPromptType="latest_scan"
        onSelect={onSelect}
        promptTitle={(prompt) => `Title ${prompt}`}
        promptSubtitle={(prompt) => `Subtitle ${prompt}`}
        categoryTitle={(category) => CATEGORY_LABELS[category]}
        isPromptLocked={(prompt) => prompt === 'weekly_plan'}
        lockedBadgeLabel="Pro"
        lockedHint="Unlock this prompt"
        testID="coach-mode-picker-test"
      />,
    );

    fireEvent.press(screen.getByTestId('coach-mode-picker-test-card-weekly_plan'));

    expect(onSelect).toHaveBeenCalledWith('weekly_plan');
    expect(
      screen.getByTestId('coach-mode-picker-test-card-weekly_plan-lock-badge'),
    ).toBeTruthy();
    expect(
      screen.getByTestId('coach-mode-picker-test-card-weekly_plan-artwork'),
    ).toBeTruthy();
    expect(
      screen.getByTestId('coach-mode-picker-test-card-weekly_plan').props
        .accessibilityState?.disabled,
    ).toBe(false);
  });

  it('shows a spinner and blocks presses for the busy prompt row', () => {
    const onSelect = jest.fn();

    render(
      <CoachModePicker
        availablePrompts={['latest_scan']}
        selectedPromptType="latest_scan"
        busyPromptType="latest_scan"
        onSelect={onSelect}
        promptTitle={(prompt) => `Title ${prompt}`}
        categoryTitle={(category) => CATEGORY_LABELS[category]}
        testID="coach-mode-picker-test"
      />,
    );

    fireEvent.press(screen.getByTestId('coach-mode-picker-test-card-latest_scan'));

    expect(onSelect).not.toHaveBeenCalled();
    expect(
      screen.getByTestId('coach-mode-picker-test-card-latest_scan-spinner'),
    ).toBeTruthy();
    expect(
      screen.getByTestId('coach-mode-picker-test-card-latest_scan').props
        .accessibilityState?.busy,
    ).toBe(true);
  });
});
