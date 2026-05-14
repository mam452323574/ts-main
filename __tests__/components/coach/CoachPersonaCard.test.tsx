import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { CoachPersonaCard } from '@/components/coach/CoachPersonaCard';
import { getCoachPersonaVisual } from '@/shared/coachPersonaVisuals';

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      background: '#F2F2F7',
      cardBackground: '#FFFFFF',
      primaryText: '#1D1D1F',
      primary: '#007AFF',
      white: '#FFFFFF',
      gray: '#8E8E93',
      gold: '#FFD700',
      goldLight: '#FFF8E1',
    },
  }),
}));

describe('CoachPersonaCard', () => {
  it('renders a readable premium soft-lock while keeping the card tappable', () => {
    const onPress = jest.fn();
    const visual = getCoachPersonaVisual('strict_tough');

    render(
      <CoachPersonaCard
        title="Strict Tough"
        subtitle="Direct accountability"
        avatarImageSource={visual.imageSource}
        avatarFallbackLabel={visual.fallbackLabel}
        avatarHaloTint={visual.haloTint}
        locked
        lockedBadgeLabel="Premium"
        lockedHint="Tap to unlock"
        onPress={onPress}
        testID="coach-persona-card"
      />,
    );

    expect(screen.getByTestId('coach-persona-card-lock-overlay')).toBeTruthy();
    expect(screen.getByTestId('coach-persona-card-lock-blur')).toBeTruthy();
    expect(screen.getByTestId('coach-persona-card-lock-badge')).toBeTruthy();
    expect(screen.getByTestId('coach-persona-card-lock-icon')).toBeTruthy();
    expect(screen.getByText('Premium')).toBeTruthy();

    fireEvent.press(screen.getByTestId('coach-persona-card'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not render premium lock chrome for unlocked personas', () => {
    const visual = getCoachPersonaVisual('gentle_supportive');

    render(
      <CoachPersonaCard
        title="Gentle Supportive"
        subtitle="Warm and practical"
        avatarImageSource={visual.imageSource}
        avatarFallbackLabel={visual.fallbackLabel}
        avatarHaloTint={visual.haloTint}
        onPress={jest.fn()}
        testID="coach-persona-card"
      />,
    );

    expect(screen.queryByTestId('coach-persona-card-lock-overlay')).toBeNull();
    expect(screen.queryByTestId('coach-persona-card-lock-badge')).toBeNull();
  });

  it('renders the portrait variant with a large rectangular coach image', () => {
    const visual = getCoachPersonaVisual('gentle_supportive');

    render(
      <CoachPersonaCard
        title="Gentle Supportive"
        subtitle="Warm and practical"
        avatarImageSource={visual.imageSource}
        avatarFallbackLabel={visual.fallbackLabel}
        avatarHaloTint={visual.haloTint}
        variant="portrait"
        active
        onPress={jest.fn()}
        testID="coach-persona-card"
      />,
    );

    const portraitCard = screen.getByTestId('coach-persona-card');
    const portraitFrame = screen.getByTestId('coach-persona-card-portrait-frame');
    const portraitImage = screen.getByTestId('coach-persona-card-portrait-image');
    const portraitCardStyle = StyleSheet.flatten(
      typeof portraitCard.props.style === 'function'
        ? portraitCard.props.style({ pressed: false })
        : portraitCard.props.style,
    );
    const portraitFrameStyle = StyleSheet.flatten(portraitFrame.props.style);
    const portraitImageStyle = StyleSheet.flatten(portraitImage.props.style);

    expect(portraitCardStyle.width).toBe(168);
    expect(portraitCardStyle.minHeight).toBe(258);
    expect(portraitFrame).toBeTruthy();
    expect(portraitFrameStyle.margin).toBeUndefined();
    expect(portraitFrameStyle.borderWidth).toBeUndefined();
    expect(portraitFrameStyle.height).toBe(192);
    expect(portraitImage).toBeTruthy();
    expect(portraitImageStyle.transform).toEqual([{ scale: 1.08 }]);
    expect(screen.getByTestId('coach-persona-card-portrait-gradient')).toBeTruthy();
    expect(screen.queryByTestId('coach-persona-card-avatar')).toBeNull();
    expect(screen.getByText('Gentle Supportive')).toBeTruthy();
  });
});
