import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { CoachConversationHeroCard } from '@/components/coach/CoachConversationHeroCard';
import {
  BORDER_RADIUS,
  DARK_COLORS,
  LIGHT_COLORS,
  getCoachPaperSurface,
  withAlpha,
} from '@/constants/theme';

const mockThemeState = {
  colors: LIGHT_COLORS,
  isDark: false,
};

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => mockThemeState,
}));

const baseProps = {
  personaKey: 'gentle_supportive' as const,
  title: null as string | null,
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

  it('renders portrait, gradient, and a visible CTA pill for free_available', () => {
    render(
      <CoachConversationHeroCard
        {...baseProps}
        ctaLabel="Démarrer ma conversation"
        variant="free_available"
      />,
    );

    expect(screen.getByTestId('coach-conversation-hero-card-portrait')).toBeTruthy();
    expect(screen.getByTestId('coach-conversation-hero-card-gradient')).toBeTruthy();
    expect(screen.getByTestId('coach-conversation-hero-card-halo')).toBeTruthy();
    expect(screen.getByTestId('coach-conversation-hero-card-cta')).toBeTruthy();
    expect(screen.getByTestId('coach-conversation-hero-card-cta-icon')).toBeTruthy();
    expect(screen.getByText('Démarrer ma conversation')).toBeTruthy();

    const cardStyle = getPressableStyle('coach-conversation-hero-card');
    expect(cardStyle.borderRadius).toBe(BORDER_RADIUS.hero);
    expect(cardStyle.overflow).toBe('hidden');
    expect(cardStyle.minHeight).toBeGreaterThanOrEqual(280);
  });

  it('uses a light paper surface and dark copy in light mode', () => {
    render(<CoachConversationHeroCard {...baseProps} variant="free_available" />);

    const paper = getCoachPaperSurface(false);
    const gradient = screen.getByTestId('coach-conversation-hero-card-gradient');
    const title = StyleSheet.flatten(
      screen.getByTestId('coach-conversation-hero-card-title').props.style,
    );
    const cta = StyleSheet.flatten(
      screen.getByText(baseProps.ctaLabel).props.style,
    );

    expect(gradient.props.colors[0]).not.toBe('#0F1A2A');
    expect(title.color).toBe(paper.ink);
    expect(cta.color).toBe(paper.ink);
  });

  it('renders the parent-provided ctaLabel and subtitle in free_exhausted state (B-1)', () => {
    render(
      <CoachConversationHeroCard
        {...baseProps}
        variant="free_exhausted"
        title="Conversation gratuite en pause"
        ctaLabel="Voir la conversation"
        subtitle="Attends la prochaine recharge ou passe premium pour continuer."
      />,
    );

    const ctaLabel = screen.getByTestId('coach-conversation-hero-card-cta-label');
    expect(ctaLabel.props.children).toBe('Voir la conversation');
    expect(screen.queryByText('Parler au coach')).toBeNull();

    const subtitle = screen.getByTestId('coach-conversation-hero-card-subtitle');
    expect(subtitle.props.children).toBe(
      'Attends la prochaine recharge ou passe premium pour continuer.',
    );
  });

  it('falls back to "Parler au coach" when ctaLabel is empty (B-1)', () => {
    render(
      <CoachConversationHeroCard
        {...baseProps}
        variant="free_available"
        ctaLabel=""
      />,
    );

    const ctaLabel = screen.getByTestId('coach-conversation-hero-card-cta-label');
    expect(ctaLabel.props.children).toBe('Parler au coach');
  });

  it('omits the subtitle slot when subtitle is empty (B-1)', () => {
    render(
      <CoachConversationHeroCard
        {...baseProps}
        variant="free_available"
        subtitle=""
      />,
    );

    expect(
      screen.queryByTestId('coach-conversation-hero-card-subtitle'),
    ).toBeNull();
  });

  it('omits the subtitle slot when subtitle is undefined (B-1)', () => {
    // Production code typings require a subtitle string, but defensive runtime
    // guards still matter when the parent forgets to pass the prop entirely.
    render(
      <CoachConversationHeroCard
        {...baseProps}
        variant="free_available"
        subtitle={undefined as unknown as string}
      />,
    );

    expect(
      screen.queryByTestId('coach-conversation-hero-card-subtitle'),
    ).toBeNull();
  });

  it('falls back to "Parler au coach" when ctaLabel is undefined (B-1)', () => {
    render(
      <CoachConversationHeroCard
        {...baseProps}
        variant="free_available"
        ctaLabel={undefined as unknown as string}
      />,
    );

    const ctaLabel = screen.getByTestId(
      'coach-conversation-hero-card-cta-label',
    );
    expect(ctaLabel.props.children).toBe('Parler au coach');
  });

  it('renders the premium_exhausted CTA "Voir l’historique" (B-1)', () => {
    render(
      <CoachConversationHeroCard
        {...baseProps}
        variant="premium_exhausted"
        title="Limite quotidienne atteinte"
        ctaLabel="Voir l’historique"
        subtitle="Consulte ton historique en attendant le prochain reset."
      />,
    );

    expect(
      screen.getByTestId('coach-conversation-hero-card-cta-label').props
        .children,
    ).toBe('Voir l’historique');
    expect(
      screen.getByTestId('coach-conversation-hero-card-subtitle').props
        .children,
    ).toBe('Consulte ton historique en attendant le prochain reset.');
  });

  it('propagates the dynamic ctaLabel into the accessibility label (B-1)', () => {
    render(
      <CoachConversationHeroCard
        {...baseProps}
        variant="free_exhausted"
        title="Conversation gratuite en pause"
        ctaLabel="Voir la conversation"
        subtitle="Attends la prochaine recharge ou passe premium pour continuer."
      />,
    );

    const button = screen.getByTestId('coach-conversation-hero-card');
    expect(button.props.accessibilityLabel).toContain('Voir la conversation');
    expect(button.props.accessibilityLabel).toContain(
      'Attends la prochaine recharge ou passe premium pour continuer.',
    );
    expect(button.props.accessibilityLabel).not.toContain('Parler au coach');
  });

  it('injects the coach name from i18n into the title for free_available', () => {
    render(
      <CoachConversationHeroCard {...baseProps} variant="free_available" />,
    );

    expect(
      screen.getByTestId('coach-conversation-hero-card-title').props.children,
    ).toBe('Conversation Libre avec Noah');
  });

  it('injects the coach name from i18n into the title for premium_available', () => {
    render(
      <CoachConversationHeroCard
        {...baseProps}
        personaKey="playful_light"
        variant="premium_available"
      />,
    );

    expect(
      screen.getByTestId('coach-conversation-hero-card-title').props.children,
    ).toBe('Conversation Libre avec Milo');
  });

  it('keeps Leo hero crop bottom-aligned without the selector card scale', () => {
    render(
      <CoachConversationHeroCard
        {...baseProps}
        personaKey="motivational_energetic"
        variant="premium_available"
      />,
    );

    const portrait = screen.getByTestId('coach-conversation-hero-card-portrait');
    const portraitStyle = StyleSheet.flatten(portrait.props.style);

    expect(portrait.props.contentPosition).toBe('bottom');
    expect(portraitStyle.transform).toBeUndefined();
  });

  it.each([
    {
      variant: 'free_resume' as const,
      title: 'Conversation en cours',
      hint: '2 questions restantes',
    },
    {
      variant: 'premium_resume' as const,
      title: 'Conversation en cours',
      hint: '5 messages restants',
    },
    {
      variant: 'free_exhausted' as const,
      title: 'Conversation gratuite utilisée',
      hint: null,
    },
    {
      variant: 'premium_exhausted' as const,
      title: 'Limite quotidienne atteinte',
      hint: null,
    },
  ])(
    'keeps the parent-provided title for $variant (no coach-name rephrasing)',
    (state) => {
      render(
        <CoachConversationHeroCard
          {...baseProps}
          variant={state.variant}
          title={state.title}
          hint={state.hint}
        />,
      );

      expect(
        screen.getByTestId('coach-conversation-hero-card-title').props.children,
      ).toBe(state.title);
    },
  );

  it('builds an accessibility label combining heroTitle, subtitle, hint, and CTA', () => {
    render(
      <CoachConversationHeroCard
        {...baseProps}
        hint="3 questions restantes"
        variant="free_available"
      />,
    );

    const button = screen.getByTestId('coach-conversation-hero-card');
    expect(button.props.accessibilityRole).toBe('button');
    expect(button.props.accessibilityLabel).toContain(
      'Conversation Libre avec Noah',
    );
    expect(button.props.accessibilityLabel).toContain('Pose ta question');
    expect(button.props.accessibilityLabel).toContain('3 questions restantes');
    expect(button.props.accessibilityLabel).toContain('Démarrer une conversation');
  });

  it('blocks presses when disabled', () => {
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
    expect(button.props.accessibilityState).toEqual({ disabled: true });

    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('swaps the portrait for the fallback view when the image fails to load', () => {
    render(
      <CoachConversationHeroCard {...baseProps} variant="free_available" />,
    );

    const portrait = screen.getByTestId('coach-conversation-hero-card-portrait');
    fireEvent(portrait, 'error');

    expect(
      screen.getByTestId('coach-conversation-hero-card-portrait-fallback'),
    ).toBeTruthy();
    expect(
      screen.queryByTestId('coach-conversation-hero-card-portrait'),
    ).toBeNull();
  });

  it('keeps the same structure in dark mode', () => {
    mockThemeState.colors = DARK_COLORS;
    mockThemeState.isDark = true;

    render(
      <CoachConversationHeroCard {...baseProps} variant="premium_available" />,
    );

    expect(screen.getByTestId('coach-conversation-hero-card-gradient')).toBeTruthy();
    expect(screen.getByTestId('coach-conversation-hero-card-cta')).toBeTruthy();
    expect(screen.getByTestId('coach-conversation-hero-card-portrait')).toBeTruthy();

    const cardStyle = getPressableStyle('coach-conversation-hero-card');
    expect(cardStyle.borderRadius).toBe(BORDER_RADIUS.hero);
    expect(cardStyle.overflow).toBe('hidden');
    expect(screen.getByTestId('coach-conversation-hero-card-gradient').props.colors[0]).toBe(
      '#0F1A2A',
    );
    expect(
      StyleSheet.flatten(
        screen.getByTestId('coach-conversation-hero-card-title').props.style,
      ).color,
    ).toBe(withAlpha(DARK_COLORS.white, 0.96));
  });
});

function getPressableStyle(testID: string) {
  const button = screen.getByTestId(testID);
  return StyleSheet.flatten(
    typeof button.props.style === 'function'
      ? button.props.style({ pressed: false })
      : button.props.style,
  );
}
