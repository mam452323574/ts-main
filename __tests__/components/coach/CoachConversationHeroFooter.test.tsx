import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { CoachConversationHeroFooter } from '@/components/coach/CoachConversationHeroFooter';
import { LIGHT_COLORS } from '@/constants/theme';

const mockThemeState = {
  colors: LIGHT_COLORS,
  isDark: false,
};

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => mockThemeState,
}));

describe('CoachConversationHeroFooter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockThemeState.colors = LIGHT_COLORS;
    mockThemeState.isDark = false;
  });

  it('returns null when neither secondary nor view-all props are provided', () => {
    const { toJSON } = render(
      <CoachConversationHeroFooter personaKey="gentle_supportive" />,
    );
    expect(toJSON()).toBeNull();
  });

  it('renders only the secondary button when view-all props are missing', () => {
    const onSecondaryPress = jest.fn();
    render(
      <CoachConversationHeroFooter
        personaKey="gentle_supportive"
        secondaryLabel="Nouveau sujet"
        onSecondaryPress={onSecondaryPress}
      />,
    );

    expect(
      screen.getByTestId('coach-conversation-hero-footer-secondary'),
    ).toBeTruthy();
    expect(
      screen.queryByTestId('coach-conversation-hero-footer-view-all'),
    ).toBeNull();

    fireEvent.press(
      screen.getByTestId('coach-conversation-hero-footer-secondary'),
    );
    expect(onSecondaryPress).toHaveBeenCalledTimes(1);
  });

  it('renders only the view-all link when secondary props are missing', () => {
    const onViewConversationsPress = jest.fn();
    render(
      <CoachConversationHeroFooter
        personaKey="strict_tough"
        viewConversationsLabel="Voir les 3 conversations"
        onViewConversationsPress={onViewConversationsPress}
      />,
    );

    expect(
      screen.queryByTestId('coach-conversation-hero-footer-secondary'),
    ).toBeNull();
    const link = screen.getByTestId('coach-conversation-hero-footer-view-all');
    expect(link).toBeTruthy();
    expect(link.props.accessibilityRole).toBe('link');

    fireEvent.press(link);
    expect(onViewConversationsPress).toHaveBeenCalledTimes(1);
  });

  it('renders both actions when all props are provided', () => {
    const onSecondaryPress = jest.fn();
    const onViewConversationsPress = jest.fn();
    render(
      <CoachConversationHeroFooter
        personaKey="playful_light"
        secondaryLabel="Nouveau sujet"
        onSecondaryPress={onSecondaryPress}
        viewConversationsLabel="Voir les 5 conversations"
        onViewConversationsPress={onViewConversationsPress}
      />,
    );

    expect(
      screen.getByTestId('coach-conversation-hero-footer-secondary-label').props
        .children,
    ).toBe('Nouveau sujet');
    expect(
      screen.getByTestId('coach-conversation-hero-footer-view-all-label').props
        .children,
    ).toBe('Voir les 5 conversations');
  });

  it('skips the secondary button when the label is blank even if the handler is set', () => {
    const onSecondaryPress = jest.fn();
    const onViewConversationsPress = jest.fn();
    render(
      <CoachConversationHeroFooter
        personaKey="motivational_energetic"
        secondaryLabel="   "
        onSecondaryPress={onSecondaryPress}
        viewConversationsLabel="Voir les 2 conversations"
        onViewConversationsPress={onViewConversationsPress}
      />,
    );

    expect(
      screen.queryByTestId('coach-conversation-hero-footer-secondary'),
    ).toBeNull();
    expect(
      screen.getByTestId('coach-conversation-hero-footer-view-all'),
    ).toBeTruthy();
  });
});
