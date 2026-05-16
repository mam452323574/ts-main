import React from 'react';
import { render, screen } from '@testing-library/react-native';

import { CoachPersonaAvatar } from '@/components/coach/CoachPersonaAvatar';
import { getCoachPersonaVisual } from '@/shared/coachPersonaVisuals';

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      cardBackground: '#111318',
      primaryText: '#F4F5F8',
      white: '#FFFFFF',
    },
  }),
}));

const getStyles = (style: any) => (Array.isArray(style) ? style : [style]);

describe('CoachPersonaAvatar', () => {
  it('renders a styled fallback when no image source is provided', () => {
    render(
      <CoachPersonaAvatar
        fallbackLabel="NO"
        haloTint="#6CA7FF"
        testID="coach-avatar"
      />,
    );

    expect(screen.getByTestId('coach-avatar')).toBeTruthy();
    expect(screen.getByTestId('coach-avatar-fallback')).toBeTruthy();
    expect(screen.getByText('NO')).toBeTruthy();
  });

  it('renders the bundled image when a persona visual source is available', () => {
    render(
      <CoachPersonaAvatar
        imageSource={getCoachPersonaVisual('gentle_supportive').imageSource}
        fallbackLabel="NO"
        haloTint="#6CA7FF"
        testID="coach-avatar-image"
      />,
    );

    expect(screen.getByTestId('coach-avatar-image')).toBeTruthy();
    expect(screen.queryByTestId('coach-avatar-image-fallback')).toBeNull();
  });

  it('supports featured emphasis for premium hero compositions', () => {
    render(
      <CoachPersonaAvatar
        fallbackLabel="NO"
        haloTint="#6CA7FF"
        emphasis="featured"
        testID="coach-avatar-featured"
      />,
    );

    const haloStyles = getStyles(
      screen.getByTestId('coach-avatar-featured-halo').props.style,
    );
    const ringStyles = getStyles(
      screen.getByTestId('coach-avatar-featured-ring').props.style,
    );

    expect(screen.getByTestId('coach-avatar-featured-fallback')).toBeTruthy();
    expect(haloStyles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          transform: [{ scale: 1.14 }],
        }),
      ]),
    );
    expect(ringStyles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          borderWidth: 1.5,
        }),
      ]),
    );
  });
});
