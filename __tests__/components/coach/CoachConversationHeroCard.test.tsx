import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { CoachConversationHeroCard } from '@/components/coach/CoachConversationHeroCard';
import { BORDER_RADIUS, DARK_COLORS, LIGHT_COLORS } from '@/constants/theme';

const mockThemeState = {
  colors: LIGHT_COLORS,
  isDark: false,
};

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => mockThemeState,
}));

const baseProps = {
  personaKey: 'gentle_supportive' as const,
  title: 'Parler au coach',
  subtitle: 'Pose ta question et reçois une réponse personnalisée.',
  ctaLabel: 'Démarrer une conversation',
  onPress: jest.fn(),
  testID: 'coach-conversation-hero-card',
};

describe('CoachConversationHeroCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockThemeState.colors = LIGHT_COLORS;
    mockThemeState.isDark = false;
  });

  it('renders the free available state as a compact conversation row', () => {
    render(
      <CoachConversationHeroCard
        {...baseProps}
        ctaLabel="Démarrer ma conversation"
        variant="free_available"
      />,
    );

    const surfaceStyle = StyleSheet.flatten(
      screen.getByTestId('coach-conversation-hero-card-surface').props.style,
    );

    expect(screen.getByTestId('coach-conversation-hero-card-avatar')).toBeTruthy();
    expect(screen.getByTestId('coach-conversation-hero-card-action-icon')).toBeTruthy();
    expect(screen.getByText('Conversation gratuite • 4 questions incluses')).toBeTruthy();
    expect(screen.getByTestId('coach-conversation-hero-card-title').props.children).toBe(
      'Parler au coach',
    );
    expect(screen.queryByText('Démarrer ma conversation')).toBeNull();
    expect(surfaceStyle.flexDirection).toBe('row');
    expect(surfaceStyle.borderRadius).toBe(BORDER_RADIUS.md);
    expect(surfaceStyle.shadowOpacity).toBeLessThanOrEqual(0.04);
  });

  it.each([
    {
      variant: 'free_resume' as const,
      title: 'Conversation en cours',
      subtitle: 'Continue là où tu t’es arrêté.',
      hint: '2 questions restantes',
      meta: 'Conversation en cours • 2 questions restantes',
    },
    {
      variant: 'premium_available' as const,
      title: 'Parler au coach',
      subtitle: 'Pose ta question, le coach personnalise sa réponse.',
      hint: '6 messages restants aujourd’hui',
      meta: 'Premium • 6 messages restants aujourd’hui',
    },
    {
      variant: 'free_exhausted' as const,
      title: 'Conversation gratuite utilisée',
      subtitle: 'Passe premium pour continuer à écrire au coach.',
      hint: null,
      meta: 'Limite gratuite atteinte',
    },
    {
      variant: 'premium_exhausted' as const,
      title: 'Limite quotidienne atteinte',
      subtitle: 'Consulte ton historique en attendant le prochain reset.',
      hint: null,
      meta: 'Limite quotidienne atteinte',
    },
  ])('renders the $variant state with discrete metadata', (state) => {
    render(
      <CoachConversationHeroCard
        {...baseProps}
        variant={state.variant}
        title={state.title}
        subtitle={state.subtitle}
        hint={state.hint}
      />,
    );

    expect(screen.getAllByText(state.meta).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId('coach-conversation-hero-card-title').props.children).toBe(
      state.title,
    );
    expect(
      screen.getByTestId('coach-conversation-hero-card-subtitle').props.children,
    ).toBe(state.subtitle);
    expect(screen.queryByTestId('coach-conversation-hero-card-hint')).toBeNull();
  });

  it('keeps the row accessible and prevents presses while disabled', () => {
    const onPress = jest.fn();

    render(
      <CoachConversationHeroCard
        {...baseProps}
        disabled
        onPress={onPress}
        variant="premium_available"
      />,
    );

    const button = screen.getByTestId('coach-conversation-hero-card');

    expect(button.props.accessibilityRole).toBe('button');
    expect(button.props.accessibilityState).toEqual({ disabled: true });
    expect(button.props.accessibilityLabel).toContain('Parler au coach');

    fireEvent.press(button);

    expect(onPress).not.toHaveBeenCalled();
  });

  it('keeps the same compact structure in dark mode', () => {
    mockThemeState.colors = DARK_COLORS;
    mockThemeState.isDark = true;

    render(<CoachConversationHeroCard {...baseProps} variant="premium_available" />);

    const surfaceStyle = StyleSheet.flatten(
      screen.getByTestId('coach-conversation-hero-card-surface').props.style,
    );

    expect(surfaceStyle.flexDirection).toBe('row');
    expect(surfaceStyle.shadowOpacity).toBeLessThanOrEqual(0.04);
    expect(screen.getByTestId('coach-conversation-hero-card-meta')).toBeTruthy();
    expect(screen.getByTestId('coach-conversation-hero-card-action')).toBeTruthy();
  });
});
