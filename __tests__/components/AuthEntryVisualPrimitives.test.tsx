import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import { AuthHero } from '@/components/auth/AuthHero';
import { AuthThemeVisual } from '@/components/auth/AuthThemeVisual';

describe('auth entry visual primitives', () => {
  it('uses a centered compact hierarchy for the intro variant', () => {
    render(
      <AuthHero
        variant="intro"
        title="Votre premier scan commence ici"
        subtitle="Creez votre profil"
      />,
    );

    expect(
      StyleSheet.flatten(screen.getByText('Votre premier scan commence ici').props.style),
    ).toEqual(
      expect.objectContaining({
        fontSize: 32,
        lineHeight: 38,
        textAlign: 'center',
      }),
    );
  });

  it('uses a compact left-aligned hierarchy for step content', () => {
    render(
      <AuthHero
        variant="step"
        title="Ajoutez une photo"
        subtitle="Cette etape est facultative"
      />,
    );

    expect(StyleSheet.flatten(screen.getByText('Ajoutez une photo').props.style)).toEqual(
      expect.objectContaining({
        fontSize: 24,
        lineHeight: 30,
        textAlign: 'left',
      }),
    );
  });

  it('renders flat theme previews without gradients', () => {
    const { UNSAFE_queryAllByType } = render(
      <>
        <AuthThemeVisual theme="light" />
        <AuthThemeVisual theme="dark" />
      </>,
    );

    expect(UNSAFE_queryAllByType('LinearGradient' as any)).toHaveLength(0);
  });
});
