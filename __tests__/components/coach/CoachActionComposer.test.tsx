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

  it.each(CONTRAST_CASES)(
    'uses denser surfaces for the dock and CTA for $personaKey in $themeName mode',
    ({ personaKey, themeName }) => {
      mockThemeState.colors = themeName === 'dark' ? DARK_COLORS : LIGHT_COLORS;
      mockThemeState.isDark = themeName === 'dark';
      const visual = getCoachPersonaVisual(personaKey);

      render(
        <CoachActionComposer
          personaTitle="Coach"
          promptTitle="Plan"
          actionLabel="Demander"
          actionA11yLabel="Demander conseil"
          personaVisual={visual}
          onPress={jest.fn()}
          actionTestID="coach-action-primary"
        />,
      );

      const composerStyle = StyleSheet.flatten(
        screen.getByTestId('coach-action-composer').props.style,
      );
      const actionButtonStyle = StyleSheet.flatten(
        typeof screen.getByTestId('coach-action-primary').props.style === 'function'
          ? screen.getByTestId('coach-action-primary').props.style({ pressed: false })
          : screen.getByTestId('coach-action-primary').props.style,
      );

      // Dark keeps its tight density (>= 0.94); light intentionally relaxed
      // to ~0.88 (iOS) / ~0.92 (Android) per the 2026-05-27 audit so the
      // composer reads as a softer glassy panel rather than a hard white
      // block under the CTA. The action button background remains a solid
      // hex in both themes, so its check is platform-agnostic.
      const minComposerAlpha = themeName === 'dark' ? 0.94 : 0.85;
      expect(hasStrongSurfaceOpacity(composerStyle.backgroundColor, minComposerAlpha)).toBe(true);
      expect(hasStrongSurfaceOpacity(actionButtonStyle.backgroundColor, 0.94)).toBe(true);
      expect(composerStyle.shadowColor).toBe('transparent');
      expect(composerStyle.shadowOpacity).toBe(0);
      expect(composerStyle.shadowRadius).toBe(0);
      expect(composerStyle.shadowOffset).toEqual({ width: 0, height: 0 });
      expect(composerStyle.elevation).toBe(0);
      expect(actionButtonStyle.shadowOpacity).toBeLessThanOrEqual(0.035);
    },
  );

  it('shows only the selected coach name in the sticky metadata line', () => {
    const visual = getCoachPersonaVisual('patient_calm');

    render(
      <CoachActionComposer
        personaTitle="Mira"
        promptTitle="Question au coach"
        actionLabel="Demander"
        actionA11yLabel="Demander conseil"
        personaVisual={visual}
        onPress={jest.fn()}
        actionTestID="coach-action-primary"
      />,
    );

    expect(screen.getByTestId('coach-action-composer-prompt-title').props.children).toBe(
      'Question au coach',
    );
    expect(screen.getByTestId('coach-action-composer-persona-title').props.children).toBe(
      'Mira',
    );
    expect(screen.getByText('Demander')).toBeTruthy();
    expect(screen.queryByText(/·/)).toBeNull();
    expect(screen.queryByText('Disponible')).toBeNull();
  });

  it('keeps a long scan-results return label readable inside the sticky action', () => {
    const visual = getCoachPersonaVisual('patient_calm');
    const longLabel = 'Zurück zu den Scanner-Ergebnissen';

    render(
      <CoachActionComposer
        personaTitle="Mira"
        promptTitle="Plan"
        actionLabel={longLabel}
        actionA11yLabel={longLabel}
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
    const actionLabel = screen.getByText(longLabel);
    const actionLabelStyle = StyleSheet.flatten(actionLabel.props.style);

    expect(actionButtonStyle.maxWidth).toBe('72%');
    expect(actionLabel.props.numberOfLines).toBe(2);
    expect(actionLabel.props.adjustsFontSizeToFit).toBe(true);
    expect(actionLabelStyle.color).toBe(screen.getByTestId('coach-action-icon').props.color);
    expect(getContrast(actionLabelStyle.color, actionButtonStyle.backgroundColor)).toBeGreaterThanOrEqual(4.5);
  });
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

function hasStrongSurfaceOpacity(color: string, minimumAlpha: number) {
  if (color.startsWith('#')) {
    return true;
  }

  const rgbaMatch = color.match(
    /^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([0-9]*\.?[0-9]+)\s*\)$/i,
  );

  if (!rgbaMatch) {
    return false;
  }

  return Number.parseFloat(rgbaMatch[1]) >= minimumAlpha;
}
