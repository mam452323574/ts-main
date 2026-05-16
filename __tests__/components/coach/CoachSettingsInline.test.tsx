import React from 'react';
import { render, screen } from '@testing-library/react-native';

import { CoachSettingsInline } from '@/components/coach/CoachSettingsInline';
import { getCoachPersonaVisual } from '@/shared/coachPersonaVisuals';
import type { CoachPromptType } from '@/shared/coachPromptTypes';

jest.mock('@/contexts/ThemeContext', () => {
  const { DARK_COLORS } = require('@/constants/theme');

  return {
    useTheme: () => ({
      colors: DARK_COLORS,
      isDark: true,
    }),
  };
});

const defaultProps = {
  activePersonaKey: 'gentle_supportive' as const,
  selectedQuestionPromptType: null,
  expandedPromptType: null,
  personaOptions: [
    {
      key: 'gentle_supportive' as const,
      title: 'Noah',
      subtitle: 'Chaleureux et rassurant.',
      visual: getCoachPersonaVisual('gentle_supportive'),
      locked: false,
    },
  ],
  questionOptionsByPromptType: {
    latest_scan: [
      {
        key: 'latest_scan__three_simple_actions' as const,
        label: 'Quelles 3 actions simples auront le plus d impact ?',
      },
    ],
  },
  selectedQuestionKey: null,
  questionSelectionMode: 'free_text' as const,
  questionText: '',
  questionSectionLabel: 'Suggestions utiles',
  customQuestionLabel: 'Ta question au coach',
  customQuestionPlaceholder: 'Demande ce que tu veux',
  selectedBadgeLabel: 'Selectionne',
  questionCounterLabel: (count: number, max: number) => `${count}/${max}`,
  questionMaxLength: 800,
  promptTitle: (prompt: CoachPromptType) => `Prompt ${prompt}`,
  promptSubtitle: (prompt: CoachPromptType) => `Subtitle ${prompt}`,
  title: 'Reglages',
  subtitle: 'Ecris ta question.',
  accentColor: '#7FA9D4',
  personaSectionLabel: 'Coach',
  modeSectionLabel: 'Question au coach',
  lockedBadgeLabel: 'Premium',
  lockedHint: 'Debloquer',
  onSelectQuestion: jest.fn(),
  onSelectCustomQuestion: jest.fn(),
  onChangeQuestionText: jest.fn(),
  onSelectPromptType: jest.fn(),
  onPreviewPersona: jest.fn(),
};

describe('CoachSettingsInline', () => {
  it('uses one clear placeholder and does not render helper copy below the field', () => {
    render(<CoachSettingsInline {...defaultProps} />);

    expect(
      screen.getByTestId('coach-settings-inline-question-input').props.placeholder,
    ).toBe('Demande ce que tu veux');
    expect(screen.queryByText('Demande ce que tu veux.')).toBeNull();
  });

  it('shows an explicit selected badge on free text or the active preset', () => {
    const { rerender } = render(<CoachSettingsInline {...defaultProps} />);

    expect(
      screen.getByTestId('coach-settings-inline-question-input-selected-badge'),
    ).toBeTruthy();
    expect(
      screen.queryByTestId(
        'coach-settings-inline-mode-picker-question-latest_scan__three_simple_actions-selected-badge',
      ),
    ).toBeNull();

    rerender(
      <CoachSettingsInline
        {...defaultProps}
        selectedQuestionPromptType="latest_scan"
        expandedPromptType="latest_scan"
        questionSelectionMode="preset"
        selectedQuestionKey="latest_scan__three_simple_actions"
        questionText="Quelles 3 actions simples auront le plus d impact ?"
      />,
    );

    expect(
      screen.queryByTestId('coach-settings-inline-question-input-selected-badge'),
    ).toBeNull();
    expect(
      screen.getByTestId(
        'coach-settings-inline-mode-picker-question-latest_scan__three_simple_actions-selected-badge',
      ),
    ).toBeTruthy();
    expect(
      screen.getByTestId(
        'coach-settings-inline-mode-picker-question-latest_scan__three_simple_actions',
      ).props.accessibilityState?.selected,
    ).toBe(true);
  });
});
