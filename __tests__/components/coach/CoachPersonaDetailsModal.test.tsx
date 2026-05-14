import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { CoachPersonaDetailsModal } from '@/components/coach/CoachPersonaDetailsModal';
import { getCoachPersona } from '@/shared/coachPersonas';
import { getCoachPersonaVisual } from '@/shared/coachPersonaVisuals';

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#05070C',
      cardBackground: '#111318',
      primaryText: '#F4F5F8',
      gray: '#8E8E93',
      white: '#FFFFFF',
      primary: '#0A84FF',
      gold: '#FFD60A',
      goldLight: '#4D3F00',
    },
  }),
}));

describe('CoachPersonaDetailsModal', () => {
  it('renders the personality breakdown blocks for the selected coach', () => {
    render(
      <CoachPersonaDetailsModal
        visible
        persona={getCoachPersona('analytical_precise')}
        visual={getCoachPersonaVisual('analytical_precise')}
        active={false}
        locked={false}
        onClose={jest.fn()}
        onConfirm={jest.fn()}
        onUnlock={jest.fn()}
      />,
    );

    expect(screen.getByTestId('coach-persona-details-modal')).toBeTruthy();
    expect(screen.getByTestId('coach-persona-details-scroll')).toBeTruthy();
    expect(screen.getByTestId('coach-persona-details-close-x')).toBeTruthy();
    expect(screen.getByTestId('coach-persona-details-avatar')).toBeTruthy();
    expect(screen.getByTestId('coach-persona-details-title')).toBeTruthy();
    expect(screen.getByTestId('coach-persona-details-summary')).toBeTruthy();
    expect(screen.getByTestId('coach-persona-details-voice')).toBeTruthy();
    expect(screen.getByTestId('coach-persona-details-energy')).toBeTruthy();
    expect(screen.getByTestId('coach-persona-details-motivation')).toBeTruthy();
    expect(screen.getByTestId('coach-persona-details-best-for')).toBeTruthy();
  });

  it('uses the confirmation CTA for unlocked coaches', () => {
    const onConfirm = jest.fn();

    render(
      <CoachPersonaDetailsModal
        visible
        persona={getCoachPersona('motivational_energetic')}
        visual={getCoachPersonaVisual('motivational_energetic')}
        active={false}
        locked={false}
        onClose={jest.fn()}
        onConfirm={onConfirm}
        onUnlock={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByTestId('coach-persona-details-primary-cta'));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('uses the unlock CTA for locked coaches', () => {
    const onUnlock = jest.fn();

    render(
      <CoachPersonaDetailsModal
        visible
        persona={getCoachPersona('strict_tough')}
        visual={getCoachPersonaVisual('strict_tough')}
        active={false}
        locked
        onClose={jest.fn()}
        onConfirm={jest.fn()}
        onUnlock={onUnlock}
      />,
    );

    expect(screen.getByTestId('coach-persona-details-locked-callout')).toBeTruthy();
    expect(
      screen.getByText('Disponible avec Health Scan Premium'),
    ).toBeTruthy();
    expect(screen.getByText('Debloquer ce coach')).toBeTruthy();
    expect(screen.getByText('Plus tard')).toBeTruthy();

    fireEvent.press(screen.getByTestId('coach-persona-details-primary-cta'));

    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it('keeps the current coach CTA non-mutating and closes the sheet when pressed', () => {
    const onClose = jest.fn();
    const onConfirm = jest.fn();

    render(
      <CoachPersonaDetailsModal
        visible
        persona={getCoachPersona('gentle_supportive')}
        visual={getCoachPersonaVisual('gentle_supportive')}
        active
        locked={false}
        onClose={onClose}
        onConfirm={onConfirm}
        onUnlock={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByTestId('coach-persona-details-primary-cta'));
    fireEvent.press(screen.getByTestId('coach-persona-details-close-x'));
    fireEvent.press(screen.getByTestId('coach-persona-details-close'));
    fireEvent.press(screen.getByTestId('coach-persona-details-backdrop'));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(4);
  });
});
