import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import { CoachActionComposer } from '@/components/coach/CoachActionComposer';
import { DARK_COLORS, LIGHT_COLORS } from '@/constants/theme';
import { getCoachPersonaVisual } from '@/shared/coachPersonaVisuals';
import type { CoachPersonaKey } from '@/types';

const mockThemeState = {
  colors: LIGHT_COLORS,
  isDark: false,
};

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => mockThemeState,
}));

jest.mock('@/components/FeatureIcons', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    CoachFeatureIcon: ({ color, ...props }: any) =>
      React.createElement(View, {
        ...props,
        color,
        testID: 'coach-action-icon',
      }),
  };
});

const CONTRAST_CASES: ReadonlyArray<{
  personaKey: CoachPersonaKey;
  themeName: 'light' | 'dark';
}> = [
  { personaKey: 'gentle_supportive', themeName: 'light' },
  { personaKey: 'patient_calm', themeName: 'light' },
  { personaKey: 'strict_tough', themeName: 'light' },
  { personaKey: 'gentle_supportive', themeName: 'dark' },
  { personaKey: 'patient_calm', themeName: 'dark' },
  { personaKey: 'strict_tough', themeName: 'dark' },
];

describe('CoachActionComposer', () => {
  beforeEach(() => {
    mockThemeState.colors = LIGHT_COLORS;
    mockThemeState.isDark = false;
  });

  it.each(CONTRAST_CASES)(
    'keeps the primary action readable for $personaKey in $themeName mode',
    ({ personaKey, themeName }) => {
      mockThemeState.colors = themeName === 'dark' ? DARK_COLORS : LIGHT_COLORS;
      mockThemeState.isDark = themeName === 'dark';
      const visual = getCoachPersonaVisual(personaKey);

      render(
        <CoachActionComposer
          personaTitle="Coach"
          promptTitle="Plan"
          statusLabel="Disponible"
          actionLabel="Demander"
          actionA11yLabel="Demander conseil"
          personaVisual={visual}
          onPress={jest.fn()}
          actionTestID="coach-action-primary"
        />,
      );

      const actionButton = screen.getByTestId('coach-action-primary');
      const actionButtonStyle = StyleSheet.flatten(
        typeof actionButton.props.style === 'function'
          ? actionButton.props.style({ pressed: false })
          : actionButton.props.style,
      );
      const actionLabelStyle = StyleSheet.flatten(
        screen.getByText('Demander').props.style,
      );
      const icon = screen.getByTestId('coach-action-icon');

      expect(actionLabelStyle.color).toBe(icon.props.color);
      expect(
        getContrast(actionLabelStyle.color, actionButtonStyle.backgroundColor),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );
});

function getContrast(colorA: string, colorB: string) {
  const luminanceA = getLuminance(colorA);
  const luminanceB = getLuminance(colorB);
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);

  return (lighter + 0.05) / (darker + 0.05);
}

function getLuminance(hexColor: string) {
  const normalized = hexColor.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((offset) =>
    Number.parseInt(normalized.slice(offset, offset + 2), 16),
  );

  return (
    0.2126 * toLinearChannel(r) +
    0.7152 * toLinearChannel(g) +
    0.0722 * toLinearChannel(b)
  );
}

function toLinearChannel(channel: number) {
  const normalized = channel / 255;

  return normalized <= 0.03928
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}
