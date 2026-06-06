import React from 'react';
import { render, screen } from '@testing-library/react-native';

import { CoachPremiumUpsellInline } from '@/components/coach/chat/CoachPremiumUpsellInline';
import { DARK_COLORS, LIGHT_COLORS, getThemeTokens } from '@/constants/theme';

const mockThemeState = {
  colors: LIGHT_COLORS,
  isDark: false,
};

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => mockThemeState,
}));

describe('CoachPremiumUpsellInline', () => {
  beforeEach(() => {
    mockThemeState.colors = LIGHT_COLORS;
    mockThemeState.isDark = false;
  });

  it('uses a contrast-safe premium foreground in light mode', () => {
    render(
      <CoachPremiumUpsellInline
        title="Continue avec premium"
        body="Debloque la suite."
        ctaLabel="Passer premium"
        onPress={jest.fn()}
      />,
    );

    expect(screen.getByText('Passer premium')).toHaveStyle({
      color: getThemeTokens(false).premium.foreground,
    });
    expect(screen.getByTestId('coach-premium-upsell-inline-icon').props.color).toBe(
      getThemeTokens(false).premium.foreground,
    );
    expect(screen.getByTestId('coach-premium-upsell-inline-arrow').props.color).toBe(
      getThemeTokens(false).premium.foreground,
    );
  });

  it('keeps the gold foreground in dark mode', () => {
    mockThemeState.colors = DARK_COLORS;
    mockThemeState.isDark = true;

    render(
      <CoachPremiumUpsellInline
        title="Continue avec premium"
        body="Debloque la suite."
        ctaLabel="Passer premium"
        onPress={jest.fn()}
      />,
    );

    expect(screen.getByText('Passer premium')).toHaveStyle({ color: DARK_COLORS.gold });
    expect(screen.getByTestId('coach-premium-upsell-inline-icon').props.color).toBe(
      DARK_COLORS.gold,
    );
  });
});
