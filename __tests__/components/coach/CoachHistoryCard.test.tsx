import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import { CoachHistoryCard } from '@/components/coach/CoachHistoryCard';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: 'Light',
  },
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      cardBackground: '#111318',
      primaryText: '#F4F5F8',
      primary: '#6CA7FF',
      gray: '#94A3B8',
      secondary: '#7C3AED',
      white: '#FFFFFF',
    },
  }),
}));

function CoachHistoryCardHarness({
  onCtaPress = jest.fn(),
  recentLabel = null,
}: {
  onCtaPress?: jest.Mock;
  recentLabel?: string | null;
}) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <CoachHistoryCard
      title="Weekly reset"
      body={'Keep the routine light.\n\nPrioritize hydration and sleep.'}
      dateLabel="Yesterday"
      personaLabel="Coach personality"
      personaValue="Noah"
      personaAvatarFallbackLabel="NO"
      personaAvatarHaloTint="#6CA7FF"
      recentLabel={recentLabel}
      disclaimerLabel="Disclaimer"
      disclaimer="Wellness guidance only."
      ctaLabel="Open plan"
      onCtaPress={onCtaPress}
      expanded={expanded}
      onToggle={() => setExpanded((current) => !current)}
      testID="coach-history-card"
    />
  );
}

describe('CoachHistoryCard', () => {
  it('renders a compact summary by default', () => {
    const screen = render(<CoachHistoryCardHarness />);

    expect(screen.getByTestId('coach-history-card')).toBeTruthy();
    expect(screen.getByTestId('coach-history-card-date').props.children).toBe('Yesterday');
    expect(screen.getByText('Weekly reset')).toBeTruthy();
    expect(screen.getByText('Noah')).toBeTruthy();
    expect(screen.queryByTestId('coach-history-card-expanded')).toBeNull();
  });

  it('renders a recent badge only when provided', () => {
    const screen = render(<CoachHistoryCardHarness recentLabel="Recent" />);

    expect(screen.getByTestId('coach-history-card-recent-badge')).toBeTruthy();
    expect(screen.getByText('Recent')).toBeTruthy();

    screen.rerender(<CoachHistoryCardHarness />);

    expect(screen.queryByTestId('coach-history-card-recent-badge')).toBeNull();
  });

  it('expands and shows the full body plus disclaimer', () => {
    const screen = render(<CoachHistoryCardHarness />);

    fireEvent.press(screen.getByTestId('coach-history-card-toggle'));

    expect(screen.getByTestId('coach-history-card-expanded')).toBeTruthy();
    expect(screen.getByText('Keep the routine light.')).toBeTruthy();
    expect(screen.getByText('Prioritize hydration and sleep.')).toBeTruthy();
    expect(screen.getByTestId('coach-history-card-disclaimer').props.children).toBe(
      'Wellness guidance only.',
    );
  });

  it('fires the CTA when the card is expanded', () => {
    const onCtaPress = jest.fn();
    const screen = render(<CoachHistoryCardHarness onCtaPress={onCtaPress} />);

    fireEvent.press(screen.getByTestId('coach-history-card-toggle'));
    fireEvent.press(screen.getByText('Open plan'));

    expect(onCtaPress).toHaveBeenCalledTimes(1);
  });
});
