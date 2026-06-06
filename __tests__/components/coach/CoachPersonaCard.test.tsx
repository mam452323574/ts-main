import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { CoachPersonaCard } from '@/components/coach/CoachPersonaCard';
import { DARK_COLORS, LIGHT_COLORS, getThemeTokens } from '@/constants/theme';
import {
  getCoachPersonaCrop,
  getCoachPersonaVisual,
} from '@/shared/coachPersonaVisuals';

const mockThemeState = {
  colors: LIGHT_COLORS,
  isDark: false,
};

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => mockThemeState,
}));

describe('CoachPersonaCard', () => {
  beforeEach(() => {
    mockThemeState.colors = LIGHT_COLORS;
    mockThemeState.isDark = false;
  });

  it('renders a readable premium soft-lock while keeping the card tappable', () => {
    const onPress = jest.fn();
    const visual = getCoachPersonaVisual('strict_tough');

    render(
      <CoachPersonaCard
        title="Axel"
        subtitle="Direct and demanding"
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
    expect(screen.getByTestId('coach-persona-card-lock-icon').props.color).toBe(
      getThemeTokens(false).premium.foreground,
    );
    expect(screen.getByText('Premium')).toHaveStyle({
      color: getThemeTokens(false).premium.foreground,
    });

    fireEvent.press(screen.getByTestId('coach-persona-card'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('keeps gold lock foregrounds in dark mode', () => {
    mockThemeState.colors = DARK_COLORS;
    mockThemeState.isDark = true;
    const visual = getCoachPersonaVisual('strict_tough');

    render(
      <CoachPersonaCard
        title="Axel"
        subtitle="Direct and demanding"
        avatarFallbackLabel={visual.fallbackLabel}
        avatarHaloTint={visual.haloTint}
        locked
        lockedBadgeLabel="Premium"
        onPress={jest.fn()}
        testID="coach-persona-card"
      />,
    );

    expect(screen.getByTestId('coach-persona-card-lock-icon').props.color).toBe(
      DARK_COLORS.gold,
    );
    expect(screen.getByText('Premium')).toHaveStyle({ color: DARK_COLORS.gold });
  });

  it('does not render premium lock chrome for unlocked personas', () => {
    const visual = getCoachPersonaVisual('gentle_supportive');

    render(
      <CoachPersonaCard
        title="Noah"
        subtitle="Warm and reassuring"
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
        title="Noah"
        subtitle="Warm and reassuring"
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
    expect(screen.queryByTestId('coach-persona-card-portrait-gradient')).toBeNull();
    expect(screen.queryByTestId('coach-persona-card-avatar')).toBeNull();
    expect(screen.getByText('Noah')).toBeTruthy();
  });

  it('uses the Leo-specific card crop in portrait selector cards', () => {
    const visual = getCoachPersonaVisual('motivational_energetic');

    render(
      <CoachPersonaCard
        title="Leo"
        subtitle="Energetic and motivational"
        avatarImageSource={visual.imageSource}
        avatarFallbackLabel={visual.fallbackLabel}
        avatarHaloTint={visual.haloTint}
        imageCrop={getCoachPersonaCrop(visual, 'card')}
        variant="portrait"
        onPress={jest.fn()}
        testID="coach-persona-card-leo"
      />,
    );

    const portraitImage = screen.getByTestId(
      'coach-persona-card-leo-portrait-image',
    );
    const portraitImageStyle = StyleSheet.flatten(portraitImage.props.style);

    expect(portraitImage.props.contentPosition).toBe('top');
    expect(portraitImageStyle.transform).toEqual([{ scale: 1.08 }]);
  });

  it('keeps the portrait image gradient unchanged in dark mode', () => {
    mockThemeState.colors = DARK_COLORS;
    mockThemeState.isDark = true;
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
        testID="coach-persona-card"
      />,
    );

    expect(screen.getByTestId('coach-persona-card-portrait-gradient').props.colors).toEqual([
      'rgba(0,0,0,0)',
      'rgba(0,0,0,0.72)',
    ]);
  });
});
