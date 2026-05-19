import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import { ActionCard } from '@/components/ActionCard';
import { CoachPersonaCard } from '@/components/coach/CoachPersonaCard';
import { LIGHT_COLORS } from '@/constants/theme';
import { getCoachPersonaVisual } from '@/shared/coachPersonaVisuals';

const MockIcon = (({ color }: { color: string }) => (
  <Text testID="light-theme-action-icon">{color}</Text>
)) as any;

const flattenStyle = (style: unknown) =>
  StyleSheet.flatten(
    typeof style === 'function'
      ? (style as (state: { pressed: boolean }) => unknown)({ pressed: false })
      : (style as Parameters<typeof StyleSheet.flatten>[0]),
  ) as { color?: string };

describe('light theme regressions', () => {
  it('keeps secondary text readable in the light palette', () => {
    expect(LIGHT_COLORS.secondaryText).toBe(LIGHT_COLORS.textMuted);
    expect(LIGHT_COLORS.secondaryText).not.toBe(LIGHT_COLORS.white);
  });

  it('renders shared action cards with readable text in light mode', () => {
    render(
      <ActionCard
        title="Readable card"
        icon={MockIcon}
        onPress={jest.fn()}
      />,
    );

    expect(screen.getByText('Readable card')).toHaveStyle({
      color: LIGHT_COLORS.primaryText,
    });
    expect(screen.getByTestId('light-theme-action-icon')).toHaveTextContent(
      LIGHT_COLORS.primary,
    );
  });

  it('does not paint the portrait coach card title in pure white in light mode', () => {
    const visual = getCoachPersonaVisual('gentle_supportive');

    render(
      <CoachPersonaCard
        title="Noah"
        subtitle="Warm and reassuring"
        avatarImageSource={visual.imageSource}
        avatarFallbackLabel={visual.fallbackLabel}
        avatarHaloTint={visual.haloTint}
        variant="portrait"
        onPress={jest.fn()}
      />,
    );

    const titleStyle = flattenStyle(screen.getByText('Noah').props.style);
    const subtitleStyle = flattenStyle(
      screen.getByText('Warm and reassuring').props.style,
    );

    expect(titleStyle.color?.toUpperCase()).not.toBe('#FFFFFF');
    expect(subtitleStyle.color?.toUpperCase()).not.toContain('FFFFFF');
  });

  it('keeps the active portrait coach card title readable in light mode', () => {
    const visual = getCoachPersonaVisual('gentle_supportive');

    render(
      <CoachPersonaCard
        title="Noah"
        subtitle="Warm and reassuring"
        avatarImageSource={visual.imageSource}
        avatarFallbackLabel={visual.fallbackLabel}
        avatarHaloTint={visual.haloTint}
        variant="portrait"
        active
        onPress={jest.fn()}
      />,
    );

    const titleStyle = flattenStyle(screen.getByText('Noah').props.style);

    expect(titleStyle.color).toBeDefined();
    expect(titleStyle.color?.toUpperCase()).not.toBe('#FFFFFF');
  });
});
