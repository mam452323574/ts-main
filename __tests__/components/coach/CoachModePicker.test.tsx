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
  it('renders prompt rows grouped by category and keeps parent cards separate from child selection', () => {
    render(
      <CoachModePicker
        availablePrompts={['latest_scan', 'weekly_plan', 'nutrition_focus']}
        selectedQuestionPromptType="weekly_plan"
        selectedQuestionKey="weekly_plan__realistic_week"
        questionSelectionMode="preset"
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
    ).toBe(false);
    expect(
      screen.queryByTestId('coach-mode-picker-test-card-weekly_plan-selected-badge'),
    ).toBeNull();
    expect(
      screen.getByTestId(
        'coach-mode-picker-test-card-weekly_plan-contains-selection-indicator',
      ),
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
        selectedQuestionPromptType={null}
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

  it('renders suggested questions inline under the expanded prompt only', () => {
    const { rerender } = render(
      <CoachModePicker
        availablePrompts={['latest_scan', 'weekly_plan']}
        selectedQuestionPromptType={null}
        expandedPromptType="latest_scan"
        questionOptionsByPromptType={{
          latest_scan: [
            {
              key: 'latest_scan__three_simple_actions',
              label: 'Three simple actions',
            },
          ],
          weekly_plan: [
            {
              key: 'weekly_plan__realistic_week',
              label: 'Realistic week',
            },
          ],
        }}
        selectedQuestionKey={null}
        questionSelectionMode="free_text"
        onSelect={jest.fn()}
        onSelectQuestion={jest.fn()}
        promptTitle={(prompt) => `Title ${prompt}`}
        categoryTitle={(category) => CATEGORY_LABELS[category]}
        questionSectionLabel="Suggestions"
        testID="coach-mode-picker-test"
      />,
    );

    expect(
      screen.getByTestId('coach-mode-picker-test-suggestions-latest_scan'),
    ).toBeTruthy();
    expect(
      screen.getByTestId('coach-mode-picker-test-card-latest_scan').props
        .accessibilityState?.expanded,
    ).toBe(true);
    expect(
      screen.getByTestId('coach-mode-picker-test-card-latest_scan').props
        .accessibilityState?.selected,
    ).toBe(false);
    expect(
      screen.queryByTestId('coach-mode-picker-test-card-latest_scan-selected-badge'),
    ).toBeNull();
    expect(
      screen.getByTestId(
        'coach-mode-picker-test-question-latest_scan__three_simple_actions',
      ),
    ).toBeTruthy();
    expect(
      screen.queryByTestId('coach-mode-picker-test-suggestions-weekly_plan'),
    ).toBeNull();

    rerender(
      <CoachModePicker
        availablePrompts={['latest_scan', 'weekly_plan']}
        selectedQuestionPromptType="weekly_plan"
        expandedPromptType="weekly_plan"
        questionOptionsByPromptType={{
          latest_scan: [
            {
              key: 'latest_scan__three_simple_actions',
              label: 'Three simple actions',
            },
          ],
          weekly_plan: [
            {
              key: 'weekly_plan__realistic_week',
              label: 'Realistic week',
            },
          ],
        }}
        selectedQuestionKey="weekly_plan__realistic_week"
        questionSelectionMode="preset"
        onSelect={jest.fn()}
        onSelectQuestion={jest.fn()}
        promptTitle={(prompt) => `Title ${prompt}`}
        categoryTitle={(category) => CATEGORY_LABELS[category]}
        questionSectionLabel="Suggestions"
        selectedBadgeLabel="Selected"
        testID="coach-mode-picker-test"
      />,
    );

    expect(
      screen.queryByTestId('coach-mode-picker-test-suggestions-latest_scan'),
    ).toBeNull();
    expect(
      screen.getByTestId('coach-mode-picker-test-suggestions-weekly_plan'),
    ).toBeTruthy();
    expect(
      screen.getByTestId('coach-mode-picker-test-card-weekly_plan').props
        .accessibilityState?.selected,
    ).toBe(false);
    expect(
      screen.queryByTestId('coach-mode-picker-test-card-weekly_plan-selected-badge'),
    ).toBeNull();
    expect(
      screen.getByTestId(
        'coach-mode-picker-test-card-weekly_plan-contains-selection-indicator',
      ),
    ).toBeTruthy();
    expect(
      screen.getByTestId(
        'coach-mode-picker-test-question-weekly_plan__realistic_week-selected-badge',
      ),
    ).toBeTruthy();
  });

  it('shows a spinner and blocks presses for the busy prompt row', () => {
    const onSelect = jest.fn();

    render(
      <CoachModePicker
        availablePrompts={['latest_scan']}
        selectedQuestionPromptType={null}
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

  it('renders suggestions inline under the expanded prompt', () => {
    const onSelectQuestion = jest.fn();

    render(
      <CoachModePicker
        availablePrompts={['latest_scan', 'weekly_plan']}
        selectedQuestionPromptType="weekly_plan"
        expandedPromptType="weekly_plan"
        questionOptionsByPromptType={{
          latest_scan: [
            {
              key: 'latest_scan__three_simple_actions',
              label: 'Three simple actions',
            },
          ],
          weekly_plan: [
            {
              key: 'weekly_plan__realistic_week',
              label: 'Build a realistic week',
            },
          ],
        }}
        selectedQuestionKey="weekly_plan__realistic_week"
        questionSelectionMode="preset"
        onSelect={jest.fn()}
        onSelectQuestion={onSelectQuestion}
        promptTitle={(prompt) => `Title ${prompt}`}
        categoryTitle={(category) => CATEGORY_LABELS[category]}
        questionSectionLabel="Suggestions"
        selectedBadgeLabel="Selected"
        testID="coach-mode-picker-test"
      />,
    );

    expect(
      screen.queryByTestId('coach-mode-picker-test-suggestions-latest_scan'),
    ).toBeNull();
    expect(
      screen.getByTestId('coach-mode-picker-test-suggestions-weekly_plan'),
    ).toBeTruthy();

    fireEvent.press(
      screen.getByTestId(
        'coach-mode-picker-test-question-weekly_plan__realistic_week',
      ),
    );

    expect(onSelectQuestion).toHaveBeenCalledWith('weekly_plan__realistic_week');
  });
});
